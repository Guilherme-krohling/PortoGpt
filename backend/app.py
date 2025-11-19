# import os
# import sys
# from dotenv import load_dotenv
# from llama_index.llms.groq import Groq
# from llama_index.embeddings.huggingface import HuggingFaceEmbedding  # <--- ADICIONE ESTA LINHA
# from llama_index.core import (
#     SimpleDirectoryReader,
#     VectorStoreIndex,
#     Settings
# )

# # --- Configuração (Semelhante ao seu projeto antigo) ---

# def configurar_llm():
#     """Carrega a API key e configura o LLM (Groq) e o Embed Model."""
#     load_dotenv()
#     api_key = os.getenv("secret_key")
#     if not api_key:
#         print("Erro: A variável de ambiente 'secret_key' não foi encontrada.")
#         print("Por favor, crie um arquivo .env e adicione 'secret_key=SUA_CHAVE_AQUI'")
#         sys.exit(1)
        
#     # 1. Modelo de CHAT (Otimizado por você)
#     Settings.llm = Groq(model="llama-3.1-8b-instant", api_key=api_key)
    
#     # 2. Modelo de INDEXAÇÃO (A correção do erro)
#     Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
    
#     # Mensagem de sucesso atualizada
#     print("LLM (Groq) e Embed Model (HuggingFace) configurados com sucesso.")

# # --- Lógica de RAG (A Nova Parte) ---

# def carregar_e_indexar_documentos(pasta_dados="data"):
#     """
#     Carrega documentos PDF da pasta 'data' e cria um índice vetorial.
#     Este índice fica em memória RAM.
#     """
    
#     # 1. Verificar se a pasta 'data' existe
#     if not os.path.exists(pasta_dados):
#         print(f"Pasta '{pasta_dados}' não encontrada.")
#         print("Por favor, crie uma pasta chamada 'data' e coloque seus arquivos PDF nela.")
#         sys.exit(1)

#     print(f"Carregando documentos da pasta '{pasta_dados}'...")
    
#     # 2. Carregar os PDFs
#     # SimpleDirectoryReader sabe como usar o pypdf para ler os PDFs
#     reader = SimpleDirectoryReader(input_dir=pasta_dados)
#     documentos = reader.load_data()
    
#     if not documentos:
#         print(f"Nenhum documento encontrado em '{pasta_dados}'.")
#         sys.exit(1)
        
#     print(f"Carregado(s) {len(documentos)} documento(s).")
    
#     # 3. Criar o Índice
#     # Esta é a "mágica" do LlamaIndex.
#     # Ele automaticamente:
#     #   a. Quebra os documentos em "chunks" (pedaços).
#     #   b. Converte cada chunk em "embeddings" (vetores numéricos).
#     #   c. Armazena tudo em um índice vetorial na memória.
#     print("Criando índice vetorial (pode demorar um pouco)...")
#     index = VectorStoreIndex.from_documents(documentos)
    
#     print("Índice criado com sucesso.")
#     return index

# # --- Execução Principal ---

# def main():
#     configurar_llm()
#     index = carregar_e_indexar_documentos()
    
#     # 4. Criar o "Query Engine"
#     # Este é o objeto que você usará para fazer perguntas.
#     # É o substituto do seu "pipeline_consulta" complexo.
#     query_engine = index.as_query_engine(streaming=True)
    
#     print("\n" + "="*50)
#     print("🤖 Assistente de PDF pronto!")
#     print("Faça perguntas sobre os documentos na sua pasta 'data'.")
#     print("Digite 'sair' para terminar.")
#     print("="*50 + "\n")
    
#     # 5. Loop de Perguntas (Nosso "Frontend" de terminal)
#     while True:
#         pergunta = input("Sua pergunta: ")
        
#         if pergunta.lower() == 'sair':
#             print("Até logo!")
#             break
        
#         if not pergunta.strip():
#             continue
            
#         print("\nBuscando resposta...")
        
#         # 5. Fazer a pergunta
#         # O query_engine automaticamente:
#         #   a. Converte sua 'pergunta' em um vetor.
#         #   b. Busca os chunks de texto mais relevantes no índice.
#         #   c. Envia os chunks + sua pergunta para o LLM (Groq).
#         #   d. Retorna a resposta gerada.
#         resposta_streaming = query_engine.query(pergunta)
        
#         print("\nResposta:")
#         # Imprime a resposta em "streaming" (como o ChatGPT)
#         resposta_streaming.print_response_stream()
#         print("\n" + "-"*50 + "\n")

# if __name__ == "__main__":
#     main()