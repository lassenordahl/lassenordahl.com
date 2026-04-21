"""Minimal MicroPython WebSocket client.

Text frames only (opcode 0x1). TLS via ssl.wrap_socket. No fragmentation.
Non-blocking reads via select.poll. Auto-replies to ping.
"""
import socket
import ssl
import select
import os
import binascii
import struct


class WebSocketError(Exception):
    pass


class WebSocket:
    def __init__(self):
        self.sock = None
        self._raw = None
        self._poll = None
        self.closed = True

    def connect(self, url, timeout=10):
        if url.startswith("wss://"):
            secure = True
            rest = url[6:]
            default_port = 443
        elif url.startswith("ws://"):
            secure = False
            rest = url[5:]
            default_port = 80
        else:
            raise WebSocketError("bad scheme")

        slash = rest.find("/")
        if slash >= 0:
            host_port = rest[:slash]
            path = rest[slash:]
        else:
            host_port = rest
            path = "/"

        colon = host_port.find(":")
        if colon >= 0:
            host = host_port[:colon]
            port = int(host_port[colon + 1:])
        else:
            host = host_port
            port = default_port

        ai = socket.getaddrinfo(host, port)[0]
        raw = socket.socket()
        raw.settimeout(timeout)
        raw.connect(ai[-1])

        s = ssl.wrap_socket(raw, server_hostname=host) if secure else raw

        key = binascii.b2a_base64(os.urandom(16)).strip().decode()
        req = (
            "GET %s HTTP/1.1\r\n"
            "Host: %s\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        ) % (path, host, key)
        s.write(req.encode())

        status_line = s.readline()
        if not status_line:
            raise WebSocketError("no handshake response")
        parts = status_line.split(None, 2)
        if len(parts) < 2 or parts[1] != b"101":
            raise WebSocketError("bad status: %s" % status_line)
        while True:
            line = s.readline()
            if not line or line == b"\r\n":
                break

        self.sock = s
        self._raw = raw
        self._poll = select.poll()
        self._poll.register(raw, select.POLLIN)
        self.closed = False

    def _read_exact(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.sock.read(n - len(buf))
            if not chunk:
                raise WebSocketError("eof")
            buf += chunk
        return buf

    def _read_frame(self):
        hdr = self._read_exact(2)
        b1, b2 = hdr[0], hdr[1]
        opcode = b1 & 0x0F
        masked = b2 & 0x80
        plen = b2 & 0x7F
        if plen == 126:
            plen = struct.unpack(">H", self._read_exact(2))[0]
        elif plen == 127:
            plen = struct.unpack(">Q", self._read_exact(8))[0]
        mask = self._read_exact(4) if masked else None
        payload = self._read_exact(plen) if plen else b""
        if mask:
            payload = bytes(payload[i] ^ mask[i % 4] for i in range(len(payload)))

        if opcode == 0x1:
            return payload.decode()
        if opcode == 0x8:
            self.close()
            return None
        if opcode == 0x9:
            self._send_frame(0xA, payload)
            return None
        return None

    def _send_frame(self, opcode, payload):
        if isinstance(payload, str):
            payload = payload.encode()
        mask_key = os.urandom(4)
        hdr = bytes([0x80 | opcode])
        plen = len(payload)
        if plen < 126:
            hdr += bytes([0x80 | plen])
        elif plen < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack(">H", plen)
        else:
            hdr += bytes([0x80 | 127]) + struct.pack(">Q", plen)
        hdr += mask_key
        masked = bytes(payload[i] ^ mask_key[i % 4] for i in range(plen))
        self.sock.write(hdr + masked)

    def recv(self, timeout_ms=0):
        if self.closed or not self.sock:
            return None
        events = self._poll.poll(timeout_ms)
        if not events:
            return None
        try:
            return self._read_frame()
        except Exception as e:
            print("ws recv err:", e)
            self.close()
            return None

    def recv_blocking(self, timeout_s=2):
        """Blocking read — use right after connect to drain TLS-buffered frames
        that select.poll won't report (TLS buffers bytes below poll's visibility)."""
        if self.closed or not self.sock:
            return None
        try:
            # settimeout goes on the raw socket; SSLSocket has no settimeout.
            self._raw.settimeout(timeout_s)
            return self._read_frame()
        except Exception as e:
            print("ws recv_blocking err:", e)
            self.close()
            return None

    def send(self, text):
        if self.closed or not self.sock:
            return False
        try:
            self._send_frame(0x1, text)
            return True
        except Exception as e:
            print("ws send err:", e)
            self.close()
            return False

    def close(self):
        self.closed = True
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None
        self._raw = None
        self._poll = None
