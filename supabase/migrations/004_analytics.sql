-- Penguin Hairs: analytics_events table

create table if not exists analytics_events (
  id           bigserial primary key,
  event_type   text not null,           -- 'page_view', 'product_view', 'purchase'
  page         text,                    -- 'homepage', 'shop', 'styling'
  product_id   text,                    -- product id (for product_view / purchase)
  product_name text,                    -- snapshot of name at time of event
  amount       int,                     -- purchase amount in pence/cents (future)
  created_at   timestamptz default now()
);

create index analytics_events_event_type_idx on analytics_events (event_type);
create index analytics_events_created_at_idx on analytics_events (created_at);
create index analytics_events_product_id_idx on analytics_events (product_id);

alter table analytics_events enable row level security;

create policy "anon_select_analytics" on analytics_events for select to anon using (true);
create policy "anon_insert_analytics" on analytics_events for insert to anon with check (true);
