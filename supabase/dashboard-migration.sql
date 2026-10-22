-- Additive migration. Run after schema.sql. Safe to rerun; existing records are preserved.
create table if not exists public.catalog_items (
 id text primary key,
 kind text not null check (kind in ('course','path','event','job')),
 author uuid references auth.users(id) on delete set null,
 data jsonb not null,
 created timestamptz not null default now()
);
create table if not exists public.hub_profiles (
 owner uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null default '{}'::jsonb
);
create table if not exists public.hub_preferences (
 owner uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null default '{}'::jsonb
);
create table if not exists public.hub_actions (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('enroll','lesson','path','event','job')),
 item text not null,
 data jsonb not null default '{}'::jsonb,
 created timestamptz not null default now(),
 unique(owner,kind,item)
);
create index if not exists hub_actions_owner_idx on public.hub_actions(owner);
alter table public.catalog_items enable row level security;
alter table public.hub_profiles enable row level security;
alter table public.hub_preferences enable row level security;
alter table public.hub_actions enable row level security;
grant select,insert,update,delete on public.catalog_items,public.hub_profiles,public.hub_preferences,public.hub_actions to authenticated;

drop policy if exists catalog_read on public.catalog_items;
create policy catalog_read on public.catalog_items for select to authenticated using(true);
drop policy if exists catalog_insert on public.catalog_items;
create policy catalog_insert on public.catalog_items for insert to authenticated with check(public.is_admin() or (kind in ('event','job') and public.is_recruiter() and author=auth.uid()));
drop policy if exists catalog_update on public.catalog_items;
create policy catalog_update on public.catalog_items for update to authenticated using(public.is_admin() or (kind in ('event','job') and public.is_recruiter() and author=auth.uid())) with check(public.is_admin() or (kind in ('event','job') and public.is_recruiter() and author=auth.uid()));
drop policy if exists catalog_delete on public.catalog_items;
create policy catalog_delete on public.catalog_items for delete to authenticated using(public.is_admin() or (kind in ('event','job') and public.is_recruiter() and author=auth.uid()));

-- Profile and settings remain owner-private. Recruiters retain the existing consented assessment workflow.
drop policy if exists profile_own on public.hub_profiles;
create policy profile_own on public.hub_profiles for all to authenticated using(owner=auth.uid()) with check(owner=auth.uid());
drop policy if exists preferences_own on public.hub_preferences;
create policy preferences_own on public.hub_preferences for all to authenticated using(owner=auth.uid()) with check(owner=auth.uid());
drop policy if exists actions_read on public.hub_actions;
create policy actions_read on public.hub_actions for select to authenticated using(owner=auth.uid());
drop policy if exists actions_delete on public.hub_actions;
create policy actions_delete on public.hub_actions for delete to authenticated using(owner=auth.uid());

-- Validate catalog references even if someone writes directly through Supabase REST.
create or replace function public.valid_hub_action(action_kind text, action_item text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.catalog_items c
  where (action_kind='enroll' and c.kind='course' and c.id=action_item)
     or (action_kind='path' and c.kind='path' and c.id=action_item)
     or (action_kind='job' and c.kind='job' and c.id=action_item)
     or (action_kind='event' and c.kind='event' and c.id=action_item and c.data->>'date'>=current_date::text)
     or (action_kind='lesson' and c.kind='course' and exists(
       select 1 from jsonb_array_elements(coalesce(c.data->'lessons','[]'::jsonb)) l(value)
       where action_item=c.id||':'||(l.value->>'id')
     ))
 );
$$;
revoke all on function public.valid_hub_action(text,text) from public,anon;
grant execute on function public.valid_hub_action(text,text) to authenticated;
drop policy if exists actions_insert on public.hub_actions;
create policy actions_insert on public.hub_actions for insert to authenticated with check(owner=auth.uid() and public.valid_hub_action(kind,item));
drop policy if exists actions_update on public.hub_actions;
create policy actions_update on public.hub_actions for update to authenticated using(owner=auth.uid()) with check(owner=auth.uid() and public.valid_hub_action(kind,item));

