-- Allow anon role to SELECT from orders and bookings (needed for admin dashboard)
CREATE POLICY "anon_select_orders" ON orders FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_bookings" ON bookings FOR SELECT TO anon USING (true);
