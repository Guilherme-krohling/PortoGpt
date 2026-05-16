import fitz
from pathlib import Path
import re
import json
from llama_index.core.llms import LLM
from llama_index.core import Settings
from llama_index.llms.groq import Groq
import os
from dotenv import load_dotenv
import json
import re

DIR = Path(__file__).resolve().parent 

def extrair_json_seguro(texto_resposta):
    texto = texto_resposta.strip()
    
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        pass

    match = re.search(r'```(?:json)?\s*(.*?)\s*```', texto, re.DOTALL | re.IGNORECASE)
    if match:
        texto_limpo = match.group(1)
        try:
            return json.loads(texto_limpo)
        except json.JSONDecodeError as e:
            print(f"Aviso: Encontrou bloco de código, mas o JSON era inválido. Erro: {e}")

    inicio = texto.find('{')
    fim = texto.rfind('}')
    
    if inicio != -1 and fim != -1:
        texto_limpo = texto[inicio:fim+1]
        try:
            return json.loads(texto_limpo)
        except json.JSONDecodeError as e:
            print(f"Aviso: Tentou forçar chaves, mas falhou. Erro: {e}")
            
    raise ValueError("Não foi possível extrair um JSON válido da resposta da LLM.")

def extrair_imagem(bytes_img: bytes, bytes_mask:bytes, ext, block_n):
    img_dir = DIR / "img"
    img_path = img_dir / f"img_{block_n}.{ext}" 
    img_dir.mkdir(parents=True, exist_ok=True)
    
    if bytes_mask:
        base = fitz.Pixmap(fitz.csRGB, fitz.Pixmap(bytes_img))
        mask = fitz.Pixmap(fitz.Pixmap(bytes_mask))
        if base.alpha:
            base = fitz.Pixmap(base, 0) 
        if mask.alpha:
            mask = fitz.Pixmap(mask, 0)
        composed = fitz.Pixmap(base, mask)
        composed.save(str(img_path))
    else:
        with open(img_path, 'wb') as arq:
            arq.write(bytes_img)
        
    return img_path.as_uri()

def ordenar_blocks(blocks: list):
    blocks.sort(key=lambda block: block['position'][1])

def llm_processador(llm: LLM, page_n, raw_page):
    prompt = f"""Com base no conteúdo da página, retorne apenas um json válido com os seguintes dados:
        Variáveis esperadas:
     cabecalho:
       - nome_empresa: str      Nome da organização
       - subtitulo_empresa: str Subtítulo ou setor (opcional)
       - url_img: list          Diretório da imagem

     documento:
       - titulo: str            Título principal do documento (apenas na primeira página)
       - paragrafos: list       Lista de dicts {{titulo_2, titulo_3, paragrafo, url_img}}
       
     rodape:
       - url_img: list          Diretório da imagem
       - endereco: str          Endereço da organização
       - telefone: str          Telefone de contato
       - email: str             E-mail de contato
       - site: str              Site institucional

    REGRAS DE TRANSCRIÇÃO E ESTRUTURAÇÃO (CRÍTICO):
    1. PRESERVAÇÃO TOTAL DO TEXTO: Transcreva o conteúdo EXATAMENTE como fornecido. É terminantemente PROIBIDO 
    resumir, omitir, reescrever ou perder qualquer palavra do texto original. Tudo o que entra deve sair.
    2. DIVISÃO SEMÂNTICA INTELIGENTE: Embora não possa alterar as palavras, você TEM PERMISSÃO 
    E DEVE dividir um único bloco de texto em múltiplos itens distintos dentro da lista de 'paragrafos' sempre 
    que identificar uma mudança de assunto, quebra lógica ou transição semântica. 
    3. HIERARQUIA DE FONTES: Use a variável "font_size_max" de cada bloco como seu principal guia. 
    Textos com fontes maiores devem ser alocados nas chaves 'titulo_2' ou 'titulo_3'. 
    O restante do corpo do texto deve preencher a chave 'paragrafo'.

    REGRAS IMPORTANTES PARA IMAGENS:
    Os blocos já estão ordenados de cima para baixo.
    1. Se uma imagem aparecer no INÍCIO da lista, coloque a sua url em 'cabecalho'.
    2. Se uma imagem aparecer no MEIO da lista, crie um novo item na lista de 'paragrafos' contendo APENAS a 'url_img', deixando titulo_2, titulo_3 e paragrafo como nulos.
    3. Se uma imagem aparecer no FINAL da lista, coloque a sua url em 'rodape'.

    REGRAS DE FORMATAÇÃO:
    - NÃO invente dados. Se não encontrar retorne nulo.
    - NÃO explique. NÃO use markdown. NÃO use ```json.
    - NÃO escreva nenhum texto antes ou depois.

    Conteúdo página {page_n}: {raw_page}
    """
    return llm.complete(prompt)

def ler_doc(llm: LLM, filepath) -> list[dict]:
    doc = fitz.open(filepath)
    doc_content = []

    for i, pagina in enumerate(doc):
        blocks = []
        for bloco in pagina.get_text("dict")['blocks']:
            if bloco['type'] == 1:
                blocks.append({
                    "type": "image",
                    "image" : {
                        'extension' : bloco['ext'],
                        'url_img' : extrair_imagem(bloco['image'], bloco['mask'], bloco['ext'], bloco['number'])
                    },
                    'position' : bloco['bbox']
                })
            else:
                block_text = ""
                maior_fonte = 0
                
                for linha in bloco['lines']:
                    for span in linha['spans']:
                        block_text += span['text'] + " "
                        if span['size'] > maior_fonte:
                            maior_fonte = span['size']
                
                block_text = block_text.strip()
                
                if block_text:
                    blocks.append({
                        "type": "text",
                        "content": block_text,
                        "font_size_max": maior_fonte,
                        "position": bloco['bbox']
                    })
        ordenar_blocks(blocks)
        response = llm_processador(llm, i+1, blocks)
        page_content = extrair_json_seguro(response.text)
        doc_content.append(page_content)

    doc.close()
    return doc_content

if __name__ == "__main__":
    import processamento_template
    load_dotenv()
    api_key = os.getenv("secret_key")
    Settings.llm = Groq(model="llama-3.3-70b-versatile", api_key=api_key)
    doc_content = ler_doc(Settings.llm, DIR / "data" / "dispensadiadotrabalhador_editado.pdf")
    processamento_template.processar_template(doc_content)