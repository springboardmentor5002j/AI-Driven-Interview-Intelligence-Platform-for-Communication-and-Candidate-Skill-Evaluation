import json
from uuid import uuid4
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.settings import Settings

A, B, R, ADMIN = (str(uuid4()) for _ in range(4))


class SupabaseMock:
    def __init__(self):
        self.users = {'a': {'id': A, 'email': 'candidate@example.com'}, 'b': {'id': B, 'email': 'other@example.com'},
                      'r': {'id': R, 'email': 'recruiter@example.com'}, 'admin': {'id': ADMIN, 'email': 'admin@example.com'}}
        self.roles = {'admin@example.com': 'admin'}
        self.records = []
        self.grants = []
        self.files = {}
        self.calls = []

    async def handle(self, req):
        self.calls.append(req)
        token = req.headers.get('authorization', '').removeprefix('Bearer ')
        info = self.users.get(token)
        path, method, params = req.url.path, req.method, req.url.params
        if not info:
            return httpx.Response(401, json={'message': 'invalid token'})
        if path == '/auth/v1/user':
            return httpx.Response(200, json={**info, 'email_confirmed_at': info.get('confirmed', '2026-10-08'), 'user_metadata': {'full_name': token, 'role': 'admin'}})
        assert req.headers['apikey'] == 'public-key'
        role = self.roles.get(info['email'], 'candidate')
        content = await req.aread()
        body = json.loads(content) if content and not path.startswith('/storage/') else None
        def visible(owner):
            return owner == info['id'] or (role in ('recruiter', 'admin') and any(g['owner'] == owner and g['email'] == info['email'] for g in self.grants))
        if path == '/rest/v1/role_allowlist':
            if method == 'GET':
                rows = [{'email': e, 'role': r, 'created': '2026-10-08'} for e, r in self.roles.items() if role == 'admin' or e == info['email']]
                if params.get('email'):
                    rows = [r for r in rows if r['email'] == params['email'].removeprefix('eq.')]
                return httpx.Response(200, json=rows)
            if role != 'admin':
                return httpx.Response(403)
            if method == 'POST':
                self.roles[body['email']] = body['role']
            elif method == 'DELETE':
                email = params['email'].removeprefix('eq.')
                if self.roles.get(email) == 'recruiter':
                    del self.roles[email]
            return httpx.Response(204)
        if path.endswith('/rpc/is_authorized_recruiter'):
            return httpx.Response(200, json=self.roles.get(body['target_email']) in ('recruiter', 'admin'))
        if path == '/rest/v1/records':
            if method == 'POST':
                assert body['owner'] == info['id']
                self.records.append(body)
                return httpx.Response(201)
            rows = [r for r in self.records if visible(r['owner']) and (r['owner'] == info['id'] or r['kind'] != 'template')]
            if params.get('owner'):
                rows = [r for r in rows if r['owner'] == params['owner'].removeprefix('eq.')]
            return httpx.Response(200, json=rows)
        if path == '/rest/v1/grants':
            if method == 'POST':
                assert body['owner'] == info['id']
                old = next((g for g in self.grants if g['owner'] == body['owner'] and g['email'] == body['email']), None)
                if not old:
                    self.grants.append({'id': str(uuid4()), **body, 'created': '2026-10-08'})
                return httpx.Response(201)
            if method == 'DELETE':
                self.grants = [g for g in self.grants if not (g['owner'] == info['id'] and g['id'] == params['id'].removeprefix('eq.'))]
                return httpx.Response(204)
            rows = [g for g in self.grants if g['owner'] == info['id'] or (g['email'] == info['email'] and role in ('recruiter', 'admin'))]
            for key in ('owner', 'email'):
                if params.get(key):
                    rows = [g for g in rows if g[key] == params[key].removeprefix('eq.')]
            return httpx.Response(200, json=rows)
        if path.startswith('/storage/v1/object/'):
            key = path.split('/assets/')[1]
            owner = key.split('/')[0]
            if method == 'POST':
                assert owner == info['id']
                self.files[key] = (content, req.headers.get('content-type'))
                return httpx.Response(200, json={'Key': key})
            if not visible(owner):
                return httpx.Response(403)
            if key not in self.files:
                return httpx.Response(404)
            content, mime = self.files[key]
            return httpx.Response(200, content=content, headers={'Content-Type': mime})
        raise AssertionError(f'Unexpected upstream path {path}')


