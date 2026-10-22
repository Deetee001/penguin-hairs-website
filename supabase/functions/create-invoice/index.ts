import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_API = "https://api.stripe.com/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

async function stripeFetch(path: string, method: string, params?: Record<string, string>) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${path} failed`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Verify admin auth token (same pattern as booking-update)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_KEY },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { booking_id, amount, description, due_days } = await req.json();
    const amountNum = Number(amount);
    if (!booking_id || !amountNum || amountNum <= 0) {
      return new Response(JSON.stringify({ error: "Missing booking_id or a positive amount" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const bookingRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking_id}&select=*`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const bookings = await bookingRes.json();
    const booking = bookings?.[0];
    if (!booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const customerName = [booking.first_name, booking.last_name].filter(Boolean).join(" ");

    // Find or create the Stripe customer for this client
    let customerId = booking.stripe_customer_id as string | null;
    if (!customerId) {
      const existing = await stripeFetch(`/customers?email=${encodeURIComponent(booking.email)}&limit=1`, "GET");
      if (existing.data?.[0]) {
        customerId = existing.data[0].id;
      } else {
        const created = await stripeFetch("/customers", "POST", {
          email: booking.email,
          name: customerName,
        });
        customerId = created.id;
      }
    }

    const dueDays = Number(due_days) > 0 ? String(Number(due_days)) : "7";
    const invoiceDescription = description || `${booking.service} — ${booking.date}`;

    // Create the invoice first, then attach the line item to it directly —
    // pending (unattached) invoice items are not reliably pulled onto a
    // newly created invoice across API versions.
    const invoice = await stripeFetch("/invoices", "POST", {
      customer: customerId as string,
      collection_method: "send_invoice",
      days_until_due: dueDays,
      "metadata[booking_id]": String(booking_id),
    });

    await stripeFetch("/invoiceitems", "POST", {
      customer: customerId as string,
      invoice: invoice.id,
      amount: String(Math.round(amountNum * 100)),
      currency: "cad",
      description: invoiceDescription,
    });

    await stripeFetch(`/invoices/${invoice.id}/finalize`, "POST");
    const sent = await stripeFetch(`/invoices/${invoice.id}/send`, "POST");

    await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking_id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        stripe_customer_id: customerId,
        stripe_invoice_id: sent.id,
        invoice_status: sent.status,
        invoice_amount: amountNum,
        invoice_url: sent.hosted_invoice_url,
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      invoiceId: sent.id,
      invoiceUrl: sent.hosted_invoice_url,
      status: sent.status,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
