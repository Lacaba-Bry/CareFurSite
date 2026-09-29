-- CareFur public site patch v3
-- Run this AFTER the previous public-site SQL.
-- This patch adds:
-- 1) anonymous email-based public inquiries (no Google sign-in required)
-- 2) Gmail-required public reviews
-- 3) reservation helper RPC with room pricing/estimate fields
-- 4) improved public room availability output

create extension if not exists pgcrypto;

-- -----------------------------
-- Safe schema additions
-- -----------------------------
alter table if exists public.public_inquiries
  add column if not exists access_token_hash text;

alter table if exists public.public_inquiry_messages
  add column if not exists sender_name text;

alter table if exists public.public_inquiry_messages
  add column if not exists staff_user_id uuid references public.users(id);

alter table if exists public.public_reviews
  add column if not exists reviewer_email text;

alter table if exists public.reservation_requests
  add column if not exists requested_room_number text,
  add column if not exists room_rate_per_night numeric(10,2),
  add column if not exists nights integer,
  add column if not exists estimated_total numeric(10,2);

create index if not exists public_inquiries_updated_at_idx
  on public.public_inquiries(updated_at desc);

create index if not exists public_reviews_status_created_idx
  on public.public_reviews(status, created_at desc);

-- -----------------------------
-- Improved public room function
-- -----------------------------
create or replace function public.public_room_availability(target_date date)
returns table (
  room_id uuid,
  room_number text,
  room_name text,
  capacity integer,
  room_status text,
  availability_status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id as room_id,
    r.room_number,
    r.room_name,
    r.capacity,
    r.status::text as room_status,
    case
      when lower(coalesce(r.status::text, 'active')) in ('inactive','maintenance','unavailable','disabled') then 'contact'
      when exists (
        select 1
        from public.bookings b
        where b.room_id = r.id
          and b.status::text <> 'cancelled'
          and b.check_in_at::date <= target_date
          and coalesce(b.actual_check_out_at, b.expected_check_out_at)::date >= target_date
          and not (
            b.status::text = 'checked_out'
            and coalesce(b.actual_check_out_at, b.expected_check_out_at)::date < target_date
          )
      ) then 'occupied'
      else 'available'
    end as availability_status
  from public.rooms r
  order by r.room_number;
$$;

revoke all on function public.public_room_availability(date) from public;
grant execute on function public.public_room_availability(date) to anon, authenticated;

-- -----------------------------
-- Public reviews via RPC
-- -----------------------------
create or replace function public.submit_public_review(
  p_reviewer_name text,
  p_reviewer_email text,
  p_rating integer,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_reviewer_name), '') = '' then
    raise exception 'Reviewer name is required';
  end if;

  if lower(coalesce(trim(p_reviewer_email), '')) not like '%@gmail.com' then
    raise exception 'A Gmail address is required';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 to 5';
  end if;

  if coalesce(trim(p_comment), '') = '' then
    raise exception 'Review comment is required';
  end if;

  insert into public.public_reviews (
    reviewer_name,
    reviewer_email,
    rating,
    comment,
    status
  ) values (
    trim(p_reviewer_name),
    lower(trim(p_reviewer_email)),
    p_rating,
    trim(p_comment),
    'pending'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_public_review(text, text, integer, text) from public;
grant execute on function public.submit_public_review(text, text, integer, text) to anon, authenticated;

-- Keep approved reviews publicly visible.
drop policy if exists "Public can read approved reviews" on public.public_reviews;
create policy "Public can read approved reviews"
on public.public_reviews
for select
to anon, authenticated
using (status = 'approved');

-- -----------------------------
-- Anonymous email-based inquiry chat
-- -----------------------------
create or replace function public.create_public_inquiry(
  p_client_name text,
  p_client_email text,
  p_subject text,
  p_first_message text
)
returns table (inquiry_id uuid, access_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_token text := encode(gen_random_bytes(16), 'hex');
  v_token_hash text := encode(digest(v_token, 'sha256'), 'hex');
begin
  if coalesce(trim(p_client_name), '') = '' then
    raise exception 'Client name is required';
  end if;

  if coalesce(trim(p_client_email), '') = '' or position('@' in p_client_email) = 0 then
    raise exception 'A valid email address is required';
  end if;

  if coalesce(trim(p_subject), '') = '' then
    raise exception 'Subject is required';
  end if;

  if coalesce(trim(p_first_message), '') = '' then
    raise exception 'Message is required';
  end if;

  insert into public.public_inquiries (
    id,
    client_name,
    client_email,
    subject,
    status,
    access_token_hash
  ) values (
    v_id,
    trim(p_client_name),
    lower(trim(p_client_email)),
    trim(p_subject),
    'open',
    v_token_hash
  );

  insert into public.public_inquiry_messages (
    inquiry_id,
    sender_type,
    sender_name,
    message
  ) values (
    v_id,
    'client',
    trim(p_client_name),
    trim(p_first_message)
  );

  return query select v_id, v_token;
end;
$$;

create or replace function public.get_public_inquiry_thread(
  p_inquiry_id uuid,
  p_access_token text
)
returns table (
  id uuid,
  sender_type text,
  sender_name text,
  message text,
  created_at timestamptz,
  subject text,
  status text,
  client_name text,
  client_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text := encode(digest(coalesce(p_access_token, ''), 'sha256'), 'hex');
begin
  if not exists (
    select 1
    from public.public_inquiries i
    where i.id = p_inquiry_id
      and i.access_token_hash = v_expected
  ) then
    raise exception 'Inquiry access denied';
  end if;

  return query
  select
    m.id,
    m.sender_type,
    coalesce(m.sender_name, case when m.sender_type = 'staff' then 'CareFur Staff' else i.client_name end) as sender_name,
    m.message,
    m.created_at,
    i.subject,
    i.status,
    i.client_name,
    i.client_email
  from public.public_inquiry_messages m
  join public.public_inquiries i
    on i.id = m.inquiry_id
  where i.id = p_inquiry_id
  order by m.created_at asc;
end;
$$;

create or replace function public.send_public_inquiry_message(
  p_inquiry_id uuid,
  p_access_token text,
  p_sender_name text,
  p_message text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text := encode(digest(coalesce(p_access_token, ''), 'sha256'), 'hex');
  v_status text;
begin
  select i.status
    into v_status
  from public.public_inquiries i
  where i.id = p_inquiry_id
    and i.access_token_hash = v_expected;

  if v_status is null then
    raise exception 'Inquiry access denied';
  end if;

  if v_status = 'closed' then
    raise exception 'Inquiry is already closed';
  end if;

  if coalesce(trim(p_message), '') = '' then
    raise exception 'Message is required';
  end if;

  insert into public.public_inquiry_messages (
    inquiry_id,
    sender_type,
    sender_name,
    message
  ) values (
    p_inquiry_id,
    'client',
    coalesce(nullif(trim(p_sender_name), ''), 'Client'),
    trim(p_message)
  );

  update public.public_inquiries
  set updated_at = now()
  where id = p_inquiry_id;

  return true;
end;
$$;

revoke all on function public.create_public_inquiry(text, text, text, text) from public;
revoke all on function public.get_public_inquiry_thread(uuid, text) from public;
revoke all on function public.send_public_inquiry_message(uuid, text, text, text) from public;

grant execute on function public.create_public_inquiry(text, text, text, text) to anon, authenticated;
grant execute on function public.get_public_inquiry_thread(uuid, text) to anon, authenticated;
grant execute on function public.send_public_inquiry_message(uuid, text, text, text) to anon, authenticated;

-- -----------------------------
-- Public reservation request RPC
-- -----------------------------
create or replace function public.create_public_reservation_request(
  p_owner_name text,
  p_email text,
  p_phone text,
  p_pet_name text,
  p_pet_species text,
  p_pet_breed text,
  p_room_id uuid,
  p_requested_room_number text,
  p_check_in_at timestamptz,
  p_expected_check_out_at timestamptz,
  p_special_instructions text,
  p_room_rate_per_night numeric,
  p_nights integer,
  p_estimated_total numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text := 'CF-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
begin
  if coalesce(trim(p_owner_name), '') = '' then
    raise exception 'Owner name is required';
  end if;

  if coalesce(trim(p_email), '') = '' or position('@' in p_email) = 0 then
    raise exception 'A valid email is required';
  end if;

  if coalesce(trim(p_phone), '') = '' then
    raise exception 'Phone is required';
  end if;

  if coalesce(trim(p_pet_name), '') = '' then
    raise exception 'Pet name is required';
  end if;

  if coalesce(trim(p_pet_species), '') = '' then
    raise exception 'Pet species is required';
  end if;

  if p_expected_check_out_at::date <= p_check_in_at::date then
    raise exception 'Check-out must be after check-in';
  end if;

  insert into public.reservation_requests (
    request_code,
    owner_name,
    owner_email,
    owner_phone,
    pet_name,
    species,
    breed,
    room_id,
    requested_room_number,
    check_in,
    check_out,
    notes,
    status,
    payment_method,
    room_rate_per_night,
    nights,
    estimated_total
  ) values (
    v_code,
    trim(p_owner_name),
    lower(trim(p_email)),
    trim(p_phone),
    trim(p_pet_name),
    trim(p_pet_species),
    nullif(trim(p_pet_breed), ''),
    p_room_id,
    nullif(trim(p_requested_room_number), ''),
    p_check_in_at::date,
    p_expected_check_out_at::date,
    nullif(trim(p_special_instructions), ''),
    'pending_payment',
    'in_store',
    p_room_rate_per_night,
    p_nights,
    p_estimated_total
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_public_reservation_request(text, text, text, text, text, text, uuid, text, timestamptz, timestamptz, text, numeric, integer, numeric) from public;
grant execute on function public.create_public_reservation_request(text, text, text, text, text, text, uuid, text, timestamptz, timestamptz, text, numeric, integer, numeric) to anon, authenticated;
