import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN")!;
const SQUARE_LOCATION_ID = Deno.env.get("SQUARE_LOCATION_ID")!;
const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-01-18";

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
    const { cart, sourceId, shipping } = await req.json();

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

    const totalCents = cart.reduce((sum: number, item: any) => sum + item.price * item.qty * 100, 0);

    const lineItems = cart.map((item: any) => ({
      name: item.name,
      quantity: String(item.qty),
      note: item.specs,
      base_price_money: { amount: item.price * 100, currency: "CAD" },
    }));

    // Create order
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

    // Create payment
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

    return new Response(JSON.stringify({
      success: true,
      orderId: orderData.order.id,
      paymentId: paymentData.payment.id,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
