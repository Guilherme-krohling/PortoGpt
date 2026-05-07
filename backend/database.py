import os
import sqlite3
import hashlib
import secrets
import json
from pathlib import Path
from typing import Optional, List, Dict, Any

DB_PATH = Path(__file__).resolve().parent / "portogpt.db"
DEFAULT_ADMIN_EMAIL = os.getenv("PORTOGPT_ADMIN_EMAIL", "admin@portogpt.com")
DEFAULT_ADMIN_PASSWORD = os.getenv("PORTOGPT_ADMIN_PASSWORD", "admin123")

DEFAULT_AI_SETTINGS = {
    "strict_documents_only": True,
    "answer_unknown_when_missing": True,
    "ask_clarifying_questions": True,
    "include_source_hint": True,
    "tone": "professional",
    "similarity_top_k": 10,
    "custom_instructions": "",
}


def _row_to_user(row) -> Dict[str, Any]:
    return {
        "id": row[0],
        "email": row[1],
        "name": row[2],
        "role": row[3],
        "status": row[4],
        "created_at": row[5],
        "last_login": row[6],
    }


def _row_to_document(row) -> Dict[str, Any]:
    return {
        "id": row[0],
        "filename": row[1],
        "name": row[1],
        "original_name": row[2],
        "title": row[3],
        "description": row[4],
        "size": row[5],
        "mtime": row[6],
        "active": bool(row[7]),
        "uploaded_by": row[8],
        "created_at": row[9],
        "updated_at": row[10],
    }


def _row_to_template(row) -> Dict[str, Any]:
    return {
        "id": row[0],
        "filename": row[1],
        "name": row[1],
        "original_name": row[2],
        "title": row[3],
        "description": row[4],
        "size": row[5],
        "mtime": row[6],
        "active": bool(row[7]),
        "uploaded_by": row[8],
        "created_at": row[9],
        "updated_at": row[10],
    }


def _row_to_chat_session(row) -> Dict[str, Any]:
    return {
        "id": row[0],
        "user_id": row[1],
        "title": row[2],
        "created_at": row[3],
        "updated_at": row[4],
        "message_count": row[5],
        "last_message": row[6],
    }

# ==========================================
# FUNÇÕES DE HASH DE SENHA (usando hashlib)
# ==========================================
def hash_password(senha: str) -> str:
    """Faz hash de uma senha usando PBKDF2."""
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac('sha256', senha.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${password_hash.hex()}"


def verify_password(senha: str, password_hash: str) -> bool:
    """Verifica se uma senha corresponde ao hash."""
    try:
        salt, hash_hex = password_hash.split('$')
        password_check = hashlib.pbkdf2_hmac('sha256', senha.encode('utf-8'), salt.encode('utf-8'), 100000)
        return password_check.hex() == hash_hex
    except Exception:
        return False


# ==========================================
# INICIALIZAÇÃO DO BANCO DE DADOS
# ==========================================
def init_db():
    """Cria as tabelas se não existirem."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    # Tabela de Usuários
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            role TEXT DEFAULT 'viewer',
            status TEXT DEFAULT 'active',
            last_login TIMESTAMP,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Migração simples para bases antigas sem colunas de admin.
    cursor.execute("PRAGMA table_info(users)")
    cols = {row[1] for row in cursor.fetchall()}
    if "name" not in cols:
        cursor.execute("ALTER TABLE users ADD COLUMN name TEXT")
    if "role" not in cols:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'")
    if "status" not in cols:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
    if "last_login" not in cols:
        cursor.execute("ALTER TABLE users ADD COLUMN last_login TIMESTAMP")

    # Garante acesso inicial ao painel administrativo em ambientes locais.
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
    admin_count = cursor.fetchone()[0]
    if admin_count == 0:
        admin_email = os.getenv("PORTOGPT_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
        admin_password = os.getenv("PORTOGPT_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)
        admin_hash = hash_password(admin_password)
        cursor.execute("SELECT id FROM users WHERE email = ?", (admin_email,))
        existing_admin = cursor.fetchone()
        if existing_admin:
            cursor.execute(
                """
                UPDATE users
                SET name = ?, role = 'admin', status = 'active', password_hash = ?
                WHERE id = ?
                """,
                ("Administrador", admin_hash, existing_admin[0]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO users (email, name, role, status, password_hash)
                VALUES (?, ?, 'admin', 'active', ?)
                """,
                (admin_email, "Administrador", admin_hash),
            )
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT DEFAULT 'Novo chat',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Tabela de Chat History
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            response TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("PRAGMA table_info(chat_history)")
    chat_cols = {row[1] for row in cursor.fetchall()}
    if "session_id" not in chat_cols:
        cursor.execute("ALTER TABLE chat_history ADD COLUMN session_id INTEGER")

    cursor.execute("SELECT DISTINCT user_id FROM chat_history WHERE session_id IS NULL")
    legacy_users = [row[0] for row in cursor.fetchall()]
    for legacy_user_id in legacy_users:
        cursor.execute(
            """
            INSERT INTO chat_sessions (user_id, title, created_at, updated_at)
            SELECT ?, 'Histórico anterior', MIN(created_at), MAX(created_at)
            FROM chat_history
            WHERE user_id = ? AND session_id IS NULL
            """,
            (legacy_user_id, legacy_user_id),
        )
        legacy_session_id = cursor.lastrowid
        cursor.execute(
            "UPDATE chat_history SET session_id = ? WHERE user_id = ? AND session_id IS NULL",
            (legacy_session_id, legacy_user_id),
        )

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            original_name TEXT,
            title TEXT,
            description TEXT DEFAULT '',
            size INTEGER DEFAULT 0,
            mtime INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            uploaded_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            original_name TEXT,
            title TEXT,
            description TEXT DEFAULT '',
            size INTEGER DEFAULT 0,
            mtime INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            uploaded_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    for key, value in DEFAULT_AI_SETTINGS.items():
        cursor.execute(
            "INSERT OR IGNORE INTO ai_settings (key, value) VALUES (?, ?)",
            (key, json.dumps(value, ensure_ascii=False)),
        )
    
    conn.commit()
    conn.close()
    print("Banco de dados inicializado")


