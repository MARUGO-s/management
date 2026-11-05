"""Login rate limit for password-manager verify, against a local in-memory PostgREST stand-in.

Checks: 3 failures in 10 minutes lock that client+type (even the right password gets 429),
other clients and the other password type are not affected, a success clears the counter,
old failures fall out of the window, and a broken throttle table never blocks a correct login.
"""
import hashlib
import json
import itertools
import os
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from test_local_function_authorization import ROOT, SECRET

PASSWORDS = {'system': 'system-test-password', 'admin': 'admin-test-password'}
rows = {kind: hashlib.sha256(value.encode()).hexdigest() for kind, value in PASSWORDS.items()}
failures = []  # list of {'key': str, 'failed_at': str}
BROKEN = {'throttle': False, 'password_read': False}
NEXT_ID = itertools.count(1)


def parse_time(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


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

    def throttle_filter(self, query):
        items = failures
        if 'key' in query:
            items = [r for r in items if r['key'] == query['key'][0].removeprefix('eq.')]
        for cond in query.get('failed_at', []):
            op, value = cond.split('.', 1)
            when = parse_time(value)
            items = [r for r in items if (parse_time(r['failed_at']) >= when if op == 'gte' else parse_time(r['failed_at']) < when)]
        return items

    def do_GET(self):
        path = urlparse(self.path)
        query = parse_qs(path.query)
        if path.path == '/rest/v1/login_failures':
            if BROKEN['throttle']:
                return self.write_json(500, {'message': 'broken for test'})
            items = sorted(self.throttle_filter(query), key=lambda r: r['failed_at'], reverse=True)
            limit = int(query.get('limit', ['1000'])[0])
            return self.write_json(200, [{'failed_at': r['failed_at']} for r in items[:limit]])
        assert path.path == '/rest/v1/password_management', path.path
        if BROKEN['password_read']:
            return self.write_json(500, {'message': 'password read failed for test'})
        kind = query.get('password_type', [''])[0].removeprefix('eq.')
        match = {'password_hash': rows[kind]} if kind in rows else None
        if 'application/vnd.pgrst.object+json' in self.headers.get('Accept', ''):
            return self.write_json(200, match) if match else self.write_json(406, {'code': 'PGRST116'})
        return self.write_json(200, [match] if match else [])

    def do_POST(self):
        path = urlparse(self.path)
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if path.path.startswith('/rest/v1/rpc/'):
            if BROKEN['throttle']:
                return self.write_json(404, {'code': 'PGRST202', 'message': 'RPC missing for test'})
            key = body['p_key']
            if path.path.endswith('/reserve_login_attempt'):
                now = datetime.now(timezone.utc)
                recent = [r for r in failures if r['key'] == key and parse_time(r['failed_at']) >= now - timedelta(minutes=10)]
                if len(recent) >= 3:
                    return self.write_json(200, {'locked': True, 'attempt_id': None, 'retry_after_seconds': 600})
                ident = str(next(NEXT_ID))
                failures.append({'id': ident, 'key': key, 'failed_at': now.isoformat()})
                return self.write_json(200, {'locked': False, 'attempt_id': ident, 'retry_after_seconds': 0})
            assert path.path.endswith('/finish_login_attempt'), path.path
            ident = int(body['p_attempt_id'])
            failures[:] = [r for r in failures if not (r['key'] == key and (int(r['id']) <= ident if body['p_success'] else int(r['id']) == ident))]
            return self.write_json(204, {})
        raise AssertionError(path.path)

    def do_PATCH(self):
        query = parse_qs(urlparse(self.path).query)
        kind = query['password_type'][0].removeprefix('eq.')
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        expected = query.get('password_hash', [None])[0]
        if expected is None or rows.get(kind) == expected.removeprefix('eq.'):
            rows[kind] = body['password_hash']
        self.write_json(204, {})

    def do_DELETE(self):
        path = urlparse(self.path)
        assert path.path == '/rest/v1/login_failures', path.path
        if BROKEN['throttle']:
            return self.write_json(500, {'message': 'broken for test'})
        doomed = self.throttle_filter(parse_qs(path.query))
        for item in list(doomed):
            failures.remove(item)
        self.write_json(204, {})


def verify(kind, password, ip='203.0.113.10'):
    headers = {'Content-Type': 'application/json', 'x-forwarded-for': f'{ip}, 10.0.0.1', 'cf-connecting-ip': ip}
    data = json.dumps({'action': 'verify', 'passwordType': kind, 'currentPassword': password}).encode()
    req = urllib.request.Request('http://127.0.0.1:8000/', data=data, headers=headers, method='POST')
    try:
        response = urllib.request.urlopen(req, timeout=8)
    except urllib.error.HTTPError as err:
        response = err
    with response:
        return response.status, json.loads(response.read() or b'{}')


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

        # Reject noncanonical types/passwords before any failure slot is reserved.
        for kind, password in [(['system'], PASSWORDS['system']), ('System', 'wrong'),
                               (None, 'wrong'), (1, 'wrong'), ({}, 'wrong'),
                               ('system', None), ('system', ['wrong']), ('system', 123)]:
            status, body = verify(kind, password)
            assert status == 400 and not body.get('token') and failures == [], (kind, status, body, failures)

        # 2 failures, then the right password still works and clears the counter.
        for _ in range(2):
            status, body = verify('system', 'wrong')
            assert status == 200 and body['isValid'] is False, (status, body)
        assert len(failures) == 2, len(failures)
        assert all(len(r['key']) == 64 and '203.0.113.10' not in r['key'] for r in failures), 'client address must be hashed'
        status, body = verify('system', PASSWORDS['system'])
        assert status == 200 and body['isValid'] and body['token'], (status, body)
        assert failures == [], 'a successful login clears that client\'s failures'

        # 3 failures lock this client for the system password; even the right one is refused.
        for _ in range(3):
            status, body = verify('system', 'wrong')
            assert status == 200 and body['isValid'] is False, (status, body)
        status, body = verify('system', PASSWORDS['system'])
        assert status == 429 and body.get('locked') is True and body.get('isValid') is False and not body.get('token'), (status, body)
        assert 1 <= body['retryAfterSeconds'] <= 600, body
        count_when_locked = len(failures)
        status, body = verify('system', 'wrong')
        assert status == 429 and len(failures) == count_when_locked, 'locked attempts are not checked or counted'

        # Other clients and the admin password are not affected.
        status, body = verify('system', PASSWORDS['system'], ip='198.51.100.7')
        assert status == 200 and body['isValid'], (status, body)
        status, body = verify('admin', PASSWORDS['admin'])
        assert status == 200 and body['isValid'], (status, body)

        # Failures older than 10 minutes fall out of the window.
        old = (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat().replace('+00:00', 'Z')
        for item in failures:
            item['failed_at'] = old
        status, body = verify('system', PASSWORDS['system'])
        assert status == 200 and body['isValid'], (status, body)

        # Password reads fail before comparison: release the reservation instead of
        # exhausting the login budget during an unrelated backend failure.
        BROKEN['password_read'] = True
        for _ in range(5):
            status, body = verify('system', 'wrong', ip='192.0.2.56')
            assert status == 500 and failures == [], (status, body, failures)
        BROKEN['password_read'] = False
        status, body = verify('system', PASSWORDS['system'], ip='192.0.2.56')
        assert status == 200 and body['isValid'], (status, body)

        # A missing RPC on an older DB is fail-open; wrong still stays wrong.
        BROKEN['throttle'] = True
        status, body = verify('system', PASSWORDS['system'], ip='192.0.2.55')
        assert status == 200 and body['isValid'], (status, body)
        status, body = verify('system', 'wrong', ip='192.0.2.55')
        assert status == 200 and body['isValid'] is False, (status, body)
        BROKEN['throttle'] = False
        print('Login rate limit: 3 failures lock per client+type, success clears, window expiry, other client/type unaffected, fail-open passed')
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