@pytest.fixture
def setup():
    upstream = SupabaseMock()
    settings = Settings('https://project.supabase.co', 'public-key')
    with TestClient(create_app(settings, httpx.MockTransport(upstream.handle))) as client:
        yield client, upstream


def headers(token='a'):
    return {'Authorization': 'Bearer ' + token}


def authorize(client):
    return client.post('/api/roles', json={'email': 'Recruiter@example.com'}, headers=headers('admin'))


def resume(client, token='a'):
    return client.post('/api/data', json={'kind': 'resume', 'data': {'name': 'Resume', 'text': 'Education Experience Skills Projects Java SQL Built 10 APIs improved 30% developed 20 tests implemented 3 projects Git Docker', 'jd': 'Java SQL Git Docker', 'assessment': {'score': -100}, 'candidate': 'FORGED', 'email': 'forged@example.com'}}, headers=headers(token))


def grant(client):
    return client.post('/api/data', json={'kind': 'grant', 'email': 'recruiter@example.com'}, headers=headers())


def upload(client, token='a'):
    return client.post('/api/files', files={'file': ('clip.webm', b'recorded-video', 'video/webm')}, headers=headers(token))


def test_health_and_config(setup):
    c, _ = setup
    assert c.get('/api/health').json()['backend'] == 'FastAPI'
    assert c.get('/api/config').json()['supabaseKey'] == 'public-key'


@pytest.mark.parametrize('endpoint', ['/api/data', '/api/data?recruiter=true', '/api/roles', '/api/files?key=x'])
def test_anonymous_rejected(setup, endpoint):
    assert setup[0].get(endpoint).status_code == 401


def test_invalid_token(setup):
    assert setup[0].get('/api/data', headers=headers('bad')).status_code == 401


def test_unconfirmed_account(setup):
    c, db = setup
    db.users['a']['confirmed'] = None
    assert c.get('/api/data', headers=headers()).status_code == 401


def test_metadata_cannot_grant_admin(setup):
    assert setup[0].get('/api/roles', headers=headers()).status_code == 403


def test_candidate_cannot_create_recruiter(setup):
    assert setup[0].post('/api/roles', json={'email': 'evil@example.com'}, headers=headers()).status_code == 403


def test_admin_creates_recruiter(setup):
    c, db = setup
    assert authorize(c).status_code == 200
    assert db.roles['recruiter@example.com'] == 'recruiter'


@pytest.mark.parametrize('portal', ['recruiter', 'admin'])
def test_candidate_login_cannot_promote_role(setup, portal):
    assert setup[0].post('/api/login', json={'portal': portal}, headers=headers()).status_code == 403


def test_candidate_login(setup):
    assert setup[0].post('/api/login', json={'portal': 'candidate'}, headers=headers()).json()['redirect'] == '/candidate'


def test_authorized_recruiter_login(setup):
    c, _ = setup
    authorize(c)
    assert c.post('/api/login', json={'portal': 'recruiter'}, headers=headers('r')).json()['redirect'] == '/recruiter'


def test_unlisted_recruiter_denied(setup):
    assert setup[0].get('/api/data?recruiter=true', headers=headers('r')).status_code == 403


def test_unlisted_grant_denied(setup):
    assert grant(setup[0]).status_code == 400


def test_resume_scored_on_server(setup):
    c, db = setup
    assert resume(c).status_code == 200
    stored = db.records[0]['data']
    assert stored['assessment']['score'] == 100
    assert stored['candidate'] == 'a' and stored['email'] == 'candidate@example.com'


def test_test_scored_on_server(setup):
    c, db = setup
    assert c.post('/api/data', headers=headers(), json={'kind': 'test', 'data': {'answers': [0, 0, 0, 0, 0], 'score': 100}}).status_code == 200
    assert db.records[0]['data']['score'] == 0


