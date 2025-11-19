import os
import chromadb
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

# ==========================================
# PROMPTS E PERSONALIDADE (A Mágica acontece aqui)
# ==========================================
SYSTEM_PROMPT = """
Você é o PortoGpt, um consultor sênior especialista em análise de documentos portuários e técnicos.
Sua missão é ajudar colaboradores a encontrar informações precisas em documentos internos.

REGRAS DE COMPORTAMENTO:
1. **Seja Preciso:** Baseie suas respostas EXCLUSIVAMENTE no contexto fornecido.
2. **Não Alucine:** Se a informação não estiver no texto, NÃO invente.
3. **Seja Investigativo (MUITO IMPORTANTE):** - Se a pergunta do usuário for muito vaga (ex: "Qual o prazo?"), NÃO diga "não sei". 
   - Em vez disso, PERGUNTE DE VOLTA: "Para qual tipo de processo você gostaria de saber o prazo? (Ex: Licitação, Entrega, Pagamento?)".
   - Ajude o usuário a refinar a pergunta até que você encontre a resposta no contexto.
4. **Estilo:** Responda em Português do Brasil, de forma profissional, direta e educada.
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
    print("⚡ Inicializando PortoGpt API...")

    load_dotenv()
    api_key = os.getenv("secret_key")
    if not api_key:
        print("❌ ERRO: 'secret_key' não encontrada no .env")
        return

    # 1. Configurar Cérebro (LLM) e Leitor (Embeddings)
    Settings.llm = Groq(model="llama-3.3-70b-versatile", api_key=api_key)
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

    # 2. Conectar ao Banco de Dados (ChromaDB)
    if os.path.exists("./chroma_db"):
        print("💾 Carregando memória de longo prazo (ChromaDB)...")
        try:
            db_client = chromadb.PersistentClient(path="./chroma_db")
            chroma_collection = db_client.get_or_create_collection("portogpt_collection")
            vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
            
            index = VectorStoreIndex.from_vector_store(
                vector_store,
                embed_model=Settings.embed_model
            )
            
            # 3. Configurar Reranker (Filtro de Qualidade)
            reranker = SentenceTransformerRerank(model="cross-encoder/ms-marco-MiniLM-L-12-v2", top_n=3)

            # 4. Criar Motor de Chat
            chat_engine = index.as_chat_engine(
                chat_mode="context",
                similarity_top_k=10, # Busca ampla (10 trechos)
                node_postprocessors=[reranker], # Filtro fino (3 melhores)
                system_prompt=SYSTEM_PROMPT
            )
            
            print("✅ PortoGpt está ONLINE e pronto para responder.")
        except Exception as e:
            print(f"❌ Erro ao carregar banco de dados: {e}")
    else:
        print("⚠️ Banco de dados './chroma_db' não encontrado. O sistema não responderá perguntas.")

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
        return {"response": str(response)}
    except Exception as e:
        print(f"Erro na geração da resposta: {e}")
        raise HTTPException(status_code=500, detail="Ocorreu um erro interno ao processar sua pergunta.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)