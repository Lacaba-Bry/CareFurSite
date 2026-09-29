-- CareFur public website runtime fix
-- Run this file once in Supabase SQL Editor.
-- It removes the public site's dependency on Edge Functions for rooms,
-- reservations, reviews, and client inquiries.

create extension if not exists pgcrypto;

-- ---------- Public inquiries ----------
create table if not exists public.public_inquiries (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid,
  client_name text not null,
  client_email text not null,
  subject text not null,
  status text not null default 'open' check (status in ('open','closed')),
  access_token_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_inquiries add column if not exists client_user_id uuid;
alter table public.public_inquiries alter column access_token_hash drop not null;
create index if not exists public_inquiries_client_user_idx on public.public_inquiries(client_user_id, updated_at desc);

create table if not exists public.public_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.public_inquiries(id) on delete cascade,
  sender_type text not null check (sender_type in ('client','staff','system')),
  sender_name text,
  staff_user_id uuid references public.users(id),
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists public_inquiry_messages_inquiry_idx on public.public_inquiry_messages(inquiry_id, created_at);

alter table public.public_inquiries enable row level security;
alter table public.public_inquiry_messages enable row level security;

-- Owner/client can see only their own inquiry threads.
drop policy if exists "Clients can read own public inquiries" on public.public_inquiries;
create policy "Clients can read own public inquiries"
on public.public_inquiries for select to authenticated
using (client_user_id = auth.uid());

drop policy if exists "Clients can create own public inquiries" on public.public_inquiries;
create policy "Clients can create own public inquiries"
on public.public_inquiries for insert to authenticated
with check (
  client_user_id = auth.uid()
  and status = 'open'
  and lower(client_email) = lower(coalesce(auth.jwt()->>'email',''))
);

-- Staff/admin can read and manage all inquiries.
drop policy if exists "Staff can read inquiries" on public.public_inquiries;
create policy "Staff can read inquiries"
on public.public_inquiries for select to authenticated
using (public.is_staff_member() or public.is_admin());

drop policy if exists "Staff can update inquiries" on public.public_inquiries;
create policy "Staff can update inquiries"
on public.public_inquiries for update to authenticated
using (public.is_staff_member() or public.is_admin())
with check (public.is_staff_member() or public.is_admin());

-- Clients can read messages only in their own inquiries.
drop policy if exists "Clients can read own inquiry messages" on public.public_inquiry_messages;
create policy "Clients can read own inquiry messages"
on public.public_inquiry_messages for select to authenticated
using (
  exists (
    select 1 from public.public_inquiries i
    where i.id = public_inquiry_messages.inquiry_id
      and i.client_user_id = auth.uid()
  )
);

drop policy if exists "Clients can send own inquiry messages" on public.public_inquiry_messages;
create policy "Clients can send own inquiry messages"
on public.public_inquiry_messages for insert to authenticated
with check (
  sender_type = 'client'
  and staff_user_id is null
  and exists (
    select 1 from public.public_inquiries i
    where i.id = public_inquiry_messages.inquiry_id
      and i.client_user_id = auth.uid()
      and i.status = 'open'
  )
);

drop policy if exists "Staff can read inquiry messages" on public.public_inquiry_messages;
create policy "Staff can read inquiry messages"
on public.public_inquiry_messages for select to authenticated
using (public.is_staff_member() or public.is_admin());

drop policy if exists "Staff can send inquiry messages" on public.public_inquiry_messages;
create policy "Staff can send inquiry messages"
on public.public_inquiry_messages for insert to authenticated
with check (
  sender_type = 'staff'
  and staff_user_id = auth.uid()
  and (public.is_staff_member() or public.is_admin())
);

create or replace function public.touch_public_inquiry_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.public_inquiries set updated_at = now() where id = new.inquiry_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_public_inquiry_from_message on public.public_inquiry_messages;
create trigger trg_touch_public_inquiry_from_message
after insert on public.public_inquiry_messages
for each row execute function public.touch_public_inquiry_from_message();

-- ---------- Public room availability ----------
-- SECURITY DEFINER means visitors receive only these safe room fields and
-- never direct access to private booking/owner data.
create or replace function public.public_room_availability(target_date date)
returns table (
  id uuid,
  room_number text,
  room_name text,
  capacity integer,
  status text,
  available boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    r.room_number,
    r.room_name,
    r.capacity,
    r.status::text,
    (
      r.status::text = 'active'
      and not exists (
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
      )
    ) as available
  from public.rooms r
  order by r.room_number;
$$;

revoke all on function public.public_room_availability(date) from public;
grant execute on function public.public_room_availability(date) to anon, authenticated;

-- ---------- Reservation requests ----------
create table if not exists public.reservation_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  owner_name text not null,
  owner_email text not null,
  owner_phone text not null,
  pet_name text not null,
  species text not null,
  breed text,
  room_id uuid references public.rooms(id),
  check_in date not null,
  check_out date not null,
  notes text,
  status text not null default 'pending_payment' check (status in ('pending_payment','confirmed','declined','cancelled')),
  payment_method text not null default 'in_store' check (payment_method = 'in_store'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reservation_requests enable row level security;

drop policy if exists "Public can submit reservation requests" on public.reservation_requests;
create policy "Public can submit reservation requests"
on public.reservation_requests for insert to anon, authenticated
with check (
  status = 'pending_payment'
  and payment_method = 'in_store'
  and check_out > check_in
);

drop policy if exists "Staff can read reservation requests" on public.reservation_requests;
create policy "Staff can read reservation requests"
on public.reservation_requests for select to authenticated
using (public.is_staff_member() or public.is_admin());

-- ---------- Public reviews ----------
create table if not exists public.public_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz
);
alter table public.public_reviews enable row level security;

drop policy if exists "Public can read approved reviews" on public.public_reviews;
create policy "Public can read approved reviews"
on public.public_reviews for select to anon, authenticated
using (status = 'approved');

drop policy if exists "Public can submit reviews" on public.public_reviews;
create policy "Public can submit reviews"
on public.public_reviews for insert to anon, authenticated
with check (
  status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists "Staff can manage reviews" on public.public_reviews;
create policy "Staff can manage reviews"
on public.public_reviews for all to authenticated
using (public.is_staff_member() or public.is_admin())
with check (public.is_staff_member() or public.is_admin());
