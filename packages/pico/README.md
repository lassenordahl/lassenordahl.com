# pico

MicroPython firmware for the Raspberry Pi Pico 2 W + Pimoroni Pico Unicorn Pack (16x7 RGB LED matrix).

## Hardware

- **Board**: Raspberry Pi Pico 2 W
- **Display**: Pimoroni Pico Unicorn Pack (16x7 RGB LED matrix)
- **Buttons**: A, B, X, Y

## Setup

### 1. Flash MicroPython

Download the Pimoroni MicroPython build (includes picounicorn):
- https://github.com/pimoroni/pimoroni-pico/releases
- File: `pimoroni-pico2-micropython.uf2`

Flash: hold BOOTSEL, plug in USB, drag `.uf2` to `RPI-RP2` drive.

### 2. Configure WiFi

```bash
cp secrets.py.example secrets.py
# Edit secrets.py with your WiFi credentials
```

Upload `secrets.py` to the Pico (never commit this file).

### 3. Upload firmware

```bash
pip install mpremote

# Upload all files
mpremote cp main.py :main.py
mpremote cp display.py :display.py
mpremote cp secrets.py :secrets.py
```

## Files

- `main.py` — entry point, runs on boot
- `display.py` — WiFi connection + API polling + render logic
- `secrets.py` — WiFi credentials (not committed)
- `examples/` — standalone pattern demos
