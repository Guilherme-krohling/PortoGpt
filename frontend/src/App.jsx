import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatContainerRef = useRef(null);

  // Rola para o final sempre que chega mensagem nova
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.text }),
      });

      const data = await response.json();
      const aiMessage = { role: 'assistant', text: data.response };
      setMessages(prev => [...prev, aiMessage]);

    } catch (error) {
      console.error("Erro:", error);
      setMessages(prev => [...prev, { role: 'assistant', text: "Erro ao conectar com o servidor." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  }

  return (
    <div className="app-container">
      {/* 1. BARRA LATERAL (SIDEBAR) */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <button onClick={handleNewChat} className="new-chat-btn">
            <span>+</span> Novo chat
          </button>
        </div>

        <div className="history-list">
          <p className="history-title">Recentes</p>
          {/* Aqui entrará o histórico real no futuro */}
          <div className="history-item">Análise de TCC...</div>
          <div className="history-item">Dúvidas sobre Porto...</div>
          <div className="history-item">Autores do projeto...</div>
        </div>

        <div className="sidebar-footer">
          <div className="settings-item">⚙️ Configurações</div>
        </div>
      </aside>

      {/* 2. ÁREA PRINCIPAL */}
      <main className="main-content">
        {/* 3. LOGIN / TOPO */}
        <header className="top-bar">
          <div className="model-selector">
            PortoGpt 1.0 
          </div>
          <div className="user-profile">
            <div className="user-avatar">G</div>
          </div>
        </header>

        {/* 4. CHAT CENTRALIZADO */}
        <div className="chat-area" ref={chatContainerRef}>
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <h1>Olá, Guilherme</h1>
              <p>Como posso ajudar com os dados portuários hoje?</p>
            </div>
          ) : (
            <div className="messages-container">
              {messages.map((msg, index) => (
                <div key={index} className={`message-row ${msg.role}`}>
                  <div className="message-content">
                    <div className="message-icon">
                      {msg.role === 'assistant' ? '🤖' : 'G'}
                    </div>
                    <div className="message-text">
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="message-row assistant">
                  <div className="message-content">
                    <div className="message-icon">🤖</div>
                    <div className="message-text loading-text">Pensando...</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. INPUT (EMBAIXO) */}
        <div className="input-container">
          <div className="input-box">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua pergunta aqui..."
              disabled={loading}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()}>
              ➤
            </button>
          </div>
          <p className="disclaimer">
            O PortoGpt pode cometer erros. Verifique as informações importantes.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App