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

    // Build ICS calendar attachment
    const icsContent = buildICS(fullName, email, serviceLabel, date, time);
    const icsBase64 = btoa(icsContent);
    const icsAttachment = [{
      filename: "appointment.ics",
      content: icsBase64,
      content_type: "text/calendar; method=REQUEST",
    }];

    // Send confirmation to customer (with ICS attachment)
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
        attachments: icsAttachment,
      }),
    });

    // Send notification to owner (with ICS attachment)
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
        attachments: icsAttachment,
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
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="text-align:center;padding-bottom:28px;">
          <p style="margin:0 0 4px;font-size:22px;">🐧</p>
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b8932a;font-weight:600;">PENGUIN HAIRS</p>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background:#ffffff;border-top:3px solid #c9a048;padding:40px 40px 36px;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
          <h1 style="margin:0 0 8px;font-size:26px;font-weight:300;color:#1a1a1a;letter-spacing:0.03em;">Appointment Confirmed</h1>
          <p style="margin:0 0 28px;font-size:14px;color:#777;line-height:1.7;">Hi ${name}, we're looking forward to seeing you.</p>

          <div style="border-top:1px solid #ede8df;margin-bottom:24px;"></div>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:12px 0;border-bottom:1px solid #f0ebe2;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Service</span>
              <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;font-weight:500;">${service}</p>
            </td></tr>
            <tr><td style="padding:12px 0;border-bottom:1px solid #f0ebe2;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Date</span>
              <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;">${date}</p>
            </td></tr>
            <tr><td style="padding:12px 0;${notes ? 'border-bottom:1px solid #f0ebe2;' : ''}">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Time</span>
              <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;">${time}</p>
            </td></tr>
            ${notes ? `<tr><td style="padding:12px 0;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Your Notes</span>
              <p style="margin:5px 0 0;font-size:14px;color:#555;line-height:1.7;">${notes}</p>
            </td></tr>` : ''}
          </table>

          <div style="border-top:1px solid #ede8df;margin:28px 0 24px;"></div>
          <p style="margin:0;font-size:13px;color:#888;line-height:1.8;">Need to reschedule? Reply to this email or contact us at <a href="mailto:styling@penguinhairs.com" style="color:#c9a048;text-decoration:none;">styling@penguinhairs.com</a>.</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="text-align:center;padding-top:24px;">
          <p style="margin:0;font-size:11px;color:#b0a898;letter-spacing:0.1em;">© 2026 PENGUIN HAIRS · Premium Luxury Wigs & Styling</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---- ICS CALENDAR ----
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return { hours: 10, minutes: 0 };
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

function buildICS(name: string, email: string, service: string, date: string, time: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const { hours, minutes } = parseTime(time);
  const [year, month, day] = date.split("-").map(Number);
  const dtStart = `${year}${pad(month)}${pad(day)}T${pad(hours)}${pad(minutes)}00`;
  const endHours = hours + 1 >= 24 ? 23 : hours + 1;
  const dtEnd = `${year}${pad(month)}${pad(day)}T${pad(endHours)}${pad(minutes)}00`;
  const uid = `ph-${Date.now()}@penguinhairs.com`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Penguin Hairs//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Penguin Hairs \u2013 ${service}`,
    `DESCRIPTION:Appointment with Penguin Hairs\\nService: ${service}\\nDate: ${date}\\nTime: ${time}`,
    "ORGANIZER;CN=Penguin Hairs:mailto:styling@penguinhairs.com",
    `ATTENDEE;CN=${name};RSVP=TRUE:mailto:${email}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function ownerEmailHtml(name: string, email: string, service: string, date: string, time: string, notes: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <p style="margin:0 0 4px;font-size:20px;">🐧</p>
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#b8932a;font-weight:600;">NEW BOOKING</p>
        </td></tr>
        <tr><td style="background:#ffffff;border-top:3px solid #c9a048;padding:36px 40px;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
          <h2 style="margin:0 0 24px;font-size:20px;font-weight:400;color:#1a1a1a;">New Appointment Request</h2>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Client</span>
              <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;font-weight:500;">${name}</p>
            </td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Email</span>
              <p style="margin:5px 0 0;font-size:15px;"><a href="mailto:${email}" style="color:#c9a048;text-decoration:none;">${email}</a></p>
            </td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #f0ebe2;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Service</span>
              <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;">${service}</p>
            </td></tr>
            <tr><td style="padding:10px 0;${notes ? 'border-bottom:1px solid #f0ebe2;' : ''}">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Date & Time</span>
              <p style="margin:5px 0 0;font-size:15px;color:#1a1a1a;">${date} at ${time}</p>
            </td></tr>
            ${notes ? `<tr><td style="padding:10px 0;">
              <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#b8932a;">Client Notes</span>
              <p style="margin:5px 0 0;font-size:14px;color:#555;line-height:1.7;">${notes}</p>
            </td></tr>` : ''}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
