import os
import sys
from pathlib import Path
import chromadb
from dotenv import load_dotenv
from tempfile import NamedTemporaryFile
import shutil
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, StorageContext, Settings
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

COLLECTION_NAME = "portogpt_collection"

def processar_documentos(documents):
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
    chroma_collection = buscar_collection(reset=True)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    # 5. Criar e SALVAR o Índice
    print("💾 Processando e salvando no ChromaDB (isso pode demorar)...")
    VectorStoreIndex.from_documents(
        documents, 
        storage_context=storage_context,
        show_progress=True
    )
    
    print("✅ Sucesso! Índice salvo na pasta './chroma_db'.")

def buscar_collection(reset=False):
    DB_DIR = Path(__file__).resolve().parent / "chroma_db"
    # Criar a pasta se não existir
    os.makedirs(DB_DIR, exist_ok=True)
    db_client = chromadb.PersistentClient(path=str(DB_DIR))
    if reset:
        try:
            db_client.delete_collection(COLLECTION_NAME)
            print("Coleção vetorial anterior removida.")
        except Exception:
            pass
    print(db_client.list_collections())
    return db_client.get_or_create_collection(COLLECTION_NAME)


def limpar_collection():
    DB_DIR = Path(__file__).resolve().parent / "chroma_db"
    os.makedirs(DB_DIR, exist_ok=True)
    db_client = chromadb.PersistentClient(path=str(DB_DIR))
    try:
        db_client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    db_client.get_or_create_collection(COLLECTION_NAME)
    print("Coleção vetorial limpa. Nenhum documento ativo foi indexado.")

def ler_diretorio(files=None, pasta=None):
    try:
        documents = SimpleDirectoryReader(input_files=files, input_dir=pasta).load_data()
        print(f"📄 Encontrados {len(documents)} fragmentos de documentos.")
        return documents
    except ValueError as e:
        raise Exception(f"Nenhum arquivo encontrado em {pasta}")
    
def upload_arquivo(file):
    with NamedTemporaryFile(suffix='.pdf', delete=False) as temp:
        shutil.copyfileobj(file, temp)
        path = temp.name
    try:
        processar_documentos(ler_diretorio(files=[path]))
    finally:
        os.unlink(path)


if __name__ == "__main__":
    print("📂 Lendo documentos da base ativa...")
    DIR = Path(__file__).resolve().parent / "data"
    if not os.path.exists(DIR):
        print("❌ Pasta 'data' não encontrada dentro de backend!")
        raise Exception

    args = [arg for arg in sys.argv[1:] if arg != "--empty"]
    if "--empty" in sys.argv:
        limpar_collection()
        sys.exit(0)

    if not args:
        try:
            import database

            database.init_db()
            database.sync_documents_from_disk(DIR)
            args = [str(DIR / doc["filename"]) for doc in database.listar_documentos() if doc.get("active")]
        except Exception as e:
            print(f"Não foi possível ler documentos ativos do SQLite: {e}")

    if not args:
        limpar_collection()
        sys.exit(0)

    documents = ler_diretorio(files=args)
    processar_documentos(documents)
