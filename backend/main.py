import os
import re
import chromadb
import ingest
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Form, Header, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse, HTMLResponse
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
from typing import Optional
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


class CreateTemplateRequest(BaseModel):
    name: str
    html: str
    description: Optional[str] = None


class SaveHtmlRequest(BaseModel):
    html: str


class ApplyTemplateRequest(BaseModel):
    pdf_text: str


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


def resolve_template_file(filename: str):
    """Resolve com segurança o caminho de um arquivo dentro de templates/."""
    safe_filename = os.path.basename(filename)
    file_path = (TEMPLATES_DIR / safe_filename).resolve()
    templates_root = TEMPLATES_DIR.resolve()
    if not str(file_path).startswith(str(templates_root)) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return safe_filename, file_path


def register_saved_document(filename: str, original_name: str, file_path: Path, title=None, description=None, uploaded_by=None):
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
    background_tasks: BackgroundTasks = None,
    x_user_id: Optional[int] = Header(default=None, alias="X-User-Id"),
):
    try:
        # Segurança: sanitizar nome e evitar path traversal
        filename = os.path.basename(file.filename)
        dest_path = DATA_DIR / filename
        os.makedirs(DATA_DIR, exist_ok=True)
        # Salvar arquivo em data/
        with open(dest_path, 'wb') as out:
            shutil.copyfileobj(file.file, out)

        # Atualizar metadata
        meta = load_docs_metadata()
        meta[filename] = {"active": True}
        save_docs_metadata(meta)
        document = register_saved_document(filename, file.filename, dest_path, uploaded_by=x_user_id)

        # Reindex apenas o arquivo enviado — agendado em background para não bloquear
        try:
            if background_tasks is not None:
                background_tasks.add_task(rebuild_index, file_paths=[str(dest_path)])
            else:
                rebuild_index(file_paths=[str(dest_path)])
        except Exception as e:
            print('Erro ao agendar reindex:', e)

        return {"response": f"Upload de {filename} bem-sucedido!", "document": document}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Não foi possível fazer o upload do arquivo")


@app.get("/api/docs")
def list_docs():
    """Lista arquivos na pasta data com metadados do SQLite."""
    database.sync_documents_from_disk(DATA_DIR, load_docs_metadata())
    return JSONResponse(content={"files": database.listar_documentos()})


@app.get("/api/templates")
def list_templates(admin_user=Depends(require_admin)):
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
    '    body { font-family: Arial, sans-serif; font-size: 12pt; color: #222; background: #fff; }\n'
    '    header { display: flex; align-items: center; padding: 18px 40px; border-bottom: 2px solid #0b4fd8; position: relative; }\n'
    '    .logo-ph { height: 48px; width: 80px; background: #dce9ff; color: #0b4fd8; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10pt; border-radius: 4px; flex-shrink: 0; }\n'
    '    .company { position: absolute; left: 0; right: 0; text-align: center; font-size: 18pt; font-weight: 700; color: #0b4fd8; pointer-events: none; }\n'
    '    .doc-title { text-align: center; padding: 28px 40px 12px; font-size: 16pt; font-weight: 700; }\n'
    '    main { padding: 0 40px 40px; }\n'
    '    .field { margin-bottom: 22px; }\n'
    '    .field-label { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #0b4fd8; margin-bottom: 6px; }\n'
    '    .field-value { font-size: 11pt; color: #333; line-height: 1.6; }\n'
    '    footer { display: flex; align-items: center; justify-content: space-between; padding: 12px 40px; border-top: 1px solid #ddd; }\n'
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
def preview_template(filename: str, admin_user=Depends(require_admin)):
    """Renderiza o template com valores de exemplo e retorna o HTML resultante."""
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
def apply_template(filename: str, request: ApplyTemplateRequest, admin_user=Depends(require_admin)):
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

    # Monta prompt para o LLM extrair os campos do texto do PDF
    fields_list = "\n".join(f"- {v}" for v in variables)
    prompt = f"""Você receberá o texto extraído de um PDF e uma lista de campos de template.
Sua tarefa é extrair os valores correspondentes do texto e retornar um JSON com esses campos preenchidos.
Retorne APENAS o JSON, sem explicações adicionais.

CAMPOS DO TEMPLATE:
{fields_list}

TEXTO DO PDF:
{request.pdf_text[:6000]}

Retorne um JSON com os campos acima preenchidos com os valores encontrados no texto.
Se um campo não for encontrado, use uma string vazia.
"""

    api_key = os.getenv("secret_key")
    if not api_key:
        raise HTTPException(status_code=500, detail="Chave de API não configurada")

    try:
        groq_client = GroqDirect(api_key=api_key)
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        extracted = json.loads(response.choices[0].message.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao extrair campos com IA: {e}")

    # Adiciona valores reservados de paginação
    extracted.setdefault("page_number", "1")
    extracted.setdefault("total_pages", "1")
    extracted.setdefault("logo_url", "")

    try:
        env = Environment(loader=BaseLoader())
        tmpl = env.from_string(source)
        rendered = tmpl.render(**extracted)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao renderizar template: {e}")

    return {"html": rendered, "fields": extracted}


@app.post("/api/docs/upload")
def upload_admin_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    background_tasks: BackgroundTasks = None,
    admin_user=Depends(require_admin),
):
    try:
        filename = os.path.basename(file.filename)
        dest_path = DATA_DIR / filename
        os.makedirs(DATA_DIR, exist_ok=True)

        with open(dest_path, 'wb') as out:
            shutil.copyfileobj(file.file, out)

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
        )

        if background_tasks is not None:
            background_tasks.add_task(rebuild_index, file_paths=[str(dest_path)])
        else:
            rebuild_index(file_paths=[str(dest_path)])

        return {"message": "PDF enviado com sucesso", "document": document}
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Não foi possível enviar o PDF")


@app.put("/api/docs/{filename}")
def update_document(filename: str, request: DocumentUpdateRequest, background_tasks: BackgroundTasks = None, admin_user=Depends(require_admin)):
    safe_filename, _ = resolve_data_file(filename)
    result = database.atualizar_documento(
        filename=safe_filename,
        title=request.title or Path(safe_filename).stem,
        description=request.description or "",
        active=request.active,
    )
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])

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
def toggle_file(filename: str, background_tasks: BackgroundTasks = None, admin_user=Depends(require_admin)):
    safe_filename, _ = resolve_data_file(filename)
    result = database.alternar_documento(safe_filename)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])

    document = result["document"]
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
def delete_file(filename: str, background_tasks: BackgroundTasks = None, admin_user=Depends(require_admin)):
    safe_filename, file_path = resolve_data_file(filename)
    try:
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
