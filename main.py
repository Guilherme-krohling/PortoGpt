import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Imports do LlamaIndex
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core import (
    SimpleDirectoryReader,
    VectorStoreIndex,
    Settings
)

# 1. Configuração Inicial da Aplicação
app = FastAPI(title="PortoGpt API")

# Variável global para guardar o "cérebro" da IA
query_engine = None

# 2. Definição dos Modelos de Dados (O que entra e o que sai)
class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    response: str

# 3. Função de Configuração (Roda apenas uma vez quando o servidor liga)
@app.on_event("startup")
def startup_event():
    global query_engine
    print("Inicializando PortoGpt API...")

    # Carregar variáveis de ambiente
    load_dotenv()
    api_key = os.getenv("secret_key")
    if not api_key:
        raise ValueError("A variável 'secret_key' não foi encontrada no .env")

    # Configurar Modelos (Chat + Embedding)
    print("Configurando modelos...")
    Settings.llm = Groq(model="llama-3.1-8b-instant", api_key=api_key)
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

    # Carregar e Indexar Documentos
    # (Nota: Na Fase 3, vamos mudar isso para carregar do disco em vez de ler a pasta toda vez)
    print("Indexando documentos da pasta 'data'...")
    if os.path.exists("data"):
        reader = SimpleDirectoryReader(input_dir="data")
        documents = reader.load_data()
        index = VectorStoreIndex.from_documents(documents)
        
        # Criar o motor de busca
        query_engine = index.as_query_engine()
        print("API pronta para uso!")
    else:
        print("AVISO: Pasta 'data' não encontrada. A API iniciou mas não responderá perguntas.")

# 4. O Endpoint (A "Porta" da API)
@app.post("/api/query", response_model=QueryResponse)
def query_endpoint(request: QueryRequest):
    global query_engine
    
    if query_engine is None:
        raise HTTPException(status_code=503, detail="O sistema não foi inicializado corretamente (verifique os logs).")
    
    try:
        # Realizar a consulta
        response = query_engine.query(request.query)
        return QueryResponse(response=str(response))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Para rodar (apenas se executar o arquivo diretamente)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)