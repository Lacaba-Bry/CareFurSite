-- CareFur public/client website additions.
-- Run once in Supabase SQL Editor or with the Supabase CLI.

create table if not exists public.public_inquiries (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_email text not null,
  subject text not null,
  status text not null default 'open' check (status in ('open','closed')),
  access_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.public_inquiries(id) on delete cascade,
  sender_type text not null check (sender_type in ('client','staff','system')),
  sender_name text,
  staff_user_id uuid references public.users(id),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_inquiry_messages_inquiry_idx
  on public.public_inquiry_messages(inquiry_id, created_at);

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
  status text not null default 'pending_payment'
    check (status in ('pending_payment','confirmed','declined','cancelled')),
  payment_method text not null default 'in_store' check (payment_method = 'in_store'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

alter table public.public_inquiries enable row level security;
alter table public.public_inquiry_messages enable row level security;
alter table public.reservation_requests enable row level security;
alter table public.public_reviews enable row level security;

-- The public site communicates with inquiries/reservations through Edge Functions.
-- No anon direct policies are intentionally added for those tables.

-- Approved reviews are safe to read publicly.
drop policy if exists "Public can read approved reviews" on public.public_reviews;
create policy "Public can read approved reviews"
on public.public_reviews
for select
to anon, authenticated
using (status = 'approved');

-- Staff/admin can read public-site operational data directly in the dashboard if desired.
drop policy if exists "Staff can read inquiries" on public.public_inquiries;
create policy "Staff can read inquiries"
on public.public_inquiries
for select
to authenticated
using (public.is_staff_member() or public.is_admin());

drop policy if exists "Staff can read inquiry messages" on public.public_inquiry_messages;
create policy "Staff can read inquiry messages"
on public.public_inquiry_messages
for select
to authenticated
using (public.is_staff_member() or public.is_admin());

drop policy if exists "Staff can read reservation requests" on public.reservation_requests;
create policy "Staff can read reservation requests"
on public.reservation_requests
for select
to authenticated
using (public.is_staff_member() or public.is_admin());
