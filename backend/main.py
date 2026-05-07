import os
import chromadb
import ingest
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Imports do LlamaIndex e Rerank
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import VectorStoreIndex, Settings
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.core.postprocessor import SentenceTransformerRerank

# Imports do módulo de documentos
from document_routes import router as document_router

# Import opcional: ferramentas de Function Calling (pode falhar se LlamaIndex não estiver instalado)
try:
    from chat_tools import get_document_tools
except ImportError:
    print("⚠️ chat_tools não carregado (LlamaIndex tools indisponível)")
    def get_document_tools():
        return []

# ==========================================
# CONFIGURAÇÕES GERAIS
# ==========================================
app = FastAPI(title="PortoGpt API", version="2.0")

# Configuração de CORS (Para o Frontend acessar)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registra as rotas do módulo de documentos
app.include_router(document_router)

# Variável global para o motor de chat
chat_engine = None

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

FERRAMENTA DE DOCUMENTOS:
- Se o usuário perguntar quais modelos estão disponíveis, use 'listar_modelos'.
- Quando o usuário pedir para CRIAR, GERAR, REDIGIR ou ELABORAR um documento oficial
  (ofício, relatório técnico ou parecer), use a ferramenta 'gerar_documento'.
- Identifique no pedido: tipo_documento, destinatario, assunto, corpo_texto, remetente, cargo.
- Se o usuário não especificar o tipo de documento, pergunte a ele ou mostre a lista com 'listar_modelos'.
- Se informações importantes estiverem faltando (como destinatário ou assunto), 
  PERGUNTE ao usuário antes de gerar o documento.
- Sempre que for exibir a lista de modelos (ou através de listar_modelos), 
  os itens estarão formatados como links: [Nome do Modelo](#modelo:id). 
  Isso permite que o usuário clique e acione a geração automaticamente na interface.

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

# ==========================================
# INICIALIZAÇÃO (Startup)
# ==========================================
@app.on_event("startup")
def startup_event():
    global chat_engine
    print("[INIT] Inicializando PortoGpt API v2.0...")

    load_dotenv()
    api_key = os.getenv("secret_key")
    if not api_key:
        print("[ERRO] 'secret_key' nao encontrada no .env")
        return

    # 1. Configurar Cérebro (LLM) e Leitor (Embeddings)
    Settings.llm = Groq(model="llama-3.3-70b-versatile", api_key=api_key)
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

    # 2. Conectar ao Banco de Dados (ChromaDB)
    print("[DB] Carregando memoria de longo prazo (ChromaDB)...")
    try:
        chroma_collection = ingest.buscar_collection()
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        
        index = VectorStoreIndex.from_vector_store(
            vector_store,
            embed_model=Settings.embed_model
        )
        
        # 3. Configurar Reranker (Filtro de Qualidade)
        reranker = SentenceTransformerRerank(model="cross-encoder/ms-marco-MiniLM-L-12-v2", top_n=3)

        # 4. Obter as ferramentas de documento para o Function Calling
        doc_tools = get_document_tools()
        print(f"[TOOLS] {len(doc_tools)} ferramenta(s) de documento carregada(s).")

        # 5. Criar Motor de Chat com suporte a Function Calling
        chat_engine = index.as_chat_engine(
            chat_mode="context",
            similarity_top_k=10, # Busca ampla (10 trechos)
            node_postprocessors=[reranker], # Filtro fino (3 melhores)
            system_prompt=SYSTEM_PROMPT
        )
        
        print("[OK] PortoGpt esta ONLINE e pronto para responder.")
        print("[DOC] Modulo de documentos ativo em /api/documents/")
    except FileNotFoundError as e:
        print("[AVISO] Banco de dados './chroma_db' nao encontrado. O sistema nao respondera perguntas.")
    except Exception as e:
        print(f"[ERRO] Erro ao carregar banco de dados: {e}")

# ==========================================
# ROTAS (Endpoints)
# ==========================================        
@app.post("/api/chat")
def chat_endpoint(request: QueryRequest):
    global chat_engine
    
    if chat_engine is None:
        raise HTTPException(status_code=503, detail="O sistema ainda está iniciando ou falhou. Verifique os logs.")
    
    try:
        # O chat_engine gerencia o histórico automaticamente
        response = chat_engine.chat(request.query)
        response_text = str(response)
        
        # Verifica se a resposta contém código LaTeX gerado
        has_latex = "---LATEX_CODE_START---" in response_text
        latex_code = None
        
        if has_latex:
            # Extrai o código LaTeX da resposta
            start = response_text.find("---LATEX_CODE_START---") + len("---LATEX_CODE_START---")
            end = response_text.find("---LATEX_CODE_END---")
            latex_code = response_text[start:end].strip()
            
            # Limpa a resposta para o chat (remove o bloco LaTeX bruto)
            clean_response = response_text[:response_text.find("DOCUMENTO_LATEX_GERADO")]
            clean_response += (
                "## ✅ Documento Gerado!\n\n"
                "O documento foi gerado com sucesso. "
                "Clique no botão abaixo para abrir o editor e visualizar o PDF.\n\n"
                "**Você pode editar livremente o código LaTeX e recompilar quantas vezes quiser.**"
            )
            response_text = clean_response
        
        return {
            "response": response_text,
            "has_document": has_latex,
            "latex_code": latex_code,
        }
    except Exception as e:
        print(f"Erro na geração da resposta: {e}")
        raise HTTPException(status_code=500, detail="Ocorreu um erro interno ao processar sua pergunta.")
    
@app.post("/api/upload")
def upload_endpoint(file: UploadFile):
    try:
        ingest.upload_arquivo(file.file)
        return {"response": f"Upload de {file.filename} bem-sucedido!"}
    except Exception as e:
        print(e)
        return {"response": "Não foi possível fazer o upload do arquivo"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)