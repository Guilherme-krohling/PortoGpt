import { useState, useEffect, useCallback } from 'react';
import Split from 'react-split';
import LatexEditor from './LatexEditor';
import PdfViewer from './PdfViewer';
import TemplateSelector from './TemplateSelector';
import { useDocumentApi } from '../../hooks/useDocumentApi';
import './DocumentEditor.css';

// Código LaTeX padrão quando nenhum template está selecionado
const DEFAULT_LATEX = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazil]{babel}
\\usepackage[left=3cm,right=2cm,top=3cm,bottom=2cm]{geometry}

\\begin{document}

\\begin{center}
  {\\LARGE \\textbf{Bem-vindo ao Editor de Documentos}}\\\\[0.5cm]
  {\\large PortoGpt — Padronização de Documentos}
\\end{center}

\\vspace{1cm}

Selecione um \\textbf{modelo} no dropdown acima para começar, ou edite este código LaTeX livremente.

Depois, clique em \\textbf{Recompilar} para gerar o PDF.

\\end{document}
`;

/**
 * Componente principal do editor de documentos.
 * Layout de 2 painéis: Editor LaTeX à esquerda, PDF à direita.
 * 
 * Props:
 * - onBack: callback para voltar à tela de chat
 * - initialLatex: código LaTeX inicial (vindo do chat via IA)
 */
function DocumentEditor({ onBack, initialLatex }) {
  const [latexCode, setLatexCode] = useState(initialLatex || DEFAULT_LATEX);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const {
    templates,
    compiling,
    error,
    pdfUrl,
    fetchTemplates,
    fetchTemplateCode,
    compileLatex,
    downloadPdf,
    createTemplate,
    copyTemplate,
    renameTemplate,
    deleteTemplate,
    setError,
  } = useDocumentApi();


  // Carrega a lista de templates ao montar
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Se recebe LaTeX inicial (do chat), compila automaticamente
  useEffect(() => {
    if (initialLatex) {
      setLatexCode(initialLatex);
      compileLatex(initialLatex);
    }
  }, [initialLatex]);

  // Handler para mudança de template
  const handleTemplateChange = useCallback(async (templateId) => {
    setSelectedTemplate(templateId);
    setError(null);

    const code = await fetchTemplateCode(templateId);
    if (code) {
      setLatexCode(code);
    }
  }, [fetchTemplateCode, setError]);

  // Handler para compilação
  const handleCompile = useCallback(() => {
    if (!latexCode.trim()) {
      setError('O código LaTeX não pode estar vazio.');
      return;
    }
    compileLatex(latexCode);
  }, [latexCode, compileLatex, setError]);

  // Atalho Ctrl+S para recompilar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCompile]);

  const handleCreate = async (nome) => {
    const novoTemplate = await createTemplate(nome);
    if (novoTemplate) {
      setSelectedTemplate(novoTemplate.id);
      setLatexCode(await fetchTemplateCode(novoTemplate.id) || '');
    }
  };

  const handleCopy = async (id) => {
    const novoTemplate = await copyTemplate(id);
    if (novoTemplate) {
      setSelectedTemplate(novoTemplate.id);
      setLatexCode(await fetchTemplateCode(novoTemplate.id) || '');
    }
  };

  const handleRename = async (id, novoNome) => {
    await renameTemplate(id, novoNome);
  };

  const handleDelete = async (id) => {
    const success = await deleteTemplate(id);
    if (success) {
      setSelectedTemplate('');
      setLatexCode(DEFAULT_LATEX);
    }
  };

  return (
    <div className="document-editor">
      {/* Barra de navegação superior */}
      <header className="doc-header">
        <div className="doc-header-left">
          <button className="doc-back-btn" onClick={onBack} title="Voltar ao Chat">
            <i className="fa-solid fa-arrow-left"></i>
            <span>Voltar ao Chat</span>
          </button>
          <div className="doc-title">
            <img src="/logo.png" alt="Logo" className="doc-logo" />
            <span>Editor de Documentos</span>
          </div>
        </div>
        <div className="doc-header-right">
          <div className="doc-status">
            {compiling && <span className="status-compiling">⏳ Compilando...</span>}
            {error && <span className="status-error" title={error}>⚠️ Erro</span>}
            {pdfUrl && !compiling && !error && <span className="status-ok">✅ PDF pronto</span>}
          </div>
        </div>
      </header>

      {/* Alerta de erro */}
      {error && (
        <div className="doc-error-bar">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <span>{error}</span>
          <button className="error-dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Painéis de conteúdo */}
      <div className="doc-body">
        <Split
          className="doc-split"
          sizes={[50, 50]}
          minSize={300}
          gutterSize={6}
          direction="horizontal"
          cursor="col-resize"
        >
          {/* Painel Esquerdo: Editor LaTeX */}
          <div className="doc-panel editor-panel">
            <div className="panel-toolbar">
              <TemplateSelector
                templates={templates}
                selectedId={selectedTemplate}
                onChange={handleTemplateChange}
                onCreate={handleCreate}
                onCopy={handleCopy}
                onRename={handleRename}
                onDelete={handleDelete}
                disabled={compiling}
              />
            </div>
            <div className="panel-content">
              <LatexEditor
                value={latexCode}
                onChange={(value) => setLatexCode(value || '')}
                readOnly={compiling}
              />
            </div>
          </div>

          {/* Painel Direito: Visualização do PDF */}
          <div className="doc-panel preview-panel">
            <div className="panel-toolbar">
              <div className="preview-controls">
                <button
                  className="btn-compile"
                  onClick={handleCompile}
                  disabled={compiling || !latexCode.trim()}
                  title="Compilar LaTeX (Ctrl+S)"
                >
                  <i className={`fa-solid ${compiling ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
                  <span>{compiling ? 'Compilando...' : 'Recompilar'}</span>
                </button>
                <button
                  className="btn-download"
                  onClick={downloadPdf}
                  disabled={!pdfUrl || compiling}
                  title="Baixar o PDF gerado"
                >
                  <i className="fa-solid fa-download"></i>
                  <span>Baixar PDF</span>
                </button>
              </div>
            </div>
            <div className="panel-content">
              <PdfViewer pdfUrl={pdfUrl} compiling={compiling} />
            </div>
          </div>
        </Split>
      </div>
    </div>
  );
}

export default DocumentEditor;
