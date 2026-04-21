"""
Display controller - multi-mode display for Pico 2 W + Unicorn Pack.

Modes (cycle with A=next, B=prev):
  0 text   - scrolling text pushed via API
  1 trains - upcoming MTA L/G train times
  2 pixels - live pixel art from lassenordahl.com/draw

Upload alongside main.py, config.py, secrets.py, urequests.py.
"""
import network
import urequests
import time
import json
import picounicorn
from config import API_BASE, POLL_INTERVAL_MS
from wsclient import WebSocket

unicorn = picounicorn.PicoUnicorn()
WIDTH = picounicorn.WIDTH   # 16
HEIGHT = picounicorn.HEIGHT # 7

# ── Modes ──────────────────────────────────────────────────────────────────────
MODES = ["pixels", "text", "trains"]
mode_idx = 0


def current_mode():
    return MODES[mode_idx]


# ── Low-level pixel ops ────────────────────────────────────────────────────────
def set_pixel(x, y, r, g, b):
    unicorn.set_pixel(x, y, r, g, b)


def clear():
    for x in range(WIDTH):
        for y in range(HEIGHT):
            unicorn.set_pixel(x, y, 0, 0, 0)


# ── Font ───────────────────────────────────────────────────────────────────────
# 5-tall bitmap font. Each char is a list of column bitmasks (bit0=top row).
# Centered vertically with FONT_Y_OFFSET=1 in the 7-row display.
FONT_Y_OFFSET = 1
FONT = {
    ' ': [0, 0, 0],
    'A': [30, 5, 5, 30],
    'B': [31, 21, 21, 10],
    'C': [14, 17, 17, 10],
    'D': [31, 17, 17, 14],
    'E': [31, 21, 21, 17],
    'F': [31, 5, 5, 1],
    'G': [14, 17, 21, 28],
    'H': [31, 4, 4, 31],
    'I': [17, 31, 17, 0],
    'J': [16, 17, 17, 15],
    'K': [31, 4, 10, 17],
    'L': [31, 16, 16, 16],
    'M': [31, 2, 4, 2, 31],
    'N': [31, 2, 4, 31],
    'O': [14, 17, 17, 14],
    'P': [31, 5, 5, 2],
    'Q': [14, 17, 25, 30],
    'R': [31, 13, 5, 18],
    'S': [18, 21, 21, 9],
    'T': [1, 1, 31, 1, 1],
    'U': [15, 16, 16, 15],
    'V': [7, 24, 24, 7],
    'W': [3, 12, 16, 12, 3],
    'X': [17, 10, 4, 10, 17],
    'Y': [3, 4, 24, 4, 3],
    'Z': [25, 21, 19, 17],
    '0': [14, 17, 17, 14],
    '1': [18, 31, 16, 0],
    '2': [25, 21, 21, 18],
    '3': [17, 21, 21, 11],
    '4': [6, 5, 31, 4],
    '5': [23, 21, 21, 9],
    '6': [14, 21, 21, 8],
    '7': [1, 25, 5, 3],
    '8': [10, 21, 21, 10],
    '9': [2, 21, 21, 14],
    '!': [0, 29, 0],
    '.': [0, 24, 0],
    ',': [0, 24, 8],
    '-': [4, 4, 4],
    ':': [0, 10, 0],
    'm': [28, 4, 28, 4, 28],
}


def text_to_columns(text):
    cols = []
    for ch in text.upper():
        glyph = FONT.get(ch, [31, 0, 31])
        cols.extend(glyph)
        cols.append(0)  # 1-pixel gap
    return cols


def render_scroll(cols, offset, r=0, g=200, b=255):
    clear()
    n = len(cols)
    if n == 0:
        return
    for x in range(WIDTH):
        col_bits = cols[(offset + x) % n]
        for row in range(5):
            if col_bits & (1 << row):
                set_pixel(x, row + FONT_Y_OFFSET, r, g, b)


# ── Network ────────────────────────────────────────────────────────────────────
def connect_wifi():
    from secrets import WIFI_SSID, WIFI_PASSWORD
    wlan = network.WLAN(network.STA_IF)
    if wlan.isconnected():
        print("WiFi already up:", wlan.ifconfig()[0])
        return True
    wlan.active(True)
    time.sleep(1)  # chip needs a moment after activation
    print("Connecting to %r..." % WIFI_SSID)
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)
    for i in range(60):  # 30s total
        if wlan.isconnected():
            print("WiFi connected:", wlan.ifconfig()[0])
            return True
        if i and i % 6 == 0:
            print("  ...still waiting (status=%d)" % wlan.status())
        time.sleep(0.5)
    print("WiFi connection failed, final status=%d" % wlan.status())
    return False


def poll(path):
    try:
        res = urequests.get(API_BASE + path, timeout=5)
        data = res.json()
        res.close()
        return data
    except Exception as e:
        print("Poll error:", path, e)
        return None


# ── Mode: text ─────────────────────────────────────────────────────────────────
def poll_text():
    return poll("/display")


# ── Mode: trains ───────────────────────────────────────────────────────────────
# TODO: implement MTA L/G train fetching in API
# Returns {"text": "L 3m  G 8m"} or similar scrollable string
def poll_trains():
    return poll("/trains")


# ── Mode: pixels (WebSocket) ───────────────────────────────────────────────────
# Subscribes to /pixels/ws on the Worker's PixelCanvas Durable Object.
# Server sends JSON frames:
#   {"type":"snapshot","pixels":[[r,g,b],...]}  — on connect
#   {"type":"paint","x":_,"y":_,"r":_,"g":_,"b":_}
#   {"type":"clear"}
pixels_buf = [(0, 0, 0)] * (WIDTH * HEIGHT)
pixels_ws = WebSocket()
ws_next_retry_at = 0
WS_BACKOFF_MS = 5000


