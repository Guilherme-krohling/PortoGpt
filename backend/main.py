import os
import re
import ingest
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, Form, Header, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi import BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import shutil
from pydantic import BaseModel
import json
from pathlib import Path
import subprocess
import sys
import json as json_module
import time
from typing import Any, Dict, Optional
from jinja2 import Environment, BaseLoader, Undefined
from groq import Groq as GroqDirect

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Imports do Database
import database

# Imports do LlamaIndex e Rerank
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import VectorStoreIndex, Settings
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.core.postprocessor import SentenceTransformerRerank

# ==========================================
# CONFIGURAÇÕES GERAIS
# ==========================================
app = FastAPI(title="PortoGpt API", version="1.0")

# Configuração de CORS (Para o Frontend acessar)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Variável global para o motor de chat
chat_engine = None
DATA_DIR = Path(__file__).resolve().parent / "data"
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
PENDING_UPLOADS_DIR = Path(__file__).resolve().parent / "pending_uploads"
PROCESSED_UPLOADS_DIR = Path(__file__).resolve().parent / "processed_uploads"
RAW_UPLOADS_DIR = Path(__file__).resolve().parent / "raw_uploads"
METADATA_FILE = Path(__file__).resolve().parent / "docs.json"

# ==========================================
# PROMPTS E PERSONALIDADE (A Mágica acontece aqui)
# ==========================================
SYSTEM_PROMPT = """
Você é o PortoGpt, um consultor sênior especialista em análise de documentos portuários e técnicos.
Sua missão é ajudar colaboradores a encontrar informações precisas em documentos internos.

REGRAS DE COMPORTAMENTO:
1. Seja Preciso: Baseie suas respostas EXCLUSIVAMENTE no contexto fornecido.
2. Não Alucine: Se a informação não estiver no texto, NÃO invente.
3. Seja Investigativo (MUITO IMPORTANTE): - Se a pergunta do usuário for muito vaga (ex: "Qual o prazo?"), NÃO diga "não sei". 
   - Em vez disso, PERGUNTE DE VOLTA: "Para qual tipo de processo você gostaria de saber o prazo? (Ex: Licitação, Entrega, Pagamento?)".
   - Ajude o usuário a refinar a pergunta até que você encontre a resposta no contexto.
4. Estilo: Responda em Português do Brasil, de forma profissional, direta e educada.

FORMATAÇÃO OBRIGATÓRIA:

- Use Markdown válido
- Use parágrafos curtos
- Use listas somente quando houver múltiplos itens
- Destaque termos importantes com **negrito**
- Nunca use HTML
- Nunca responda bloco único de texto

MODELO DE RESPOSTA:

## Resultado

Texto introdutório.

(quando houver lista)
- Item 1
- Item 2

## Observação

Texto final.
"""

# ==========================================
# MODELOS DE DADOS (Pydantic)
# ==========================================
class QueryRequest(BaseModel):
    query: str
    user_id: int = None  # Opcional para compatibilidade


class RegisterRequest(BaseModel):
    name: Optional[str] = None
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ChatRequest(BaseModel):
    query: str
    user_id: int
    session_id: Optional[int] = None


class ChatSessionRequest(BaseModel):
    user_id: int
    title: Optional[str] = None


class SaveMessageRequest(BaseModel):
    user_id: int
    session_id: Optional[int] = None
    user_message: str
    assistant_message: str
    metadata: Optional[Dict[str, Any]] = None


class AdminUserRequest(BaseModel):
    name: str
    email: str
    password: Optional[str] = None
    role: str = "viewer"
    status: str = "active"


class AISettingsRequest(BaseModel):
    strict_documents_only: bool = True
    answer_unknown_when_missing: bool = True
    ask_clarifying_questions: bool = True
    include_source_hint: bool = True
    tone: str = "professional"
    similarity_top_k: int = 10
    custom_instructions: str = ""


class DocumentUpdateRequest(BaseModel):
    title: str
    description: str = ""
    active: bool = True


class RejectDocumentRequest(BaseModel):
    feedback: str = ""


class CreateTemplateRequest(BaseModel):
    name: str
    html: str
    description: str = ""


class SaveHtmlRequest(BaseModel):
    html: str


class PreviewTemplateRequest(BaseModel):
    html: Optional[str] = None


class ApplyTemplateRequest(BaseModel):
    pdf_text: str


