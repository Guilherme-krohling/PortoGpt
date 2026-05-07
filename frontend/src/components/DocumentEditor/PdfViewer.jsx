import { memo } from 'react';

/**
 * Visualizador de PDF usando iframe nativo do navegador.
 * 
 * Props:
 * - pdfUrl: URL blob do PDF para exibir
 * - compiling: boolean indicando se está compilando
 */
function PdfViewer({ pdfUrl, compiling }) {
  if (compiling) {
    return (
      <div className="pdf-placeholder">
        <div className="pdf-compiling">
          <div className="compile-spinner" />
          <p>Compilando documento...</p>
          <span>Isso pode levar alguns segundos na primeira vez</span>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="pdf-placeholder">
        <div className="pdf-empty">
          <div className="pdf-empty-icon">📄</div>
          <h3>Nenhum PDF gerado</h3>
          <p>Selecione um template e clique em <strong>"Recompilar"</strong> para gerar o PDF.</p>
          <div className="pdf-empty-steps">
            <div className="step">
              <span className="step-number">1</span>
              <span>Escolha um modelo no dropdown</span>
            </div>
            <div className="step">
              <span className="step-number">2</span>
              <span>Edite o código LaTeX</span>
            </div>
            <div className="step">
              <span className="step-number">3</span>
              <span>Clique em Recompilar</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <iframe
      className="pdf-iframe"
      src={pdfUrl}
      title="Visualização do PDF"
      width="100%"
      height="100%"
    />
  );
}

export default memo(PdfViewer);
