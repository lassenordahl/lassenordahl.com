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
import picounicorn
from config import API_BASE, POLL_INTERVAL_MS

unicorn = picounicorn.PicoUnicorn()
WIDTH = picounicorn.WIDTH   # 16
HEIGHT = picounicorn.HEIGHT # 7

# ── Modes ──────────────────────────────────────────────────────────────────────
MODES = ["text", "trains", "pixels"]
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
    wlan.active(True)
    wlan.connect(WIFI_SSID, WIFI_PASSWORD)
    for _ in range(20):
        if wlan.isconnected():
            print("WiFi connected:", wlan.ifconfig()[0])
            return True
        time.sleep(0.5)
    print("WiFi connection failed")
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


# ── Mode: pixels ───────────────────────────────────────────────────────────────
# TODO: implement collaborative pixel draw on lassenordahl.com/draw
# Returns {"pixels": [[r,g,b], ...]} — flat list of WIDTH*HEIGHT entries
def poll_pixels():
    return poll("/pixels")


def render_pixels(data):
    if not data or "pixels" not in data:
        clear()
        return
    pixels = data["pixels"]
    for idx in range(min(len(pixels), WIDTH * HEIGHT)):
        rgb = pixels[idx]
        x = idx % WIDTH
        y = idx // WIDTH
        set_pixel(x, y, rgb[0], rgb[1], rgb[2])


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

    while True:
        now = time.ticks_ms()
        mode = current_mode()

        # Button handling — reset scroll on mode change
        if handle_buttons():
            mode = current_mode()
            scroll_offsets[mode] = 0

        # Poll active mode on interval
        if time.ticks_diff(now, last_polls[mode]) >= POLL_INTERVAL_MS:
            if mode == "text":
                new_state = poll_text()
            elif mode == "trains":
                new_state = poll_trains()
            else:
                new_state = poll_pixels()

            if new_state is not None:
                if mode in ("text", "trains"):
                    new_text = new_state.get("text", "")
                    old_text = (states[mode] or {}).get("text", "")
                    if new_text != old_text:
                        scroll_cols[mode] = text_to_columns(new_text)
                        scroll_offsets[mode] = 0
                states[mode] = new_state
            last_polls[mode] = now

        # Render
        state = states[mode]
        if mode in ("text", "trains"):
            cols = scroll_cols[mode]
            if state and cols:
                cr, cg, cb = mode_colors[mode]
                render_scroll(cols, scroll_offsets[mode], cr, cg, cb)
                scroll_offsets[mode] = (scroll_offsets[mode] + 1) % len(cols)
            else:
                clear()
        elif mode == "pixels":
            render_pixels(state)

        time.sleep_ms(80)