# ==========================================
# FUNÇÕES DE USUÁRIO
# ==========================================
def criar_usuario(email: str, senha: str) -> Dict[str, Any]:
    try:
        email = email.strip().lower()
        # Hash da senha
        password_hash = hash_password(senha)
        
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        derived_name = email.split("@")[0]
        cursor.execute(
            "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
            (email, derived_name, password_hash)
        )
        
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        
        user = obter_usuario(user_id)
        return {
            "success": True,
            "user_id": user_id,
            "email": email,
            "user": user,
            "message": "Usuário criado com sucesso"
        }
    except sqlite3.IntegrityError:
        return {
            "success": False,
            "message": "E-mail já cadastrado"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Erro ao criar usuário: {str(e)}"
        }


def autenticar_usuario(email: str, senha: str) -> Dict[str, Any]:
    """Autentica um usuário e retorna seu ID se correto."""
    try:
        email = email.strip().lower()
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT id, password_hash, COALESCE(status, 'active') FROM users WHERE email = ?",
            (email,),
        )
        result = cursor.fetchone()
        conn.close()
        
        if result is None:
            return {
                "success": False,
                "message": "E-mail não encontrado"
            }
        
        user_id, password_hash, status = result

        if status != "active":
            return {
                "success": False,
                "message": "Usuário inativo ou pendente"
            }
        
        # Verifica a senha
        if verify_password(senha, password_hash):
            # Atualiza último login para apoiar a tela de administração.
            conn = sqlite3.connect(str(DB_PATH))
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
            conn.commit()
            conn.close()

            user = obter_usuario(user_id)
            return {
                "success": True,
                "user_id": user_id,
                "email": email,
                "user": user,
                "message": "Autenticação bem-sucedida"
            }
        else:
            return {
                "success": False,
                "message": "Senha incorreta"
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Erro na autenticação: {str(e)}"
        }


