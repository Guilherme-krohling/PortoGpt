"""
latex_compiler.py
Módulo responsável por compilar código LaTeX em PDF usando Tectonic.

Tectonic é um motor LaTeX standalone que:
- Não requer instalação do TeX Live completo
- Baixa pacotes sob demanda e os cacheia
- Produz PDFs completos a partir de código LaTeX puro
"""

import subprocess
import tempfile
import os
import shutil
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent / "assets"

class LatexCompilationError(Exception):
    """Exceção customizada para erros de compilação LaTeX."""
    def __init__(self, message: str, log: str = ""):
        self.message = message
        self.log = log
        super().__init__(self.message)


def compilar_latex(codigo_latex: str) -> bytes:
    """
    Recebe uma string com código LaTeX, compila para PDF usando Tectonic
    e retorna os bytes do PDF resultante.
    """
    # Cria um diretório temporário para a compilação
    with tempfile.TemporaryDirectory(prefix="portogpt_latex_") as tmpdir:
        # Copia as imagens/arquivos estáticos da pasta assets para o tmpdir, se existir
        if ASSETS_DIR.exists():
            shutil.copytree(ASSETS_DIR, tmpdir, dirs_exist_ok=True)
            
        # Escreve o código LaTeX em um arquivo .tex
        tex_path = Path(tmpdir) / "documento.tex"
        pdf_path = Path(tmpdir) / "documento.pdf"
        
        tex_path.write_text(codigo_latex, encoding="utf-8")
        
        try:
            # Executa o Tectonic para compilar
            result = subprocess.run(
                ["tectonic", str(tex_path), "--outdir", tmpdir],
                capture_output=True,
                text=True,
                timeout=120,  # 2 minutos de timeout
                cwd=tmpdir
            )
            
            if result.returncode != 0:
                raise LatexCompilationError(
                    message="Erro na compilação do LaTeX.",
                    log=result.stderr or result.stdout
                )
            
            # Verifica se o PDF foi gerado
            if not pdf_path.exists():
                raise LatexCompilationError(
                    message="PDF não foi gerado após a compilação.",
                    log=result.stdout
                )
            
            # Lê e retorna os bytes do PDF
            return pdf_path.read_bytes()
            
        except FileNotFoundError:
            raise LatexCompilationError(
                message=(
                    "Tectonic não está instalado ou não foi encontrado no PATH. "
                    "Instale com: winget install tectonic-typesetting.tectonic "
                    "ou baixe em https://tectonic-typesetting.github.io"
                )
            )
        except subprocess.TimeoutExpired:
            raise LatexCompilationError(
                message="A compilação excedeu o tempo limite de 120 segundos."
            )


def verificar_tectonic() -> dict:
    """
    Verifica se o Tectonic está instalado e retorna informações sobre ele.
    
    Returns:
        dict com status e versão do Tectonic.
    """
    try:
        result = subprocess.run(
            ["tectonic", "--version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        return {
            "instalado": True,
            "versao": result.stdout.strip(),
        }
    except FileNotFoundError:
        return {
            "instalado": False,
            "versao": None,
        }
    except Exception as e:
        return {
            "instalado": False,
            "versao": None,
            "erro": str(e)
        }
