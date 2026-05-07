"""
document_routes.py
Rotas da API para o módulo de Padronização e Geração de Documentos.

Endpoints:
- GET  /api/documents/templates       → Lista templates disponíveis
- GET  /api/documents/templates/{id}  → Retorna código LaTeX de um template
- POST /api/documents/compile         → Compila LaTeX e retorna PDF
- GET  /api/documents/tectonic-status → Verifica se Tectonic está instalado
"""

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from latex_compiler import compilar_latex, LatexCompilationError, verificar_tectonic

# ==========================================
# CONFIGURAÇÃO
# ==========================================
router = APIRouter(prefix="/api/documents", tags=["Documentos"])

import json
import uuid
import shutil

# Diretório onde ficam os templates .tex e o json
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
TEMPLATES_JSON_PATH = TEMPLATES_DIR / "templates.json"

def carregar_templates():
    if TEMPLATES_JSON_PATH.exists():
        with open(TEMPLATES_JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def salvar_templates(catalogo):
    with open(TEMPLATES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(catalogo, f, ensure_ascii=False, indent=4)

TEMPLATE_CATALOG = carregar_templates()


# ==========================================
# MODELOS (Pydantic)
# ==========================================
class CompileRequest(BaseModel):
    latex_code: str


class TemplateInfo(BaseModel):
    id: str
    nome: str
    descricao: str

class TemplateRenameRequest(BaseModel):
    nome: str
    
class TemplateCreateRequest(BaseModel):
    nome: str
    descricao: str = "Novo Modelo"



# ==========================================
# ENDPOINTS
# ==========================================

@router.get("/templates")
def listar_templates() -> list[dict]:
    """Retorna a lista de todos os templates disponíveis."""
    catalogo = carregar_templates()
    return [
        {
            "id": t["id"],
            "nome": t["nome"],
            "descricao": t["descricao"],
        }
        for t in catalogo.values()
    ]


@router.get("/templates/{template_id}")
def obter_template(template_id: str) -> dict:
    """Retorna o código LaTeX de um template específico."""
    catalogo = carregar_templates()
    if template_id not in catalogo:
        raise HTTPException(
            status_code=404,
            detail=f"Template '{template_id}' não encontrado. "
        )
    
    template_info = catalogo[template_id]
    arquivo_path = TEMPLATES_DIR / template_info["arquivo"]
    
    if not arquivo_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Arquivo do template '{template_id}' não encontrado no servidor."
        )
    
    codigo_latex = arquivo_path.read_text(encoding="utf-8")
    
    return {
        **template_info,
        "latex_code": codigo_latex
    }

@router.post("/templates")
def criar_template(request: TemplateCreateRequest):
    catalogo = carregar_templates()
    novo_id = str(uuid.uuid4())
    arquivo_nome = f"{novo_id}.tex"
    
    novo_template = {
        "id": novo_id,
        "nome": request.nome,
        "descricao": request.descricao,
        "arquivo": arquivo_nome,
        "variaveis": []
    }
    
    conteudo_base = r"""\documentclass[12pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[brazil]{babel}
\usepackage[left=3cm,right=2cm,top=3cm,bottom=2cm]{geometry}

\begin{document}
\begin{center}
    {\LARGE \textbf{Novo Documento}}
\end{center}

Insira o conteúdo do seu modelo aqui.

\end{document}
"""
    (TEMPLATES_DIR / arquivo_nome).write_text(conteudo_base, encoding="utf-8")
    
    catalogo[novo_id] = novo_template
    salvar_templates(catalogo)
    
    return novo_template

@router.post("/templates/{template_id}/copy")
def copiar_template(template_id: str):
    catalogo = carregar_templates()
    if template_id not in catalogo:
        raise HTTPException(status_code=404, detail="Template não encontrado")
        
    origem = catalogo[template_id]
    novo_id = str(uuid.uuid4())
    arquivo_nome = f"{novo_id}.tex"
    
    novo_template = {
        "id": novo_id,
        "nome": f"{origem['nome']} (Cópia)",
        "descricao": origem["descricao"],
        "arquivo": arquivo_nome,
        "variaveis": origem.get("variaveis", [])
    }
    
    shutil.copy(TEMPLATES_DIR / origem["arquivo"], TEMPLATES_DIR / arquivo_nome)
    
    catalogo[novo_id] = novo_template
    salvar_templates(catalogo)
    
    return novo_template

@router.put("/templates/{template_id}")
def renomear_template(template_id: str, request: TemplateRenameRequest):
    catalogo = carregar_templates()
    if template_id not in catalogo:
        raise HTTPException(status_code=404, detail="Template não encontrado")
        
    catalogo[template_id]["nome"] = request.nome
    salvar_templates(catalogo)
    
    return catalogo[template_id]

@router.delete("/templates/{template_id}")
def deletar_template(template_id: str):
    catalogo = carregar_templates()
    if template_id not in catalogo:
        raise HTTPException(status_code=404, detail="Template não encontrado")
        
    # Remove o arquivo .tex
    arquivo_nome = catalogo[template_id]["arquivo"]
    arquivo_path = TEMPLATES_DIR / arquivo_nome
    if arquivo_path.exists():
        arquivo_path.unlink()
        
    del catalogo[template_id]
    salvar_templates(catalogo)
    
    return {"status": "sucesso"}




@router.post("/compile")
def compilar_documento(request: CompileRequest):
    """
    Recebe código LaTeX, compila para PDF e retorna o arquivo.
    
    O PDF é retornado como application/pdf com headers para
    visualização inline (não força download).
    """
    if not request.latex_code.strip():
        raise HTTPException(
            status_code=400,
            detail="O código LaTeX não pode estar vazio."
        )
    
    try:
        pdf_bytes = compilar_latex(request.latex_code)
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": "inline; filename=documento.pdf",
                "Cache-Control": "no-cache",
            }
        )
    except LatexCompilationError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "message": e.message,
                "log": e.log
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro interno na compilação: {str(e)}"
        )


@router.get("/tectonic-status")
def status_tectonic():
    """Verifica se o Tectonic está instalado e disponível."""
    return verificar_tectonic()