def require_active_user(x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")):
    """Valida usuario autenticado e ativo."""
    if x_user_id is None:
        raise HTTPException(status_code=401, detail="Usuario nao autenticado")

    user = database.obter_usuario(x_user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Usuario nao encontrado")

    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Usuario inativo ou pendente")

    return user


def require_admin(x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")):
    """Valida se o usuário atual pode acessar rotas administrativas."""
    if x_user_id is None:
        raise HTTPException(status_code=401, detail="Usuário não autenticado")

    user = database.obter_usuario(x_user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Usuário inativo ou pendente")

    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso permitido apenas para administradores")

    return user


def require_pdf_manager(x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")):
    """Valida se o usuario atual pode gerenciar PDFs."""
    user = require_active_user(x_user_id)

    if user.get("role") not in {"admin", "editor"}:
        raise HTTPException(status_code=403, detail="Acesso permitido apenas para administradores e editores")

    return user


def build_system_prompt():
    """Monta o prompt do PortoGpt com parâmetros salvos no SQLite."""
    settings = database.obter_ai_settings()
    tone_map = {
        "professional": "Use tom profissional, direto e educado.",
        "simple": "Use linguagem simples, clara e fácil de entender.",
        "technical": "Use tom técnico, com precisão e termos do domínio portuário quando forem úteis.",
    }

    rules = []
    if settings.get("strict_documents_only", True):
        rules.append("Responda somente com base nos documentos indexados e no contexto recuperado.")
    if settings.get("answer_unknown_when_missing", True):
        rules.append("Quando a informação não estiver nos documentos, diga isso claramente e não invente dados.")
    if settings.get("ask_clarifying_questions", True):
        rules.append("Se a pergunta estiver vaga, faça uma pergunta objetiva para refinar a busca antes de concluir.")
    if settings.get("include_source_hint", True):
        rules.append("Quando possível, mencione qual documento ou trecho da base parece sustentar a resposta.")

    custom_instructions = settings.get("custom_instructions", "").strip()
    if custom_instructions:
        rules.append(f"Instruções personalizadas do administrador: {custom_instructions}")

    rules.append(tone_map.get(settings.get("tone"), tone_map["professional"]))
    rules_text = "\n".join(f"- {rule}" for rule in rules)

    return f"{SYSTEM_PROMPT}\n\nPARÂMETROS ADMINISTRATIVOS ATUAIS:\n{rules_text}\n"


def carregar_chat_engine():
    """Carrega ou recarrega o motor de chat a partir do ChromaDB."""
    global chat_engine
    settings = database.obter_ai_settings()

    print("💾 Carregando memória de longo prazo (ChromaDB)...")
    chroma_collection = ingest.buscar_collection()
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)

    index = VectorStoreIndex.from_vector_store(
        vector_store,
        embed_model=Settings.embed_model
    )

    reranker = SentenceTransformerRerank(model="cross-encoder/ms-marco-MiniLM-L-12-v2", top_n=3)

    chat_engine = index.as_chat_engine(
        chat_mode="context",
        similarity_top_k=int(settings.get("similarity_top_k", 10)),
        node_postprocessors=[reranker],
        system_prompt=build_system_prompt()
    )

    print("✅ PortoGpt está ONLINE e pronto para responder.")
    return chat_engine


def load_docs_metadata():
    if not METADATA_FILE.exists():
        return {}
    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_docs_metadata(meta: dict):
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def rebuild_index(file_paths=None):
    """Recria o índice no ChromaDB usando somente PDFs ativos no SQLite."""
    global chat_engine
    database.sync_documents_from_disk(DATA_DIR, load_docs_metadata())
    active_docs = database.listar_documentos()
    files = [str(DATA_DIR / doc["filename"]) for doc in active_docs if doc.get("active")]

    try:
        backend_dir = Path(__file__).resolve().parent
        command = [sys.executable, "ingest.py", *files] if files else [sys.executable, "ingest.py", "--empty"]
        completed = subprocess.run(command, cwd=str(backend_dir), capture_output=True, text=True)
        if completed.stdout:
            print(completed.stdout)
        if completed.returncode != 0:
            if completed.stderr:
                print(completed.stderr)
            raise RuntimeError("Falha ao reconstruir índice vetorial")

        if not files:
            chat_engine = None
            return

        if Settings.llm is not None and Settings.embed_model is not None:
            carregar_chat_engine()
        print("✅ ARQUIVOS REINDEXADOS")
    except Exception as e:
        print(f"Erro ao reconstruir índice: {e}")


def is_missing_chroma_collection_error(error: Exception) -> bool:
    """Identifica referência quebrada para uma collection antiga do ChromaDB."""
    message = str(error).lower()
    return "collection" in message and ("does not exist" in message or "not found" in message)


def ensure_chat_engine():
    """Garante que o motor de chat esteja carregado com a collection atual."""
    global chat_engine
    if chat_engine is not None:
        return chat_engine

    active_docs = [doc for doc in database.listar_documentos() if doc.get("active")]
    if not active_docs:
        raise HTTPException(status_code=503, detail="Nenhum PDF ativo está disponível para consulta.")

    rebuild_index()
    if chat_engine is None:
        carregar_chat_engine()
    return chat_engine

# ==========================================
# INICIALIZAÇÃO (Startup)
# ==========================================
@app.on_event("startup")
def startup_event():
    global chat_engine
    print("⚡ Inicializando PortoGpt API...")

    load_dotenv()

    # Inicializar banco de dados
    database.init_db()
    database.sync_documents_from_disk(DATA_DIR, load_docs_metadata())
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    os.makedirs(PENDING_UPLOADS_DIR, exist_ok=True)
    os.makedirs(PROCESSED_UPLOADS_DIR, exist_ok=True)
    database.sync_templates_from_disk(TEMPLATES_DIR)

    api_key = os.getenv("secret_key")
    if not api_key:
        print("❌ ERRO: 'secret_key' não encontrada no .env")
        return

    # 1. Configurar Cérebro (LLM) e Leitor (Embeddings)
    Settings.llm = Groq(model="llama-3.3-70b-versatile", api_key=api_key)
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

    try:
        carregar_chat_engine()
    except FileNotFoundError:
        print("⚠️ Banco de dados './chroma_db' não encontrado. O sistema não responderá perguntas.")
    except Exception as e:
        print(f"❌ Erro ao carregar banco de dados: {e}")

# ==========================================
# ROTAS (Endpoints)
# ==========================================

# ========== AUTENTICAÇÃO ==========
@app.post("/api/register")
def register_endpoint(request: RegisterRequest):
    """Registra um novo usuário."""
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="E-mail e senha são obrigatórios")
    
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 6 caracteres")
    
    result = database.criar_usuario(request.email, request.password)
    
    if result["success"]:
        return {"message": result["message"], "user_id": result["user_id"], "user": result.get("user")}
    else:
        raise HTTPException(status_code=400, detail=result["message"])


@app.post("/api/login")
def login_endpoint(request: LoginRequest):
    """Autentica um usuário e retorna seu ID."""
    if not request.email or not request.password:
        raise HTTPException(status_code=400, detail="E-mail e senha são obrigatórios")
    
    result = database.autenticar_usuario(request.email, request.password)
    
    if result["success"]:
        return {"message": result["message"], "user_id": result["user_id"], "user": result.get("user")}
    else:
        raise HTTPException(status_code=401, detail=result["message"])


@app.get("/api/user/{user_id}")
def get_user_endpoint(user_id: int):
    """Obtém informações do usuário."""
    user = database.obter_usuario(user_id)
    
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    return user


# ========== ADMIN USUÁRIOS ==========
@app.get("/api/users")
def list_users_endpoint(admin_user=Depends(require_admin)):
    """Lista usuários para a tela admin."""
    return {"users": database.listar_usuarios()}


@app.post("/api/users")
def create_user_endpoint(request: AdminUserRequest, admin_user=Depends(require_admin)):
    """Cria usuário no painel admin."""
    if not request.email or not request.name:
        raise HTTPException(status_code=400, detail="Nome e e-mail são obrigatórios")

    if request.password is not None and len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 6 caracteres")

    if request.role not in {"admin", "editor", "viewer"}:
        raise HTTPException(status_code=400, detail="Função inválida")

    if request.status not in {"active", "inactive", "pending"}:
        raise HTTPException(status_code=400, detail="Status inválido")

    result = database.criar_usuario_admin(
        name=request.name.strip(),
        email=request.email.strip().lower(),
        role=request.role,
        status=request.status,
        senha=request.password,
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.put("/api/users/{user_id}")
def update_user_endpoint(user_id: int, request: AdminUserRequest, admin_user=Depends(require_admin)):
    """Atualiza dados de usuário no painel admin."""
    if not request.email or not request.name:
        raise HTTPException(status_code=400, detail="Nome e e-mail são obrigatórios")

    if request.password is not None and len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 6 caracteres")

    if request.role not in {"admin", "editor", "viewer"}:
        raise HTTPException(status_code=400, detail="Função inválida")

    if request.status not in {"active", "inactive", "pending"}:
        raise HTTPException(status_code=400, detail="Status inválido")

    if user_id == admin_user["id"] and (request.role != "admin" or request.status != "active"):
        raise HTTPException(status_code=400, detail="Não é possível remover seu próprio acesso de administrador")

    result = database.atualizar_usuario_admin(
        user_id=user_id,
        name=request.name.strip(),
        email=request.email.strip().lower(),
        role=request.role,
        status=request.status,
        senha=request.password,
    )

    if not result["success"]:
        if result["message"] == "Usuário não encontrado":
            raise HTTPException(status_code=404, detail=result["message"])
        raise HTTPException(status_code=400, detail=result["message"])

    return result


@app.delete("/api/users/{user_id}")
def delete_user_endpoint(user_id: int, admin_user=Depends(require_admin)):
    """Exclui usuário no painel admin."""
    if user_id == admin_user["id"]:
        raise HTTPException(status_code=400, detail="Não é possível excluir seu próprio usuário")

    result = database.deletar_usuario_admin(user_id)
    if not result["success"]:
        if result["message"] == "Usuário não encontrado":
            raise HTTPException(status_code=404, detail=result["message"])
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.get("/api/admin/dashboard")
def admin_dashboard_endpoint(admin_user=Depends(require_admin)):
    """Indicadores agregados para o dashboard administrativo."""
    return {"stats": database.obter_admin_dashboard_stats()}


# ========== ADMIN CONHECIMENTO DA IA ==========
@app.get("/api/ai/settings")
def get_ai_settings_endpoint(admin_user=Depends(require_admin)):
    """Obtém parâmetros de comportamento da IA."""
    return {"settings": database.obter_ai_settings()}


@app.put("/api/ai/settings")
def update_ai_settings_endpoint(request: AISettingsRequest, admin_user=Depends(require_admin)):
    """Atualiza parâmetros de comportamento da IA."""
    payload = request.model_dump() if hasattr(request, "model_dump") else request.dict()
    result = database.atualizar_ai_settings(payload)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    try:
        if Settings.llm is not None and Settings.embed_model is not None:
            carregar_chat_engine()
    except Exception as e:
        print(f"Não foi possível recarregar o chat engine após atualizar parâmetros: {e}")

    return result


# ========== CHAT ==========
@app.post("/api/chat")
def chat_endpoint(request: ChatRequest):
    global chat_engine
    
    # Verificar se usuário existe
    user = database.obter_usuario(request.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    try:
        # O chat_engine gerencia o histórico automaticamente
        engine = ensure_chat_engine()
        try:
            response = engine.chat(request.query)
        except Exception as e:
            if not is_missing_chroma_collection_error(e):
                raise
            print("Collection vetorial antiga detectada. Reindexando base ativa e tentando novamente...")
            chat_engine = None
            rebuild_index()
            response = ensure_chat_engine().chat(request.query)
        response_text = str(response)
        
        # Salvar no banco de dados
        save_result = database.salvar_mensagem(
            request.user_id,
            request.query,
            response_text,
            session_id=request.session_id,
        )
        
        return {"response": response_text, "session_id": save_result.get("session_id")}
    except Exception as e:
        print(f"Erro na geração da resposta: {e}")
        raise HTTPException(status_code=500, detail="Ocorreu um erro interno ao processar sua pergunta.")


@app.post("/api/chat/stream")
def chat_stream_endpoint(request: ChatRequest):
    """Gera resposta e envia o texto em pequenos blocos para efeito de streaming."""
    global chat_engine

    user = database.obter_usuario(request.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    def emit_event(event: dict):
        return f"{json_module.dumps(event, ensure_ascii=False)}\n"

    def stream_response():
        global chat_engine
        try:
            engine = ensure_chat_engine()
            try:
                response = engine.chat(request.query)
            except Exception as e:
                if not is_missing_chroma_collection_error(e):
                    raise
                print("Collection vetorial antiga detectada. Reindexando base ativa e tentando novamente...")
                chat_engine = None
                rebuild_index()
                response = ensure_chat_engine().chat(request.query)

            response_text = str(response)
            save_result = database.salvar_mensagem(
                request.user_id,
                request.query,
                response_text,
                session_id=request.session_id,
            )

            for index in range(0, len(response_text), 8):
                yield emit_event({"type": "chunk", "text": response_text[index:index + 8]})
                time.sleep(0.055)

            yield emit_event({"type": "done", "session_id": save_result.get("session_id")})
        except Exception as e:
            print(f"Erro na geração da resposta em streaming: {e}")
            yield emit_event({"type": "error", "message": "Ocorreu um erro interno ao processar sua pergunta."})

    return StreamingResponse(stream_response(), media_type="application/x-ndjson; charset=utf-8")


@app.get("/api/chat/sessions/{user_id}")
def list_chat_sessions_endpoint(user_id: int):
    """Lista conversas salvas do usuário."""
    user = database.obter_usuario(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    return {"sessions": database.listar_chat_sessions(user_id)}


@app.get("/api/chat/insights/{user_id}")
def chat_insights_endpoint(user_id: int, days: int = 7, top_k: int = 3):
    """Insights simples do chat do usuário (ex.: mais perguntado na semana)."""
    user = database.obter_usuario(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if user.get("status") != "active":
        raise HTTPException(status_code=403, detail="Usuário inativo ou pendente")

    top_questions = database.obter_perguntas_mais_frequentes(user_id, days=days, top_k=top_k)
    return {"top_questions": top_questions, "days": max(1, min(60, int(days or 7)))}


@app.post("/api/chat/sessions")
def create_chat_session_endpoint(request: ChatSessionRequest):
    """Cria uma conversa vazia para o usuário."""
    user = database.obter_usuario(request.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    result = database.criar_chat_session(request.user_id, request.title)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@app.get("/api/chat/sessions/{session_id}/messages")
def get_chat_session_messages_endpoint(session_id: int, user_id: int):
    """Obtém as mensagens de uma conversa."""
    user = database.obter_usuario(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    session = database.obter_chat_session(user_id, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    return {
        "session": session,
        "messages": database.obter_mensagens_chat_session(user_id, session_id),
    }


@app.delete("/api/chat/sessions/{session_id}")
def delete_chat_session_endpoint(session_id: int, user_id: int):
    """Remove uma conversa inteira."""
    result = database.deletar_chat_session(user_id, session_id)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])
    return result


# ========== HISTÓRICO DE CHAT ==========
@app.post("/api/chat/history")
def save_chat_history_endpoint(request: SaveMessageRequest):
    """Salva uma mensagem interativa ou de template no histórico do chat."""
    save_result = database.salvar_mensagem(
        request.user_id,
        request.user_message,
        request.assistant_message,
        session_id=request.session_id,
        metadata=request.metadata,
    )
    return {"session_id": save_result.get("session_id")}


@app.get("/api/chat/history/{user_id}")
def get_chat_history_endpoint(user_id: int, limite: int = 50):
    """Obtém o histórico de chat do usuário."""
    user = database.obter_usuario(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    historico = database.obter_historico(user_id, limite)
    return {"historico": historico}


@app.delete("/api/chat/history/{user_id}/{chat_id}")
def delete_chat_message_endpoint(user_id: int, chat_id: int):
    """Deleta uma mensagem específica do histórico."""
    result = database.deletar_mensagem(chat_id, user_id)
    
    if result["success"]:
        return result
    else:
        raise HTTPException(status_code=400, detail=result["message"])


@app.delete("/api/chat/history/{user_id}")
def clear_chat_history_endpoint(user_id: int):
    """Limpa todo o histórico de chat do usuário."""
    user = database.obter_usuario(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    result = database.limpar_historico(user_id)
    
    if result["success"]:
        return result
    else:
        raise HTTPException(status_code=400, detail=result["message"])
def resolve_data_file(filename: str):
    """Resolve com segurança o caminho de um arquivo dentro de data/."""
    safe_filename = os.path.basename(filename)
    file_path = (DATA_DIR / safe_filename).resolve()
    data_root = DATA_DIR.resolve()
    if not str(file_path).startswith(str(data_root)) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return safe_filename, file_path

def resolve_pending_file(filename: str):
    """Resolve com segurança o caminho de um arquivo dentro de pending_uploads/."""
    safe_filename = os.path.basename(filename)
    file_path = (PENDING_UPLOADS_DIR / safe_filename).resolve()
    raw_root = PENDING_UPLOADS_DIR.resolve()
    if not str(file_path).startswith(str(raw_root)) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return safe_filename, file_path


def resolve_template_file(filename: str):
    """Resolve com segurança o caminho de um arquivo dentro de templates/."""
    safe_filename = os.path.basename(filename)
    file_path = (TEMPLATES_DIR / safe_filename).resolve()
    templates_root = TEMPLATES_DIR.resolve()
    if not str(file_path).startswith(str(templates_root)) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return safe_filename, file_path


def unique_pdf_filename(original_name: str) -> str:
    safe_name = os.path.basename(original_name or "documento.pdf")
    stem = Path(safe_name).stem or "documento"
    suffix = Path(safe_name).suffix.lower() or ".pdf"
    if suffix != ".pdf":
        raise HTTPException(status_code=400, detail="Envie apenas arquivos PDF")
    return f"{stem}_{int(time.time() * 1000)}{suffix}"


def resolve_managed_file(root: Path, filename: str):
    safe_filename = os.path.basename(filename)
    file_path = (root / safe_filename).resolve()
    root_path = root.resolve()
    if not str(file_path).startswith(str(root_path)) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return safe_filename, file_path


# Variáveis cujo nome indica "corpo/conteúdo completo do documento"
BODY_VARS = {
    "corpo", "conteudo", "texto", "body", "content", "documento",
    "relatorio", "descricao", "texto_completo", "conteudo_completo",
    "corpo_do_documento", "texto_do_documento",
}


def pdf_text_to_html(text: str) -> str:
    """Converte texto extraído de PDF em HTML inline (compatível com <p>{{ corpo }}</p>).

    Usa apenas <br> e elementos inline para evitar aninhamento inválido de <p> dentro de <p>.
    """
    lines = text.split('\n')
    html_parts = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            i += 1
            continue

        # Seção numerada: "1. Objetivo", "2. Atividades Executadas"
        if re.match(r'^\d+\.\s+\S', stripped):
            if html_parts:
                html_parts.append('<br>')
            html_parts.append(f'<strong>{stripped}</strong><br>')
            i += 1
            continue

        # Bullets: ●, •, ou "- texto"
        if stripped[0] in {'●', '•'} or stripped.startswith('- '):
            bullet_text = stripped.lstrip('●•- ').strip()
            html_parts.append(f'&nbsp;&nbsp;&#8226;&nbsp;{bullet_text}<br>')
            i += 1
            continue

        html_parts.append(f'{stripped}<br>')
        i += 1

    return ''.join(html_parts).rstrip('<br>') or '(sem conteúdo)'


def _apply_template_to_text(source: str, pdf_text: str) -> tuple:
    """Extrai campos do texto e renderiza o template. Retorna (fields_dict, rendered_html)."""
    RESERVED = {"page_number", "total_pages", "logo_url"}
    variables = [
        v for v in dict.fromkeys(re.findall(r"\{\{\s*(\w+)\s*\}\}", source))
        if v not in RESERVED
    ]
    if not variables:
        raise ValueError("Template não possui campos variáveis definidos")

    body_variables = [v for v in variables if v.lower() in BODY_VARS]
    field_variables = [v for v in variables if v.lower() not in BODY_VARS]

    extracted: dict = {}

    # 1. Extrai campos específicos primeiro (via IA)
    if field_variables:
        api_key = os.getenv("secret_key")
        if not api_key:
            raise ValueError("Chave de API não configurada")
        fields_list = "\n".join(f"- {v}" for v in field_variables)
        prompt = (
            "Você receberá o texto extraído de um PDF e uma lista de campos.\n"
            "Extraia APENAS os valores específicos de cada campo e retorne um JSON.\n"
            "Retorne APENAS o JSON, sem explicações.\n\n"
            f"CAMPOS:\n{fields_list}\n\n"
            f"TEXTO DO PDF:\n{pdf_text[:6000]}\n\n"
            "Se um campo não for encontrado, use string vazia."
        )
        groq_client = GroqDirect(api_key=api_key)
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        extracted.update(json.loads(response.choices[0].message.content))

    # 2. Gera corpo removendo linhas que já são campos (evita repetição)
    if body_variables:
        field_values = {v for v in extracted.values() if isinstance(v, str) and v.strip()}
        clean_lines = []
        for line in pdf_text.split('\n'):
            stripped = line.strip()
            if not stripped:
                continue
            # Pula linha se ela inteira é um valor já extraído
            if stripped in field_values:
                continue
            # Pula padrão "Label: valor" onde valor já foi extraído
            if any(stripped.endswith(f': {val}') or stripped == val for val in field_values if val):
                continue
            clean_lines.append(line)
        # Remove o bloco de cabeçalho (linhas antes do primeiro conteúdo numerado ou parágrafo longo)
        body_text = '\n'.join(clean_lines)
        # Encontra onde começa o conteúdo real (primeira seção numerada ou primeiro parágrafo longo)
        content_start = 0
        for idx, line in enumerate(clean_lines):
            s = line.strip()
            if re.match(r'^\d+\.\s+\S', s) or (len(s) > 40 and not re.match(r'^\w+:', s)):
                content_start = idx
                break
        body_text = '\n'.join(clean_lines[content_start:])
        body_html = pdf_text_to_html(body_text)
        for var in body_variables:
            extracted[var] = body_html

    extracted.setdefault("page_number", "1")
    extracted.setdefault("total_pages", "1")
    extracted.setdefault("logo_url", "")

    env = Environment(loader=BaseLoader())
    tmpl = env.from_string(source)
    rendered = tmpl.render(**extracted)
    return extracted, rendered


def process_document_template(raw_path: Path, processed_path: Path, template_filename: str=None) -> Path:
    """Aplica o template HTML escolhido ao PDF e salva o resultado formatado.

    Retorna o caminho real do arquivo processado (pode ser .html ou .pdf).
    """
    try:
        selected_template = None
        if template_filename:
            selected_template = database.obter_template(template_filename)

        if not selected_template:
            shutil.copyfile(raw_path, processed_path)
            return processed_path
        
        if not selected_template.get("active"):
            raise ValueError("Template inativo não pode ser aplicado")

        template_path = TEMPLATES_DIR / selected_template["filename"]
        if not template_path.exists():
            raise FileNotFoundError("Template não encontrado nos arquivos")

        import pypdf
        reader = pypdf.PdfReader(str(raw_path))
        pdf_text = "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages)

        template_source = template_path.read_text(encoding="utf-8")

        RESERVED = {"page_number", "total_pages", "logo_url"}
        variables = [
            v for v in dict.fromkeys(re.findall(r"\{\{\s*(\w+)\s*\}\}", template_source))
            if v not in RESERVED
        ]

        if not variables:
            shutil.copyfile(raw_path, processed_path)
            return processed_path

        # Separa variáveis de corpo (conteúdo completo) das de campo (valor específico)
        body_variables = [v for v in variables if v.lower() in BODY_VARS]
        field_variables = [v for v in variables if v.lower() not in BODY_VARS]

        extracted = extract_template_json(pdf_text, body_variables, field_variables)

        env = Environment(loader=BaseLoader())
        tmpl = env.from_string(template_source)
        rendered_html = tmpl.render(**extracted)

        pdf_b = _render_pdf_with_chromium(rendered_html)
        with open(raw_path, 'wb') as f:
            f.write(pdf_b)

        html_path = processed_path.with_suffix(".html")
        html_path.write_text(rendered_html, encoding="utf-8")
        return html_path

    except Exception as exc:
        print(f"[process_document_template] Erro ao aplicar template: {exc}")
        shutil.copyfile(raw_path, processed_path)
        return processed_path

def extract_template_json(pdf_text, body_variables, field_variables):
    extracted = {}

        # Corpo: preenche diretamente com todo o texto do PDF convertido em HTML
    body_html = pdf_text_to_html(pdf_text)
    for var in body_variables:
        extracted[var] = body_html

        # Campos específicos: usa IA apenas se necessário
    if field_variables:
        api_key = os.getenv("secret_key")
        if not api_key:
            for var in field_variables:
                extracted[var] = ""
        else:
            fields_list = "\n".join(f"- {v}" for v in field_variables)
            prompt = (
                    "Você receberá o texto extraído de um PDF e uma lista de campos.\n"
                    "Extraia APENAS os valores específicos de cada campo e retorne um JSON.\n"
                    "Retorne APENAS o JSON, sem explicações.\n\n"
                    f"CAMPOS:\n{fields_list}\n\n"
                    f"TEXTO DO PDF:\n{pdf_text[:6000]}\n\n"
                    "Se um campo não for encontrado, use string vazia."
                )
            groq_client = GroqDirect(api_key=api_key)
            response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
            extracted.update(json_module.loads(response.choices[0].message.content))

    extracted.setdefault("page_number", "1")
    extracted.setdefault("total_pages", "1")
    extracted.setdefault("logo_url", "")
    return extracted


def register_saved_document(filename: str, original_name: str, file_path: Path, title=None, description=None, uploaded_by=None, status="aprovado", raw_filename=None, processed_filename=None, approved_by=None):
    stat = file_path.stat()
    result = database.registrar_documento(
        filename=filename,
        original_name=original_name,
        title=title,
        description=description,
        size=stat.st_size,
        mtime=int(stat.st_mtime),
        active=True,
        uploaded_by=uploaded_by,
        status=status,
        raw_filename=raw_filename or filename,
        processed_filename=processed_filename or filename,
        approved_by=approved_by,
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result["document"]


def register_saved_template(filename: str, original_name: str, file_path: Path, title=None, description=None, uploaded_by=None):
    stat = file_path.stat()
    result = database.registrar_template(
        filename=filename,
        original_name=original_name,
        title=title,
        description=description,
        size=stat.st_size,
        mtime=int(stat.st_mtime),
        active=True,
        uploaded_by=uploaded_by,
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result["template"]


@app.post("/api/upload")
def upload_endpoint(
    file: UploadFile = File(...),
    template_filename: Optional[str] = Form(default=None),
    message: Optional[str] = Form(default=None),
    session_id: Optional[int] = Form(default=None),
    x_user_id: Optional[int] = Header(default=None, alias="X-User-Id"),
):
    try:
        # Segurança: sanitizar nome e evitar path traversal
        user = require_active_user(x_user_id)
        filename = unique_pdf_filename(file.filename)
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(PENDING_UPLOADS_DIR, exist_ok=True)
        os.makedirs(PROCESSED_UPLOADS_DIR, exist_ok=True)
        is_auto_approved = user.get("role") in {"admin", "editor"}
        dest_path = DATA_DIR / filename if is_auto_approved else PENDING_UPLOADS_DIR / filename
        original_path = RAW_UPLOADS_DIR / filename
        processed_path = PROCESSED_UPLOADS_DIR / filename
        # Salvar arquivo em data/
        with open(original_path, 'wb') as out:
            shutil.copyfileobj(file.file, out)
        file.file.seek(0)
        with open(dest_path, 'wb') as out:
            shutil.copyfileobj(file.file, out)
        actual_processed = process_document_template(dest_path, processed_path, template_filename)
        processed_name = actual_processed.name

        # Atualizar metadata
        if is_auto_approved:
            meta = load_docs_metadata()
            meta[filename] = {"active": True}
            save_docs_metadata(meta)
            document = register_saved_document(
                filename, file.filename, dest_path, uploaded_by=user["id"], description=message or "",
                status="aprovado", raw_filename=filename, processed_filename=processed_name, approved_by=user["id"],
            )
            database.registrar_evento_documento(document["id"], "inserido", "aprovado", "Upload pelo chat com aprovação automatica.", user["id"])
            database.registrar_evento_documento(document["id"], "aprovado", "aprovado", "Documento publicado automaticamente por perfil interno.", user["id"])
        else:
            stat = actual_processed.stat()
            result = database.registrar_documento(
                filename=filename,
                original_name=file.filename,
                title=Path(file.filename).stem,
                description=message or "",
                size=stat.st_size,
                mtime=int(stat.st_mtime),
                active=False,
                uploaded_by=user["id"],
                status="pendente",
                raw_filename=filename,
                processed_filename=processed_name,
            )
            if not result["success"]:
                raise HTTPException(status_code=500, detail=result["message"])
            document = result["document"]
            database.registrar_evento_documento(document["id"], "enviado", "pendente", "Documento enviado pelo chat e encaminhado para aprovação.", user["id"])
            database.registrar_evento_documento(document["id"], "processado", "pendente", "Previa formatada gerada pela etapa de templatização.", user["id"])

        if is_auto_approved:
            try:
                rebuild_index(file_paths=[str(dest_path)])
            except Exception as e:
                print('Erro ao agendar reindex:', e)
        response = (
            f"Upload de {file.filename} aprovado automaticamente."
            if is_auto_approved
            else f"Documento {file.filename} enviado para templatização e aprovação do administrador."
        )
        chat_session_id = session_id
        if message is not None:
            user_message = message.strip() or f"Enviei o PDF {file.filename}."
            save_result = database.salvar_mensagem(
                user["id"],
                f"{user_message}\n\n[PDF enviado: {file.filename}]",
                response,
                session_id=session_id,
            )
            chat_session_id = save_result.get("session_id")

        # Extrai texto do PDF para uso imediato no chat (aplicar template)
        pdf_text_for_chat = ""
        try:
            import pypdf as _pypdf
            _reader = _pypdf.PdfReader(str(dest_path))
            pdf_text_for_chat = "\n".join(page.extract_text(extraction_mode="layout") or "" for page in _reader.pages)
        except Exception:
            pass

        return {
            "response": response,
            "document": document,
            "formatted_pdf_url": f"/api/submissions/{document['id']}/processed",
            "session_id": chat_session_id,
            "pdf_text": pdf_text_for_chat,
        }
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Não foi possível fazer o upload do arquivo")


@app.get("/api/docs")
def list_docs(x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")):
    """Lista arquivos na pasta data com metadados do SQLite."""
    database.sync_documents_from_disk(DATA_DIR, load_docs_metadata())
    user = database.obter_usuario(x_user_id) if x_user_id else None
    if user and user.get("status") == "active" and user.get("role") in {"admin", "editor"}:
        files = database.listar_documentos()
        for doc in files:
            doc["history"] = database.listar_eventos_documento(doc["id"])
    else:
        files = [doc for doc in database.listar_documentos(status="aprovado") if doc.get("active")]
    return JSONResponse(content={"files": files})


@app.get("/api/docs/{filename}/file")
def view_document_file(filename: str, user_id: Optional[int] = None, x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")):
    resolved_user_id = x_user_id or user_id
    user = database.obter_usuario(resolved_user_id) if resolved_user_id else None
    doc = database.obter_documento(os.path.basename(filename))
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if doc.get("status") != "aprovado" and user and user.get("role") not in {"admin", "editor"}:
        raise HTTPException(status_code=403, detail="Documento ainda não aprovado")
    if doc.get("status") != "aprovado" and not user:
        raise HTTPException(status_code=403, detail="Documento ainda não aprovado")
    _, file_path = resolve_data_file(filename)
    headers = {"Content-Disposition": f'inline; filename="{doc.get("original_name") or filename}"'}
    return FileResponse(file_path, media_type="application/pdf", headers=headers)


@app.get("/api/submissions")
def list_document_submissions(current_user=Depends(require_active_user)):
    if current_user.get("role") == "admin":
        docs = [doc for doc in database.listar_documentos() if doc.get("uploaded_by")]
        docs.sort(key=lambda doc: doc.get("updated_at") or doc.get("created_at") or "", reverse=True)
    else:
        docs = database.listar_documentos(uploaded_by=current_user["id"])
    for doc in docs:
        doc["history"] = database.listar_eventos_documento(doc["id"])
    return {"submissions": docs, "pending_count": database.contar_documentos_pendentes()}


@app.get("/api/submissions/{document_id}/raw")
def view_raw_submission(document_id: int, user_id: Optional[int] = None, x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")):
    current_user = require_active_user(x_user_id or user_id)
    doc = database.obter_documento_por_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if current_user.get("role") != "admin" and doc.get("uploaded_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    root = RAW_UPLOADS_DIR
    _, file_path = resolve_managed_file(root, doc.get("raw_filename") or doc["filename"])
    headers = {"Content-Disposition": f'inline; filename="{doc.get("original_name") or doc["filename"]}"'}
    return FileResponse(file_path, media_type="application/pdf", headers=headers)


@app.get("/api/submissions/{document_id}/processed")
def view_processed_submission(document_id: int, user_id: Optional[int] = None, x_user_id: Optional[int] = Header(default=None, alias="X-User-Id")):
    current_user = require_active_user(x_user_id or user_id)
    doc = database.obter_documento_por_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if current_user.get("role") not in {"admin", "editor"} and doc.get("uploaded_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    processed_name = doc.get("processed_filename") or doc["filename"]
    processed_path = PROCESSED_UPLOADS_DIR / processed_name

    if processed_name.endswith(".html") and processed_path.exists():
        return HTMLResponse(processed_path.read_text(encoding="utf-8"))

    root = PROCESSED_UPLOADS_DIR if processed_path.exists() else DATA_DIR
    _, file_path = resolve_managed_file(root, processed_name)
    headers = {"Content-Disposition": f'inline; filename="{doc.get("original_name") or doc["filename"]}"'}
    return FileResponse(file_path, media_type="application/pdf", headers=headers)


@app.post("/api/submissions/{document_id}/approve")
def approve_submission(document_id: int, background_tasks: BackgroundTasks = None, admin_user=Depends(require_admin)):
    doc = database.obter_documento_por_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    
    raw_name = doc.get("raw_filename") or doc["filename"]
    dest_path = DATA_DIR / doc["filename"]
    os.makedirs(DATA_DIR, exist_ok=True)

    raw_path = PENDING_UPLOADS_DIR / os.path.basename(raw_name)
    if not raw_path.exists():
        fallback_path = DATA_DIR / os.path.basename(raw_name)
        if not fallback_path.exists():
            raise HTTPException(status_code=404, detail="PDF original não encontrado para publicação")
        raw_path = fallback_path

    if raw_path.resolve() != dest_path.resolve():
        shutil.copyfile(raw_path, dest_path)

    result = database.atualizar_status_documento(doc["filename"], "aprovado", approved_by=admin_user["id"])
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    database.registrar_evento_documento(document_id, "aprovado", "aprovado", "Documento aprovado e publicado na base.", admin_user["id"])

    meta = load_docs_metadata()
    meta[doc["filename"]] = {"active": True, "title": doc["title"], "description": doc.get("description", "")}
    save_docs_metadata(meta)

    if background_tasks is not None:
        background_tasks.add_task(rebuild_index, file_paths=[str(dest_path)])
    else:
        rebuild_index(file_paths=[str(dest_path)])
    return {"message": "Documento aprovado", "document": result["document"]}


@app.post("/api/submissions/{document_id}/reject")
def reject_submission(document_id: int, request: RejectDocumentRequest, admin_user=Depends(require_admin)):
    doc = database.obter_documento_por_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if not request.feedback.strip():
        raise HTTPException(status_code=400, detail="Informe o motivo da reprovaÃ§Ã£o")
    result = database.atualizar_status_documento(doc["filename"], "reprovado", feedback=request.feedback)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    database.registrar_evento_documento(document_id, "reprovado", "reprovado", request.feedback, admin_user["id"])
    return {"message": "Documento reprovado", "document": result["document"]}


@app.post("/api/submissions/{document_id}/resubmit")
def resubmit_submission(
    document_id: int,
    file: UploadFile = File(...),
    current_user=Depends(require_active_user),
):
    doc = database.obter_documento_por_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if doc.get("uploaded_by") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if doc.get("status") != "reprovado":
        raise HTTPException(status_code=400, detail="Somente documentos reprovados podem ser reenviados")
    if int(doc.get("resubmission_count") or 0) >= 1:
        raise HTTPException(status_code=400, detail="Limite de reenvio atingido para esta solicitação")

    filename = doc["filename"]
    raw_path = PENDING_UPLOADS_DIR / filename
    processed_path = PROCESSED_UPLOADS_DIR / filename
    os.makedirs(PENDING_UPLOADS_DIR, exist_ok=True)
    os.makedirs(PROCESSED_UPLOADS_DIR, exist_ok=True)

    with open(raw_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    process_document_template(raw_path, processed_path)

    stat = processed_path.stat()
    result = database.reenviar_documento_reprovado(
        document_id=document_id,
        filename=filename,
        original_name=file.filename,
        title=Path(file.filename).stem,
        size=stat.st_size,
        mtime=int(stat.st_mtime),
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    database.registrar_evento_documento(document_id, "reenviado", "pendente", "Usuario reenviou a solicitacao para nova analise.", current_user["id"])
    database.registrar_evento_documento(document_id, "processado", "pendente", "Nova previa formatada gerada pela etapa de templatizacao.", current_user["id"])
    return {"message": "Solicitação reenviada para aprovação", "document": result["document"]}


@app.get("/api/notifications")
def notifications(current_user=Depends(require_active_user)):
    if current_user.get("role") == "admin":
        docs = database.listar_documentos(status="pendente")
        docs.sort(key=lambda doc: doc.get("updated_at") or doc.get("created_at") or "", reverse=True)
        unread_docs = database.filtrar_notificacoes_nao_lidas(current_user["id"], docs)
        return {"pending_documents": len(unread_docs), "items": unread_docs}

    docs = []
    for doc in database.listar_documentos(uploaded_by=current_user["id"]):
        if doc.get("status") == "reprovado":
            docs.append(doc)
        elif doc.get("status") == "aprovado" and ingest.is_indexed_file(doc.get("filename")):
            docs.append(doc)

    docs.sort(key=lambda doc: doc.get("updated_at") or doc.get("created_at") or "", reverse=True)
    docs = database.filtrar_notificacoes_nao_lidas(current_user["id"], docs)
    return {"pending_documents": 0, "items": docs}


@app.post("/api/notifications/read")
def read_notifications(current_user=Depends(require_active_user)):
    if current_user.get("role") == "admin":
        docs = database.listar_documentos(status="pendente")
    elif current_user.get("role") == "editor":
        docs = []
    else:
        docs = [
            doc for doc in database.listar_documentos(uploaded_by=current_user["id"])
            if doc.get("status") in {"aprovado", "reprovado"}
        ]
    result = database.marcar_notificacoes_lidas(current_user["id"], docs)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return {"message": "Notificações limpas"}


@app.get("/api/templates")
def list_templates():
    """Lista templates cadastrados com metadados do SQLite."""
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    database.sync_templates_from_disk(TEMPLATES_DIR)
    return {"templates": database.listar_templates()}


@app.post("/api/templates/upload")
def upload_admin_template(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    admin_user=Depends(require_admin),
):
    try:
        filename = os.path.basename(file.filename)
        dest_path = TEMPLATES_DIR / filename
        os.makedirs(TEMPLATES_DIR, exist_ok=True)

        with open(dest_path, 'wb') as out:
            shutil.copyfileobj(file.file, out)

        template = register_saved_template(
            filename=filename,
            original_name=file.filename,
            file_path=dest_path,
            title=title,
            description=description,
            uploaded_by=admin_user["id"],
        )

        return {"message": "Template enviado com sucesso", "template": template}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Não foi possível enviar o template")


@app.put("/api/templates/{filename}")
def update_template(filename: str, request: DocumentUpdateRequest, admin_user=Depends(require_admin)):
    safe_filename, _ = resolve_template_file(filename)
    result = database.atualizar_template(
        filename=safe_filename,
        title=request.title or Path(safe_filename).stem,
        description=request.description or "",
        active=request.active,
    )
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])

    return result


@app.post("/api/templates/{filename}/toggle")
def toggle_template(filename: str, admin_user=Depends(require_admin)):
    safe_filename, _ = resolve_template_file(filename)
    result = database.alternar_template(safe_filename)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])
    return {"file": safe_filename, "active": result["template"]["active"], "template": result["template"]}


@app.delete("/api/templates/{filename}")
def delete_template(filename: str, admin_user=Depends(require_admin)):
    safe_filename, file_path = resolve_template_file(filename)
    try:
        file_path.unlink()
        database.deletar_template(safe_filename)
        return {"status": "deleted", "file": safe_filename}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Erro ao deletar template")


# ========== TEMPLATES — CRIAR / EDITAR HTML / PREVIEW / APPLY ==========

@app.post("/api/templates/create")
def create_template(request: CreateTemplateRequest, admin_user=Depends(require_admin)):
    """Cria um template Jinja2 a partir do HTML gerado pelo formulário."""
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    slug = re.sub(r"[^a-z0-9_]", "", re.sub(r"\s+", "_", request.name.lower().strip()))
    if not slug:
        slug = "template"
    filename = f"{slug}.html"
    dest_path = TEMPLATES_DIR / filename

    # Evita sobreescrever: adiciona sufixo numérico se já existir
    counter = 1
    while dest_path.exists():
        filename = f"{slug}_{counter}.html"
        dest_path = TEMPLATES_DIR / filename
        counter += 1

    dest_path.write_text(request.html, encoding="utf-8")
    template = register_saved_template(
        filename=filename,
        original_name=filename,
        file_path=dest_path,
        title=request.name,
        description=request.description or f"Template criado via formulário",
        uploaded_by=admin_user["id"],
    )
    return {"message": "Template criado com sucesso", "template": template}


DEFAULT_TEMPLATE_HTML = (
    '<!DOCTYPE html>\n'
    '<html lang="pt-BR">\n'
    '<head>\n'
    '  <meta charset="UTF-8" />\n'
    '  <style>\n'
    '    * { box-sizing: border-box; margin: 0; padding: 0; }\n'
    '    body { font-family: Arial, sans-serif; font-size: 12pt; color: #222; background: #fff; min-height: 100vh; display: flex; flex-direction: column; padding-bottom: 64px; }\n'
    '    header { display: flex; align-items: center; padding: 18px 40px; border-bottom: 2px solid #0b4fd8; position: relative; }\n'
    '    .logo-ph { height: 48px; width: 80px; background: #dce9ff; color: #0b4fd8; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10pt; border-radius: 4px; flex-shrink: 0; }\n'
    '    .company { position: absolute; left: 0; right: 0; text-align: center; font-size: 18pt; font-weight: 700; color: #0b4fd8; pointer-events: none; }\n'
    '    .doc-title { text-align: center; padding: 28px 40px 12px; font-size: 16pt; font-weight: 700; }\n'
    '    main { flex: 1; padding: 0 40px 40px; }\n'
    '    .field { margin-bottom: 22px; }\n'
    '    .field-label { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #0b4fd8; margin-bottom: 6px; }\n'
    '    .field-value { font-size: 11pt; color: #333; line-height: 1.6; }\n'
    '    footer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 12px 40px; border-top: 1px solid #ddd; background: #fff; z-index: 10; }\n'
    '    .footer-ph { height: 28px; width: 48px; background: #dce9ff; color: #0b4fd8; display: flex; align-items: center; justify-content: center; font-size: 8pt; border-radius: 3px; }\n'
    '    .page-num { font-size: 9pt; color: #888; }\n'
    '  </style>\n'
    '</head>\n'
    '<body>\n'
    '  <header>\n'
    '    <div class="logo-ph">LOGO</div>\n'
    '    <span class="company">{{ company_name }}</span>\n'
    '  </header>\n'
    '  <h1 class="doc-title">{{ titulo }}</h1>\n'
    '  <main>\n'
    '    <section class="field">\n'
    '      <h3 class="field-label">Campo 1</h3>\n'
    '      <span class="field-value">{{ campo_1 }}</span>\n'
    '    </section>\n'
    '    <section class="field">\n'
    '      <h3 class="field-label">Conteúdo</h3>\n'
    '      <p class="field-value">{{ conteudo }}</p>\n'
    '    </section>\n'
    '  </main>\n'
    '  <footer>\n'
    '    <div class="footer-ph">LOGO</div>\n'
    '    <span class="page-num">Página {{ page_number }} de {{ total_pages }}</span>\n'
    '  </footer>\n'
    '</body>\n'
    '</html>'
)


@app.get("/api/templates/{filename}/html")
def get_template_html(filename: str, admin_user=Depends(require_admin)):
    """Retorna o conteúdo HTML de um template para edição."""
    safe_filename, file_path = resolve_template_file(filename)

    # Arquivos não-HTML (PDFs, DOCXs enviados por upload) não têm HTML editável;
    # retorna um template padrão para o usuário começar a editar.
    if file_path.suffix.lower() != ".html":
        title = file_path.stem
        default_html = DEFAULT_TEMPLATE_HTML.replace("{{{{ titulo }}}}", f"{{{{{title}}}}}")
        return {"filename": safe_filename, "html": default_html, "is_default": True}

    try:
        html = file_path.read_text(encoding="utf-8")
        return {"filename": safe_filename, "html": html, "is_default": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler template: {e}")


@app.put("/api/templates/{filename}/html")
def save_template_html(filename: str, request: SaveHtmlRequest, admin_user=Depends(require_admin)):
    """Salva o HTML editado de um template preservando os metadados existentes."""
    safe_filename, file_path = resolve_template_file(filename)
    try:
        file_path.write_text(request.html, encoding="utf-8")
        stat = file_path.stat()

        # Preserva title e description existentes
        existing = database.obter_template(safe_filename)
        database.atualizar_template(
            filename=safe_filename,
            title=existing["title"] if existing else Path(safe_filename).stem,
            description=existing["description"] if existing else "",
            active=existing["active"] if existing else True,
        )
        return {"message": "HTML salvo com sucesso", "filename": safe_filename, "size": stat.st_size}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar HTML: {e}")


@app.post("/api/templates/{filename}/preview")
def preview_template(filename: str, request: PreviewTemplateRequest = Body(default=PreviewTemplateRequest()), admin_user=Depends(require_admin)):
    """Renderiza o template com valores de exemplo e retorna o HTML resultante."""
    if request.html is not None:
        source = request.html
    else:
        safe_filename, file_path = resolve_template_file(filename)
        try:
            source = file_path.read_text(encoding="utf-8")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao ler template: {e}")

    # Extrai todas as variáveis {{ var }} do template
    variables = list(dict.fromkeys(re.findall(r"\{\{\s*(\w+)\s*\}\}", source)))

    # Valores de exemplo estáticos
    sample_map = {
        "company_name": "Porto S.A.",
        "logo_url": "",
        "page_number": "1",
        "total_pages": "3",
        "titulo": "Exemplo de Título",
    }
    sample = {v: sample_map.get(v, f"[{v.replace('_', ' ').title()}]") for v in variables}

    try:
        env = Environment(loader=BaseLoader(), undefined=Undefined)
        tmpl = env.from_string(source)
        rendered = tmpl.render(**sample)
    except Exception as e:
        rendered = source  # Retorna o source sem renderizar se houver erro de sintaxe

    return HTMLResponse(content=rendered)


@app.post("/api/templates/{filename}/apply")
def apply_template(filename: str, request: ApplyTemplateRequest, current_user=Depends(require_active_user)):
    """Extrai campos do PDF bruto e preenche o template Jinja2 com IA."""
    safe_filename, file_path = resolve_template_file(filename)
    try:
        source = file_path.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler template: {e}")

    # Extrai variáveis do template exceto as reservadas
    RESERVED = {"page_number", "total_pages", "logo_url"}
    variables = [
        v for v in dict.fromkeys(re.findall(r"\{\{\s*(\w+)\s*\}\}", source))
        if v not in RESERVED
    ]

    if not variables:
        raise HTTPException(status_code=400, detail="Template não possui campos variáveis definidos")

    try:
        extracted, rendered = _apply_template_to_text(source, request.pdf_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao aplicar template: {e}")

    return {"html": rendered, "fields": extracted}


@app.post("/api/templates/{filename}/apply-file")
def apply_template_file(
    filename: str,
    file: UploadFile = File(...),
    _current_user=Depends(require_active_user),
):
    """Aplica o template diretamente sobre um arquivo PDF enviado pelo usuário."""
    safe_filename, file_path = resolve_template_file(filename)
    try:
        source = file_path.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler template: {e}")

    try:
        import pypdf as _pypdf, io as _io
        file_bytes = file.file.read()
        reader = _pypdf.PdfReader(_io.BytesIO(file_bytes))
        pdf_text = "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao extrair texto do PDF: {e}")

    try:
        extracted, rendered = _apply_template_to_text(source, pdf_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao aplicar template: {e}")

    return {"html": rendered, "fields": extracted}


_PDF_PRINT_CSS = """
@page { size: A4; margin: 0; }
html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
"""


def _prepare_html_for_pdf(html: str) -> str:
    """Garante que o HTML renderizado pelo Chromium gere um PDF fiel ao iframe.

    - Injeta @page A4 sem margem (o template já controla padding/posicionamento).
    - Força a preservação das cores de fundo na impressão.
    - Não altera estrutura do header/footer: o Chromium suporta o CSS original
      (flexbox, position:fixed, object-fit) exatamente como o iframe da preview.
    """
    style_block = f"<style>{_PDF_PRINT_CSS}</style>"
    if "</head>" in html:
        return html.replace("</head>", style_block + "</head>", 1)
    if "<body" in html:
        return html.replace("<body", style_block + "<body", 1)
    return style_block + html


def _render_pdf_with_chromium(html: str) -> bytes:
    """Renderiza HTML em PDF usando Chromium headless via Playwright.

    Executa de forma síncrona (o endpoint FastAPI roda em threadpool quando
    declarado com 'def'), abrindo um navegador efêmero por chamada para evitar
    estados compartilhados.
    """
    from playwright.sync_api import sync_playwright

    prepared = _prepare_html_for_pdf(html)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            context = browser.new_context()
            page = context.new_page()
            page.set_content(prepared, wait_until="networkidle")
            page.emulate_media(media="print")
            return page.pdf(
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            browser.close()


@app.post("/api/render-pdf")
def render_pdf_endpoint(
    html: str = Form(...),
    filename: str = Form("documento"),
):
    """Converte HTML em PDF usando Chromium headless (Playwright).

    O Chromium renderiza o HTML exatamente como o iframe de pré-visualização,
    garantindo paridade visual (flexbox, position:fixed, object-fit, fontes etc).
    """
    import traceback as _tb
    from urllib.parse import quote

    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', filename).strip() or 'documento'
    encoded_filename = quote(f"{safe}.pdf")

    try:
        pdf_bytes = _render_pdf_with_chromium(html)
    except ModuleNotFoundError as e:
        print("[render-pdf] Dependência ausente:", repr(e))
        _tb.print_exc()
        raise HTTPException(
            status_code=500,
            detail=(
                f"Dependência ausente no servidor: {e.name}. "
                "Execute: pip install -r requirements.txt && python -m playwright install chromium"
            ),
        )
    except Exception as e:
        print("[render-pdf] Falha ao gerar PDF (Playwright):", repr(e))
        _tb.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Falha ao gerar PDF (Chromium): {type(e).__name__}: {e}",
        )

    if not pdf_bytes:
        print("[render-pdf] Chromium retornou buffer vazio")
        raise HTTPException(status_code=500, detail="PDF vazio após renderização")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}",
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@app.post("/api/docs/upload")
def upload_admin_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    background_tasks: BackgroundTasks = None,
    admin_user=Depends(require_pdf_manager),
):
    try:
        filename = unique_pdf_filename(file.filename)
        dest_path = DATA_DIR / filename
        original_path = RAW_UPLOADS_DIR / filename
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(RAW_UPLOADS_DIR, exist_ok=True)

        with open(dest_path, 'wb') as out:
            shutil.copyfileobj(file.file, out)
        file.file.seek(0)
        with open(original_path, 'wb') as out:
            shutil.copyfileobj(file.file, out)
        os.makedirs(PROCESSED_UPLOADS_DIR, exist_ok=True)
        process_document_template(dest_path, PROCESSED_UPLOADS_DIR / filename)

        meta = load_docs_metadata()
        meta[filename] = {"active": True, "title": title or Path(filename).stem, "description": description or ""}
        save_docs_metadata(meta)
        document = register_saved_document(
            filename=filename,
            original_name=file.filename,
            file_path=dest_path,
            title=title,
            description=description,
            uploaded_by=admin_user["id"],
            status="aprovado",
            raw_filename=filename,
            processed_filename=filename,
            approved_by=admin_user["id"],
        )
        database.registrar_evento_documento(document["id"], "inserido", "aprovado", "PDF adicionado em Gerenciamento de PDFs.", admin_user["id"])
        database.registrar_evento_documento(document["id"], "aprovado", "aprovado", "Documento entrou aprovado diretamente na base.", admin_user["id"])

        if background_tasks is not None:
            background_tasks.add_task(rebuild_index, file_paths=[str(dest_path)])
        else:
            rebuild_index(file_paths=[str(dest_path)])

        return {"message": "PDF enviado com sucesso", "document": document}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Não foi possível enviar o PDF")


@app.put("/api/docs/{filename}")
def update_document(filename: str, request: DocumentUpdateRequest, background_tasks: BackgroundTasks = None, admin_user=Depends(require_pdf_manager)):
    safe_filename, _ = resolve_data_file(filename)
    result = database.atualizar_documento(
        filename=safe_filename,
        title=request.title or Path(safe_filename).stem,
        description=request.description or "",
        active=request.active,
    )
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])
    database.registrar_evento_documento(result["document"]["id"], "editado", result["document"].get("status"), "Metadados do PDF atualizados.", admin_user["id"])

    meta = load_docs_metadata()
    meta[safe_filename] = {
        "active": request.active,
        "title": request.title or Path(safe_filename).stem,
        "description": request.description or "",
    }
    save_docs_metadata(meta)

    if background_tasks is not None:
        background_tasks.add_task(rebuild_index)
    else:
        rebuild_index()

    return result


@app.post("/api/docs/reindex")
def reindex_all_documents(background_tasks: BackgroundTasks = None, admin_user=Depends(require_admin)):
    """Reconstrói a base vetorial usando somente PDFs ativos."""
    if background_tasks is not None:
        background_tasks.add_task(rebuild_index)
        return {"status": "scheduled"}

    rebuild_index()
    return {"status": "reindexed"}


@app.post("/api/docs/{filename}/reindex")
def reindex_file(filename: str, background_tasks: BackgroundTasks = None, admin_user=Depends(require_admin)):
    safe_filename, file_path = resolve_data_file(filename)
    try:
        if background_tasks is not None:
            background_tasks.add_task(rebuild_index, file_paths=[str(file_path)])
            return {"status": "scheduled", "file": safe_filename}

        rebuild_index(file_paths=[str(file_path)])
        return {"status": "reindexed", "file": safe_filename}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Erro ao reindexar")


@app.post("/api/docs/{filename}/toggle")
def toggle_file(filename: str, background_tasks: BackgroundTasks = None, admin_user=Depends(require_pdf_manager)):
    safe_filename, _ = resolve_data_file(filename)
    result = database.alternar_documento(safe_filename)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])

    document = result["document"]
    database.registrar_evento_documento(
        document["id"],
        "ativado" if document["active"] else "inativado",
        document.get("status"),
        "PDF ativado na base da IA." if document["active"] else "PDF inativado na base da IA.",
        admin_user["id"],
    )
    meta = load_docs_metadata()
    meta[safe_filename] = {
        "active": document["active"],
        "title": document["title"],
        "description": document["description"],
    }
    save_docs_metadata(meta)

    try:
        if background_tasks is not None:
            background_tasks.add_task(rebuild_index)
        else:
            rebuild_index()
        return {"file": safe_filename, "active": document["active"], "document": document}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Erro ao alternar arquivo")


@app.delete("/api/docs/{filename}")
def delete_file(filename: str, background_tasks: BackgroundTasks = None, admin_user=Depends(require_pdf_manager)):
    try:
        safe_filename, file_path = resolve_data_file(filename)
    except HTTPException:
        safe_filename, file_path = resolve_pending_file(filename)
        
    try:
        doc = database.obter_documento(safe_filename)
        if doc:
            database.registrar_evento_documento(doc["id"], "excluido", doc.get("status"), "PDF removido de Gerenciamento de PDFs.", admin_user["id"])
        file_path.unlink()
        database.deletar_documento(safe_filename)
        meta = load_docs_metadata()
        if safe_filename in meta:
            del meta[safe_filename]
            save_docs_metadata(meta)
        if background_tasks is not None:
            background_tasks.add_task(rebuild_index)
        else:
            rebuild_index()
        return {"status": "deleted", "file": safe_filename}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Erro ao deletar arquivo")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