def obter_usuario(user_id: int) -> Optional[Dict[str, Any]]:
    """Obtém informações de um usuário pelo ID."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT id, email, COALESCE(name, ''), COALESCE(role, 'viewer'), "
            "COALESCE(status, 'active'), created_at, last_login "
            "FROM users WHERE id = ?",
            (user_id,),
        )
        result = cursor.fetchone()
        conn.close()
        
        if result is None:
            return None
        
        return _row_to_user(result)
    except Exception as e:
        print(f"Erro ao obter usuário: {str(e)}")
        return None


def listar_usuarios() -> List[Dict[str, Any]]:
    """Lista todos os usuários para o painel admin."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, COALESCE(name, ''), COALESCE(role, 'viewer'), "
            "COALESCE(status, 'active'), created_at, last_login "
            "FROM users ORDER BY created_at DESC"
        )
        rows = cursor.fetchall()
        conn.close()

        return [_row_to_user(row) for row in rows]
    except Exception as e:
        print(f"Erro ao listar usuários: {str(e)}")
        return []


def criar_usuario_admin(name: str, email: str, role: str, status: str, senha: Optional[str] = None) -> Dict[str, Any]:
    """Cria usuário para o painel admin com senha temporária aleatória."""
    try:
        email = email.strip().lower()
        temp_password = senha or secrets.token_urlsafe(12)
        password_hash = hash_password(temp_password)

        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (email, name, role, status, password_hash) VALUES (?, ?, ?, ?, ?)",
            (email, name, role, status, password_hash),
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()

        user = obter_usuario(user_id)
        response = {
            "success": True,
            "message": "Usuário criado com sucesso",
            "user_id": user_id,
            "user": user,
        }
        if senha is None:
            response["temporary_password"] = temp_password
        return response
    except sqlite3.IntegrityError:
        return {"success": False, "message": "E-mail já cadastrado"}
    except Exception as e:
        return {"success": False, "message": f"Erro ao criar usuário: {str(e)}"}


def atualizar_usuario_admin(
    user_id: int,
    name: str,
    email: str,
    role: str,
    status: str,
    senha: Optional[str] = None,
) -> Dict[str, Any]:
    """Atualiza os campos gerenciáveis no painel admin."""
    try:
        email = email.strip().lower()
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        if senha:
            cursor.execute(
                "UPDATE users SET name = ?, email = ?, role = ?, status = ?, password_hash = ? WHERE id = ?",
                (name, email, role, status, hash_password(senha), user_id),
            )
        else:
            cursor.execute(
                "UPDATE users SET name = ?, email = ?, role = ?, status = ? WHERE id = ?",
                (name, email, role, status, user_id),
            )
        conn.commit()
        updated = cursor.rowcount
        conn.close()

        if updated == 0:
            return {"success": False, "message": "Usuário não encontrado"}

        return {
            "success": True,
            "message": "Usuário atualizado com sucesso",
            "user": obter_usuario(user_id),
        }
    except sqlite3.IntegrityError:
        return {"success": False, "message": "E-mail já cadastrado"}
    except Exception as e:
        return {"success": False, "message": f"Erro ao atualizar usuário: {str(e)}"}


