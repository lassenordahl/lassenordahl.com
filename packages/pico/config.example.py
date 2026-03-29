# Copy this to config.py on the Pico (do NOT commit config.py)
# Set ENV to match where you're pointing the device

ENV = "staging"  # "local" | "staging" | "prod"

# Only needed when ENV = "local" — your machine's LAN IP running `wrangler dev`
LOCAL_HOST = "192.168.x.x"

_URLS = {
    "local":   "http://" + LOCAL_HOST + ":8787/display",
    "staging": "https://lassenordahl-api.lasseanordahl.workers.dev/display",
    "prod":    "https://api.lassenordahl.com/display",
}

API_URL = _URLS[ENV]
POLL_INTERVAL_MS = 2000 if ENV == "local" else 5000
