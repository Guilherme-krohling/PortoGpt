import { useState, useCallback, useRef } from 'react';

const API_URL = 'http://localhost:8000/api';

/**
 * Hook para gerenciar toda a comunicação com o módulo de documentos.
 */
export function useDocumentApi() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const previousUrlRef = useRef(null);

  /**
   * Busca a lista de templates disponíveis no backend.
   */
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/documents/templates`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setTemplates(data);
      return data;
    } catch (err) {
      setError('Não foi possível carregar os templates.');
      console.error(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Busca o código LaTeX de um template específico.
   */
  const fetchTemplateCode = useCallback(async (templateId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/documents/templates/${templateId}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      return data.latex_code;
    } catch (err) {
      setError(`Não foi possível carregar o template "${templateId}".`);
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Envia código LaTeX para compilação e atualiza o PDF viewer.
   */
  const compileLatex = useCallback(async (latexCode) => {
    setCompiling(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/documents/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latex_code: latexCode }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        const detail = errorData.detail;
        throw new Error(
          typeof detail === 'object'
            ? `${detail.message}\n\nLog: ${detail.log}`
            : detail
        );
      }

      const blob = await res.blob();

      // Revoga a URL anterior para evitar vazamento de memória
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      previousUrlRef.current = url;
      setPdfUrl(url);
      return url;
    } catch (err) {
      setError(err.message || 'Erro na compilação do LaTeX.');
      console.error(err);
      return null;
    } finally {
      setCompiling(false);
    }
  }, []);

  /**
   * Faz download do PDF atual.
   */
  const downloadPdf = useCallback(() => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = 'documento_portogpt.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [pdfUrl]);

  /**
   * Verifica se o Tectonic está instalado.
   */
  const checkTectonic = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/documents/tectonic-status`);
      return await res.json();
    } catch {
      return { instalado: false, erro: 'Backend offline' };
    }
  }, []);

  /**
   * Cria um novo template vazio.
   */
  const createTemplate = useCallback(async (nome) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/documents/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, descricao: "Novo Modelo" }),
      });
      if (!res.ok) throw new Error('Erro ao criar modelo');
      await fetchTemplates();
      return await res.json();
    } catch (err) {
      setError('Não foi possível criar o modelo.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  /**
   * Copia um template existente.
   */
  const copyTemplate = useCallback(async (templateId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/documents/templates/${templateId}/copy`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Erro ao copiar modelo');
      await fetchTemplates();
      return await res.json();
    } catch (err) {
      setError('Não foi possível copiar o modelo.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  /**
   * Renomeia um template existente.
   */
  const renameTemplate = useCallback(async (templateId, novoNome) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/documents/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome }),
      });
      if (!res.ok) throw new Error('Erro ao renomear modelo');
      await fetchTemplates();
      return await res.json();
    } catch (err) {
      setError('Não foi possível renomear o modelo.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  /**
   * Deleta um template existente.
   */
  const deleteTemplate = useCallback(async (templateId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/documents/templates/${templateId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Erro ao deletar modelo');
      await fetchTemplates();
      return true;
    } catch (err) {
      setError('Não foi possível deletar o modelo.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    compiling,
    error,
    pdfUrl,
    fetchTemplates,
    fetchTemplateCode,
    compileLatex,
    downloadPdf,
    checkTectonic,
    createTemplate,
    copyTemplate,
    renameTemplate,
    deleteTemplate,
    setError,
    setPdfUrl,
  };
}