def deletar_usuario_admin(user_id: int) -> Dict[str, Any]:
    """Exclui usuário e seu histórico."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        deleted = cursor.rowcount
        conn.close()

        if deleted == 0:
            return {"success": False, "message": "Usuário não encontrado"}

        return {"success": True, "message": "Usuário excluído com sucesso"}
    except Exception as e:
        return {"success": False, "message": f"Erro ao excluir usuário: {str(e)}"}


# ==========================================
# FUNÇÕES DE CONHECIMENTO E DOCUMENTOS
# ==========================================
def obter_ai_settings() -> Dict[str, Any]:
    """Obtém as configurações de comportamento da IA."""
    settings = DEFAULT_AI_SETTINGS.copy()
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM ai_settings")
        rows = cursor.fetchall()
        conn.close()

        for key, value in rows:
            if key in settings:
                try:
                    settings[key] = json.loads(value)
                except json.JSONDecodeError:
                    settings[key] = value
    except Exception as e:
        print(f"Erro ao obter configurações da IA: {str(e)}")

    return settings


def atualizar_ai_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Atualiza configurações permitidas de comportamento da IA."""
    allowed_keys = set(DEFAULT_AI_SETTINGS.keys())
    normalized = {}

    for key, value in settings.items():
        if key not in allowed_keys:
            continue

        if isinstance(DEFAULT_AI_SETTINGS[key], bool):
            normalized[key] = bool(value)
        elif isinstance(DEFAULT_AI_SETTINGS[key], int):
            try:
                normalized[key] = max(1, min(20, int(value)))
            except (TypeError, ValueError):
                normalized[key] = DEFAULT_AI_SETTINGS[key]
        else:
            normalized[key] = str(value or "").strip()

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        for key, value in normalized.items():
            cursor.execute(
                """
                INSERT INTO ai_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (key, json.dumps(value, ensure_ascii=False)),
            )
        conn.commit()
        conn.close()
        return {"success": True, "settings": obter_ai_settings()}
    except Exception as e:
        return {"success": False, "message": f"Erro ao atualizar configurações da IA: {str(e)}"}


def sync_documents_from_disk(data_dir, metadata: Optional[Dict[str, Any]] = None) -> None:
    """Sincroniza a tabela de documentos com os arquivos presentes em data/."""
    metadata = metadata or {}
    data_path = Path(data_dir)
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    disk_names = []

    if data_path.exists():
        for path in sorted(data_path.iterdir()):
            if not path.is_file():
                continue

            disk_names.append(path.name)
            info = metadata.get(path.name, {})
            title = info.get("title") or path.stem
            description = info.get("description", "")
            active = 1 if info.get("active", True) else 0
            stat = path.stat()

            cursor.execute("SELECT id FROM documents WHERE filename = ?", (path.name,))
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    """
                    UPDATE documents
                    SET size = ?, mtime = ?, original_name = COALESCE(original_name, ?),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE filename = ?
                    """,
                    (stat.st_size, int(stat.st_mtime), path.name, path.name),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO documents
                        (filename, original_name, title, description, size, mtime, active)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (path.name, path.name, title, description, stat.st_size, int(stat.st_mtime), active),
                )

    if disk_names:
        placeholders = ",".join("?" for _ in disk_names)
        cursor.execute(f"DELETE FROM documents WHERE filename NOT IN ({placeholders})", disk_names)
    else:
        cursor.execute("DELETE FROM documents")

    conn.commit()
    conn.close()


def sync_templates_from_disk(templates_dir) -> None:
    """Sincroniza a tabela de templates com os arquivos presentes no diretório informado."""
    templates_path = Path(templates_dir)
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    disk_names = []

    if templates_path.exists():
        for path in sorted(templates_path.iterdir()):
            if not path.is_file():
                continue

            disk_names.append(path.name)
            stat = path.stat()

            cursor.execute("SELECT id FROM templates WHERE filename = ?", (path.name,))
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    """
                    UPDATE templates
                    SET size = ?, mtime = ?, original_name = COALESCE(original_name, ?),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE filename = ?
                    """,
                    (stat.st_size, int(stat.st_mtime), path.name, path.name),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO templates
                        (filename, original_name, title, description, size, mtime, active)
                    VALUES (?, ?, ?, '', ?, ?, 1)
                    """,
                    (path.name, path.name, path.stem, stat.st_size, int(stat.st_mtime)),
                )

    if disk_names:
        placeholders = ",".join("?" for _ in disk_names)
        cursor.execute(f"DELETE FROM templates WHERE filename NOT IN ({placeholders})", disk_names)
    else:
        cursor.execute("DELETE FROM templates")

    conn.commit()
    conn.close()


def listar_documentos() -> List[Dict[str, Any]]:
    """Lista documentos conhecidos pelo sistema."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, original_name, COALESCE(title, filename), COALESCE(description, ''),
                   COALESCE(size, 0), COALESCE(mtime, 0), COALESCE(active, 1),
                   uploaded_by, created_at, updated_at
            FROM documents
            ORDER BY active DESC, title COLLATE NOCASE ASC
            """
        )
        rows = cursor.fetchall()
        conn.close()
        return [_row_to_document(row) for row in rows]
    except Exception as e:
        print(f"Erro ao listar documentos: {str(e)}")
        return []


def listar_templates() -> List[Dict[str, Any]]:
    """Lista templates cadastrados no sistema."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, original_name, COALESCE(title, filename), COALESCE(description, ''),
                   COALESCE(size, 0), COALESCE(mtime, 0), COALESCE(active, 1),
                   uploaded_by, created_at, updated_at
            FROM templates
            ORDER BY active DESC, title COLLATE NOCASE ASC
            """
        )
        rows = cursor.fetchall()
        conn.close()
        return [_row_to_template(row) for row in rows]
    except Exception as e:
        print(f"Erro ao listar templates: {str(e)}")
        return []


