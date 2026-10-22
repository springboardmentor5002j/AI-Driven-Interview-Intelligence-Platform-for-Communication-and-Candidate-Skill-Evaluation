from dataclasses import dataclass
from typing import Annotated
from fastapi import Depends, HTTPException, Request
import httpx


class SupabaseGateway:
    def __init__(self, client: httpx.AsyncClient, settings):
        self.client = client
        self.settings = settings

    async def request(self, method, path, token, **kwargs):
        headers = {'apikey': self.settings.supabase_key, 'Authorization': 'Bearer ' + token}
        headers.update(kwargs.pop('headers', {}))
        try:
            response = await self.client.request(method, self.settings.supabase_url + path, headers=headers, **kwargs)
        except httpx.RequestError as exc:
            raise HTTPException(502, 'Supabase is unreachable. Check the URL and network connection.') from exc
        self.check(response)
        return response

    @staticmethod
    def check(response):
        if response.is_success:
            return
        if response.status_code in (401, 403):
            raise HTTPException(response.status_code, 'Supabase denied this request. Check your session and Row Level Security policies.')
        if response.status_code == 404:
            raise HTTPException(404, 'Supabase resource not found. Check that the schema and assets bucket are installed.')
        # Do not expose upstream response bodies, authorization codes or tokens.
        raise HTTPException(502, f'Supabase request failed ({response.status_code}). Check Supabase logs and project configuration.')


def gateway(request: Request):
    return request.app.state.gateway


@dataclass
class User:
    id: str
    email: str
    name: str
    role: str
    token: str


async def current_user(request: Request, db: Annotated[SupabaseGateway, Depends(gateway)]):
    if not db.settings.configured:
        raise HTTPException(503, 'Configure SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env and restart FastAPI.')
    authorization = request.headers.get('authorization', '')
    if not authorization.lower().startswith('bearer ') or not authorization[7:].strip():
        raise HTTPException(401, 'Sign in with Google first.')
    token = authorization[7:].strip()
    response = await db.request('GET', '/auth/v1/user', token)
    info = response.json()
    if not info.get('id') or not info.get('email') or not info.get('email_confirmed_at'):
        raise HTTPException(401, 'A confirmed Supabase account is required.')
    email = info['email'].strip().lower()
    roles = (await db.request('GET', '/rest/v1/role_allowlist', token,
                            params={'select': 'role', 'email': 'eq.' + email})).json()
    role = roles[0]['role'] if roles else 'candidate'
    if role not in ('admin', 'recruiter'):
        role = 'candidate'
    return User(info['id'], email, info.get('user_metadata', {}).get('full_name') or email, role, token)


Auth = Annotated[User, Depends(current_user)]
DB = Annotated[SupabaseGateway, Depends(gateway)]


def require_recruiter(user):
    if user.role not in ('recruiter', 'admin'):
        raise HTTPException(403, 'Your email is not an authorized recruiter. Ask the administrator to create your recruiter account first.')


def require_admin(user):
    if user.role != 'admin':
        raise HTTPException(403, 'Administrator access required.')