def pixels_ws_url():
    base = API_BASE
    if base.startswith("https://"):
        base = "wss://" + base[8:]
    elif base.startswith("http://"):
        base = "ws://" + base[7:]
    return base + "/pixels/ws"


def ensure_pixels_ws(now):
    global ws_next_retry_at
    if not pixels_ws.closed:
        return
    if time.ticks_diff(now, ws_next_retry_at) < 0:
        return
    try:
        pixels_ws.connect(pixels_ws_url(), timeout=10)
        print("pixels WS connected")
        # Snapshot is sent immediately; TLS buffers it so select.poll misses it.
        # Drain synchronously once, then rely on poll for incremental frames.
        snap = pixels_ws.recv_blocking(timeout_s=3)
        if snap:
            _apply_ws_msg(snap)
    except Exception as e:
        print("pixels WS connect failed:", e)
        ws_next_retry_at = time.ticks_add(now, WS_BACKOFF_MS)


def _apply_ws_msg(msg):
    global pixels_buf
    try:
        data = json.loads(msg)
    except Exception:
        return
    t = data.get("type")
    if t == "snapshot":
        px = data.get("pixels") or []
        buf = [(0, 0, 0)] * (WIDTH * HEIGHT)
        for i in range(min(len(px), WIDTH * HEIGHT)):
            p = px[i]
            buf[i] = (p[0], p[1], p[2])
        pixels_buf = buf
    elif t == "paint":
        x, y = data.get("x", 0), data.get("y", 0)
        if 0 <= x < WIDTH and 0 <= y < HEIGHT:
            pixels_buf[y * WIDTH + x] = (data.get("r", 0), data.get("g", 0), data.get("b", 0))
    elif t == "clear":
        pixels_buf = [(0, 0, 0)] * (WIDTH * HEIGHT)


def pump_pixels_ws():
    """Drain any pending WS messages into pixels_buf. Non-blocking."""
    while True:
        msg = pixels_ws.recv(timeout_ms=0)
        if msg is None:
            return
        _apply_ws_msg(msg)


def render_pixels_buf():
    for idx in range(WIDTH * HEIGHT):
        r, g, b = pixels_buf[idx]
        set_pixel(idx % WIDTH, idx // WIDTH, r, g, b)


# ── Buttons ────────────────────────────────────────────────────────────────────
btn_a_prev = False
btn_b_prev = False


def handle_buttons():
    """Check A/B buttons. Returns True if mode changed."""
    global mode_idx, btn_a_prev, btn_b_prev
    a = unicorn.is_pressed(picounicorn.BUTTON_A)
    b = unicorn.is_pressed(picounicorn.BUTTON_B)
    changed = False
    if a and not btn_a_prev:
        mode_idx = (mode_idx + 1) % len(MODES)
        changed = True
        print("Mode ->", MODES[mode_idx])
    elif b and not btn_b_prev:
        mode_idx = (mode_idx - 1) % len(MODES)
        changed = True
        print("Mode ->", MODES[mode_idx])
    btn_a_prev = a
    btn_b_prev = b
    return changed


# ── Main loop ──────────────────────────────────────────────────────────────────
def run():
    if not connect_wifi():
        for _ in range(5):
            for x in range(WIDTH):
                for y in range(HEIGHT):
                    set_pixel(x, y, 255, 0, 0)
            time.sleep(0.3)
            clear()
            time.sleep(0.3)
        return

    # Per-mode state
    states = {m: None for m in MODES}
    last_polls = {m: time.ticks_ms() - POLL_INTERVAL_MS for m in MODES}
    scroll_cols = {m: [] for m in MODES}
    scroll_offsets = {m: 0 for m in MODES}

    # Train mode color: orange. Text mode: cyan. Pixels: raw.
    mode_colors = {
        "text":   (0, 200, 255),
        "trains": (255, 165, 0),
    }

    last_diag = time.ticks_ms()
    while True:
        now = time.ticks_ms()
        mode = current_mode()

        # Button handling — reset scroll on mode change
        if handle_buttons():
            mode = current_mode()
            scroll_offsets[mode] = 0

        # Keep WS alive + drain whenever we're in pixels mode
        if mode == "pixels":
            ensure_pixels_ws(now)
            if not pixels_ws.closed:
                pump_pixels_ws()

        # Debug heartbeat every 2s
        if time.ticks_diff(now, last_diag) >= 2000:
            nb = sum(1 for p in pixels_buf if p != (0, 0, 0))
            print("[diag] mode=%s ws_closed=%s nonblack=%d" % (mode, pixels_ws.closed, nb))
            last_diag = now

        # Poll text/trains on interval
        if mode in ("text", "trains") and time.ticks_diff(now, last_polls[mode]) >= POLL_INTERVAL_MS:
            new_state = poll_text() if mode == "text" else poll_trains()
            if new_state is not None:
                new_text = new_state.get("text", "")
                old_text = (states[mode] or {}).get("text", "")
                if new_text != old_text:
                    scroll_cols[mode] = text_to_columns(new_text)
                    scroll_offsets[mode] = 0
                states[mode] = new_state
            last_polls[mode] = now

        # Render
        if mode in ("text", "trains"):
            cols = scroll_cols[mode]
            if states[mode] and cols:
                cr, cg, cb = mode_colors[mode]
                render_scroll(cols, scroll_offsets[mode], cr, cg, cb)
                scroll_offsets[mode] = (scroll_offsets[mode] + 1) % len(cols)
            else:
                clear()
        elif mode == "pixels":
            render_pixels_buf()

        time.sleep_ms(80)