def obter_template(filename: str) -> Optional[Dict[str, Any]]:
    """Obtém um template pelo nome do arquivo."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, original_name, COALESCE(title, filename), COALESCE(description, ''),
                   COALESCE(size, 0), COALESCE(mtime, 0), COALESCE(active, 1),
                   uploaded_by, created_at, updated_at
            FROM templates
            WHERE filename = ?
            """,
            (filename,),
        )
        row = cursor.fetchone()
        conn.close()
        return _row_to_template(row) if row else None
    except Exception as e:
        print(f"Erro ao obter template: {str(e)}")
        return None


def obter_documento(filename: str) -> Optional[Dict[str, Any]]:
    """Obtém um documento pelo nome do arquivo."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, original_name, COALESCE(title, filename), COALESCE(description, ''),
                   COALESCE(size, 0), COALESCE(mtime, 0), COALESCE(active, 1),
                   uploaded_by, created_at, updated_at
            FROM documents
            WHERE filename = ?
            """,
            (filename,),
        )
        row = cursor.fetchone()
        conn.close()
        return _row_to_document(row) if row else None
    except Exception as e:
        print(f"Erro ao obter documento: {str(e)}")
        return None


def registrar_documento(
    filename: str,
    original_name: Optional[str],
    title: Optional[str],
    description: Optional[str],
    size: int,
    mtime: int,
    active: bool = True,
    uploaded_by: Optional[int] = None,
) -> Dict[str, Any]:
    """Cria ou atualiza metadados de um documento enviado."""
    title = (title or Path(filename).stem).strip()
    description = (description or "").strip()
    original_name = original_name or filename

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO documents
                (filename, original_name, title, description, size, mtime, active, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(filename) DO UPDATE SET
                original_name = excluded.original_name,
                title = excluded.title,
                description = excluded.description,
                size = excluded.size,
                mtime = excluded.mtime,
                active = excluded.active,
                uploaded_by = COALESCE(excluded.uploaded_by, documents.uploaded_by),
                updated_at = CURRENT_TIMESTAMP
            """,
            (filename, original_name, title, description, size, mtime, 1 if active else 0, uploaded_by),
        )
        conn.commit()
        conn.close()
        return {"success": True, "document": obter_documento(filename)}
    except Exception as e:
        return {"success": False, "message": f"Erro ao registrar documento: {str(e)}"}


def registrar_template(
    filename: str,
    original_name: Optional[str],
    title: Optional[str],
    description: Optional[str],
    size: int,
    mtime: int,
    active: bool = True,
    uploaded_by: Optional[int] = None,
) -> Dict[str, Any]:
    """Cria ou atualiza metadados de um template enviado."""
    title = (title or Path(filename).stem).strip()
    description = (description or "").strip()
    original_name = original_name or filename

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO templates
                (filename, original_name, title, description, size, mtime, active, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(filename) DO UPDATE SET
                original_name = excluded.original_name,
                title = excluded.title,
                description = excluded.description,
                size = excluded.size,
                mtime = excluded.mtime,
                active = excluded.active,
                uploaded_by = COALESCE(excluded.uploaded_by, templates.uploaded_by),
                updated_at = CURRENT_TIMESTAMP
            """,
            (filename, original_name, title, description, size, mtime, 1 if active else 0, uploaded_by),
        )
        conn.commit()
        conn.close()
        return {"success": True, "template": obter_template(filename)}
    except Exception as e:
        return {"success": False, "message": f"Erro ao registrar template: {str(e)}"}


def atualizar_documento(
    filename: str,
    title: str,
    description: str,
    active: bool,
) -> Dict[str, Any]:
    """Atualiza metadados editáveis de um documento."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE documents
            SET title = ?, description = ?, active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE filename = ?
            """,
            (title.strip(), description.strip(), 1 if active else 0, filename),
        )
        conn.commit()
        updated = cursor.rowcount
        conn.close()

        if updated == 0:
            return {"success": False, "message": "Documento não encontrado"}

        return {"success": True, "document": obter_documento(filename)}
    except Exception as e:
        return {"success": False, "message": f"Erro ao atualizar documento: {str(e)}"}