@pytest.mark.parametrize('answers', [[1], [1, 1, 2, 1, 5], [True, 1, 2, 1, 2]])
def test_invalid_test_answers(setup, answers):
    assert setup[0].post('/api/data', headers=headers(), json={'kind': 'test', 'data': {'answers': answers}}).status_code == 400


def test_candidate_isolation(setup):
    c, _ = setup
    resume(c)
    assert c.get('/api/data', headers=headers('b')).json()['records'] == []


def test_recruiter_requires_consent(setup):
    c, _ = setup
    authorize(c); resume(c)
    assert c.get('/api/data?recruiter=true', headers=headers('r')).json()['records'] == []


def test_consent_allows_reports(setup):
    c, _ = setup
    authorize(c); resume(c); grant(c)
    assert len(c.get('/api/data?recruiter=true', headers=headers('r')).json()['records']) == 1


def test_owner_recording_stream(setup):
    c, _ = setup
    key = upload(c).json()['key']
    result = c.get('/api/files', params={'key': key}, headers=headers())
    assert result.status_code == 200 and result.content == b'recorded-video'
    assert result.headers['cache-control'] == 'private, no-store'


def test_other_candidate_file_denied(setup):
    c, _ = setup
    key = upload(c).json()['key']
    assert c.get('/api/files', params={'key': key}, headers=headers('b')).status_code == 403


def test_shared_recording_and_revocation(setup):
    c, db = setup
    authorize(c); grant(c)
    key = upload(c).json()['key']
    assert c.get('/api/files', params={'key': key}, headers=headers('r')).status_code == 200
    id_ = db.grants[0]['id']
    assert c.delete('/api/data', params={'id': id_}, headers=headers()).status_code == 200
    assert c.get('/api/files', params={'key': key}, headers=headers('r')).status_code == 403


def test_other_user_cannot_revoke_consent(setup):
    c, db = setup
    authorize(c); grant(c)
    c.delete('/api/data', params={'id': db.grants[0]['id']}, headers=headers('b'))
    assert len(db.grants) == 1


def test_role_removal_blocks_existing_grant(setup):
    c, _ = setup
    authorize(c); grant(c)
    key = upload(c).json()['key']
    assert c.delete('/api/roles', params={'email': 'recruiter@example.com'}, headers=headers('admin')).status_code == 200
    assert c.get('/api/files', params={'key': key}, headers=headers('r')).status_code == 403


@pytest.mark.parametrize('mime', ['text/html', 'application/x-executable'])
def test_invalid_upload_type(setup, mime):
    assert setup[0].post('/api/files', files={'file': ('bad', b'x', mime)}, headers=headers()).status_code == 400


def test_upload_limit():
    db = SupabaseMock()
    with TestClient(create_app(Settings('https://project.supabase.co', 'public-key', max_upload_bytes=3), httpx.MockTransport(db.handle))) as c:
        assert c.post('/api/files', files={'file': ('big.txt', b'large', 'text/plain')}, headers=headers()).status_code == 413
        assert db.files == {}


def test_malformed_file_key(setup):
    assert setup[0].get('/api/files', params={'key': '../../etc/passwd'}, headers=headers()).status_code == 400


def test_candidate_cannot_create_template(setup):
    assert setup[0].post('/api/data', json={'kind': 'template', 'data': {'name': 'x', 'questions': 'q'}}, headers=headers()).status_code == 403


def test_user_token_forwarded(setup):
    c, db = setup
    c.get('/api/data', headers=headers())
    assert all(r.headers['authorization'] == 'Bearer a' for r in db.calls)


def test_invalid_portal(setup):
    assert setup[0].post('/api/login', json={'portal': 'superadmin'}, headers=headers()).status_code == 422


def test_missing_configuration():
    with TestClient(create_app(Settings())) as c:
        assert c.get('/api/config').json()['configured'] is False
        assert c.get('/api/data', headers=headers()).status_code == 503


def test_unknown_api_not_spa(setup):
    assert setup[0].get('/api/not-a-real-route').status_code == 404
