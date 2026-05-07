"""
chat_tools.py
Ferramentas (Function Calling) para o LlamaIndex usar no chat.

Define a tool 'gerar_documento' que o LLM pode invocar quando
o usuário pede para criar um documento oficial.
"""

from pathlib import Path
from llama_index.core.tools import FunctionTool

# Diretório dos templates
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

import json

# Diretório dos templates e do JSON
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
TEMPLATES_JSON_PATH = TEMPLATES_DIR / "templates.json"

def get_templates_disponiveis():
    if TEMPLATES_JSON_PATH.exists():
        with open(TEMPLATES_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def listar_modelos() -> str:
    """
    Retorna uma lista formatada em Markdown de todos os modelos de documentos disponíveis.
    O LLM deve usar esta ferramenta quando o usuário perguntar quais modelos existem ou pedir a lista.
    """
    templates = get_templates_disponiveis()
    if not templates:
        return "Nenhum modelo de documento disponível no momento."
    
    linhas = ["Aqui estão os modelos disponíveis:"]
    for t_id, info in templates.items():
        linhas.append(f"- [{info['nome']}](#modelo:{t_id}): {info['descricao']}")
    return "\n".join(linhas)



def gerar_documento(
    tipo_documento: str,
    destinatario: str = "",
    assunto: str = "",
    corpo_texto: str = "",
    remetente: str = "",
    cargo_remetente: str = "",
    numero_documento: str = "001/2026",
    cidade: str = "São Luís",
    data: str = ""
) -> str:
    """
    Gera o código LaTeX de um documento oficial da Autoridade Portuária.
    
    Use esta ferramenta APENAS quando o usuário pedir explicitamente para 
    criar, gerar ou redigir um documento oficial (ofício, relatório técnico 
    ou parecer).

    Args:
        tipo_documento: Tipo do documento. Valores possíveis: "oficio", "relatorio_tecnico", "parecer"
        destinatario: Nome ou cargo do destinatário do documento
        assunto: Assunto principal do documento
        corpo_texto: Texto principal/conteúdo do documento
        remetente: Nome de quem assina o documento
        cargo_remetente: Cargo do remetente
        numero_documento: Número identificador do documento (ex: "001/2026")
        cidade: Cidade de emissão (padrão: "São Luís")
        data: Data do documento (ex: "07 de maio de 2026")

    Returns:
        String com o código LaTeX completo do documento preenchido, pronto para compilação.
    """
    templates = get_templates_disponiveis()
    if tipo_documento not in templates:
        return (
            f"Tipo de documento '{tipo_documento}' não reconhecido. "
            f"Os tipos disponíveis são: {', '.join(templates.keys())}. "
            f"Por favor, especifique um tipo válido."
        )
    
    template_info = templates[tipo_documento]
    arquivo_path = TEMPLATES_DIR / template_info["arquivo"]
    
    if not arquivo_path.exists():
        return f"Erro: Template '{tipo_documento}' não encontrado no servidor."
    
    # Carrega o template base
    latex_code = arquivo_path.read_text(encoding="utf-8")
    
    # Substitui as variáveis de placeholder se o usuário forneceu valores
    substituicoes = {
        "{{CIDADE}}": cidade,
        "{{DATA}}": data,
        "{{NUMERO_OFICIO}}": numero_documento,
        "{{DESTINATARIO}}": destinatario,
        "{{ASSUNTO}}": assunto,
        "{{CORPO_TEXTO}}": corpo_texto,
        "{{REMETENTE}}": remetente,
        "{{CARGO}}": cargo_remetente,
    }
    
    for placeholder, valor in substituicoes.items():
        if valor:
            latex_code = latex_code.replace(placeholder, valor)
            
    # Cria uma cópia do modelo como novo template (Ajuste 4)
    import uuid
    novo_id = str(uuid.uuid4())
    novo_nome = f"{template_info['nome']} - Gerado ({numero_documento or data or 'Chat'})"
    novo_arquivo_nome = f"{novo_id}.tex"
    
    novo_template = {
        "id": novo_id,
        "nome": novo_nome,
        "descricao": f"Documento gerado pelo assistente a partir do modelo '{template_info['nome']}'.",
        "arquivo": novo_arquivo_nome,
        "variaveis": []
    }
    
    (TEMPLATES_DIR / novo_arquivo_nome).write_text(latex_code, encoding="utf-8")
    
    templates[novo_id] = novo_template
    with open(TEMPLATES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(templates, f, ensure_ascii=False, indent=4)
    
    # Retorna o código LaTeX com uma instrução para o frontend
    return (
        f"DOCUMENTO_LATEX_GERADO\n"
        f"Tipo: {template_info['nome']}\n"
        f"---LATEX_CODE_START---\n"
        f"{latex_code}\n"
        f"---LATEX_CODE_END---\n"
        f"\nO documento foi gerado com sucesso e salvo como um novo modelo ({novo_nome})! "
        f"Você será redirecionado para o editor de documentos para visualizar e editar o PDF."
    )


# Cria a FunctionTool do LlamaIndex
document_tool = FunctionTool.from_defaults(
    fn=gerar_documento,
    name="gerar_documento",
    description=(
        "Gera um documento oficial da Autoridade Portuária em formato LaTeX. "
        "Use quando o usuário pedir para criar, gerar, redigir ou elaborar um documento. "
        "Se o usuário quiser ver os modelos disponíveis primeiro, use listar_modelos."
    )
)

listar_tool = FunctionTool.from_defaults(
    fn=listar_modelos,
    name="listar_modelos",
    description=(
        "Lista todos os modelos de documentos disponíveis. "
        "Use quando o usuário perguntar quais modelos existem ou quiser escolher um."
    )
)


def get_document_tools() -> list:
    """Retorna a lista de tools de documento para o chat engine."""
    return [document_tool, listar_tool]

