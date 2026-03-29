"""
Pattern examples for Pico Unicorn
"""
import picounicorn
import time
import math

picounicorn.init()
WIDTH = picounicorn.get_width()   # 16
HEIGHT = picounicorn.get_height() # 7

def hsv_to_rgb(h, s, v):
    """Convert HSV (0-1 range) to RGB (0-255)"""
    if s == 0.0:
        return int(v * 255), int(v * 255), int(v * 255)

    i = int(h * 6.0)
    f = (h * 6.0) - i
    p = v * (1.0 - s)
    q = v * (1.0 - s * f)
    t = v * (1.0 - s * (1.0 - f))
    i = i % 6

    if i == 0: r, g, b = v, t, p
    elif i == 1: r, g, b = q, v, p
    elif i == 2: r, g, b = p, v, t
    elif i == 3: r, g, b = p, q, v
    elif i == 4: r, g, b = t, p, v
    else: r, g, b = v, p, q

    return int(r * 255), int(g * 255), int(b * 255)

def rainbow_wave():
    """Rainbow wave animation"""
    offset = 0
    while True:
        for x in range(WIDTH):
            for y in range(HEIGHT):
                hue = ((x + y + offset) % 16) / 16.0
                r, g, b = hsv_to_rgb(hue, 1.0, 1.0)
                picounicorn.set_pixel(x, y, r, g, b)
        offset += 1
        time.sleep(0.05)

def plasma():
    """Plasma effect"""
    t = 0
    while True:
        for x in range(WIDTH):
            for y in range(HEIGHT):
                v = math.sin(x / 2.0 + t)
                v += math.sin((x + y) / 2.0 + t)
                v += math.sin((x - y + t) / 2.0)
                hue = (v + 3) / 6.0
                r, g, b = hsv_to_rgb(hue, 1.0, 1.0)
                picounicorn.set_pixel(x, y, r, g, b)
        t += 0.1
        time.sleep(0.03)

def fire():
    """Fire effect"""
    import random
    heat = [[0] * HEIGHT for _ in range(WIDTH)]

    while True:
        # Cool down
        for x in range(WIDTH):
            for y in range(HEIGHT):
                heat[x][y] = max(0, heat[x][y] - random.randint(0, 2))

        # Heat rises
        for x in range(WIDTH):
            for y in range(HEIGHT - 1, 0, -1):
                heat[x][y] = (heat[x][y - 1] + heat[x][y]) // 2

        # Random sparks at bottom
        for x in range(WIDTH):
            if random.random() > 0.5:
                heat[x][0] = min(255, heat[x][0] + random.randint(50, 100))

        # Draw
        for x in range(WIDTH):
            for y in range(HEIGHT):
                h = heat[x][y]
                # Fire palette: black -> red -> yellow -> white
                if h < 85:
                    r, g, b = h * 3, 0, 0
                elif h < 170:
                    r, g, b = 255, (h - 85) * 3, 0
                else:
                    r, g, b = 255, 255, (h - 170) * 3
                picounicorn.set_pixel(x, HEIGHT - 1 - y, r, g, b)

        time.sleep(0.05)

def button_check():
    """Check buttons - A, B, X, Y"""
    while True:
        if picounicorn.is_pressed(picounicorn.BUTTON_A):
            print("A pressed")
        if picounicorn.is_pressed(picounicorn.BUTTON_B):
            print("B pressed")
        if picounicorn.is_pressed(picounicorn.BUTTON_X):
            print("X pressed")
        if picounicorn.is_pressed(picounicorn.BUTTON_Y):
            print("Y pressed")
        time.sleep(0.1)

if __name__ == "__main__":
    rainbow_wave()
