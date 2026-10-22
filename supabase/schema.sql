-- Run once in your Supabase SQL editor. Replace the administrator email below first.
create table public.role_allowlist (
 email text primary key check (email = lower(email)),
 role text not null check (role in ('admin','recruiter')),
 created timestamptz not null default now()
);
insert into public.role_allowlist(email,role) values ('replace_with_admin_email@example.com','admin');
create table public.records (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('resume','test','interview','template')),
 data jsonb not null,
 created timestamptz not null default now()
);
create table public.grants (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null references auth.users(id) on delete cascade,
 email text not null check (email = lower(email)),
 created timestamptz not null default now(),
 unique(owner,email)
);
create index records_owner_idx on public.records(owner);
create index grants_email_idx on public.grants(email);
alter table public.role_allowlist enable row level security;
alter table public.records enable row level security;
alter table public.grants enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.role_allowlist where email=lower(auth.jwt()->>'email') and role='admin');
$$;
create function public.is_recruiter() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.role_allowlist where email=lower(auth.jwt()->>'email') and role in ('admin','recruiter'));
$$;
create function public.is_authorized_recruiter(target_email text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.role_allowlist where email=lower(target_email) and role in ('admin','recruiter'));
$$;
create function public.can_read_owner(target_owner uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select target_owner=auth.uid() or (public.is_recruiter() and exists(select 1 from public.grants where owner=target_owner and email=lower(auth.jwt()->>'email')));
$$;
revoke all on function public.is_admin(),public.is_recruiter(),public.is_authorized_recruiter(text),public.can_read_owner(uuid) from public,anon;
grant execute on function public.is_admin(),public.is_recruiter(),public.is_authorized_recruiter(text),public.can_read_owner(uuid) to authenticated;
create policy roles_read on public.role_allowlist for select to authenticated using(email=lower(auth.jwt()->>'email') or public.is_admin());
create policy roles_insert on public.role_allowlist for insert to authenticated with check(public.is_admin() and role='recruiter');
create policy roles_update on public.role_allowlist for update to authenticated using(public.is_admin() and role='recruiter') with check(public.is_admin() and role='recruiter');
create policy roles_delete on public.role_allowlist for delete to authenticated using(public.is_admin() and role='recruiter');
create policy records_read on public.records for select to authenticated using(owner=auth.uid() or (kind<>'template' and public.can_read_owner(owner)));
create policy records_insert on public.records for insert to authenticated with check(owner=auth.uid() and (kind<>'template' or public.is_recruiter()));
create policy grants_read on public.grants for select to authenticated using(owner=auth.uid() or (email=lower(auth.jwt()->>'email') and public.is_recruiter()));
create policy grants_insert on public.grants for insert to authenticated with check(owner=auth.uid() and public.is_authorized_recruiter(email));
create policy grants_update on public.grants for update to authenticated using(owner=auth.uid()) with check(owner=auth.uid() and public.is_authorized_recruiter(email));
create policy grants_delete on public.grants for delete to authenticated using(owner=auth.uid());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('assets','assets',false,83886080,array['application/pdf','text/plain','video/webm','video/mp4']);
create policy assets_upload on storage.objects for insert to authenticated with check(bucket_id='assets' and (storage.foldername(name))[1]=auth.uid()::text);
create policy assets_read on storage.objects for select to authenticated using(bucket_id='assets' and ((storage.foldername(name))[1]=auth.uid()::text or (public.is_recruiter() and exists(select 1 from public.grants where owner::text=(storage.foldername(name))[1] and email=lower(auth.jwt()->>'email')))));
