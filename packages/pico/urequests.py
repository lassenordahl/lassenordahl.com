import socket
import json as _json


def get(url, timeout=5):
    proto, _, host, path = url.split("/", 3)
    port = 443 if proto == "https:" else 80
    if ":" in host:
        host, port = host.split(":", 1)
        port = int(port)

    if proto == "https:":
        import tls
        ctx = tls.SSLContext(tls.PROTOCOL_TLS_CLIENT)
        ctx.verify_mode = tls.CERT_NONE
        s = socket.socket()
        s.settimeout(timeout)
        addr = socket.getaddrinfo(host, port)[0][-1]
        s.connect(addr)
        s = ctx.wrap_socket(s, server_hostname=host)
    else:
        s = socket.socket()
        s.settimeout(timeout)
        addr = socket.getaddrinfo(host, port)[0][-1]
        s.connect(addr)

    request = "GET /{} HTTP/1.0\r\nHost: {}\r\nConnection: close\r\n\r\n".format(path, host)
    s.write(request.encode())

    # Skip headers
    while True:
        line = s.readline()
        if not line or line == b"\r\n":
            break

    body = b""
    while True:
        chunk = s.read(256)
        if not chunk:
            break
        body += chunk
    s.close()

    class Response:
        def __init__(self, data):
            self._data = data
        def json(self):
            return _json.loads(self._data)
        def close(self):
            pass

    return Response(body)
