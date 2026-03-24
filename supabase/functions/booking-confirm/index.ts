import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_EMAIL = "styling@penguinhairs.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const SERVICE_LABELS: Record<string, string> = {
  installation: "Wig Installation",
  custom_cut: "Custom Cut & Style",
  styling_color: "Styling & Color",
  maintenance: "Maintenance & Care",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { first_name, last_name, email, service, date, time, notes } = await req.json();

    if (!first_name || !email || !service || !date || !time) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const fullName = [first_name, last_name].filter(Boolean).join(" ");
    const serviceLabel = SERVICE_LABELS[service] || service;
    const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    // Save booking to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ first_name, last_name: last_name || null, email, service, date, time, notes: notes || null }),
    });

    // Send confirmation to customer
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Penguin Hairs <styling@penguinhairs.com>",
        to: [email],
        subject: "Your Appointment is Confirmed — Penguin Hairs",
        html: customerEmailHtml(fullName, serviceLabel, formattedDate, time, notes),
      }),
    });

    // Send notification to owner
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Penguin Hairs Bookings <styling@penguinhairs.com>",
        to: [OWNER_EMAIL],
        subject: `New Booking: ${fullName} — ${serviceLabel} on ${formattedDate}`,
        html: ownerEmailHtml(fullName, email, serviceLabel, formattedDate, time, notes),
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function customerEmailHtml(name: string, service: string, date: string, time: string, notes: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="text-align:center;padding-bottom:32px;">
          <p style="margin:0;font-size:13px;letter-spacing:0.3em;text-transform:uppercase;color:#d4af37;">🐧 PENGUIN HAIRS</p>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background:#111;border:1px solid rgba(212,175,55,0.25);padding:40px 36px;">

          <h1 style="margin:0 0 8px;font-size:28px;font-weight:300;color:#ffffff;letter-spacing:0.05em;">Appointment Confirmed</h1>
          <p style="margin:0 0 32px;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;">Hi ${name}, we're looking forward to seeing you.</p>

          <!-- Divider -->
          <div style="border-top:1px solid rgba(212,175,55,0.2);margin-bottom:28px;"></div>

          <!-- Details -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Service</span>
                <p style="margin:4px 0 0;font-size:15px;color:#ffffff;">${service}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Date</span>
                <p style="margin:4px 0 0;font-size:15px;color:#ffffff;">${date}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0;${notes ? 'border-bottom:1px solid rgba(255,255,255,0.06);' : ''}">
                <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Time</span>
                <p style="margin:4px 0 0;font-size:15px;color:#ffffff;">${time}</p>
              </td>
            </tr>
            ${notes ? `<tr><td style="padding:10px 0;">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Your Notes</span>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;">${notes}</p>
            </td></tr>` : ''}
          </table>

          <!-- Divider -->
          <div style="border-top:1px solid rgba(212,175,55,0.2);margin:28px 0;"></div>

          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);line-height:1.8;">
            If you need to reschedule or have any questions, reply to this email or reach us at
            <a href="mailto:styling@penguinhairs.com" style="color:#d4af37;text-decoration:none;">styling@penguinhairs.com</a>.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="text-align:center;padding-top:28px;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);letter-spacing:0.1em;">© 2026 PENGUIN HAIRS · Premium Luxury Wigs & Styling</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ownerEmailHtml(name: string, email: string, service: string, date: string, time: string, notes: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <p style="margin:0;font-size:13px;letter-spacing:0.3em;text-transform:uppercase;color:#d4af37;">🐧 NEW BOOKING</p>
        </td></tr>
        <tr><td style="background:#111;border:1px solid rgba(212,175,55,0.25);padding:36px;">
          <h2 style="margin:0 0 24px;font-size:22px;font-weight:300;color:#ffffff;">New Appointment Request</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Client</span>
              <p style="margin:4px 0 0;font-size:15px;color:#ffffff;">${name}</p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Email</span>
              <p style="margin:4px 0 0;font-size:15px;color:#d4af37;"><a href="mailto:${email}" style="color:#d4af37;text-decoration:none;">${email}</a></p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Service</span>
              <p style="margin:4px 0 0;font-size:15px;color:#ffffff;">${service}</p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Date & Time</span>
              <p style="margin:4px 0 0;font-size:15px;color:#ffffff;">${date} at ${time}</p>
            </td></tr>
            ${notes ? `<tr><td style="padding:8px 0;">
              <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);">Client Notes</span>
              <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;">${notes}</p>
            </td></tr>` : ''}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