def atualizar_template(
    filename: str,
    title: str,
    description: str,
    active: bool,
) -> Dict[str, Any]:
    """Atualiza metadados editáveis de um template."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE templates
            SET title = ?, description = ?, active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE filename = ?
            """,
            (title.strip(), description.strip(), 1 if active else 0, filename),
        )
        conn.commit()
        updated = cursor.rowcount
        conn.close()

        if updated == 0:
            return {"success": False, "message": "Template não encontrado"}

        return {"success": True, "template": obter_template(filename)}
    except Exception as e:
        return {"success": False, "message": f"Erro ao atualizar template: {str(e)}"}


def alternar_documento(filename: str) -> Dict[str, Any]:
    """Ativa ou desativa um documento na base de conhecimento."""
    document = obter_documento(filename)
    if not document:
        return {"success": False, "message": "Documento não encontrado"}

    return atualizar_documento(
        filename=filename,
        title=document["title"],
        description=document["description"],
        active=not document["active"],
    )


def alternar_template(filename: str) -> Dict[str, Any]:
    """Ativa ou desativa um template."""
    template = obter_template(filename)
    if not template:
        return {"success": False, "message": "Template não encontrado"}

    return atualizar_template(
        filename=filename,
        title=template["title"],
        description=template["description"],
        active=not template["active"],
    )


def deletar_documento(filename: str) -> Dict[str, Any]:
    """Remove metadados de um documento."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM documents WHERE filename = ?", (filename,))
        conn.commit()
        conn.close()
        return {"success": True, "message": "Documento removido com sucesso"}
    except Exception as e:
        return {"success": False, "message": f"Erro ao remover documento: {str(e)}"}


def deletar_template(filename: str) -> Dict[str, Any]:
    """Remove metadados de um template."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM templates WHERE filename = ?", (filename,))
        conn.commit()
        conn.close()
        return {"success": True, "message": "Template removido com sucesso"}
    except Exception as e:
        return {"success": False, "message": f"Erro ao remover template: {str(e)}"}


# ==========================================
# FUNÇÕES DE CHAT HISTORY
# ==========================================
def _gerar_titulo_chat(message: str) -> str:
    title = " ".join((message or "Novo chat").strip().split(" "))
    lowered = title.lower()
    greetings = [
        "oi, ",
        "oi ",
        "olá, ",
        "ola, ",
        "olá ",
        "ola ",
        "oii ",
        "bom dia ",
        "boa tarde ",
        "boa noite ",
    ]
    changed = True
    while changed:
        changed = False
        lowered = title.lower()
        for greeting in greetings:
            if lowered.startswith(greeting):
                title = title[len(greeting):].strip()
                changed = True
                break

    prefixes = [
        "me fala sobre ",
        "me fale sobre ",
        "fala sobre ",
        "fale sobre ",
        "o que é ",
        "o que e ",
        "qual é ",
        "qual e ",
        "quais são ",
        "quais sao ",
        "explique ",
        "resuma ",
        "sobre ",
    ]
    changed = True
    while changed:
        changed = False
        lowered = title.lower()
        for prefix in prefixes:
            if lowered.startswith(prefix):
                title = title[len(prefix):].strip()
                changed = True
                break

    title = title.rstrip(" ?!.:,;")
    if title:
        title = title[0].upper() + title[1:]


