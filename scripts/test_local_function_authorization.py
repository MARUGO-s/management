"""Exercise actual Edge Function handlers locally without contacting production.

Requires Deno and a free localhost:8000. Only sends requests that should be
rejected before any database or external service access.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SECRET = 'local-authorization-test-only-secret-not-for-deployment'
FUNCTIONS = {
    'access-logs': ('list', 'list'),
    'data-mismatch-reports': ('get_all', 'delete_all'),
    'api-usage-tracker': ('get', 'reset'),
    'indicator-settings': ('get', 'save'),
    'send-alert-email': (None, None),
    'password-manager': ('get', 'change'),
}


def token(role):
    body = base64.urlsafe_b64encode(json.dumps({'typ': role, 'exp': int(time.time() * 1000) + 60000}, separators=(',', ':')).encode()).decode().rstrip('=')
    signature = base64.urlsafe_b64encode(hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip('=')
    return f'{body}.{signature}'


def request(data, session=None, method='POST'):
    headers = {'Content-Type': 'application/json'}
    if session:
        headers['x-loan-session'] = session
    req = urllib.request.Request('http://127.0.0.1:8000/', data=json.dumps(data).encode() if method == 'POST' else None, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=4)
    except urllib.error.HTTPError as err:
        response = err
    with response:
        return response.status, dict(response.headers), response.read()


def main():
    with socket.socket() as sock:
        if sock.connect_ex(('127.0.0.1', 8000)) == 0:
            raise RuntimeError('Port 8000 already in use; refusing to contact an unknown server')
    system = token('system')
    admin = token('admin')
    count = 0
    for name, (read_action, admin_action) in FUNCTIONS.items():
        env = {**os.environ, 'SESSION_SIGNING_SECRET': SECRET, 'SUPABASE_URL': 'http://127.0.0.1:9999', 'SUPABASE_SERVICE_ROLE_KEY': 'test-placeholder'}
        process = subprocess.Popen(['deno', 'run', '--allow-net', '--allow-env', str(ROOT / 'supabase/functions' / name / 'index.ts')], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            for _ in range(50):
                if process.poll() is not None:
                    raise RuntimeError(f'{name} failed to start: {(process.stderr.read() if process.stderr else "")[-1000:]}')
                with socket.socket() as sock:
                    if sock.connect_ex(('127.0.0.1', 8000)) == 0:
                        break
                time.sleep(0.1)
            else:
                raise RuntimeError(f'{name} did not start')
            body = {'action': read_action} if read_action else {'to': 'test@example.invalid', 'subject': 'test', 'body': 'test'}
            if name == 'password-manager':
                body['passwordType'] = 'admin'
            status, _, payload = request(body)
            assert status == 401, f'{name} public read returned {status}: {payload[:100]!r}'
            count += 1
            admin_body = {'action': admin_action} if admin_action else body
            if name == 'password-manager':
                admin_body['passwordType'] = 'admin'
            status, _, payload = request(admin_body, system)
            assert status == 403, f'{name} system session performed admin action: {status} {payload[:100]!r}'
            count += 1
            # A valid admin session reaches these two branches without DB access.
            # Other authorized branches would query the real Supabase backend.
            if name in ('send-alert-email', 'password-manager'):
                status, _, payload = request(admin_body, admin)
                assert status not in (401, 403), f'{name} denied valid administrator: {status} {payload[:100]!r}'
                count += 1
            _, headers, _ = request({}, method='OPTIONS')
            cors_headers = {key.lower(): value for key, value in headers.items()}
            assert 'x-loan-session' in cors_headers.get('access-control-allow-headers', '').lower(), f'{name} missing browser CORS allowance'
            count += 1
            print(f'{name}: anonymous=401, system/admin-only=403, CORS=ok')
        finally:
            process.terminate()
            try:
                process.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.communicate()
    # The sheet function must also fail closed when its old migration flag is absent.
    env = {**os.environ, 'SESSION_SIGNING_SECRET': SECRET}
    env.pop('SHEETS_REQUIRE_SESSION', None)
    process = subprocess.Popen(['deno', 'run', '--allow-net', '--allow-env', str(ROOT / 'supabase/functions/sheets-api/index.ts')], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        for _ in range(50):
            if process.poll() is not None:
                raise RuntimeError('sheets-api failed to start')
            with socket.socket() as sock:
                if sock.connect_ex(('127.0.0.1', 8000)) == 0:
                    break
            time.sleep(0.1)
        else:
            raise RuntimeError('sheets-api did not start')
        status, _, payload = request({'spreadsheetId': 'invalid', 'range': '貸借表!A1'})
        assert status == 401, f'sheets-api accepted anonymous request without migration flag: {status} {payload[:100]!r}'
        count += 1
        print('sheets-api: anonymous=401 even without SHEETS_REQUIRE_SESSION')
    finally:
        process.terminate()
        try:
            process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
    print(f'{count} local authorization assertions passed; no production access')


if __name__ == '__main__':
    main()
