"""
Pico Unicorn Pack - Main entry point
Upload this to your Pico 2 as main.py
"""
import picounicorn
import time

# Initialize the display (16x7 RGB LED matrix)
unicorn = picounicorn.PicoUnicorn()

WIDTH = picounicorn.WIDTH   # 16
HEIGHT = picounicorn.HEIGHT # 7

def clear():
    """Clear the display"""
    for x in range(WIDTH):
        for y in range(HEIGHT):
            unicorn.set_pixel(x, y, 0, 0, 0)

def set_pixel(x, y, r, g, b):
    """Set a single pixel RGB (0-255 each)"""
    unicorn.set_pixel(x, y, r, g, b)

def fill(r, g, b):
    """Fill entire display with color"""
    for x in range(WIDTH):
        for y in range(HEIGHT):
            unicorn.set_pixel(x, y, r, g, b)

# Demo on boot
def demo():
    """Run a simple RGB demo"""
    # Clear first
    clear()
    time.sleep(0.5)

    # Rainbow sweep
    colors = [
        (255, 0, 0),    # Red
        (255, 127, 0),  # Orange
        (255, 255, 0),  # Yellow
        (0, 255, 0),    # Green
        (0, 0, 255),    # Blue
        (75, 0, 130),   # Indigo
        (148, 0, 211),  # Violet
    ]

    for i, (r, g, b) in enumerate(colors):
        for x in range(WIDTH):
            unicorn.set_pixel(x, i, r, g, b)
            time.sleep(0.02)

    time.sleep(1)
    clear()

if __name__ == "__main__":
    demo()
