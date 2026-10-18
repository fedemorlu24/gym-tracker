"""Local-only release fixture. Never reads a user's browser profile or app data."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import io
import subprocess
import sys
import tarfile
import tempfile

REPO = Path(__file__).resolve().parents[1]
BASELINE = 'f18345e71ef321a4e7e839b229d04547c6650c8f'  # Released v62, not moving HEAD.
phase = 62


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        global phase
        if self.path != '/__version':
            return self.send_error(404)
        value = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if value not in [b'62', b'63', b'64', b'65']:
            return self.send_error(400)
        phase = int(value)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(value)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        root = base if phase == 62 else REPO
        target = (root / path).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            return self.send_error(404)
        data = target.read_bytes()
        if phase > 63 and path in ['index.html', 'sw.js']:
            data = data.replace(b'?v=63', ('?v=' + str(phase)).encode()).replace(b"VERSION = '63'", ("VERSION = '" + str(phase) + "'").encode())
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


with tempfile.TemporaryDirectory(prefix='gym-update-test-') as folder:
    base = Path(folder).resolve()
    archive = subprocess.check_output(['git', 'archive', BASELINE], cwd=REPO)
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        # Extract regular files from a pinned local commit, with path traversal protection.
        for member in tar:
            target = (base / member.name).resolve()
            if member.isfile() and target.is_relative_to(base):
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())
    server = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 0), Handler)
    print('http://127.0.0.1:' + str(server.server_port) + '/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
