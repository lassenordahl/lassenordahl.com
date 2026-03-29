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

API_URL = "https://api.lassenordahl.com/display"
POLL_INTERVAL_MS = 5000

unicorn = picounicorn.PicoUnicorn()
WIDTH = picounicorn.WIDTH   # 16
HEIGHT = picounicorn.HEIGHT # 7


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


def clear():
    for x in range(WIDTH):
        for y in range(HEIGHT):
            unicorn.set_pixel(x, y, 0, 0, 0)


def poll():
    try:
        res = urequests.get(API_URL, timeout=5)
        data = res.json()
        res.close()
        return data
    except Exception as e:
        print("Poll error:", e)
        return None


def render(state):
    if state is None:
        return
    mode = state.get("mode", "idle")
    if mode == "idle":
        clear()
    # TODO: add display modes here


def run():
    if not connect_wifi():
        # Blink red to indicate no connection
        for _ in range(5):
            for x in range(WIDTH):
                for y in range(HEIGHT):
                    unicorn.set_pixel(x, y, 255, 0, 0)
            time.sleep(0.3)
            clear()
            time.sleep(0.3)
        return

    while True:
        state = poll()
        render(state)
        time.sleep_ms(POLL_INTERVAL_MS)
