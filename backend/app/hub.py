from datetime import date as CalendarDate, datetime, timezone
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .supabase import Auth, DB, require_admin, require_recruiter

router = APIRouter(prefix='/api/hub')


class ProfileInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    headline: str = Field(default='', max_length=160)
    bio: str = Field(default='', max_length=2000)
    location: str = Field(default='', max_length=100)
    skills: list[str] = Field(default_factory=list, max_length=30)
    goal: str = Field(default='', max_length=160)
    github: str = Field(default='', max_length=300)
    linkedin: str = Field(default='', max_length=300)


class PreferencesInput(BaseModel):
    leaderboard_opt_in: bool = False
    public_alias: str = Field(default='', max_length=40)
    compact_cards: bool = False
    preferred_topic: str = Field(default='', max_length=60)


class ListingInput(BaseModel):
    kind: Literal['event', 'job']
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(min_length=10, max_length=4000)
    organization: str = Field(min_length=2, max_length=100)
    location: str = Field(min_length=2, max_length=100)
    url: str = Field(default='', max_length=500)
    date: CalendarDate | None = None
    level: str = Field(default='All levels', max_length=40)
    topic: str = Field(default='', max_length=60)


class ActionInput(BaseModel):
    kind: Literal['enroll', 'lesson', 'path', 'event', 'job']
    item: str = Field(min_length=1, max_length=120)
    lesson: str | None = Field(default=None, max_length=100)


def web_url(value):
    if not value:
        return ''
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(400, 'Links must be valid HTTPS URLs without embedded credentials.')
    return value


async def catalog_item(db, user, item):
    rows = (await db.request('GET', '/rest/v1/catalog_items', user.token,
                           params={'select': '*', 'id': 'eq.' + item})).json()
    if not rows:
        raise HTTPException(404, 'This catalog item is no longer available.')
    return rows[0]


@router.get('/catalog')
async def catalog(user: Auth, db: DB):
    rows = (await db.request('GET', '/rest/v1/catalog_items', user.token,
                            params={'select': '*', 'order': 'created.asc'})).json()
    return {'items': rows}


@router.get('/account')
async def account(user: Auth, db: DB):
    params = {'select': '*', 'owner': 'eq.' + user.id}
    profiles = (await db.request('GET', '/rest/v1/hub_profiles', user.token, params=params)).json()
    preferences = (await db.request('GET', '/rest/v1/hub_preferences', user.token, params=params)).json()
    actions = (await db.request('GET', '/rest/v1/hub_actions', user.token, params={**params, 'order': 'created.desc'})).json()
    return {'id': user.id, 'profile': profiles[0]['data'] if profiles else {'name': user.name},
            'preferences': preferences[0]['data'] if preferences else {}, 'actions': actions}


@router.post('/profile')
async def profile(body: ProfileInput, user: Auth, db: DB):
    data = body.model_dump()
    data['name'] = data['name'].strip()
    if not data['name'] or any(not skill.strip() or len(skill) > 60 for skill in data['skills']):
        raise HTTPException(400, 'Enter a name and valid skills of up to 60 characters each.')
    data['skills'] = list(dict.fromkeys(s.strip() for s in data['skills']))
    for key in ('github', 'linkedin'):
        data[key] = web_url(data[key])
    await db.request('POST', '/rest/v1/hub_profiles', user.token,
                     headers={'Prefer': 'resolution=merge-duplicates'}, json={'owner': user.id, 'data': data})
    return {'ok': True}


@router.post('/preferences')
async def preferences(body: PreferencesInput, user: Auth, db: DB):
    data = body.model_dump()
    data['public_alias'] = data['public_alias'].strip()
    if data['leaderboard_opt_in'] and not data['public_alias']:
        raise HTTPException(400, 'Choose a public alias before joining the leaderboard.')
    await db.request('POST', '/rest/v1/hub_preferences', user.token,
                     headers={'Prefer': 'resolution=merge-duplicates'}, json={'owner': user.id, 'data': data})
    return {'ok': True}


@router.post('/catalog')
async def create_listing(body: ListingInput, user: Auth, db: DB):
    require_recruiter(user)
    if body.kind == 'event' and (not body.date or body.date < datetime.now(timezone.utc).date()):
        raise HTTPException(400, 'Events need a current or future date.')
    if not body.title.strip() or not body.organization.strip() or not body.location.strip():
        raise HTTPException(400, 'Enter a title, organization and location.')
    data = body.model_dump(mode='json', exclude={'kind'})
    data['url'] = web_url(body.url)
    id_ = str(uuid4())
    await db.request('POST', '/rest/v1/catalog_items', user.token, json={
        'id': id_, 'kind': body.kind, 'author': user.id, 'data': data})
    return {'id': id_}


@router.delete('/catalog')
async def delete_listing(id: str, user: Auth, db: DB):
    item = await catalog_item(db, user, id)
    if item['kind'] not in ('event', 'job'):
        raise HTTPException(400, 'Learning content is maintained in the catalog migration.')
    if user.role != 'admin':
        require_recruiter(user)
        if item.get('author') != user.id:
            raise HTTPException(403, 'You can remove only your own event or job listings.')
    await db.request('DELETE', '/rest/v1/catalog_items', user.token, params={'id': 'eq.' + id})
    return {'ok': True}


@router.post('/actions')
async def action(body: ActionInput, user: Auth, db: DB):
    item = await catalog_item(db, user, body.item)
    required = {'enroll': 'course', 'lesson': 'course', 'path': 'path', 'event': 'event', 'job': 'job'}[body.kind]
    if item['kind'] != required:
        raise HTTPException(400, 'This action does not match the catalog item.')
    key = body.item
    data = {'name': item['data']['title'], 'item': body.item}
    if body.kind == 'lesson':
        lessons = item['data'].get('lessons', [])
        lesson = next((x for x in lessons if x['id'] == body.lesson), None)
        if not lesson:
            raise HTTPException(400, 'Choose a lesson from this course.')
        key += ':' + body.lesson
        data.update(course=body.item, lesson=body.lesson, name=lesson['title'])
    if body.kind == 'event':
        day = item['data'].get('date')
        if not day or CalendarDate.fromisoformat(day) < datetime.now(timezone.utc).date():
            raise HTTPException(400, 'Registration for this event has closed.')
    await db.request('POST', '/rest/v1/hub_actions', user.token,
                     params={'on_conflict': 'owner,kind,item'}, headers={'Prefer': 'resolution=merge-duplicates'},
                     json={'owner': user.id, 'kind': body.kind, 'item': key, 'data': data})
    return {'ok': True}


@router.delete('/actions')
async def undo_action(kind: Literal['enroll', 'lesson', 'path', 'event', 'job'], item: str, user: Auth, db: DB):
    await db.request('DELETE', '/rest/v1/hub_actions', user.token,
                     params={'owner': 'eq.' + user.id, 'kind': 'eq.' + kind, 'item': 'eq.' + item})
    return {'ok': True}


@router.get('/leaderboard')
async def leaderboard(user: Auth, db: DB):
    rows = (await db.request('POST', '/rest/v1/rpc/hub_leaderboard', user.token, json={})).json()
    return {'entries': rows}
