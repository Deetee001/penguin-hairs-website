import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN")!;
const SQUARE_LOCATION_ID = Deno.env.get("SQUARE_LOCATION_ID")!;
const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-01-18";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    return new Response(JSON.stringify({
      success: true,
      orderId: orderData.order.id,
      paymentId: paymentData.payment.id,
      orderRef: orderData.order.id.slice(-8).toUpperCase(),
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
