import { useState, memo, useEffect, useRef } from 'react';

/**
 * Dropdown de seleção de templates LaTeX.
 * 
 * Props:
 * - templates: array de { id, nome, descricao }
 * - selectedId: id do template selecionado
 * - onChange: callback(templateId) quando muda seleção
 * - onCreate: callback(nome) para criar novo template
 * - onCopy: callback(templateId) para copiar
 * - onRename: callback(templateId, novoNome) para renomear
 * - onDelete: callback(templateId) para deletar
 * - disabled: boolean para desabilitar
 */
function TemplateSelector({ templates, selectedId, onChange, onCreate, onCopy, onRename, onDelete, disabled }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const inputRef = useRef(null);

  const selectedTemplate = templates.find(t => t.id === selectedId);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleEditClick = () => {
    if (!selectedId) return;
    setEditName(selectedTemplate?.nome || '');
    setIsEditing(true);
  };

  const handleRenameSubmit = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== selectedTemplate?.nome) {
      onRename(selectedId, editName.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div className="template-selector">
      <label htmlFor="template-select" className="template-label">
        <i className="fa-solid fa-file-lines"></i>
        Modelo:
      </label>
      
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="template-rename-input"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
      ) : (
        <div className="template-dropdown-container">
          <select
            id="template-select"
            className="template-dropdown"
            value={selectedId || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="" disabled>
              Selecione um modelo...
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id} title={t.descricao}>
                {t.nome}
              </option>
            ))}
          </select>
          {selectedId && (
            <button 
              className="template-action-btn edit-btn" 
              onClick={handleEditClick} 
              disabled={disabled}
              title="Renomear Modelo"
            >
              <i className="fa-solid fa-pen"></i>
            </button>
          )}
        </div>
      )}

      <div className="template-actions">
        {selectedId && (
          <>
            <button 
              className="template-action-btn" 
              onClick={() => onCopy(selectedId)} 
              disabled={disabled}
              title="Criar cópia deste modelo"
            >
              <i className="fa-solid fa-copy"></i>
            </button>
            <button 
              className="template-action-btn" 
              style={{ color: '#E74C3C' }}
              onClick={() => {
                if (window.confirm("Tem certeza que deseja excluir este modelo?")) {
                  onDelete(selectedId);
                }
              }} 
              disabled={disabled}
              title="Excluir este modelo"
            >
              <i className="fa-solid fa-trash"></i>
            </button>
          </>
        )}
        <button 
          className="template-action-btn" 
          onClick={() => {
            const nome = prompt("Nome do novo modelo:");
            if (nome) onCreate(nome);
          }} 
          disabled={disabled}
          title="Criar novo modelo"
        >
          <i className="fa-solid fa-plus"></i>
        </button>
      </div>
    </div>
  );
}

export default memo(TemplateSelector);
