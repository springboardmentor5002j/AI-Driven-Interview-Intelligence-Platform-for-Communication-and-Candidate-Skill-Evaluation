from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import quote
from uuid import UUID, uuid4
import json
import re
import httpx
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask
from .assessment import assess, score_test
from .hub import router as hub_router
from .settings import load_settings
from .supabase import Auth, DB, SupabaseGateway, require_admin, require_recruiter


class LoginInput(BaseModel):
    portal: Literal['candidate', 'recruiter', 'admin']


class EmailInput(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class RecordInput(BaseModel):
    kind: Literal['grant', 'resume', 'test', 'interview', 'template']
    data: dict | None = None
    email: str | None = None


def email_value(value):
    email = (value or '').strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254:
        raise HTTPException(400, 'Enter a valid email address.')
    return email


def file_key(value):
    parts = value.split('/')
    if len(parts) != 2:
        raise HTTPException(400, 'Invalid file key.')
    try:
        UUID(parts[0]); UUID(parts[1])
    except ValueError as exc:
        raise HTTPException(400, 'Invalid file key.') from exc
    return value


def create_app(settings=None, transport=None):
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=15), transport=transport) as client:
            app.state.gateway = SupabaseGateway(client, settings)
            yield

    app = FastAPI(title='SmartHire AI FastAPI Backend', version='3.0.0', lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.frontend_origins),
                       allow_methods=['GET', 'POST', 'DELETE', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type'])

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({'error': exc.detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse({'error': 'Invalid request fields. Check the submitted values.'}, status_code=422)

    @app.get('/api/health')
    async def health():
        return {'status': 'ok', 'backend': 'FastAPI', 'supabaseConfigured': settings.configured}

    @app.get('/api/config')
    async def configuration():
        return JSONResponse({'supabaseUrl': settings.supabase_url, 'supabaseKey': settings.supabase_key,
                             'configured': settings.configured, 'maxUploadMB': settings.max_upload_bytes // 1024 // 1024},
                            headers={'Cache-Control': 'no-store'})

    @app.post('/api/login')
    async def login(body: LoginInput, user: Auth):
        if body.portal == 'recruiter':
            require_recruiter(user)
        if body.portal == 'admin':
            require_admin(user)
        return {'redirect': '/' + body.portal}

    @app.get('/api/data')
    async def data(user: Auth, db: DB, recruiter: bool = False):
        if recruiter:
            require_recruiter(user)
        params = {'select': '*', 'order': 'created.desc'}
        if not recruiter:
            params['owner'] = 'eq.' + user.id
        rows = (await db.request('GET', '/rest/v1/records', user.token, params=params)).json()
        if recruiter:
            rows = [r for r in rows if r['owner'] != user.id or r['kind'] == 'template']
        grants = (await db.request('GET', '/rest/v1/grants', user.token,
                                  params={'select': '*', 'owner': 'eq.' + user.id, 'order': 'created.desc'})).json()
        return {'user': {'name': user.name, 'email': user.email, 'role': user.role}, 'records': rows, 'grants': grants}

    @app.post('/api/data')
    async def save_record(body: RecordInput, user: Auth, db: DB):
        id_ = str(uuid4())
        if body.kind == 'grant':
            email = email_value(body.email)
            authorized = (await db.request('POST', '/rest/v1/rpc/is_authorized_recruiter', user.token,
                                           json={'target_email': email})).json()
            if not authorized:
                raise HTTPException(400, 'This email is not an authorized recruiter. Ask the administrator to add it first.')
            await db.request('POST', '/rest/v1/grants', user.token,
                             params={'on_conflict': 'owner,email'},
                             headers={'Prefer': 'resolution=merge-duplicates'}, json={'owner': user.id, 'email': email})
        else:
            data = dict(body.data or {})
            if not body.data or len(json.dumps(data)) > 200000:
                raise HTTPException(400, 'Invalid or oversized record.')
            if body.kind == 'template':
                require_recruiter(user)
                if not str(data.get('name', '')).strip() or not str(data.get('questions', '')).strip():
                    raise HTTPException(400, 'Enter a template title and questions.')
            if data.get('key'):
                file_key(data['key'])
                if data['key'].split('/')[0] != user.id:
                    raise HTTPException(403, 'You can attach only your own uploaded files.')
            if body.kind == 'resume':
                text, jd = data.get('text', ''), data.get('jd', '')
                if not isinstance(text, str) or len(text.strip()) < 100 or not isinstance(jd, str):
                    raise HTTPException(400, 'Provide at least 100 characters of resume text.')
                data['assessment'] = assess(text, jd)
            if body.kind == 'test':
                answers = data.get('answers')
                if not isinstance(answers, list) or len(answers) != 5 or any(type(a) is not int or not 0 <= a <= 3 for a in answers):
                    raise HTTPException(400, 'Answer all five test questions.')
                data.update(score_test(answers))
            data.update(candidate=user.name, email=user.email)
            await db.request('POST', '/rest/v1/records', user.token, json={
                'id': id_, 'owner': user.id, 'kind': body.kind, 'data': data,
                'created': datetime.now(timezone.utc).isoformat()})
        return {'id': id_}

    @app.delete('/api/data')
    async def revoke_grant(id: UUID, user: Auth, db: DB):
        await db.request('DELETE', '/rest/v1/grants', user.token,
                         params={'id': 'eq.' + str(id), 'owner': 'eq.' + user.id})
        return {'ok': True}

    @app.get('/api/roles')
    async def roles(user: Auth, db: DB):
        require_admin(user)
        rows = (await db.request('GET', '/rest/v1/role_allowlist', user.token,
                                params={'select': '*', 'order': 'created.desc'})).json()
        return {'roles': rows}

    @app.post('/api/roles')
    async def add_recruiter(body: EmailInput, user: Auth, db: DB):
        require_admin(user)
        await db.request('POST', '/rest/v1/role_allowlist', user.token,
                         headers={'Prefer': 'resolution=merge-duplicates'},
                         json={'email': email_value(body.email), 'role': 'recruiter'})
        return {'ok': True}

    @app.delete('/api/roles')
    async def remove_recruiter(email: str, user: Auth, db: DB):
        require_admin(user)
        await db.request('DELETE', '/rest/v1/role_allowlist', user.token,
                         params={'email': 'eq.' + email_value(email), 'role': 'eq.recruiter'})
        return {'ok': True}

    @app.post('/api/files')
    async def upload(user: Auth, db: DB, file: UploadFile = File(...)):
        mime = (file.content_type or '').split(';')[0]
        if mime not in ('application/pdf', 'text/plain', 'video/webm', 'video/mp4'):
            raise HTTPException(400, 'Unsupported file type.')
        if file.size is not None and file.size > settings.max_upload_bytes:
            raise HTTPException(413, 'File exceeds the configured upload limit.')
        key = user.id + '/' + str(uuid4())
        async def chunks():
            size = 0
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(413, 'File exceeds the configured upload limit.')
                yield chunk
        headers = {'Content-Type': mime}
        if file.size is not None:
            headers['Content-Length'] = str(file.size)
        await db.request('POST', '/storage/v1/object/assets/' + key, user.token, headers=headers, content=chunks())
        return {'key': key, 'name': file.filename}

    @app.get('/api/files')
    async def download(key: str, user: Auth, db: DB):
        file_key(key)
        owner = key.split('/')[0]
        if owner != user.id:
            require_recruiter(user)
            grants = (await db.request('GET', '/rest/v1/grants', user.token,
                                      params={'select': 'id', 'owner': 'eq.' + owner, 'email': 'eq.' + user.email})).json()
            if not grants:
                raise HTTPException(403, 'The candidate has not granted access to this file.')
        req = db.client.build_request('GET', settings.supabase_url + '/storage/v1/object/authenticated/assets/' + quote(key, safe='/'),
                                      headers={'apikey': settings.supabase_key, 'Authorization': 'Bearer ' + user.token})
        try:
            response = await db.client.send(req, stream=True)
        except httpx.RequestError as exc:
            raise HTTPException(502, 'Unable to load file from Supabase.') from exc
        if not response.is_success:
            await response.aread()
            await response.aclose()
            db.check(response)
        return StreamingResponse(response.aiter_bytes(), media_type=response.headers.get('Content-Type', 'application/octet-stream'),
                                 headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'},
                                 background=BackgroundTask(response.aclose))

    app.include_router(hub_router)

    # Optional single-origin production serving after `npm run build`.
    dist = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'

    @app.get('/{path:path}', include_in_schema=False)
    async def frontend(path: str):
        if path == 'api' or path.startswith('api/') or not (dist / 'index.html').exists():
            raise HTTPException(404, 'Not found. Run the React frontend with npm run dev.')
        requested = (dist / path).resolve()
        if requested.is_relative_to(dist.resolve()) and requested.is_file():
            return FileResponse(requested)
        return FileResponse(dist / 'index.html')

    return app


app = create_app()
