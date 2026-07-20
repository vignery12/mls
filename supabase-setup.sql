-- ============================================================================
--  Merit Legal Services — Supabase database setup  (v2: accounts + booking)
--  Run this ONCE in the Supabase dashboard:  SQL Editor -> New query -> Run.
--
--  WHAT THIS BUILDS
--  ----------------
--   • admins        — which signed-in users are staff/administrators.
--   • slots         — appointment times the admin creates and publishes.
--   • appointments  — a member's request for one specific published slot.
--
--  THE FLOW
--   1. Admin signs in on admin-log-in.html and creates + publishes slots.
--   2. A member signs up / logs in on schedule.html and requests an open slot.
--      That slot is immediately "held" — no one else can take it.
--   3. Admin confirms, rejects, or changes the request. The member sees the
--      live status (and the final date/time) on their own page.
--
--  SECURITY MODEL
--   • Row Level Security (RLS) is on for every table.
--   • Members can read ONLY their own appointments. They never read the
--     appointments (or personal data) of anyone else.
--   • Members book / cancel / reschedule only through the SECURITY DEFINER
--     functions below, which enforce "one client per slot" atomically.
--   • Admins (rows in the `admins` table) get full read / manage access.
--
--  IMPORTANT — THIS REPLACES THE OLD `appointments` TABLE.
--      The booking model changed (no more free-text "preferred" date/time;
--      appointments now tie to a member account and a published slot), so the
--      old table is dropped and rebuilt. If you have real appointment rows you
--      need to keep, export them first (Table Editor -> appointments -> Export)
--      BEFORE running this script.
-- ============================================================================

