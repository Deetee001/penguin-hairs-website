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
    const {
      booking_id,
      customer_name,
      customer_email,
      service,
      old_date,
      old_time,
      new_date,
      new_time,
      new_status,
      reason,
      send_notification,
    } = await req.json();

    if (!booking_id || !customer_email) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const serviceLabel = SERVICE_LABELS[service] || service;

    // Update booking in Supabase using service role
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${booking_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        date: new_date,
        time: new_time,
        status: new_status,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!updateRes.ok) {
      const err = await updateRes.text();
      throw new Error("DB update failed: " + err);
    }

    // Send notification email if requested
    if (send_notification && customer_email) {
      const dateChanged = old_date !== new_date || old_time !== new_time;
      const subject = new_status === "cancelled"
        ? "Your Penguin Hairs Appointment Has Been Cancelled"
        : dateChanged
        ? "Your Penguin Hairs Appointment Has Been Rescheduled"
        : new_status === "confirmed"
        ? "Your Penguin Hairs Appointment is Confirmed"
        : "An Update to Your Penguin Hairs Appointment";

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Penguin Hairs <styling@penguinhairs.com>",
          to: [customer_email],
          subject,
          html: notificationEmailHtml(
            customer_name, serviceLabel, old_date, old_time,
            new_date, new_time, new_status, reason
          ),
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
  };
  return labels[status] || status;
}

function notificationEmailHtml(
  name: string, service: string,
  oldDate: string, oldTime: string,
  newDate: string, newTime: string,
  newStatus: string, reason: string | null
): string {
  const dateChanged = oldDate !== newDate || oldTime !== newTime;
  const isCancelled = newStatus === "cancelled";

  const accentColor = isCancelled ? "#c0392b" : "#c9a048";
  const statusPill = isCancelled
    ? `<span style="display:inline-block;padding:4px 12px;border-radius:20px;background:#fdecea;color:#c0392b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Cancelled</span>`
    : newStatus === "confirmed"
    ? `<span style="display:inline-block;padding:4px 12px;border-radius:20px;background:#edfaee;color:#27ae60;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Confirmed</span>`
    : `<span style="display:inline-block;padding:4px 12px;border-radius:20px;background:#fef9ec;color:#b8932a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${statusLabel(newStatus)}</span>`;

  const changesBlock = dateChanged ? `
    <tr><td style="padding:12px 0;border-bottom:1px solid #f0ebe2;">
      <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Previous Appointment</span>
      <p style="margin:5px 0 0;font-size:14px;color:#999;text-decoration:line-through;">${formatDate(oldDate)} at ${oldTime}</p>
    </td></tr>
    <tr><td style="padding:12px 0;border-bottom:1px solid #f0ebe2;">
      <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">New Appointment</span>
      <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;font-weight:500;">${formatDate(newDate)} at ${newTime}</p>
    </td></tr>` : `
    <tr><td style="padding:12px 0;border-bottom:1px solid #f0ebe2;">
      <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Appointment</span>
      <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;">${formatDate(newDate)} at ${newTime}</p>
    </td></tr>`;

  const reasonBlock = reason ? `
    <div style="background:#fef9ec;border-left:3px solid #c9a048;padding:14px 18px;margin:20px 0;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#b8932a;">Message from Penguin Hairs</p>
      <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">${reason}</p>
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <tr><td style="text-align:center;padding-bottom:28px;">
          <p style="margin:0 0 4px;font-size:22px;">🐧</p>
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b8932a;font-weight:600;">PENGUIN HAIRS</p>
        </td></tr>

        <tr><td style="background:#ffffff;border-top:3px solid ${accentColor};padding:40px 40px 36px;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
          <div style="margin-bottom:16px;">${statusPill}</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:300;color:#1a1a1a;letter-spacing:0.03em;">
            ${isCancelled ? "Appointment Cancelled" : dateChanged ? "Appointment Rescheduled" : "Appointment Updated"}
          </h1>
          <p style="margin:0 0 24px;font-size:14px;color:#777;line-height:1.7;">Hi ${name}, here's an update regarding your appointment.</p>

          <div style="border-top:1px solid #ede8df;margin-bottom:24px;"></div>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:12px 0;border-bottom:1px solid #f0ebe2;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Service</span>
              <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;font-weight:500;">${service}</p>
            </td></tr>
            ${changesBlock}
          </table>

          ${reasonBlock}

          <div style="border-top:1px solid #ede8df;margin:24px 0 20px;"></div>
          <p style="margin:0;font-size:13px;color:#888;line-height:1.8;">Questions? Reply to this email or contact us at <a href="mailto:styling@penguinhairs.com" style="color:#c9a048;text-decoration:none;">styling@penguinhairs.com</a>.</p>
        </td></tr>

        <tr><td style="text-align:center;padding-top:24px;">
          <p style="margin:0;font-size:11px;color:#b0a898;letter-spacing:0.1em;">© 2026 PENGUIN HAIRS · Premium Luxury Wigs &amp; Styling</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
