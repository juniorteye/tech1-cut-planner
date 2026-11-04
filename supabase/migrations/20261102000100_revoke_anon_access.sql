-- Supabase grants logged-out visitors table access by default. Row level
-- security already blocks them, and this removes the access as a second lock.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