def obter_perguntas_mais_frequentes(user_id: int, days: int = 7, top_k: int = 3) -> List[Dict[str, Any]]:
    """Retorna perguntas mais frequentes do usuário nos últimos N dias."""
    days = max(1, min(60, int(days or 7)))
    top_k = max(1, min(10, int(top_k or 3)))
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT message, COUNT(*) as cnt
            FROM chat_history
            WHERE user_id = ?
              AND created_at >= datetime('now', ?)
            GROUP BY message
            ORDER BY cnt DESC
            LIMIT ?
            """,
            (user_id, f"-{days} days", top_k),
        )
        rows = cursor.fetchall()
        conn.close()
        return [{"message": row[0], "count": row[1]} for row in rows]
    except Exception as e:
        print(f"Erro ao obter perguntas mais frequentes: {str(e)}")
        return []

    if len(title) > 46:
        title = f"{title[:43].rstrip()}..."
    return title or "Novo chat"


def criar_chat_session(user_id: int, title: Optional[str] = None) -> Dict[str, Any]:
    """Cria uma nova conversa para um usuário."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)",
            (user_id, title or "Novo chat"),
        )
        conn.commit()
        session_id = cursor.lastrowid
        conn.close()
        return {"success": True, "session": obter_chat_session(user_id, session_id)}
    except Exception as e:
        return {"success": False, "message": f"Erro ao criar conversa: {str(e)}"}


def obter_chat_session(user_id: int, session_id: int) -> Optional[Dict[str, Any]]:
    """Obtém uma conversa específica do usuário."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.id, s.user_id, COALESCE(s.title, 'Novo chat'), s.created_at, s.updated_at,
                   COUNT(h.id) AS message_count,
                   (
                       SELECT h2.response
                       FROM chat_history h2
                       WHERE h2.session_id = s.id
                       ORDER BY h2.created_at DESC, h2.id DESC
                       LIMIT 1
                   ) AS last_message
            FROM chat_sessions s
            LEFT JOIN chat_history h ON h.session_id = s.id
            WHERE s.user_id = ? AND s.id = ?
            GROUP BY s.id
            """,
            (user_id, session_id),
        )
        row = cursor.fetchone()
        conn.close()
        return _row_to_chat_session(row) if row else None
    except Exception as e:
        print(f"Erro ao obter conversa: {str(e)}")
        return None


def listar_chat_sessions(user_id: int) -> List[Dict[str, Any]]:
    """Lista conversas do usuário para o menu lateral."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.id, s.user_id, COALESCE(s.title, 'Novo chat'), s.created_at, s.updated_at,
                   COUNT(h.id) AS message_count,
                   (
                       SELECT h2.response
                       FROM chat_history h2
                       WHERE h2.session_id = s.id
                       ORDER BY h2.created_at DESC, h2.id DESC
                       LIMIT 1
                   ) AS last_message
            FROM chat_sessions s
            LEFT JOIN chat_history h ON h.session_id = s.id
            WHERE s.user_id = ?
            GROUP BY s.id
            ORDER BY datetime(s.updated_at) DESC, s.id DESC
            """,
            (user_id,),
        )
        rows = cursor.fetchall()
        conn.close()
        sessions = []
        for row in rows:
            session = _row_to_chat_session(row)
            if session["title"] not in ("Novo chat", "Histórico anterior"):
                session["title"] = _gerar_titulo_chat(session["title"])
            if session["last_message"] == session["title"]:
                session["last_message"] = "Última conversa salva"
            sessions.append(session)
        return sessions
    except Exception as e:
        print(f"Erro ao listar conversas: {str(e)}")
        return []


def obter_mensagens_chat_session(user_id: int, session_id: int) -> List[Dict[str, Any]]:
    """Retorna as mensagens de uma conversa em ordem cronológica."""
    if obter_chat_session(user_id, session_id) is None:
        return []

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, message, response, created_at
            FROM chat_history
            WHERE user_id = ? AND session_id = ?
            ORDER BY datetime(created_at) ASC, id ASC
            """,
            (user_id, session_id),
        )
        rows = cursor.fetchall()
        conn.close()

        messages = []
        for row in rows:
            messages.append({
                "id": f"{row[0]}-user",
                "chat_id": row[0],
                "role": "user",
                "text": row[1],
                "created_at": row[3],
            })
            messages.append({
                "id": f"{row[0]}-assistant",
                "chat_id": row[0],
                "role": "assistant",
                "text": row[2],
                "created_at": row[3],
            })
        return messages
    except Exception as e:
        print(f"Erro ao obter mensagens da conversa: {str(e)}")
        return []


def deletar_chat_session(user_id: int, session_id: int) -> Dict[str, Any]:
    """Remove uma conversa inteira do usuário."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM chat_history WHERE user_id = ? AND session_id = ?", (user_id, session_id))
        cursor.execute("DELETE FROM chat_sessions WHERE user_id = ? AND id = ?", (user_id, session_id))
        conn.commit()
        deleted = cursor.rowcount
        conn.close()

        if deleted == 0:
            return {"success": False, "message": "Conversa não encontrada"}

        return {"success": True, "message": "Conversa removida com sucesso"}
    except Exception as e:
        return {"success": False, "message": f"Erro ao remover conversa: {str(e)}"}


