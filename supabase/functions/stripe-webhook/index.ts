import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const STATUS_BY_EVENT: Record<string, string> = {
  "invoice.paid": "paid",
  "invoice.payment_failed": "payment_failed",
  "invoice.voided": "void",
  "invoice.marked_uncollectible": "uncollectible",
  "invoice.finalized": "open",
};

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig!, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const newStatus = STATUS_BY_EVENT[event.type];
  if (newStatus) {
    const invoice = event.data.object as Stripe.Invoice;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?stripe_invoice_id=eq.${invoice.id}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ invoice_status: newStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err: any) {
      console.error("Failed to update booking from webhook:", err.message);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
