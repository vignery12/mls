-- ============================================================================
--  Merit Legal Services — Supabase database setup
--  Run this ONCE in the Supabase dashboard:  SQL Editor -> New query -> Run
--  It creates the appointments table and locks it down with Row Level
--  Security (RLS) so the public website can submit requests but cannot read,
--  edit, or delete anyone's data. Reading/managing appointments is reserved
--  for signed-in staff (used by the admin dashboard in the next phase).
-- ============================================================================

-- 1. The table -----------------------------------------------------------
create table if not exists public.appointments (
  id             uuid         primary key default gen_random_uuid(),
  created_at     timestamptz  not null    default now(),
  first_name     text         not null,
  last_name      text         not null,
  email          text         not null,
  phone          text         not null,
  service        text         not null,
  preferred_date date         not null,
  preferred_time text         not null,
  language       text,
  notes          text,
  -- workflow status used by the admin dashboard later:
  status         text         not null    default 'pending'
                 check (status in ('pending', 'confirmed', 'cancelled'))
);

-- Helpful index for the admin view (newest first / filter by date)
create index if not exists appointments_created_at_idx
  on public.appointments (created_at desc);
create index if not exists appointments_preferred_date_idx
  on public.appointments (preferred_date);

-- 2. Turn on Row Level Security -----------------------------------------
--    With RLS on and no policy, ALL access is denied by default. The
--    policies below then open up exactly what we intend — nothing more.
alter table public.appointments enable row level security;

-- 3. Policies ------------------------------------------------------------

-- (a) Anonymous website visitors may INSERT a request — and nothing else.
--     They cannot select, update, or delete, so no one can read or tamper
--     with other people's submissions using the public key.
drop policy if exists "Public can submit appointments" on public.appointments;
create policy "Public can submit appointments"
  on public.appointments
  for insert
  to anon
  with check (
    -- lightweight sanity checks to reject obviously bad/empty submissions
    char_length(first_name) between 1 and 100 and
    char_length(last_name)  between 1 and 100 and
    char_length(email)      between 3 and 200 and
    char_length(phone)      between 5 and 40  and
    preferred_date >= current_date and
    status = 'pending'
  );

-- (b) Signed-in staff (Supabase Auth users) get full read/manage access.
--     These power the admin dashboard in the next phase.
drop policy if exists "Staff can read appointments" on public.appointments;
create policy "Staff can read appointments"
  on public.appointments
  for select
  to authenticated
  using (true);

drop policy if exists "Staff can update appointments" on public.appointments;
create policy "Staff can update appointments"
  on public.appointments
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Staff can delete appointments" on public.appointments;
create policy "Staff can delete appointments"
  on public.appointments
  for delete
  to authenticated
  using (true);

-- ============================================================================
--  Done. Quick sanity check you can run afterwards:
--    select * from public.appointments order by created_at desc;
--  (Returns rows only when you're signed in / using the SQL editor, which
--   runs with elevated privileges — the anon website key cannot read them.)
-- ============================================================================
