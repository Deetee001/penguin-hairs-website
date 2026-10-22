import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const OWNER_EMAIL = "orders@penguinhairs.com";

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function esc(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { paymentIntentId, cart, shipping, shippingCost, promoCode } = await req.json();

    if (!paymentIntentId) {
      return new Response(JSON.stringify({ success: false, error: "Missing payment reference" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return new Response(JSON.stringify({ success: false, error: "Payment not confirmed. Please contact us with reference: " + paymentIntentId }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Guard against a duplicate confirm call creating a second order for the same payment
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?square_payment_id=eq.${encodeURIComponent(paymentIntentId)}&select=square_order_id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const existing = await existingRes.json();
    if (existing?.[0]) {
      return new Response(JSON.stringify({ success: true, orderRef: existing[0].square_order_id }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // --- Recompute the same total that was charged, to attach the right item list ---
    const subtotal = (cart || []).reduce((sum: number, item: any) => sum + item.price * (item.qty || 1), 0);
    const shippingCostNum = Number(shippingCost) || 0;

    let discount = 0;
    if (promoCode) {
      const promoRes = await fetch(
        `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(promoCode)}&select=*`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const promos = await promoRes.json();
      const promo = promos?.[0];
      if (promo) {
        discount = promo.discount_type === "percent"
          ? subtotal * (promo.discount_value / 100)
          : Math.min(Number(promo.discount_value), subtotal);
        discount = Math.round(discount * 100) / 100;
      }
    }

    const total = Math.max(0, subtotal - discount + shippingCostNum);
    const expectedCents = Math.round(total * 100);

    if (paymentIntent.amount_received < expectedCents * 0.99) {
      return new Response(JSON.stringify({ success: false, error: "Payment amount mismatch. Please contact support. Ref: " + paymentIntentId }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const orderRef = "PH-" + Date.now().toString(36).toUpperCase();

    const items = (cart || []).map((i: any) => ({
      id: i.id, name: i.name, price: i.price, qty: i.qty || 1,
      color: i.selectedColor || null, length: i.selectedLength || null,
      specs: i.specs || "",
    }));

    if (promoCode && discount > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(promoCode)}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ uses_count: { increment: 1 } }),
      });
    }

    const orderRecord = {
      square_order_id: orderRef,
      square_payment_id: paymentIntentId,
      payment_method: "stripe",
      currency: "CAD",
      customer_name: `${shipping.firstName} ${shipping.lastName}`.trim(),
      customer_email: shipping.email,
      customer_phone: shipping.phone || "",
      shipping_address: shipping,
      items,
      subtotal,
      shipping_cost: shippingCostNum,
      total,
      status: "paid",
    };

    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(orderRecord),
    });

    if (!orderRes.ok) {
      const err = await orderRes.text();
      console.error("Order save error:", err);
      return new Response(JSON.stringify({ success: true, orderRef, warning: "Order recorded but DB save failed." }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    try {
      const itemRows = items.map((item: any) => `
        <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;font-size:14px;color:#1a1a1a;">${esc(item.name)} <span style="color:#999">&times;${item.qty}</span></p>
                  <p style="margin:3px 0 0;font-size:11px;color:#aaa;">${esc(item.specs)}</p></td>
              <td align="right"><p style="margin:0;font-size:14px;color:#b8932a;font-weight:500;">$${(item.price * item.qty).toFixed(2)}</p></td>
            </tr>
          </table>
        </td></tr>`).join("");

      const customerHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="text-align:center;padding-bottom:28px;">
          <p style="margin:0 0 4px;font-size:22px;">&#x1f427;</p>
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b8932a;font-weight:600;">PENGUIN HAIRS</p>
        </td></tr>
        <tr><td style="background:#ffffff;border-top:3px solid #c9a048;padding:40px 40px 36px;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
          <h1 style="margin:0 0 4px;font-size:26px;font-weight:300;color:#1a1a1a;">Order Confirmed</h1>
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#b8932a;">Order #${orderRef}</p>
          <p style="margin:0 0 28px;font-size:14px;color:#777;line-height:1.7;">Hi ${esc(shipping.firstName)}, thank you for your order. Your Penguin Hairs piece is being prepared with care.</p>
          <div style="border-top:1px solid #ede8df;margin-bottom:20px;"></div>
          <p style="margin:0 0 14px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Order Summary</p>
          <table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr><td style="padding:6px 0;"><span style="font-size:13px;color:#888;">Subtotal</span></td><td align="right"><span style="font-size:13px;color:#888;">$${subtotal.toFixed(2)}</span></td></tr>
            <tr><td style="padding:6px 0;"><span style="font-size:13px;color:#888;">Shipping</span></td><td align="right"><span style="font-size:13px;color:#888;">$${shippingCostNum.toFixed(2)}</span></td></tr>
            <tr><td style="padding:10px 0 0;border-top:1px solid #ede8df;"><span style="font-size:15px;color:#1a1a1a;font-weight:600;">Total</span></td><td align="right" style="border-top:1px solid #ede8df;padding-top:10px;"><span style="font-size:15px;color:#b8932a;font-weight:600;">$${total.toFixed(2)} CAD</span></td></tr>
          </table>
          <div style="border-top:1px solid #ede8df;margin:24px 0;"></div>
          <p style="margin:0 0 10px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Shipping To</p>
          <p style="margin:0;font-size:14px;color:#555;line-height:1.9;">${esc(shipping.firstName)} ${esc(shipping.lastName)}<br>${esc(shipping.address)}<br>${esc(shipping.city)}, ${esc(shipping.province)} ${esc(shipping.postal)}<br>${esc(shipping.country)}</p>
          <div style="border-top:1px solid #ede8df;margin:24px 0;"></div>
          <p style="margin:0;font-size:13px;color:#888;line-height:1.8;">Questions? Reply to this email or contact us at <a href="mailto:orders@penguinhairs.com" style="color:#c9a048;text-decoration:none;">orders@penguinhairs.com</a>.</p>
        </td></tr>
        <tr><td style="text-align:center;padding-top:24px;">
          <p style="margin:0;font-size:11px;color:#b0a898;letter-spacing:0.1em;">&copy; 2026 PENGUIN HAIRS &middot; Premium Luxury Wigs &amp; Styling</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      const ownerHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <p style="margin:0 0 4px;font-size:20px;">&#x1f427;</p>
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b8932a;font-weight:600;">NEW ORDER #${orderRef}</p>
        </td></tr>
        <tr><td style="background:#ffffff;border-top:3px solid #c9a048;padding:36px 40px;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:400;color:#1a1a1a;">New Stripe Order &mdash; $${total.toFixed(2)} CAD</h2>
          <p style="margin:0 0 24px;font-size:13px;color:#999;">Stripe PaymentIntent: ${esc(paymentIntentId)}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;"><span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Customer</span><p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;font-weight:500;">${esc(shipping.firstName)} ${esc(shipping.lastName)}</p></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;"><span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Email</span><p style="margin:5px 0 0;font-size:15px;"><a href="mailto:${esc(shipping.email)}" style="color:#c9a048;text-decoration:none;">${esc(shipping.email)}</a></p></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;"><span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Phone</span><p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;">${esc(shipping.phone || "—")}</p></td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;"><span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Ship To</span><p style="margin:5px 0 0;font-size:14px;color:#555;line-height:1.7;">${esc(shipping.address)}, ${esc(shipping.city)}, ${esc(shipping.province)} ${esc(shipping.postal)}, ${esc(shipping.country)}</p></td></tr>
            <tr><td style="padding:10px 0;"><span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Items</span>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${itemRows}</table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                <tr><td><span style="font-size:13px;color:#888;">Subtotal</span></td><td align="right"><span style="font-size:13px;color:#888;">$${subtotal.toFixed(2)}</span></td></tr>
                <tr><td><span style="font-size:13px;color:#888;">Shipping</span></td><td align="right"><span style="font-size:13px;color:#888;">$${shippingCostNum.toFixed(2)}</span></td></tr>
                <tr><td style="padding-top:8px;border-top:1px solid #ede8df;"><span style="font-size:15px;color:#1a1a1a;font-weight:600;">Total</span></td><td align="right" style="padding-top:8px;border-top:1px solid #ede8df;"><span style="font-size:15px;color:#b8932a;font-weight:600;">$${total.toFixed(2)} CAD</span></td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      await Promise.all([
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Penguin Hairs <orders@penguinhairs.com>", to: [shipping.email], subject: `Order Confirmed #${orderRef} — Penguin Hairs`, html: customerHtml }),
        }),
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Penguin Hairs Orders <orders@penguinhairs.com>", to: [OWNER_EMAIL], subject: `New Order #${orderRef} — ${shipping.firstName} ${shipping.lastName} ($${total.toFixed(2)} CAD)`, html: ownerHtml }),
        }),
      ]);
    } catch (emailErr) {
      console.error("Email send error:", emailErr);
    }

    return new Response(JSON.stringify({ success: true, orderRef }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
