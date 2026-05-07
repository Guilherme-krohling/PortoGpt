import { useEffect, useRef, memo } from 'react';
import Editor from '@monaco-editor/react';

/**
 * Wrapper para o Monaco Editor com syntax highlighting para LaTeX.
 * 
 * Props:
 * - value: string com o código LaTeX
 * - onChange: callback chamado a cada edição
 * - readOnly: boolean para modo somente leitura
 */
function LatexEditor({ value, onChange, readOnly = false }) {
  const editorRef = useRef(null);

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;

    // Registra linguagem LaTeX customizada para syntax highlighting
    monaco.languages.register({ id: 'latex' });

    monaco.languages.setMonarchTokensProvider('latex', {
      tokenizer: {
        root: [
          // Comentários
          [/%.*$/, 'comment'],
          // Comandos LaTeX
          [/\\[a-zA-Z@]+/, 'keyword'],
          // Ambientes \begin{} \end{}
          [/\\begin\{[^}]*\}/, 'type.identifier'],
          [/\\end\{[^}]*\}/, 'type.identifier'],
          // Chaves
          [/[{}]/, 'delimiter.curly'],
          // Colchetes
          [/[\[\]]/, 'delimiter.square'],
          // Matemática inline
          [/\$[^$]*\$/, 'string'],
          // Texto entre chaves após comando
          [/\\textbf/, 'keyword'],
          [/\\textit/, 'keyword'],
          [/\\emph/, 'keyword'],
        ],
      },
    });

    // Define o tema escuro customizado para o editor LaTeX
    monaco.editor.defineTheme('portogpt-latex', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'type.identifier', foreground: '4EC9B0' },
        { token: 'delimiter.curly', foreground: 'FFD700' },
        { token: 'delimiter.square', foreground: 'DA70D6' },
        { token: 'string', foreground: 'CE9178' },
      ],
      colors: {
        'editor.background': '#1B1E2B',
        'editor.foreground': '#D4D4D4',
        'editor.lineHighlightBackground': '#2A2D3E',
        'editorCursor.foreground': '#4285F4',
        'editor.selectionBackground': '#4285F440',
        'editorLineNumber.foreground': '#5C6370',
        'editorLineNumber.activeForeground': '#ABB2BF',
      },
    });

    monaco.editor.setTheme('portogpt-latex');

    // Foca o editor
    editor.focus();
  }

  return (
    <Editor
      height="100%"
      defaultLanguage="latex"
      theme="portogpt-latex"
      value={value}
      onChange={onChange}
      onMount={handleEditorDidMount}
      options={{
        readOnly,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        minimap: { enabled: true, scale: 2 },
        wordWrap: 'on',
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 16, bottom: 16 },
        suggest: { showKeywords: true },
        bracketPairColorization: { enabled: true },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
      }}
      loading={
        <div className="editor-loading">
          <div className="editor-loading-spinner" />
          <p>Carregando editor...</p>
        </div>
      }
    />
  );
}

export default memo(LatexEditor);
