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

All internal navigation links (href="/", href="/shop", href="/styling") MUST include
target="_parent" so they navigate the parent Squarespace window, NOT inside the iframe.
Without this, links give a GitHub Pages 404. Example:
  <a href="/shop" target="_parent">Collection</a>

## After Every Change

Always automatically run:
git add .
git commit -m "brief description of what changed"
git push origin gh-pages
git checkout main && git merge gh-pages && git push origin main && git checkout gh-pages

NOTE: We are on the gh-pages branch. Changes must be pushed to BOTH gh-pages and main.
GitHub Pages serves from main. Always merge gh-pages → main after every push.

## Caching

No-cache meta tags are in homepage.html to prevent browser caching:
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
If browser shows stale content, use Ctrl+Shift+R for a hard refresh.

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
