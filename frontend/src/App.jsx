import { useState, useEffect, useRef } from 'react'
import './App.css'
import ReactMarkdown from 'react-markdown'
import $ from 'jquery'

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(false);
  const chatContainerRef = useRef(null);
  const fileInput = useRef(null);

  // Rola para o final sempre que chega mensagem nova
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);
  useEffect(() => {
    $('#modalUpload').hide();
  }, [])

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', text: input };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const returnData = await request('/chat', JSON.stringify({ query: userMessage.text }),
      {'Content-type':'application/json'});
    const aiMessage = { role: 'assistant', text: returnData.response };
    setMessages(prev => [...prev, aiMessage]);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  }

  const uploadFile = () => {
    $(fileInput.current).off("change").on("change", function () {
      setFile(fileInput.current.files?.[0]);
      $('#modalUpload').show();
    });
    fileInput.current.click();
  }

  const finishUpload = async () => {
    const formData = new FormData();
    formData.append('file', file);
    const returnData = await request('/upload', formData, {});
    setMessages(prev => [...prev, { role: 'assistant', text: returnData.response}])
    $('#modalUpload').hide();
  }

  async function request(endpoint, bodyObject, headers) {
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api' + endpoint, {
        method: 'POST',
        headers: headers,
        body: bodyObject,
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }
      const data = await response.json();
      console.log(data);
      return data;
    } catch (error) {
      console.error("Erro:", error);
      setMessages(prev => [...prev, { role: 'assistant', text: "Erro ao conectar com o servidor." }]);
    } finally {
      setLoading(false);
    }
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
            <div className="user-avatar">N</div>
          </div>
        </header>

        {/* 4. CHAT CENTRALIZADO */}
        <div className="chat-area" ref={chatContainerRef}>
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <h1>Olá, Nickolas</h1>
              <p>Como posso ajudar com os dados portuários hoje?</p>
            </div>
          ) : (
            <div className="messages-container">
              {messages.map((msg, index) => (
                <div key={index} className={`message-row ${msg.role}`}>
                  <div className="message-content">
                    <div className="message-icon">
                      {msg.role === 'assistant' ? '🤖' : 'N'}
                    </div>
                    <div className="message-text">
                      {msg.role === 'assistant'
                        ? <ReactMarkdown>{msg.text}</ReactMarkdown>
                        : msg.text
                      }
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
            <input type="file" ref={fileInput} style={{ display: 'none' }} />
            <button title='Fazer upload de arquivo .pdf' onClick={uploadFile} disabled={loading}>
              <i class="fa-solid fa-upload"></i>
            </button>
            <button title='Enviar Mensagem' onClick={sendMessage} disabled={loading || !input.trim()}>
              ➤
            </button>
          </div>
          <p className="disclaimer">
            O PortoGpt pode cometer erros. Verifique as informações importantes.
          </p>
        </div>
      </main>
      <div id='modalUpload' className='overlay'>
        <div className='modal'>
          Deseja fazer o upload do arquivo {file?.name}?
          <div className="confirm-row">
            <button onClick={finishUpload}>Sim</button>
            <button onClick={() => $('#modalUpload').hide()}>Não</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App