-- Participation board: 10 points per valid self-marked lesson + best test result.
-- Recompute fixed-test correctness from answers, never trust a client-supplied score.
-- Only opted-in aliases and aggregate counts are exposed; no emails, UUIDs or transcripts.
create or replace function public.hub_leaderboard()
returns table(alias text, points bigint, lessons bigint, best_test integer)
language sql stable security definer set search_path='' as $$
 with lesson_counts as (
  select a.owner,count(*) as lessons
  from public.hub_actions a join public.catalog_items c on c.kind='course'
  where a.kind='lesson' and exists(
   select 1 from jsonb_array_elements(coalesce(c.data->'lessons','[]'::jsonb)) l(value)
   where a.item=c.id||':'||(l.value->>'id')
  ) group by a.owner
 ), test_values as (
  select r.owner,(
   select count(*)::integer*20
   from jsonb_array_elements(case when jsonb_typeof(r.data->'answers')='array' then r.data->'answers' else '[]'::jsonb end) with ordinality x(value,n)
   where x.value #>> '{}' = (array['1','1','2','1','2'])[x.n::integer]
  ) as score
  from public.records r where r.kind='test'
   and case when jsonb_typeof(r.data->'answers')='array' then jsonb_array_length(r.data->'answers')=5 else false end
   and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(r.data->'answers')='array' then r.data->'answers' else '[]'::jsonb end) a(value) where jsonb_typeof(a.value)<>'number' or (a.value #>> '{}') !~ '^[0-3]$')
 ), test_best as (select owner,max(score) as best from test_values group by owner)
 select left(trim(p.data->>'public_alias'),40),coalesce(l.lessons,0)*10+coalesce(t.best,0),coalesce(l.lessons,0),coalesce(t.best,0)
 from public.hub_preferences p
 left join lesson_counts l on l.owner=p.owner left join test_best t on t.owner=p.owner
 where p.data->'leaderboard_opt_in'='true'::jsonb and length(trim(coalesce(p.data->>'public_alias','')))>0
 order by 2 desc,1 asc limit 100;
$$;
revoke all on function public.hub_leaderboard() from public,anon;
grant execute on function public.hub_leaderboard() to authenticated;

