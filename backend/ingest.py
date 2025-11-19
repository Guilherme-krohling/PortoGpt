import os
import chromadb
from dotenv import load_dotenv
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, StorageContext, Settings
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

def processar_documentos():
    print("🚀 Iniciando ingestão de dados...")
    
    # 1. Carregar variáveis de ambiente
    load_dotenv()
    api_key = os.getenv("secret_key")
    if not api_key:
        print("Erro: secret_key não encontrada no .env")
        return

    # 2. Configurar Modelos (Igual ao main.py)
    Settings.llm = Groq(model="llama-3.1-8b-instant", api_key=api_key)
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

    # 3. Configurar o Banco de Dados (ChromaDB)
    # Ele vai criar uma pasta 'chroma_db' DENTRO da pasta backend
    print("⚙️ Configurando banco de dados...")
    db_client = chromadb.PersistentClient(path="./chroma_db")
    chroma_collection = db_client.get_or_create_collection("portogpt_collection")
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    # 4. Ler os Arquivos
    print("📂 Lendo documentos da pasta 'data'...")
    if not os.path.exists("data"):
        print("❌ Pasta 'data' não encontrada dentro de backend!")
        return

    documents = SimpleDirectoryReader("data").load_data()
    print(f"📄 Encontrados {len(documents)} fragmentos de documentos.")

    # 5. Criar e SALVAR o Índice
    print("💾 Processando e salvando no ChromaDB (isso pode demorar)...")
    VectorStoreIndex.from_documents(
        documents, 
        storage_context=storage_context,
        show_progress=True
    )
    
    print("✅ Sucesso! Índice salvo na pasta './chroma_db'.")

if __name__ == "__main__":
    processar_documentos()
