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
- **Backend**: Cloudflare Workers (`lassenordahl-api`)
- **Database**: Cloudflare D1 (pending setup)
- **Domain**: lassenordahl.com (DNS on Cloudflare, registered on Squarespace — nameservers propagating as of March 2026)
- Previously on Vercel — migrated to Cloudflare in March 2026

---

## apps/api

Cloudflare Worker (Hono) at `apps/api/`. Manages display state. Pico polls `GET /display`, clients push via `POST /display`.

Environments:
- **local**: `wrangler dev` → `http://localhost:8787`
- **staging**: `https://lassenordahl-api.lasseanordahl.workers.dev`
- **prod**: `https://api.lassenordahl.com` (once DNS propagates)

```bash
cd apps/api && wrangler dev      # local dev server
cd apps/api && wrangler deploy   # deploy to staging/prod workers.dev
```

Note: D1 binding is commented out in `wrangler.toml` until database is created. When ready:
```bash
wrangler d1 create lassenordahl  # get the database_id
# paste database_id into wrangler.toml, uncomment the [[d1_databases]] block
```

---

## apps/web

Portfolio site built with Webpack + Three.js + Markdown. Deployed to Cloudflare Pages.

```bash
cd apps/web && npm run dev        # local dev
cd apps/web && npm run build      # build → apps/web/public/
wrangler pages deploy public --project-name lassenordahl-web --branch main
```

---

## packages/pico — Pico dev cycle

MicroPython firmware for Raspberry Pi Pico 2 W + Pico Unicorn Pack (16×7 RGB LEDs).

### Files

| File | Description | Committed? |
|------|-------------|------------|
| `main.py` | Entry point — calls `display.run()` | yes |
| `display.py` | WiFi + polling + render logic | yes |
| `config.py` | Environment config (env + API URL) | **no** — copy from `config.example.py` |
| `config.example.py` | Template for config.py | yes |
| `secrets.py` | WiFi credentials | **no** — copy from `secrets.py.example` |
| `secrets.py.example` | Template for secrets.py | yes |

### Environments

Three environments, controlled by `config.py` on the device:

| ENV | API URL | When to use |
|-----|---------|-------------|
| `local` | `http://<your-LAN-IP>:8787/display` | Fast local iteration, no deploy needed |
| `staging` | `https://lassenordahl-api.lasseanordahl.workers.dev/display` | Testing against deployed worker |
| `prod` | `https://api.lassenordahl.com/display` | Production device, once DNS is live |

### First-time device setup

```bash
# 1. Create secrets.py
cp packages/pico/secrets.py.example packages/pico/secrets.py
# edit secrets.py with your WiFi SSID + password

# 2. Create config.py
cp packages/pico/config.example.py packages/pico/config.py
# edit ENV and LOCAL_HOST as needed

# 3. Upload all files to Pico
cd packages/pico
mpremote cp main.py :main.py
mpremote cp display.py :display.py
mpremote cp config.py :config.py
mpremote cp secrets.py :secrets.py
```

### Switching environments

Edit `config.py` locally, re-upload just that file:
```bash
# edit packages/pico/config.py → change ENV = "staging" / "prod" / "local"
mpremote cp packages/pico/config.py :config.py
mpremote reset
```

### Local dev loop

```bash
# Terminal 1 — run the worker locally
cd apps/api && wrangler dev

# Find your machine's LAN IP
ipconfig getifaddr en0   # macOS WiFi

# Set config.py: ENV = "local", LOCAL_HOST = "<your LAN IP>"
# Upload config.py to device, reset

# Terminal 2 — watch Pico output
mpremote repl
```

The Pico polls every 2s in local mode (vs 5s for staging/prod), so iteration is fast.

### Uploading changed display code

```bash
mpremote cp packages/pico/display.py :display.py && mpremote reset
```

### Useful mpremote commands

```bash
mpremote connect list              # find device port
mpremote repl                      # open REPL (Ctrl+X to exit)
mpremote reset                     # soft reset (reruns main.py)
mpremote ls :                      # list files on device
mpremote rm :filename.py           # delete file from device
```

---

## Display Modes

The Pico cycles through 3 modes via buttons A (next) / B (prev):

| Mode | Button | Color | API endpoint | Status |
|------|--------|-------|--------------|--------|
| `text` | — | cyan | `GET/POST /display` | ✅ working |
| `trains` | A once | orange | `GET /trains` | 🚧 stub — needs MTA integration |
| `pixels` | A twice | raw RGB | `GET/POST /pixels` | 🚧 stub — needs draw UI |

---

## Incomplete Tasks

### 🚧 Trains mode — MTA L/G arrivals
**Goal**: Show next few L and G train arrivals (e.g. "L 3m  G 8m  L 12m") scrolling in orange on the display.

**What's needed**:
- Sign up for MTA API key at https://api.mta.info
- Add `MTA_API_KEY` secret to the Cloudflare Worker (`wrangler secret put MTA_API_KEY`)
- Implement `GET /trains` in `apps/api/src/index.ts`:
  - Fetch GTFS-RT feed for L train (stop: `L17` = DeKalb Av, Brooklyn) and G train (stop: `G35` = Flushing Av or nearest)
  - Parse next 3 arrivals, format as scrollable string like `"L 3m  G 8m  L 12m"`
  - Cache result in KV with 30s TTL to avoid hammering the feed
- The Pico already polls `/trains` and scrolls `data.text` in orange — no Pico changes needed

**Suggested stop IDs** (confirm with MTA GTFS stop_times):
- L train near apartment: `L17` (DeKalb Av) or `L16` (Myrtle-Wyckoff)
- G train near apartment: `G35` (Flushing Av) or `G36` (Nassau Av)

---

### 🚧 Pixels mode — collaborative pixel draw
**Goal**: A page at `lassenordahl.com/draw` where anyone can click pixels on a 16×7 grid and it updates the physical display in real time.

**What's built**:
- `apps/web/src/draw.html` + `draw.js` + `draw.css` — functional stub (grid renders, polls API, click-to-paint works)
- `GET /pixels`, `POST /pixels`, `DELETE /pixels` endpoints in the Worker
- Pico polls `/pixels` and renders raw RGB values

**What needs polish**:
- Visual style: match `lassenordahl.com` aesthetic — square outlines like site SVGs, dark background, Poppins font (already in stub)
- Palette: user wants square outline swatches (not filled squares) to match SVG style elsewhere on the site
- Touch support: add touch events so mobile works
- Add a link/button to the draw page from the main site (or leave as a secret URL for friends)
- Consider Cloudflare Durable Objects for true real-time sync instead of 2s polling (optional)

---

## Common Commands

```bash
# API
cd apps/api && wrangler dev        # local API server
cd apps/api && wrangler deploy     # deploy API worker

# Web
cd apps/web && npm run dev
cd apps/web && npm run build
wrangler pages deploy public --project-name lassenordahl-web --branch main

# Pico (from repo root)
mpremote cp packages/pico/display.py :display.py && mpremote reset
```