-- Curated courses and career paths. No invented real-world events or jobs.
insert into public.catalog_items(id,kind,data) values ('java-foundations','course','{"title": "Java Foundations", "tag": "JAVA", "level": "Beginner", "topic": "Java", "theme": "java", "description": "Build a foundation in objects, collections and dependable Java code.", "lessons": [{"id": "objects", "title": "Objects and responsibility", "body": "A class defines state and behavior; an object is an instance of that class. Keep each class focused on one responsibility. Encapsulation protects state behind methods rather than exposing mutable fields. Use an interface when callers should depend on a contract instead of one implementation.", "exercise": "Design a Candidate class with private name and email fields. Add a method that validates an email before updating it."}, {"id": "collections", "title": "Choose the right collection", "body": "A List preserves order and allows duplicates. A Set models unique elements. A Map associates keys with values. ArrayList provides constant-time indexed access; insertion in the middle shifts elements. HashMap uses hashCode and equals to find keys. Mutable keys can break lookup when their hash changes.", "exercise": "Store unique candidate emails in a HashSet, then group candidates by skill using a Map<String,List<Candidate>>."}, {"id": "exceptions", "title": "Handle failures clearly", "body": "Checked exceptions must be caught or declared. Unchecked exceptions usually represent programming errors or invalid state. Catch exceptions where you can recover or add useful context. Use try-with-resources for AutoCloseable resources. Do not hide a failure with an empty catch block.", "exercise": "Write a file-reading method with try-with-resources. Explain how you would report a missing resume file to the user."}]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('react-essentials','course','{"title": "React Essentials", "tag": "REACT", "level": "Beginner", "topic": "React", "theme": "react", "description": "Create interactive interfaces with components, state and effects.", "lessons": [{"id": "components", "title": "Build reusable components", "body": "A React component describes UI from props and state. Props flow from parent to child and should be treated as immutable. Use stable keys when rendering lists so React can preserve the identity of each row. Split reusable presentation from application state where it improves clarity.", "exercise": "Create a CourseCard component that receives title, difficulty and an onOpen callback."}, {"id": "state", "title": "Manage state updates", "body": "useState stores values between renders. Use functional updates when the next value depends on the previous one. Never mutate arrays or objects held in state; create a new value. Derive values such as completed lesson count from source data instead of keeping a second copy that can drift.", "exercise": "Implement a bookmark toggle using setItems(previous => ...), without mutating the previous array."}, {"id": "effects", "title": "Fetch data and clean up", "body": "useEffect synchronizes a component with external systems. List relevant dependencies. Clean up subscriptions, timers and object URLs. A stale network response can overwrite newer state, so use an AbortController or ignore results after cleanup. Render loading and failure states explicitly.", "exercise": "Fetch a course list on mount, show loading and error messages, and prevent an unmounted component from applying results."}]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('sql-practice','course','{"title": "SQL and PostgreSQL", "tag": "SQL", "level": "Intermediate", "topic": "SQL", "theme": "sql", "description": "Query relational data and understand ownership and row access.", "lessons": [{"id": "queries", "title": "Filter and aggregate", "body": "WHERE filters rows before grouping. GROUP BY forms groups; HAVING filters aggregated groups. Use COUNT, SUM and AVG to summarize records. ORDER BY controls result order. SQL NULL means missing or unknown; compare it with IS NULL instead of equals.", "exercise": "Write a query to find candidates with at least three completed interviews, ordered by interview count."}, {"id": "joins", "title": "Join related tables", "body": "An INNER JOIN returns matching rows. A LEFT JOIN retains all left rows even when no right row matches. Keep conditions that preserve left rows in the join condition when appropriate. Unique constraints and foreign keys protect relationships and prevent duplicate associations.", "exercise": "Join candidate profiles with interview records and include candidates who have not recorded an interview."}, {"id": "policies", "title": "Protect data with RLS", "body": "Row Level Security evaluates access rules for each database row. A policy should check trusted identity, such as auth.uid(), rather than a user-submitted owner. An application authorization check and an RLS policy provide different layers of protection. Test both allowed and denied access.", "exercise": "Describe a policy where a candidate reads their own records and a recruiter reads them only after an explicit consent grant."}]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('api-testing','course','{"title": "API Test Automation", "tag": "TEST", "level": "Intermediate", "topic": "Testing", "theme": "testing", "description": "Practice request validation, authorization and reliable API checks.", "lessons": [{"id": "http", "title": "Test the HTTP contract", "body": "An API contract includes route, method, authentication, input shape, status and response fields. A successful status alone is insufficient: check the expected body and persistent side effects. Validate missing fields, malformed JSON and boundaries as well as happy paths.", "exercise": "List checks for a POST resume endpoint: missing text, valid text, invalid token and forged owner."}, {"id": "roles", "title": "Verify role boundaries", "body": "Authorization tests prove who can perform an action, not just who can log in. Test a candidate attempting an admin action, an unlisted recruiter, and a recruiter without candidate consent. Also verify revocation blocks future reads. Keep test accounts and data isolated.", "exercise": "Write a test matrix for candidate, recruiter and administrator access to a private recording."}, {"id": "fixtures", "title": "Use fixtures and meaningful assertions", "body": "Fixtures create repeatable setup and cleanup. Mock an external provider to test local behavior, then run separate integration checks against the configured provider. A mocked test does not prove remote RLS or OAuth configuration works. Assert outcomes instead of copying implementation details.", "exercise": "Design one test that uploads a recording, grants access, verifies playback permission, revokes access and verifies denial."}]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('python-backend','course','{"title": "Python Backend Basics", "tag": "PY", "level": "Beginner", "topic": "Python", "theme": "python", "description": "Build clear endpoints with validation and async service calls.", "lessons": [{"id": "validation", "title": "Validate at the boundary", "body": "Validate request structure and business rules before writing data. Type annotations document expectations; runtime validators enforce them. Normalize emails consistently. Return a useful error without leaking tokens or private upstream responses. Never trust a browser-provided role or score.", "exercise": "Create a Pydantic request model for a profile with a name, headline and limited skills list."}, {"id": "async", "title": "Understand asynchronous I O", "body": "async functions can yield control while awaiting network I O. Use an async HTTP client for concurrent service calls. Do not perform slow blocking work directly in an async request handler. Reuse clients with application lifespan and configure timeouts.", "exercise": "Explain why a shared HTTPX AsyncClient is useful for calls to Supabase."}, {"id": "routes", "title": "Separate application concerns", "body": "Keep routing, data access and scoring logic separable. Routes enforce authentication and validate input; service helpers perform reusable work. Unit tests can cover pure scoring functions while endpoint tests cover authorization and persistence. Use environment configuration instead of hardcoded secrets.", "exercise": "Outline an endpoint that accepts answers, recalculates a test score and saves the verified result."}]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('interview-skills','course','{"title": "Interview Communication", "tag": "TALK", "level": "Beginner", "topic": "Communication", "theme": "communication", "description": "Structure answers and explain project decisions with examples.", "lessons": [{"id": "star", "title": "Use a structured answer", "body": "For behavioral questions, explain the Situation, Task, Action and Result. Keep the situation short and focus on what you did. Use only outcomes you can support. Technical answers benefit from stating assumptions, explaining an approach, and discussing tradeoffs.", "exercise": "Draft a STAR answer about a difficult deadline using an example from your own work."}, {"id": "project", "title": "Explain a project clearly", "body": "Start with the problem and users. Describe your contribution, architecture, important choices and testing. Explain one limitation honestly. Separate implemented features from proposed improvements; listing tools does not explain what they did.", "exercise": "Explain SmartHire''s login, resume scoring and interview recording in two minutes."}, {"id": "review", "title": "Review recorded practice", "body": "Watch a practice recording and compare the transcript with what was said. Look for clear examples, concise explanations and unanswered parts of the question. Pace and filler counts are rough indicators, not confidence or correctness scores. Choose one specific improvement for the next session.", "exercise": "Record a mock interview and note one answer to shorten and one answer that needs a concrete example."}]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('java-backend-path','path','{"title": "Java Backend Developer", "description": "Build Java, SQL and API foundations, then practice explaining your architecture.", "topic": "Java", "courses": ["java-foundations", "sql-practice", "api-testing", "interview-skills"]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('frontend-path','path','{"title": "Frontend Developer", "description": "Learn React state and effects, understand APIs and practice explaining UI decisions.", "topic": "React", "courses": ["react-essentials", "api-testing", "interview-skills"]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('automation-path','path','{"title": "Automation Test Engineer", "description": "Develop Java and API testing skills with repeatable validation and interview practice.", "topic": "Testing", "courses": ["java-foundations", "api-testing", "sql-practice", "interview-skills"]}'::jsonb) on conflict(id) do update set data=excluded.data;
insert into public.catalog_items(id,kind,data) values ('python-path','path','{"title": "Python Backend Developer", "description": "Connect Python endpoints, relational storage and reliable API checks.", "topic": "Python", "courses": ["python-backend", "sql-practice", "api-testing", "interview-skills"]}'::jsonb) on conflict(id) do update set data=excluded.data;