def salvar_mensagem(user_id: int, message: str, response: str, session_id: Optional[int] = None) -> Dict[str, Any]:
    """Salva uma mensagem e resposta no histórico."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()

        created_session = False
        if session_id is not None:
            cursor.execute("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?", (session_id, user_id))
            if cursor.fetchone() is None:
                session_id = None

        if session_id is None:
            cursor.execute(
                "INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)",
                (user_id, _gerar_titulo_chat(message)),
            )
            session_id = cursor.lastrowid
            created_session = True
        
        cursor.execute(
            """INSERT INTO chat_history (session_id, user_id, message, response) 
               VALUES (?, ?, ?, ?)""",
            (session_id, user_id, message, response)
        )
        chat_id = cursor.lastrowid

        if created_session:
            cursor.execute(
                "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (session_id,),
            )
        else:
            cursor.execute(
                """
                UPDATE chat_sessions
                SET title = CASE WHEN title = 'Novo chat' THEN ? ELSE title END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
                """,
                (_gerar_titulo_chat(message), session_id, user_id),
            )
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "chat_id": chat_id,
            "session_id": session_id,
            "message": "Mensagem salva com sucesso"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Erro ao salvar mensagem: {str(e)}"
        }


def obter_historico(user_id: int, limite: int = 50) -> List[Dict[str, Any]]:
    """Obtém o histórico de chat de um usuário."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        cursor.execute(
            """SELECT id, message, response, created_at FROM chat_history 
               WHERE user_id = ? 
               ORDER BY created_at DESC 
               LIMIT ?""",
            (user_id, limite)
        )
        
        results = cursor.fetchall()
        conn.close()
        
        return [
            {
                "id": row[0],
                "message": row[1],
                "response": row[2],
                "created_at": row[3]
            }
            for row in results
        ]
    except Exception as e:
        print(f"Erro ao obter histórico: {str(e)}")
        return []


def obter_historico_com_context(user_id: int, limite: int = 10) -> str:
    """Retorna o histórico formatado para usar como contexto no prompt."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        cursor.execute(
            """SELECT message, response FROM chat_history 
               WHERE user_id = ? 
               ORDER BY created_at DESC 
               LIMIT ?""",
            (user_id, limite)
        )
        
        results = cursor.fetchall()
        conn.close()
        
        if not results:
            return "Nenhum histórico anterior."
        
        # Formata o histórico para contexto
        historico_texto = "Histórico de conversas anteriores:\n"
        for msg, resp in reversed(results):
            historico_texto += f"\nPergunta: {msg}\nResposta: {resp[:200]}...\n"
        
        return historico_texto
    except Exception as e:
        print(f"Erro ao obter histórico com contexto: {str(e)}")
        return ""


def deletar_mensagem(chat_id: int, user_id: int) -> Dict[str, Any]:
    """Deleta uma mensagem do histórico."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        # Verifica se a mensagem pertence ao usuário
        cursor.execute("SELECT user_id FROM chat_history WHERE id = ?", (chat_id,))
        result = cursor.fetchone()
        
        if result is None or result[0] != user_id:
            conn.close()
            return {
                "success": False,
                "message": "Mensagem não encontrada ou acesso negado"
            }
        
        cursor.execute("DELETE FROM chat_history WHERE id = ?", (chat_id,))
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "message": "Mensagem deletada com sucesso"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Erro ao deletar mensagem: {str(e)}"
        }


def limpar_historico(user_id: int) -> Dict[str, Any]:
    """Limpa todo o histórico de um usuário."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM chat_history WHERE user_id = ?", (user_id,))
        conn.commit()
        deleted = cursor.rowcount
        cursor.execute("DELETE FROM chat_sessions WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "deleted_count": deleted,
            "message": f"{deleted} mensagens deletadas"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Erro ao limpar histórico: {str(e)}"
        }
