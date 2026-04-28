# Supabase MCP Server Setup — Session Notes

## Why Claude Was Restarted

The Supabase MCP server was added during this session. Claude Code must be
**fully restarted** (closed and reopened) before it can connect to a newly
added MCP server. The server is configured correctly — it just won't be active
until the new session starts.

## What Was Done

1. **Found credentials** in the project folder:
   - `PenguinHairs Access token to Supabase.txt` — contains the access token
   - `Penguinhairs Supabase Password.txt` — contains the DB password
   - `VCP Matching what connects to SupaBase.txt` — connection details

2. **Added the Supabase MCP server** at the project level:
   - Command used: `claude mcp add supabase -s project -- npx -y @supabase/mcp-server-supabase@latest --access-token <token>`
   - This created `.mcp.json` in the project root

3. **Created `.gitignore`** to prevent credentials from being committed:
   - `.mcp.json` (contains the access token)
   - `*.txt` (the credential files)

## What To Do Next (in the new session)

Tell Claude:
> "Read SUPABASE_SETUP.md — the Supabase MCP server should now be connected.
> Let's set up the database for the Penguin Hairs admin product management page."

Claude should then:
- Confirm the Supabase MCP server is connected
- Create the `products` table in Supabase with fields for: name, price, category,
  description, image URL, video URL, in_stock status
- Eventually build the admin page (admin.html) that reads/writes products live
  from Supabase instead of the hardcoded PRODUCTS array in squarespace-shop.html

## Current State of the Website

- Products are hardcoded in the `PRODUCTS` array in `squarespace-shop.html`
- All prices are placeholders — real prices will come from Supabase once the
  admin page is built
- The goal is: owner logs into admin page → updates products/prices → changes
  show live on the shop page
