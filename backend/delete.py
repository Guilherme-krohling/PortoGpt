import sys
import ingest
if __name__ == "__main__":
    nome_arquivo = sys.argv[1]
    whereObj = {} if nome_arquivo is None else {'file_name': nome_arquivo}
    collection = ingest.buscar_collection()
    print(f"Deletando arquivo {nome_arquivo}" if nome_arquivo is not None else "Deletando todos arquivos")
    deleted = collection.delete(where=whereObj)
    print(f"{deleted['deleted']} itens deletados")