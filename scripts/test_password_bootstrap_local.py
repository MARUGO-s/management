"""Test initial password setup and rotation against a local in-memory PostgREST stand-in."""
import base64
import hashlib
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request

from test_local_function_authorization import ROOT, SECRET, request

ADMIN_PASSWORD = 'local-admin-test-password'
LEGACY_ADMIN_HASH = hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()
rows = {'admin': LEGACY_ADMIN_HASH}
RACE = {}


def b64url_decode(value):
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def matches_pbkdf2(stored, password):
    """Check a stored record is salted PBKDF2-SHA256 and matches the password."""
    scheme, iterations, salt, digest = stored.split('$')
    assert scheme == 'pbkdf2_sha256' and int(iterations) >= 310000, stored[:30]
    return hashlib.pbkdf2_hmac('sha256', password.encode(), b64url_decode(salt), int(iterations), len(b64url_decode(digest))) == b64url_decode(digest)


class FakePostgrest(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def write_json(self, status, value):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        from urllib.parse import parse_qs, urlparse
        path = urlparse(self.path)
        if path.path == '/rest/v1/login_failures':
            return self.write_json(200, [])
        assert path.path == '/rest/v1/password_management', path.path
        query = parse_qs(path.query)
        kind = query.get('password_type', [''])[0].removeprefix('eq.')
        selected = query.get('select', ['*'])[0].split(',')
        matches = [{key: (value if key == 'password_hash' else kind) for key in selected} for value in [rows[kind]]] if kind in rows else []
        if 'application/vnd.pgrst.object+json' in self.headers.get('Accept', ''):
            if not matches:
                self.write_json(406, {'code': 'PGRST116', 'message': 'The result contains 0 rows'})
            else:
                self.write_json(200, matches[0])
        else:
            self.write_json(200, matches)

    def do_POST(self):
        if self.path.startswith('/rest/v1/login_failures'):
            self.rfile.read(int(self.headers['Content-Length']))
            return self.write_json(201, {})
        assert self.path.startswith('/rest/v1/password_management')
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert body['password_type'] not in rows
        rows[body['password_type']] = body['password_hash']
        self.write_json(201, {})

    def do_DELETE(self):
        assert self.path.startswith('/rest/v1/login_failures'), self.path
        self.write_json(204, {})

    def do_PATCH(self):
        from urllib.parse import parse_qs, urlparse
        query = parse_qs(urlparse(self.path).query)
        kind = query['password_type'][0].removeprefix('eq.')
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        # Honour an extra password_hash=eq.<old> filter like PostgREST does.
        expected = query.get('password_hash', [None])[0]
        if expected is not None and rows.get(kind) != expected.removeprefix('eq.'):
            self.write_json(204, {})
            return
        if RACE.get(kind):
            # Simulate an admin changing the password between the read and the upgrade write.
            rows[kind] = RACE.pop(kind)
            if expected is not None:
                self.write_json(204, {})
                return
        rows[kind] = body['password_hash']
        self.write_json(204, {})


def main():
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', 8000)) == 0 or sock.connect_ex(('127.0.0.1', 9999)) == 0:
            raise RuntimeError('Test ports in use')
    db = HTTPServer(('127.0.0.1', 9999), FakePostgrest)
    thread = threading.Thread(target=db.serve_forever, daemon=True)
    thread.start()
    env = {**os.environ, 'SESSION_SIGNING_SECRET': SECRET, 'SUPABASE_URL': 'http://127.0.0.1:9999', 'SUPABASE_SERVICE_ROLE_KEY': 'test-placeholder'}
    process = subprocess.Popen(['deno', 'run', '--allow-net', '--allow-env', str(ROOT / 'supabase/functions/password-manager/index.ts')], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        for _ in range(150):
            if process.poll() is not None:
                raise RuntimeError(f'Function exited early: {process.stderr.read()[-2000:]}')
            with socket.socket() as sock:
                if sock.connect_ex(('127.0.0.1', 8000)) == 0:
                    break
            time.sleep(0.1)
        else:
            raise RuntimeError('Function failed to start')
        status, _, body = request({'action': 'get', 'passwordType': 'system'})
        assert status == 200 and json.loads(body)['passwords']['system']['status'] == '未設定', (status, body)
        status, _, body = request({'action': 'verify', 'passwordType': 'admin', 'currentPassword': ADMIN_PASSWORD})
        auth = json.loads(body)
        assert status == 200 and auth['isValid'] and auth['token'], (status, body)
        assert rows['admin'] != LEGACY_ADMIN_HASH and matches_pbkdf2(rows['admin'], ADMIN_PASSWORD), 'legacy SHA-256 must be upgraded after a successful login'
        upgraded_admin = rows['admin']
        status, _, body = request({'action': 'verify', 'passwordType': 'admin', 'currentPassword': ADMIN_PASSWORD})
        assert status == 200 and json.loads(body)['isValid'] and rows['admin'] == upgraded_admin, 'PBKDF2 login must work and must not rewrite the record'
        status, _, body = request({'action': 'verify', 'passwordType': 'admin', 'currentPassword': 'wrong-password'})
        assert status == 200 and not json.loads(body)['isValid'] and rows['admin'] == upgraded_admin, (status, body)
        new_password = 'first-system-test-password'
        change = {'action': 'change', 'passwordType': 'system', 'newPassword': new_password}
        status, _, _ = request(change)
        assert status == 401 and 'system' not in rows, 'Unauthenticated initial setup must fail'
        status, _, body = request(change, auth['token'])
        assert status == 200 and matches_pbkdf2(rows['system'], new_password), (status, body)
        status, _, body = request({'action': 'get', 'passwordType': 'system'})
        assert status == 200 and json.loads(body)['passwords']['system']['status'] == '設定済み', (status, body)
        change['newPassword'] = 'second-system-test-password'
        change['currentPassword'] = 'wrong'
        status, _, _ = request(change, auth['token'])
        assert status == 401 and matches_pbkdf2(rows['system'], new_password)
        change['currentPassword'] = new_password
        status, _, body = request(change, auth['token'])
        assert status == 200 and matches_pbkdf2(rows['system'], change['newPassword']), (status, body)
        # A legacy upgrade must not overwrite a password that changed after it was read.
        rows['admin'] = LEGACY_ADMIN_HASH
        RACE['admin'] = 'changed-by-admin-meanwhile'
        status, _, body = request({'action': 'verify', 'passwordType': 'admin', 'currentPassword': ADMIN_PASSWORD})
        assert status == 200 and json.loads(body)['isValid'] and rows['admin'] == 'changed-by-admin-meanwhile', rows['admin'][:30]
        print('Local password bootstrap: conditional upgrade does not overwrite a concurrent change')
        print('Local password bootstrap: legacy upgrade, PBKDF2 login, initial setup, no-session rejection, wrong/current password rotation passed')
    finally:
        process.terminate()
        try:
            process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
        db.shutdown()
        db.server_close()
        thread.join(timeout=3)


if __name__ == '__main__':
    main()
