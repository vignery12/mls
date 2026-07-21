-- ============================================================================
--  Merit Legal Services — migration: "who it's with" + staff-created bookings
--  --------------------------------------------------------------------------
--  Run this ONCE in Supabase -> SQL Editor IF you already ran supabase-setup.sql
--  previously and have data you want to KEEP. It is additive and does NOT drop
--  any tables. (If you are setting up fresh, just run supabase-setup.sql, which
--  already includes everything below.)
-- ============================================================================

-- 1. New "who it's with" field on slots and appointments --------------------
alter table public.slots        add column if not exists staff_name text;
alter table public.appointments add column if not exists staff_name text;

-- 1b. Allow the same date+time more than once as long as it's with a DIFFERENT
--     person. staff_name becomes a non-null string ('' = unspecified) and the
--     uniqueness key includes it.
update public.slots set staff_name = '' where staff_name is null;
alter table public.slots alter column staff_name set default '';
alter table public.slots alter column staff_name set not null;
alter table public.slots drop constraint if exists slots_slot_date_slot_time_key;
alter table public.slots drop constraint if exists slots_date_time_staff_key;
alter table public.slots add  constraint slots_date_time_staff_key
  unique (slot_date, slot_time, staff_name);

-- 2. Allow staff to book for clients who have no member account -------------
alter table public.appointments alter column user_id drop not null;

-- 3. Keep staff_name in sync from the slot (extends the existing trigger) ----
create or replace function public.sync_appointment_slot()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  if new.slot_id is not null then
    select s.slot_date, s.slot_time, s.staff_name
      into new.slot_date, new.slot_time, new.staff_name
      from public.slots s
      where s.id = new.slot_id;
  end if;
  return new;
end;
$$;

-- 4. available_slots() now also returns staff_name (return type changed, so
--    it must be dropped and recreated) ---------------------------------------
drop function if exists public.available_slots();
create or replace function public.available_slots()
  returns table (id uuid, slot_date date, slot_time time, staff_name text)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select s.id, s.slot_date, s.slot_time, s.staff_name
    from public.slots s
   where s.published = true
     and (s.slot_date > current_date
          or (s.slot_date = current_date and s.slot_time >= current_time))
     and not exists (
       select 1 from public.appointments a
        where a.slot_id = s.id and a.status in ('pending', 'confirmed')
     )
   order by s.slot_date, s.slot_time;
$$;
grant execute on function public.available_slots() to authenticated;

-- 5. Staff booking on behalf of a walk-in / call-in client ------------------
create or replace function public.admin_book_slot(
  p_slot_id  uuid,
  p_first    text,
  p_last     text,
  p_email    text,
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
  v_uid  uuid;
  v_id   uuid;
  v_open boolean;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.';
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

  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;

  insert into public.appointments
    (user_id, slot_id, first_name, last_name, email, phone, service, language, notes, status)
  values
    (v_uid, p_slot_id, p_first, p_last, p_email, p_phone, p_service, p_language, p_notes, 'confirmed')
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.admin_book_slot(uuid, text, text, text, text, text, text, text) to authenticated;
