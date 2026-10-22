import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.settings import Settings
from test_api import SupabaseMock, headers, A, B, R, authorize


class HubMock(SupabaseMock):
    def __init__(self):
        super().__init__()
        self.catalog = json.loads((Path(__file__).parents[1] / 'app/data/catalog.json').read_text())
        self.profiles, self.preferences, self.actions = [], [], []

    async def handle(self, req):
        path, method, params = req.url.path, req.method, req.url.params
        if path.startswith('/auth/') or path == '/rest/v1/role_allowlist' or path == '/rest/v1/records' or path == '/rest/v1/grants':
            return await super().handle(req)
        self.calls.append(req)
        token = req.headers.get('authorization', '').removeprefix('Bearer ')
        user = self.users.get(token)
        if not user:
            return httpx.Response(401)
        body = json.loads(await req.aread()) if method == 'POST' else None
        role = self.roles.get(user['email'], 'candidate')
        if path == '/rest/v1/catalog_items':
            if method == 'GET':
                items = [i for i in self.catalog if not params.get('id') or i['id'] == params['id'].removeprefix('eq.')]
                return httpx.Response(200, json=items)
            if method == 'POST':
                assert role == 'admin' or (role == 'recruiter' and body['kind'] in ('event','job') and body['author'] == user['id'])
                self.catalog.append(body)
                return httpx.Response(201)
            if method == 'DELETE':
                self.catalog = [i for i in self.catalog if i['id'] != params['id'].removeprefix('eq.')]
                return httpx.Response(204)
        tables = {'/rest/v1/hub_profiles':self.profiles, '/rest/v1/hub_preferences':self.preferences, '/rest/v1/hub_actions':self.actions}
        if path in tables:
            table = tables[path]
            if method == 'GET':
                assert params['owner'] == 'eq.' + user['id']
                return httpx.Response(200, json=[r for r in table if r['owner'] == user['id']])
            if method == 'POST':
                assert body['owner'] == user['id']
                keys = ['owner','kind','item'] if path.endswith('hub_actions') else ['owner']
                existing = next((r for r in table if all(r[k] == body[k] for k in keys)), None)
                if existing:
                    existing.update(body)
                else:
                    table.append({'id':str(uuid4()),'created':'2026-10-11',**body})
                return httpx.Response(201)
            if method == 'DELETE':
                assert params['owner'] == 'eq.' + user['id']
                table[:] = [r for r in table if not all(r[k] == params[k].removeprefix('eq.') for k in ('owner','kind','item'))]
                return httpx.Response(204)
        if path == '/rest/v1/rpc/hub_leaderboard':
            rows = [{'alias':p['data']['public_alias'],'points':0,'lessons':0,'best_test':0} for p in self.preferences if p['data'].get('leaderboard_opt_in')]
            return httpx.Response(200, json=rows)
        raise AssertionError(f'Unexpected upstream path {path}')


@pytest.fixture
def hub():
    db = HubMock()
    with TestClient(create_app(Settings('https://project.supabase.co','public-key'), httpx.MockTransport(db.handle))) as c:
        yield c, db


def listing(kind='job', **kwargs):
    return {'kind':kind,'title':'Backend developer','description':'Build Python API services and write tests.','organization':'Workspace team','location':'Remote', **kwargs}


@pytest.mark.parametrize('path',['catalog','account','leaderboard'])
def test_hub_requires_login(hub,path):
    assert hub[0].get('/api/hub/'+path).status_code == 401


def test_catalog_contains_real_lessons(hub):
    c,_ = hub
    items=c.get('/api/hub/catalog',headers=headers()).json()['items']
    assert len([i for i in items if i['kind']=='course'])==6
    assert len([i for i in items if i['kind']=='path'])==4
    assert all(len(i['data']['lessons'])==3 for i in items if i['kind']=='course')
    assert not any(i['kind'] in ('job','event') for i in items)


def test_profile_is_upserted_under_verified_owner(hub):
    c,db=hub
    for name in ('Purna','Purna Kunche'):
        assert c.post('/api/hub/profile',headers=headers(),json={'name':name,'skills':['Java','Java']}).status_code==200
    assert len(db.profiles)==1 and db.profiles[0]['owner']==A
    assert c.get('/api/hub/account',headers=headers()).json()['profile']['name']=='Purna Kunche'
    assert c.get('/api/hub/account',headers=headers('b')).json()['profile']['name']=='b'
    assert db.profiles[0]['data']['skills']==['Java']


@pytest.mark.parametrize('payload',[{'name':' '},{'name':'P','github':'javascript:alert(1)'},{'name':'P','linkedin':'https://name:password@example.com'},{'name':'P','skills':['x'*61]}])
def test_profile_invalid_input_rejected(hub,payload):
    assert hub[0].post('/api/hub/profile',headers=headers(),json=payload).status_code==400


def test_leaderboard_alias_required_and_opt_out(hub):
    c,db=hub
    assert c.post('/api/hub/preferences',headers=headers(),json={'leaderboard_opt_in':True}).status_code==400
    assert c.post('/api/hub/preferences',headers=headers(),json={'leaderboard_opt_in':True,'public_alias':'Learner'}).status_code==200
    row=c.get('/api/hub/leaderboard',headers=headers()).json()['entries'][0]
    assert set(row)=={'alias','points','lessons','best_test'}
    assert c.post('/api/hub/preferences',headers=headers(),json={'leaderboard_opt_in':False,'public_alias':'Learner'}).status_code==200
    assert c.get('/api/hub/leaderboard',headers=headers()).json()['entries']==[]


