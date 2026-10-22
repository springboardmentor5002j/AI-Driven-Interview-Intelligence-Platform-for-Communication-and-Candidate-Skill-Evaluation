from dataclasses import dataclass
from pathlib import Path
import base64
import json
import os
from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ''
    supabase_key: str = ''
    frontend_origins: tuple[str, ...] = ('http://localhost:5173', 'http://127.0.0.1:5173')
    max_upload_bytes: int = 80 * 1024 * 1024

    @property
    def configured(self):
        return bool(self.supabase_url and self.supabase_key)


def load_settings():
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / '.env')
    load_dotenv(root.parent / '.env')
    key = os.getenv('SUPABASE_ANON_KEY', '').strip()
    if key.startswith('sb_secret_'):
        raise ValueError('SUPABASE_ANON_KEY must be a public publishable/anon key, not a secret key.')
    if key.count('.') == 2:
        try:
            part = key.split('.')[1]
            payload = json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))
        except (ValueError, UnicodeDecodeError):
            payload = {}
        if payload.get('role') == 'service_role':
            raise ValueError('Do not use a service-role key as SUPABASE_ANON_KEY.')
    return Settings(
        supabase_url=os.getenv('SUPABASE_URL', '').strip().rstrip('/'),
        supabase_key=key,
        frontend_origins=tuple(x.strip() for x in os.getenv('FRONTEND_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if x.strip()),
        max_upload_bytes=int(os.getenv('MAX_UPLOAD_MB', '80')) * 1024 * 1024,
    )
