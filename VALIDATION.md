# Validation performed for dashboard edition

Date: 11 October 2026.

- Python application modules compiled successfully.
- **69 backend tests passed** using FastAPI TestClient and mocked Supabase HTTP (41 existing checks and 28 dashboard checks).
- Existing checks cover tokens, candidate/recruiter/admin roles, consent/revocation, private media, server-side resume/test scoring and upload validation.
- New checks cover the course/path catalog, profile ownership and upsert, input validation, HTTPS link restrictions, opt-in aliases and opt-out, recruiter/admin events and jobs, catalog deletion ownership, expired events, action deduplication, progress undo, bookmarks and private preferences.
- React TypeScript checking and the Vite production build passed for version 3.0.0.
- 12 React server-render checks passed across ten hub screens and administrator/recruiter publishing controls. These validate rendered structure and content, not browser interaction or visual appearance.
- A real Uvicorn process started; six HTTP route checks passed for `/api/health`, `/docs`, `/candidate`, `/recruiter`, `/admin` and `/login` with built frontend assets present.

## Verification boundaries

Supabase requests are mocked in API tests. The additive SQL migration was reviewed but was not executed against a live PostgreSQL/Supabase project. Execute it in the configured project and verify policies and leaderboard results there. No live Google OAuth, browser visual/responsive checks, browser speech service or physical camera/microphone tests were performed in this environment. Lesson completion is self-reported and the leaderboard is a participation indicator.

One upstream Starlette TestClient deprecation warning is emitted. All 69 tests passed despite that warning.

Posting permissions update: the endpoint tests verify candidates cannot publish either kind, recruiters can publish events and jobs, and recruiters cannot delete another author's listings. The updated SQL policies must still be applied in the live Supabase project.
