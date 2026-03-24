import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN")!;
const SQUARE_LOCATION_ID = Deno.env.get("SQUARE_LOCATION_ID")!;
const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-01-18";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const OWNER_EMAIL = "orders@penguinhairs.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { cart, sourceId, shipping, shippingCost } = await req.json();

    if (!cart || cart.length === 0) {
      return new Response(JSON.stringify({ error: "Cart is empty" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!sourceId) {
      return new Response(JSON.stringify({ error: "Payment token missing" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const shippingCostNum = Number(shippingCost) || 0;
    const subtotalCents = cart.reduce((sum: number, item: any) => sum + item.price * item.qty * 100, 0);
    const shippingCents = Math.round(shippingCostNum * 100);
    const totalCents = subtotalCents + shippingCents;

    const lineItems: any[] = cart.map((item: any) => ({
      name: item.name,
      quantity: String(item.qty),
      note: item.specs,
      base_price_money: { amount: item.price * 100, currency: "CAD" },
    }));

    // Add shipping as a line item if applicable
    if (shippingCents > 0) {
      lineItems.push({
        name: "Shipping",
        quantity: "1",
        base_price_money: { amount: shippingCents, currency: "CAD" },
      });
    }

    // Create Square order
    const orderBody: any = {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: SQUARE_LOCATION_ID,
        line_items: lineItems,
        fulfillments: [{
          type: "SHIPMENT",
          state: "PROPOSED",
          shipment_details: {
            recipient: {
              display_name: `${shipping.firstName} ${shipping.lastName}`,
              email_address: shipping.email,
              address: {
                address_line_1: shipping.address,
                locality: shipping.city,
                administrative_district_level_1: shipping.province,
                postal_code: shipping.postal,
                country: shipping.country || "CA",
              },
            },
          },
        }],
      },
    };

    const orderRes = await fetch(`${SQUARE_API}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      body: JSON.stringify(orderBody),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error(JSON.stringify(orderData.errors));

    // Create Square payment
    const paymentRes = await fetch(`${SQUARE_API}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        source_id: sourceId,
        amount_money: { amount: totalCents, currency: "CAD" },
        order_id: orderData.order.id,
        location_id: SQUARE_LOCATION_ID,
        buyer_email_address: shipping.email,
      }),
    });

    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) throw new Error(JSON.stringify(paymentData.errors));

    // Save order to Supabase
    const orderRecord = {
      square_order_id: orderData.order.id,
      square_payment_id: paymentData.payment.id,
      customer_name: `${shipping.firstName} ${shipping.lastName}`.trim(),
      customer_email: shipping.email,
      shipping_address: {
        address: shipping.address,
        city: shipping.city,
        province: shipping.province,
        postal: shipping.postal,
        country: shipping.country,
      },
      items: cart,
      subtotal: subtotalCents / 100,
      shipping_cost: shippingCostNum,
      total: totalCents / 100,
      status: "paid",
    };

    await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(orderRecord),
    });

    const orderRef = orderData.order.id.slice(-8).toUpperCase();

    // Send order confirmation to customer
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Penguin Hairs <orders@penguinhairs.com>",
        to: [shipping.email],
        subject: `Order Confirmed #${orderRef} — Penguin Hairs`,
        html: orderConfirmHtml(shipping, cart, subtotalCents / 100, shippingCostNum, totalCents / 100, orderRef),
      }),
    });

    // Send notification to owner
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Penguin Hairs Orders <orders@penguinhairs.com>",
        to: [OWNER_EMAIL],
        subject: `New Order #${orderRef} — ${shipping.firstName} ${shipping.lastName} ($${(totalCents/100).toFixed(2)} CAD)`,
        html: ownerOrderHtml(shipping, cart, subtotalCents / 100, shippingCostNum, totalCents / 100, orderRef),
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      orderId: orderData.order.id,
      paymentId: paymentData.payment.id,
      orderRef,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function orderConfirmHtml(shipping: any, cart: any[], subtotal: number, shippingCost: number, total: number, orderRef: string) {
  const itemRows = cart.map((item: any) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td><p style="margin:0;font-size:14px;color:#ffffff;">${item.name} <span style="color:rgba(255,255,255,0.4)">×${item.qty}</span></p>
              <p style="margin:3px 0 0;font-size:11px;color:rgba(255,255,255,0.35);">${item.specs}</p></td>
          <td align="right"><p style="margin:0;font-size:14px;color:#d4af37;">$${(item.price * item.qty).toFixed(2)}</p></td>
        </tr>
      </table>
    </td></tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="text-align:center;padding-bottom:32px;">
          <p style="margin:0;font-size:13px;letter-spacing:0.3em;text-transform:uppercase;color:#d4af37;">🐧 PENGUIN HAIRS</p>
        </td></tr>
        <tr><td style="background:#111;border:1px solid rgba(212,175,55,0.25);padding:40px 36px;">
          <h1 style="margin:0 0 4px;font-size:28px;font-weight:300;color:#ffffff;">Order Confirmed</h1>
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#d4af37;">Order #${orderRef}</p>
          <p style="margin:0 0 32px;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;">Hi ${shipping.firstName}, thank you for your order. Your Penguin Hairs piece is being prepared with care.</p>
          <div style="border-top:1px solid rgba(212,175,55,0.2);margin-bottom:24px;"></div>
          <p style="margin:0 0 16px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Order Summary</p>
          <table width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr><td style="padding:6px 0;"><span style="font-size:13px;color:rgba(255,255,255,0.45);">Subtotal</span></td><td align="right"><span style="font-size:13px;color:rgba(255,255,255,0.45);">$${subtotal.toFixed(2)}</span></td></tr>
            <tr><td style="padding:6px 0;"><span style="font-size:13px;color:rgba(255,255,255,0.45);">Shipping</span></td><td align="right"><span style="font-size:13px;color:rgba(255,255,255,0.45);">$${shippingCost.toFixed(2)}</span></td></tr>
            <tr><td style="padding:10px 0 0;border-top:1px solid rgba(255,255,255,0.08);"><span style="font-size:15px;color:#ffffff;font-weight:600;">Total</span></td><td align="right" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;"><span style="font-size:15px;color:#d4af37;font-weight:600;">$${total.toFixed(2)} CAD</span></td></tr>
          </table>
          <div style="border-top:1px solid rgba(212,175,55,0.2);margin:28px 0;"></div>
          <p style="margin:0 0 12px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Shipping To</p>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.8;">${shipping.firstName} ${shipping.lastName}<br>${shipping.address}<br>${shipping.city}, ${shipping.province} ${shipping.postal}<br>${shipping.country}</p>
          <div style="border-top:1px solid rgba(212,175,55,0.2);margin:28px 0;"></div>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);line-height:1.8;">Questions about your order? Reply to this email or contact us at <a href="mailto:orders@penguinhairs.com" style="color:#d4af37;text-decoration:none;">orders@penguinhairs.com</a>.</p>
        </td></tr>
        <tr><td style="text-align:center;padding-top:28px;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);letter-spacing:0.1em;">© 2026 PENGUIN HAIRS · Premium Luxury Wigs & Styling</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function ownerOrderHtml(shipping: any, cart: any[], subtotal: number, shippingCost: number, total: number, orderRef: string) {
  const itemRows = cart.map((item: any) => `
    <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0;font-size:14px;color:#ffffff;">${item.name} ×${item.qty} — <span style="color:#d4af37;">$${(item.price * item.qty).toFixed(2)}</span></p>
      <p style="margin:3px 0 0;font-size:11px;color:rgba(255,255,255,0.35);">${item.specs}</p>
    </td></tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <p style="margin:0;font-size:13px;letter-spacing:0.3em;text-transform:uppercase;color:#d4af37;">🐧 NEW ORDER #${orderRef}</p>
        </td></tr>
        <tr><td style="background:#111;border:1px solid rgba(212,175,55,0.25);padding:36px;">
          <h2 style="margin:0 0 24px;font-size:22px;font-weight:300;color:#ffffff;">New Order Received — $${total.toFixed(2)} CAD</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Customer</span>
              <p style="margin:4px 0 0;font-size:15px;color:#ffffff;">${shipping.firstName} ${shipping.lastName}</p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Email</span>
              <p style="margin:4px 0 0;font-size:15px;color:#d4af37;"><a href="mailto:${shipping.email}" style="color:#d4af37;text-decoration:none;">${shipping.email}</a></p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Ship To</span>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.7;">${shipping.address}, ${shipping.city}, ${shipping.province} ${shipping.postal}, ${shipping.country}</p>
            </td></tr>
            <tr><td style="padding:8px 0;">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Items</span>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${itemRows}</table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                <tr><td><span style="font-size:13px;color:rgba(255,255,255,0.4);">Subtotal</span></td><td align="right"><span style="font-size:13px;color:rgba(255,255,255,0.4);">$${subtotal.toFixed(2)}</span></td></tr>
                <tr><td><span style="font-size:13px;color:rgba(255,255,255,0.4);">Shipping</span></td><td align="right"><span style="font-size:13px;color:rgba(255,255,255,0.4);">$${shippingCost.toFixed(2)}</span></td></tr>
                <tr><td style="padding-top:8px;"><span style="font-size:15px;color:#ffffff;font-weight:600;">Total</span></td><td align="right" style="padding-top:8px;"><span style="font-size:15px;color:#d4af37;font-weight:600;">$${total.toFixed(2)} CAD</span></td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
