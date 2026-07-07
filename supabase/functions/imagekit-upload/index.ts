import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const IMAGEKIT_PRIVATE_KEY = Deno.env.get("IMAGEKIT_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "https://deetee001.github.io",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Verify admin auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${token}`, "apikey": SUPABASE_SERVICE_KEY }
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Parse uploaded file
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const fileName = formData.get("fileName") as string || file?.name || "upload";
    const folder = formData.get("folder") as string || "/penguin-hairs/products";

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Upload to ImageKit
    const ikForm = new FormData();
    ikForm.append("file", file, fileName);
    ikForm.append("fileName", fileName);
    ikForm.append("folder", folder);
    ikForm.append("useUniqueFileName", "true");

    const authHeader64 = btoa(IMAGEKIT_PRIVATE_KEY + ":");
    const ikRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: { "Authorization": `Basic ${authHeader64}` },
      body: ikForm,
    });

    if (!ikRes.ok) {
      const err = await ikRes.text();
      return new Response(JSON.stringify({ error: "ImageKit upload failed", details: err }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const ikData = await ikRes.json();
    return new Response(JSON.stringify({ url: ikData.url }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
