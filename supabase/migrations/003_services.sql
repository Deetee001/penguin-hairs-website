-- Penguin Hairs: services table
-- Run this once in the Supabase SQL Editor

create table if not exists services (
  id           bigserial primary key,
  name         text not null,
  description  text,
  duration     text,
  price_from   int default 0,
  icon         text default 'fas fa-star',
  booking_value text,
  sort_order   int default 0,
  active       boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table services enable row level security;

-- Styling page (and anyone) can read services
create policy "anon_select_services" on services for select to anon using (true);

-- Admin (uses anon key) can create/update/delete services
create policy "anon_insert_services" on services for insert to anon with check (true);
create policy "anon_update_services" on services for update to anon using (true);
create policy "anon_delete_services" on services for delete to anon using (true);

-- Seed with existing hardcoded services
insert into services (name, description, duration, price_from, icon, booking_value, sort_order) values
  ('Wig Installation',
   'Professional wig installation with seamless blending and natural hairline customization. Our expert stylists ensure a flawless, undetectable finish every time.',
   '2 hours', 150, 'fas fa-crown', 'Wig Installation', 1),
  ('Custom Wig Cut',
   'Precision cutting tailored to your face shape and style preferences. We sculpt your wig to frame your features perfectly, creating a look uniquely yours.',
   '1.5 hours', 120, 'fas fa-cut', 'Custom Wig Cut', 2),
  ('Wig Styling & Color',
   'Complete styling and professional coloring services for your perfect look. From highlights to full color transformations, we bring your vision to life with artistry.',
   '3 hours', 200, 'fas fa-palette', 'Wig Styling & Color', 3),
  ('Maintenance & Refresh',
   'Deep cleaning, conditioning, and restyling to restore your wig''s beauty. Regular maintenance extends the life of your investment and keeps it looking brand new.',
   '1 hour', 80, 'fas fa-spa', 'Maintenance & Refresh', 4);