@pytest.mark.parametrize('kind',['event','job'])
def test_candidate_cannot_publish(hub,kind):
    assert hub[0].post('/api/hub/catalog',headers=headers(),json=listing(kind)).status_code==403


def test_recruiters_and_admins_can_publish_events_and_jobs(hub):
    c,db=hub;authorize(c)
    assert c.post('/api/hub/catalog',headers=headers('r'),json=listing()).status_code==200
    assert db.catalog[-1]['author']==R
    tomorrow=(datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat()
    assert c.post('/api/hub/catalog',headers=headers('r'),json=listing('event',date=tomorrow)).status_code==200
    assert c.post('/api/hub/catalog',headers=headers('admin'),json=listing('event',date=tomorrow)).status_code==200


@pytest.mark.parametrize('overrides',[{'date':None},{'date':'2000-01-01'},{'date':'invalid-date'}])
def test_invalid_event_dates(hub,overrides):
    r=hub[0].post('/api/hub/catalog',headers=headers('admin'),json=listing('event',**overrides))
    assert r.status_code in (400,422)


@pytest.mark.parametrize('url',['javascript:alert(1)','http://example.com','https://user:pass@example.com'])
def test_listing_unsafe_urls(hub,url):
    assert hub[0].post('/api/hub/catalog',headers=headers('admin'),json=listing(url=url)).status_code==400


def test_course_completion_deduplicates_and_can_be_undone(hub):
    c,db=hub
    payload={'kind':'lesson','item':'java-foundations','lesson':'objects'}
    for _ in range(2):
        assert c.post('/api/hub/actions',headers=headers(),json=payload).status_code==200
    assert len(db.actions)==1 and db.actions[0]['item']=='java-foundations:objects'
    assert c.get('/api/hub/account',headers=headers('b')).json()['actions']==[]
    assert c.delete('/api/hub/actions?kind=lesson&item=java-foundations:objects',headers=headers('b')).status_code==200
    assert len(db.actions)==1
    assert c.delete('/api/hub/actions?kind=lesson&item=java-foundations:objects',headers=headers()).status_code==200
    assert not db.actions


@pytest.mark.parametrize('payload',[{'kind':'lesson','item':'java-foundations','lesson':'invented'},{'kind':'job','item':'java-foundations'},{'kind':'path','item':'missing'},{'kind':'lesson','item':'java-foundations'}])
def test_unknown_or_mismatched_actions(hub,payload):
    assert hub[0].post('/api/hub/actions',headers=headers(),json=payload).status_code in (400,404)


def test_event_registration_and_job_bookmarks(hub):
    c,db=hub
    tomorrow=(datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat()
    job=c.post('/api/hub/catalog',headers=headers('admin'),json=listing()).json()['id']
    event=c.post('/api/hub/catalog',headers=headers('admin'),json=listing('event',date=tomorrow)).json()['id']
    for kind,id_ in [('job',job),('event',event)]:
        assert c.post('/api/hub/actions',headers=headers(),json={'kind':kind,'item':id_}).status_code==200
    assert len(db.actions)==2
    db.catalog[-1]['data']['date']='2000-01-01'
    assert c.post('/api/hub/actions',headers=headers('b'),json={'kind':'event','item':event}).status_code==400


@pytest.mark.parametrize('kind',['event','job'])
def test_catalog_delete_ownership_and_learning_protection(hub,kind):
    c,db=hub;authorize(c)
    tomorrow=(datetime.now(timezone.utc)+timedelta(days=1)).date().isoformat()
    own=c.post('/api/hub/catalog',headers=headers('r'),json=listing(kind,date=tomorrow)).json()['id']
    other=c.post('/api/hub/catalog',headers=headers('admin'),json=listing(kind,date=tomorrow)).json()['id']
    assert c.delete('/api/hub/catalog?id='+own,headers=headers()).status_code==403
    assert c.delete('/api/hub/catalog?id='+other,headers=headers('r')).status_code==403
    assert c.delete('/api/hub/catalog?id=java-foundations',headers=headers('admin')).status_code==400
    assert c.delete('/api/hub/catalog?id='+own,headers=headers('r')).status_code==200
    assert not any(i['id']==own for i in db.catalog)


def test_progress_and_preferences_do_not_leak_between_users(hub):
    c,_=hub
    c.post('/api/hub/preferences',headers=headers(),json={'preferred_topic':'Java'})
    c.post('/api/hub/actions',headers=headers(),json={'kind':'enroll','item':'java-foundations'})
    c.post('/api/hub/actions',headers=headers(),json={'kind':'path','item':'java-backend-path'})
    own=c.get('/api/hub/account',headers=headers()).json()
    other=c.get('/api/hub/account',headers=headers('b')).json()
    assert own['preferences']['preferred_topic']=='Java' and len(own['actions'])==2
    assert other['preferences']=={} and other['actions']==[]
