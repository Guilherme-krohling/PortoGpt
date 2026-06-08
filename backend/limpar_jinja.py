"""Limpeza dos arquivos residuais das pastas de upload.

Remove de raw_uploads/, pending_uploads/ e processed_uploads/ os arquivos que
não correspondem a nenhum documento registrado no banco. O HTML do Jinja em
processed_uploads/ (mesmo stem do PDF, sufixo .html) é considerado pertencente
ao documento cujo nome processado/original compartilha o stem.

Uso:
    python limpar_jinja.py            # mostra o que seria removido (dry-run)
    python limpar_jinja.py --apply    # remove de fato
"""
import sys
from pathlib import Path

import database
from main import PENDING_UPLOADS_DIR, PROCESSED_UPLOADS_DIR, RAW_UPLOADS_DIR


def _nomes_conhecidos():
    """Conjunto de nomes (e stems) de arquivos referenciados por algum documento."""
    nomes = set()
    stems = set()
    for doc in database.listar_documentos():
        for chave in ("filename", "raw_filename", "processed_filename"):
            nome = doc.get(chave)
            if nome:
                nomes.add(nome)
                stems.add(Path(nome).stem)
    return nomes, stems


def _residuais_em(pasta: Path, nomes, stems):
    if not pasta.exists():
        return []
    residuais = []
    for arquivo in pasta.iterdir():
        if not arquivo.is_file():
            continue
        # Um .html do Jinja pertence ao documento se o stem casar com algum conhecido.
        if arquivo.name in nomes or arquivo.stem in stems:
            continue
        residuais.append(arquivo)
    return residuais


def main():
    aplicar = "--apply" in sys.argv
    nomes, stems = _nomes_conhecidos()

    total = 0
    for pasta in (RAW_UPLOADS_DIR, PENDING_UPLOADS_DIR, PROCESSED_UPLOADS_DIR):
        residuais = _residuais_em(pasta, nomes, stems)
        if not residuais:
            continue
        print(f"\n{pasta.name}/ -> {len(residuais)} arquivo(s) residual(is):")
        for arquivo in residuais:
            print(f"  - {arquivo.name}")
            total += 1
            if aplicar:
                try:
                    arquivo.unlink()
                except OSError as exc:
                    print(f"    !! falha ao remover: {exc}")

    if total == 0:
        print("Nenhum arquivo residual encontrado.")
    elif aplicar:
        print(f"\n{total} arquivo(s) residual(is) removido(s).")
    else:
        print(f"\n{total} arquivo(s) residual(is) encontrado(s). Rode com --apply para remover.")


if __name__ == "__main__":
    main()
