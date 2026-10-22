from app import settings


def clear_env(monkeypatch):
    for name in ('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'FRONTEND_ORIGINS', 'MAX_UPLOAD_MB'):
        monkeypatch.delenv(name, raising=False)


def test_backend_dotenv_is_loaded(tmp_path, monkeypatch):
    clear_env(monkeypatch)
    app = tmp_path / 'project' / 'backend' / 'app'
    app.mkdir(parents=True)
    monkeypatch.setattr(settings, '__file__', str(app / 'settings.py'))
    (app.parent / '.env').write_text('SUPABASE_URL=https://backend.supabase.co\nSUPABASE_ANON_KEY=public-key\n')
    config = settings.load_settings()
    assert config.configured
    assert config.supabase_url == 'https://backend.supabase.co'


def test_project_root_is_fallback(tmp_path, monkeypatch):
    clear_env(monkeypatch)
    app = tmp_path / 'project' / 'backend' / 'app'
    app.mkdir(parents=True)
    monkeypatch.setattr(settings, '__file__', str(app / 'settings.py'))
    (app.parents[1] / '.env').write_text('SUPABASE_URL=https://root.supabase.co\nSUPABASE_ANON_KEY=root-key\n')
    assert settings.load_settings().supabase_url == 'https://root.supabase.co'


def test_backend_values_take_precedence(tmp_path, monkeypatch):
    clear_env(monkeypatch)
    app = tmp_path / 'project' / 'backend' / 'app'
    app.mkdir(parents=True)
    monkeypatch.setattr(settings, '__file__', str(app / 'settings.py'))
    (app.parent / '.env').write_text('SUPABASE_URL=https://backend.supabase.co\nSUPABASE_ANON_KEY=backend-key\n')
    (app.parents[1] / '.env').write_text('SUPABASE_URL=https://root.supabase.co\nSUPABASE_ANON_KEY=root-key\n')
    assert settings.load_settings().supabase_key == 'backend-key'
