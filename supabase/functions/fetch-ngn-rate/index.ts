Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let ngnPerUsd = 0
  let usdPerCad = 0

  // Step 1: Binance P2P — median USDT/NGN price from top 5 listings
  try {
    const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: 1, rows: 5, payTypes: [],
        asset: 'USDT', tradeType: 'SELL',
        fiat: 'NGN', publisherType: null
      })
    })
    const data = await res.json()
    const prices = (data?.data ?? [])
      .map((d: Record<string, any>) => parseFloat(d.adv?.price))
      .filter((p: number) => p > 0)
    if (prices.length > 0) {
      prices.sort((a: number, b: number) => a - b)
      ngnPerUsd = prices[Math.floor(prices.length / 2)]
    }
  } catch (_) { /* continue to fallback */ }

  // Step 2: USD/CAD official rate + NGN fallback if Binance failed
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    const data = await res.json()
    if (data?.rates?.CAD) usdPerCad = 1 / data.rates.CAD
    if (!ngnPerUsd && data?.rates?.NGN) {
      ngnPerUsd = data.rates.NGN * 1.03 // official + 3% parallel premium
    }
  } catch (_) { /* use defaults */ }

  if (!ngnPerUsd || !usdPerCad) {
    return new Response(JSON.stringify({ error: 'Could not fetch rates' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  const cadToNgn = Math.round(ngnPerUsd * usdPerCad)

  // Update settings table via REST
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?key=eq.ngn_black_market_rate`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ value: String(cadToNgn), updated_at: new Date().toISOString() })
    }
  )

  if (!updateRes.ok) {
    const err = await updateRes.text()
    return new Response(JSON.stringify({ error: err }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({
    rate: cadToNgn,
    ngn_per_usd: Math.round(ngnPerUsd),
    source: ngnPerUsd ? 'binance_p2p' : 'official+premium',
    updated: true
  }), { headers: { 'Content-Type': 'application/json' } })
})
