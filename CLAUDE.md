# lassenordahl.com

Personal website and physical display platform monorepo.

## Vision

lassenordahl.com is more than a portfolio — it's the web interface for a physical display system. Interactions on the site and external API calls drive what's shown on a Raspberry Pi Pico 2 W + Pimoroni Pico Unicorn Pack (16x7 RGB LED matrix) running in the real world.

## Structure

```
apps/
  web/      - Personal site (Cloudflare Pages)
  api/      - Cloudflare Worker — display state + events API
packages/
  pico/     - MicroPython firmware for the Pico 2 W
```

## Hosting

- **Frontend**: Cloudflare Pages (`lassenordahl-web` project)
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1
- **Domain**: lassenordahl.com (DNS on Cloudflare, registered on Squarespace)
- Previously on Vercel — migrated to Cloudflare in March 2026

## apps/web

Portfolio site built with Webpack + Three.js + Markdown. Deployed to Cloudflare Pages.

- Build command: `npm run build` (from `apps/web/`)
- Output: `apps/web/public/`
- Routing handled via `apps/web/static/_redirects` (replaces old `vercel.json`)

Deploy:
```bash
cd apps/web && npm run build
wrangler pages deploy public --project-name lassenordahl-web --branch main
```

## apps/api

Cloudflare Worker (Hono) that manages display state. The Pico polls `GET /display` to know what to render. The website and other clients push state via `POST /display`.

- `wrangler.toml` has a D1 binding — run `wrangler d1 create lassenordahl` and fill in `database_id`

## packages/pico

MicroPython firmware for Raspberry Pi Pico 2 W + Pico Unicorn Pack.

- `main.py` — entry point (runs on boot)
- `display.py` — WiFi connection + polls `api.lassenordahl.com/display` every 5s
- `secrets.py` — WiFi credentials (not committed, copy from `secrets.py.example`)

Upload to device:
```bash
mpremote cp main.py :main.py
mpremote cp display.py :display.py
mpremote cp secrets.py :secrets.py
```

## Common Commands

```bash
# Dev
cd apps/web && npm run dev

# Build + deploy web
cd apps/web && npm run build
wrangler pages deploy public --project-name lassenordahl-web --branch main

# API dev
cd apps/api && wrangler dev

# Deploy API
cd apps/api && wrangler deploy
```
