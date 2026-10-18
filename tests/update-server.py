"""Local-only release fixture. Never reads a user's browser profile or app data."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
import io
import re
import subprocess
import sys
import tarfile
import tempfile

REPO = Path(__file__).resolve().parents[1]
BASELINE = '37c083c56e9656537b9c454ec5768cfdbd5324c5'  # Released v68, not moving HEAD.
BASE_VERSION = 68
CANDIDATE = int(re.search(r"const VERSION = '(\d+)'", (REPO / 'sw.js').read_text())[1])
phase = BASE_VERSION


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        global phase
        if self.path != '/__version':
            return self.send_error(404)
        value = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if value not in [str(v).encode() for v in [BASE_VERSION, CANDIDATE, CANDIDATE + 1, CANDIDATE + 2]]:
            return self.send_error(400)
        phase = int(value)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(value)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        root = base if phase == BASE_VERSION else REPO
        target = (root / path).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            return self.send_error(404)
        data = target.read_bytes()
        if phase > CANDIDATE and path in ['index.html', 'sw.js']:
            data = data.replace(f'?v={CANDIDATE}'.encode(), f'?v={phase}'.encode()).replace(f"VERSION = '{CANDIDATE}'".encode(), f"VERSION = '{phase}'".encode())
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
