import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.4.0?target=deno";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const SUPPORTED_CHARGE_CURRENCIES = new Set(["CAD", "USD", "GBP"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { cart, shipping, shippingCost, promoCode, currency } = await req.json();
    // Never trust a client-supplied rate or an unlisted currency — NGN in particular
    // always charges in CAD (no native NGN settlement on this Stripe account).
    const chargeCurrency = SUPPORTED_CHARGE_CURRENCIES.has(String(currency).toUpperCase())
      ? String(currency).toUpperCase()
      : "CAD";

    if (!cart || cart.length === 0) {
      return new Response(JSON.stringify({ error: "Cart is empty" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!shipping?.email || !shipping?.firstName || !shipping?.lastName || !shipping?.address) {
      return new Response(JSON.stringify({ error: "Missing shipping details" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // --- Server-side price validation against the DB (same pattern as verify-paystack) ---
    const productIds = cart.map((item: any) => Number(item.id)).filter((id: number) => id > 0);
    let dbProducts: any[] = [];
    if (productIds.length > 0) {
      const productsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/products?id=in.(${productIds.join(",")})&select=id,price,sale_price,sale_type`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      dbProducts = await productsRes.json();
    }
    const dbProductMap: Record<number, any> = {};
    for (const p of dbProducts) dbProductMap[p.id] = p;

    for (const item of cart) {
      const dbProduct = dbProductMap[Number(item.id)];
      if (!dbProduct) continue;
      let minPrice = dbProduct.price;
      if (dbProduct.sale_price != null) {
        minPrice = dbProduct.sale_type === "percent"
          ? Math.round(dbProduct.price * (1 - dbProduct.sale_price / 100))
          : dbProduct.sale_price;
      }
      if (item.price < minPrice * 0.98) {
        return new Response(JSON.stringify({ error: `Price mismatch for ${item.name}. Please refresh and try again.` }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    const subtotal = cart.reduce((sum: number, item: any) => sum + item.price * (item.qty || 1), 0);
    const shippingCostNum = Number(shippingCost) || 0;

    // --- Server-side promo code validation ---
    let discount = 0;
    let validPromoCode: string | null = null;
    if (promoCode) {
      const promoRes = await fetch(
        `${SUPABASE_URL}/rest/v1/promo_codes?code=eq.${encodeURIComponent(promoCode)}&active=eq.true&select=*`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const promos = await promoRes.json();
      const promo = promos?.[0];
      if (promo) {
        const now = new Date();
        const notExpired = !promo.expires_at || new Date(promo.expires_at) > now;
        const underMaxUses = promo.max_uses == null || promo.uses_count < promo.max_uses;
        const meetsMinOrder = !promo.min_order || subtotal >= promo.min_order;
        if (notExpired && underMaxUses && meetsMinOrder) {
          discount = promo.discount_type === "percent"
            ? subtotal * (promo.discount_value / 100)
            : Math.min(Number(promo.discount_value), subtotal);
          discount = Math.round(discount * 100) / 100;
          validPromoCode = promo.code;
        }
      }
    }

    const totalCad = Math.max(0, subtotal - discount + shippingCostNum);

    // Convert to the charge currency using a rate fetched fresh, server-side —
    // never trust a rate the client sends, since it directly sets the charge amount.
    let fxRate = 1;
    if (chargeCurrency !== "CAD") {
      const fxRes = await fetch("https://open.er-api.com/v6/latest/CAD");
      const fxData = await fxRes.json();
      fxRate = fxData?.rates?.[chargeCurrency];
      if (!fxRate) {
        return new Response(JSON.stringify({ error: "Could not fetch exchange rate. Please try again." }), {
          status: 503, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }
    const chargeAmount = Math.round(totalCad * fxRate * 100) / 100;
    const amountCents = Math.round(chargeAmount * 100);

    if (amountCents < 50) {
      return new Response(JSON.stringify({ error: "Order total is too low to process." }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: chargeCurrency.toLowerCase(),
      payment_method_types: ["card"],
      receipt_email: shipping.email,
      shipping: {
        name: `${shipping.firstName} ${shipping.lastName}`.trim(),
        address: {
          line1: shipping.address,
          city: shipping.city,
          state: shipping.province,
          postal_code: shipping.postal,
          country: shipping.country || "CA",
        },
      },
      metadata: {
        customer_email: shipping.email,
        promo_code: validPromoCode || "",
        total_cad: String(totalCad),
      },
    });

    return new Response(JSON.stringify({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: chargeAmount,
      currency: chargeCurrency,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