-- 0. Clean slate for the parts this script owns -----------------------------
drop table if exists public.appointments cascade;
drop table if exists public.slots        cascade;
-- (admins is left in place if it already exists so you don't lose admin grants)

-- 1. Admins -----------------------------------------------------------------
--    A user is an admin simply by having a row here. You add the first admin
--    by hand once (see the "BOOTSTRAP" note at the bottom of this file).
create table if not exists public.admins (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- Helper: is the current signed-in user an admin?  (SECURITY DEFINER so it can
-- read the admins table regardless of the caller's own row-level permissions,
-- which also avoids RLS recursion.)
create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- Admins may read the admins list (e.g. to confirm their own status).
drop policy if exists "Admins can read admins" on public.admins;
create policy "Admins can read admins"
  on public.admins for select to authenticated
  using (public.is_admin());

-- 2. Slots ------------------------------------------------------------------
--    Availability the admin creates. `published = true` makes a slot visible
--    to members. One slot = one (date, time).
create table public.slots (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slot_date  date        not null,
  slot_time  time        not null,
  published  boolean     not null default false,
  created_by uuid        references auth.users (id) on delete set null,
  unique (slot_date, slot_time)
);
create index if not exists slots_date_idx on public.slots (slot_date, slot_time);
alter table public.slots enable row level security;

-- Only admins touch the slots table directly. Members never read it — they get
-- availability through the available_slots() function (below), which hides slots
-- that are already taken.
drop policy if exists "Admins manage slots" on public.slots;
create policy "Admins manage slots"
  on public.slots for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Appointments -----------------------------------------------------------
--    A member's request for a slot. slot_date / slot_time are copied from the
--    slot (kept in sync by a trigger) so a member's own page is a single-table
--    read and survives a slot being deleted.
create table public.appointments (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  slot_id    uuid        references public.slots (id) on delete set null,
  slot_date  date        not null,
  slot_time  time        not null,
  first_name text        not null,
  last_name  text        not null,
  email      text        not null,
  phone      text        not null,
  service    text        not null,
  language   text,
  notes      text,
  status     text        not null default 'pending'
              check (status in ('pending', 'confirmed', 'rejected', 'cancelled'))
);
create index if not exists appointments_user_idx    on public.appointments (user_id);
create index if not exists appointments_status_idx  on public.appointments (status);
create index if not exists appointments_created_idx on public.appointments (created_at desc);

-- "One client per slot": at most ONE active (pending/confirmed) appointment may
-- point at a given slot. Rejected/cancelled requests free the slot again. This
-- unique index is the final guard against two people grabbing the same slot.
create unique index appointments_one_active_per_slot
  on public.appointments (slot_id)
  where status in ('pending', 'confirmed') and slot_id is not null;

alter table public.appointments enable row level security;

-- Keep slot_date/slot_time and updated_at in step with slot_id automatically.
create or replace function public.sync_appointment_slot()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  if new.slot_id is not null then
    select s.slot_date, s.slot_time
      into new.slot_date, new.slot_time
      from public.slots s
      where s.id = new.slot_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_appointment_slot on public.appointments;
create trigger trg_sync_appointment_slot
  before insert or update on public.appointments
  for each row execute function public.sync_appointment_slot();

-- Members read ONLY their own appointments; admins read all.
drop policy if exists "Read own appointments" on public.appointments;
create policy "Read own appointments"
  on public.appointments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Admins can update (confirm / reject / change) and delete any appointment.
-- Members do NOT update directly — they use the RPCs below.
drop policy if exists "Admins update appointments" on public.appointments;
create policy "Admins update appointments"
  on public.appointments for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete appointments" on public.appointments;
create policy "Admins delete appointments"
  on public.appointments for delete to authenticated
  using (public.is_admin());

-- 4. Member-facing booking functions ----------------------------------------
--    All SECURITY DEFINER so they can enforce the rules atomically. Members
--    never write to the tables directly.

-- (a) Open, published, future slots that nobody has taken yet.
--     Returns only times — never any personal data.
create or replace function public.available_slots()
  returns table (id uuid, slot_date date, slot_time time)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select s.id, s.slot_date, s.slot_time
    from public.slots s
   where s.published = true
     and (s.slot_date > current_date
          or (s.slot_date = current_date and s.slot_time >= current_time))
     and not exists (
       select 1 from public.appointments a
        where a.slot_id = s.id
          and a.status in ('pending', 'confirmed')
     )
   order by s.slot_date, s.slot_time;
$$;
grant execute on function public.available_slots() to authenticated;

-- (b) Request a slot. Fails if the slot is gone, unpublished, or already taken.
create or replace function public.book_slot(
  p_slot_id  uuid,
  p_first    text,
  p_last     text,
  p_phone    text,
  p_service  text,
  p_language text,
  p_notes    text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_email text;
  v_id    uuid;
  v_open  boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to book.';
  end if;

  select true into v_open
    from public.slots s
   where s.id = p_slot_id
     and s.published = true
     and (s.slot_date > current_date
          or (s.slot_date = current_date and s.slot_time >= current_time))
     and not exists (
       select 1 from public.appointments a
        where a.slot_id = s.id and a.status in ('pending', 'confirmed')
     );

  if v_open is not true then
    raise exception 'That time is no longer available. Please pick another.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.appointments
    (user_id, slot_id, first_name, last_name, email, phone, service, language, notes, status)
  values
    (auth.uid(), p_slot_id, p_first, p_last, coalesce(v_email, ''), p_phone,
     p_service, p_language, p_notes, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.book_slot(uuid, text, text, text, text, text, text) to authenticated;

-- (c) Cancel one of my own appointments.
create or replace function public.cancel_my_appointment(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update public.appointments
     set status = 'cancelled'
   where id = p_id
     and user_id = auth.uid()
     and status in ('pending', 'confirmed');
  if not found then
    raise exception 'Appointment not found or cannot be cancelled.';
  end if;
end;
$$;
grant execute on function public.cancel_my_appointment(uuid) to authenticated;

-- (d) Move one of my own appointments to a different open slot.
--     Goes back to 'pending' so the office re-confirms the new time.
create or replace function public.reschedule_my_appointment(p_id uuid, p_new_slot_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_open boolean;
begin
  if not exists (
    select 1 from public.appointments
     where id = p_id and user_id = auth.uid()
       and status in ('pending', 'confirmed')
  ) then
    raise exception 'Appointment not found.';
  end if;

  select true into v_open
    from public.slots s
   where s.id = p_new_slot_id
     and s.published = true
     and (s.slot_date > current_date
          or (s.slot_date = current_date and s.slot_time >= current_time))
     and not exists (
       select 1 from public.appointments a
        where a.slot_id = s.id and a.status in ('pending', 'confirmed')
     );

  if v_open is not true then
    raise exception 'That time is no longer available. Please pick another.';
  end if;

  update public.appointments
     set slot_id = p_new_slot_id, status = 'pending'
   where id = p_id and user_id = auth.uid();
end;
$$;
grant execute on function public.reschedule_my_appointment(uuid, uuid) to authenticated;

-- ============================================================================
--  BOOTSTRAP — make yourself an admin (do this ONCE)
--  --------------------------------------------------------------------------
--  1. Create the admin's login:  Authentication -> Users -> "Add user".
--     Enter the admin email + a password, and tick "Auto Confirm User".
--  2. Copy that user's UID from the Users list.
--  3. Run (replacing the UID):
--
--        insert into public.admins (user_id)
--        values ('00000000-0000-0000-0000-000000000000');
--
--  Now that account can sign in at /admin-log-in.html and manage everything.
--  Repeat for any additional staff members.
--
--  MEMBER SIGN-UP NOTE
--  --------------------------------------------------------------------------
--  Members create their own accounts on schedule.html. Under
--  Authentication -> Providers -> Email, decide whether "Confirm email" is on:
--    - ON  (recommended) — members must click a link in a confirmation email
--                          before they can log in. The page tells them to check
--                          their inbox after signing up.
--    - OFF               — members can log in immediately after signing up.
-- ============================================================================
