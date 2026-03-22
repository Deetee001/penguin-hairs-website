import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN")!;
const SQUARE_LOCATION_ID = Deno.env.get("SQUARE_LOCATION_ID")!;
const SQUARE_API = "https://connect.squareup.com/v2";
const SQUARE_VERSION = "2024-01-18";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { cart } = await req.json();

    if (!cart || cart.length === 0) {
      return new Response(JSON.stringify({ error: "Cart is empty" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const lineItems = cart.map((item: any) => ({
      name: item.name,
      quantity: String(item.qty),
      note: item.specs,
      base_price_money: {
        amount: item.price * 100, // Square uses cents
        currency: "USD",
      },
    }));

    const body = {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: SQUARE_LOCATION_ID,
        line_items: lineItems,
      },
      checkout_options: {
        redirect_url: "https://www.penguinhairs.com/shop",
        ask_for_shipping_address: true,
        merchant_support_email: "info@penguinhairs.com",
      },
    };

    const squareRes = await fetch(`${SQUARE_API}/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION,
      },
      body: JSON.stringify(body),
    });

    const data = await squareRes.json();

    if (!squareRes.ok) {
      throw new Error(JSON.stringify(data.errors));
    }

    return new Response(JSON.stringify({ url: data.payment_link.url }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
