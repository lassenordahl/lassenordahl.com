"""
Display controller - polls the API and drives the Pico Unicorn Pack.

Upload alongside main.py to the Pico 2 W.
Requires WiFi credentials in secrets.py:
  WIFI_SSID = "..."
  WIFI_PASSWORD = "..."
"""
import network
import urequests
import time
import picounicorn
from config import API_URL, POLL_INTERVAL_MS

unicorn = picounicorn.PicoUnicorn()
WIDTH = picounicorn.WIDTH   # 16
HEIGHT = picounicorn.HEIGHT # 7

buf = bytearray(WIDTH * HEIGHT * 3)


def set_pixel(x, y, r, g, b):
    i = (y * WIDTH + x) * 3
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b


def flush():
    unicorn.update(buf)


def clear():
    for i in range(len(buf)):
        buf[i] = 0
    flush()


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
}


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


def poll():
    try:
        res = urequests.get(API_URL, timeout=5)
        data = res.json()
        res.close()
        return data
    except Exception as e:
        print("Poll error:", e)
        return None


def text_to_columns(text):
    cols = []
    for ch in text.upper():
        glyph = FONT.get(ch, [31, 0, 31])
        cols.extend(glyph)
        cols.append(0)  # 1-pixel gap
    return cols


def render_scroll(cols, offset):
    for i in range(len(buf)):
        buf[i] = 0
    n = len(cols)
    if n == 0:
        flush()
        return
    for x in range(WIDTH):
        col_bits = cols[(offset + x) % n]
        for row in range(5):
            if col_bits & (1 << row):
                set_pixel(x, row + FONT_Y_OFFSET, 0, 200, 255)
    flush()


def run():
    if not connect_wifi():
        for _ in range(5):
            for x in range(WIDTH):
                for y in range(HEIGHT):
                    set_pixel(x, y, 255, 0, 0)
            flush()
            time.sleep(0.3)
            clear()
            time.sleep(0.3)
        return

    state = None
    last_poll = time.ticks_ms() - POLL_INTERVAL_MS
    scroll_cols = []
    scroll_offset = 0

    while True:
        now = time.ticks_ms()

        if time.ticks_diff(now, last_poll) >= POLL_INTERVAL_MS:
            new_state = poll()
            if new_state is not None:
                if new_state.get("text") != (state or {}).get("text"):
                    scroll_cols = text_to_columns(new_state.get("text", ""))
                    scroll_offset = 0
                state = new_state
            last_poll = now

        if state and state.get("mode") == "text" and scroll_cols:
            render_scroll(scroll_cols, scroll_offset)
            scroll_offset = (scroll_offset + 1) % len(scroll_cols)
        else:
            clear()

        time.sleep_ms(80)
