-- Penguin Hairs: orders and bookings tables
-- Run this once in the Supabase SQL Editor

-- ============ ORDERS ============
create table if not exists orders (
  id               bigserial primary key,
  created_at       timestamptz default now(),
  square_order_id  text,
  square_payment_id text,
  customer_name    text,
  customer_email   text,
  shipping_address jsonb,
  items            jsonb,
  subtotal         numeric(10,2),
  shipping_cost    numeric(10,2),
  total            numeric(10,2),
  status           text default 'paid'
);

-- Service role (edge function) can insert; no public read
alter table orders enable row level security;
create policy "service role full access on orders"
  on orders for all using (auth.role() = 'service_role');

-- ============ BOOKINGS ============
create table if not exists bookings (
  id          bigserial primary key,
  created_at  timestamptz default now(),
  first_name  text not null,
  last_name   text,
  email       text not null,
  service     text not null,
  date        date not null,
  time        text not null,
  notes       text,
  status      text default 'pending'
);

-- Anyone can insert a booking; only service role can read all bookings
alter table bookings enable row level security;
create policy "anon can insert bookings"
  on bookings for insert with check (true);
create policy "service role full access on bookings"
  on bookings for all using (auth.role() = 'service_role');
