# Penguin Hairs - Claude Code Instructions

## Project Overview

This is the Penguin Hairs luxury hair website built with custom HTML/CSS/JS
injected into Squarespace via iframes pointing to GitHub Pages.

There are 3 main pages:
- homepage.html → Squarespace page slug: /
- squarespace-shop.html → Squarespace page slug: /shop
- squarespace-styling.html → Squarespace page slug: /styling

## GitHub Pages & Squarespace Setup

- GitHub repo: https://github.com/Deetee001/penguin-hairs-website
- GitHub Pages base URL: https://deetee001.github.io/penguin-hairs-website/
- Each Squarespace page has a full-screen iframe pointing to the corresponding file:
  - / → iframe src="https://deetee001.github.io/penguin-hairs-website/homepage.html"
  - /shop → iframe src="https://deetee001.github.io/penguin-hairs-website/squarespace-shop.html"
  - /styling → iframe src="https://deetee001.github.io/penguin-hairs-website/squarespace-styling.html"
- Squarespace iframe code pattern:
  <iframe src="https://deetee001.github.io/penguin-hairs-website/[filename].html" style="position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:999999;"></iframe>

## Internal Link Rule (IMPORTANT)

All internal navigation links MUST have target="_parent" AND be handled by the JS
navigation snippet at the bottom of each file. The JS uses the full absolute URL to
avoid domain ambiguity (window.top resolves to GitHub Pages domain, not penguinhairs.com).

Every link must have target="_parent":
  <a href="/shop" target="_parent">Collection</a>

And each file must have this JS snippet before </script>:
  document.querySelectorAll('a[target="_parent"]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var href = 'https://www.penguinhairs.com' + this.getAttribute('href');
      try { window.top.location.href = href; }
      catch(err) { window.parent.location.href = href; }
    });
  });

WITHOUT this, clicking nav links on penguinhairs.com redirects to deetee001.github.io/shop (404).

## After Every Change

Always automatically run:
git add .
git commit -m "brief description of what changed"
git push origin gh-pages

NOTE: We work exclusively on the gh-pages branch. GitHub Pages is configured to serve
from gh-pages. Never push to main or merge into main.

## Caching

No-cache meta tags are in homepage.html to prevent browser caching:
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
If browser shows stale content, use Ctrl+Shift+R for a hard refresh.

## Supabase MCP Server Setup (COMPLETE)

The Supabase MCP server is configured and ready. It allows Claude to directly
create tables, run SQL, and manage the Supabase database from within this project.

**Setup done:**
- MCP server added to `.mcp.json` in this project directory
- `.mcp.json` and credential `.txt` files are gitignored (never committed)
- Credentials are stored in:
  - `PenguinHairs Access token to Supabase.txt` (access token)
  - `Penguinhairs Supabase Password.txt` (DB password)
  - `VCP Matching what connects to SupaBase.txt` (connection details)

**To activate after restarting Claude Code:**
1. Claude Code will automatically connect to the Supabase MCP server on startup
2. If it doesn't connect, run: `claude mcp list` to verify the server is listed
3. If missing, re-add with:
   `claude mcp add supabase -s project -- npx -y @supabase/mcp-server-supabase@latest --access-token <token from txt file>`

**Next steps — tell Claude to:**
- "Set up the Supabase database for the admin product management page"
- Claude will create the `products` table with all needed fields (name, price,
  category, image/video URL, description, etc.) directly via the MCP server

## Future: Admin / Product Management Page (NOT YET BUILT)

A future admin page is planned where the owner can:
- View, add, edit, and delete product listings
- Update prices that reflect live on the website
- Handle payment processing

Supabase is the chosen backend. MCP server is set up (see section above).
Products are currently hardcoded in the PRODUCTS array in squarespace-shop.html.
All prices are placeholders for now — the admin page is where real pricing will be managed.

## Product Notes

- All prices in squarespace-shop.html are PLACEHOLDERS — do not treat them as final
- Videos are hosted on Cloudinary. Use .mp4 extension (not .mov) for browser compatibility
  e.g. change /upload/v.../file.mov → /upload/q_auto,w_700,h_900,c_fill/v.../file.mp4
- If a product has a `video` field, the card renders a video instead of an image
- Bob wigs go under category: 'Short'

## Design Rules

- Background is always dark: #0a0a0a
- Accent color is always gold: #d4af37
- Headings use Cormorant Garamond font
- Body text uses Lato font
- Never remove the position-fixed overlay approach (#ph-overlay)
- Never remove the Three.js particle wave canvas
- Maintain luxury aesthetic at all times

## Tech Stack

- Pure HTML/CSS/JavaScript
- Three.js r128 for particle animations
- Hosted on GitHub Pages, embedded via iframe in Squarespace
- Media hosted on Cloudinary and Squarespace CDN
