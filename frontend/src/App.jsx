import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  AlertCircle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Clock,
  Database,
  Eye,
  FileText,
  FileUp,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Send,
  Shield,
  Sun,
  Trash2,
  User,
  UserCheck,
  UserRound,
  UserX,
  Users,
  X,
} from 'lucide-react'
import './App.css'

const API_BASE = 'http://localhost:8000/api'
const USER_STORAGE_KEY = 'portogpt_user'
const THEME_STORAGE_KEY = 'portogpt_theme'

const roleLabels = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visualizador',
}

const statusLabels = {
  active: 'Ativo',
  inactive: 'Inativo',
  pending: 'Pendente',
}

const roleIcons = {
  admin: Shield,
  editor: Pencil,
  viewer: Eye,
}

const emptyUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'viewer',
  status: 'active',
}

const emptyDocumentForm = {
  title: '',
  description: '',
  active: true,
}

const emptyTemplateForm = {
  title: '',
  description: '',
  active: true,
}

const defaultAiSettings = {
  strict_documents_only: true,
  answer_unknown_when_missing: true,
  ask_clarifying_questions: true,
  include_source_hint: true,
  tone: 'professional',
  similarity_top_k: 10,
  custom_instructions: '',
}

const adminNavItems = [
  { path: '/admin/users', label: 'Usuários', icon: Users },
  { path: '/admin/knowledge', label: 'Conhecimento da IA', icon: Brain },
  { path: '/admin/pdfs', label: 'PDFs Base', icon: FileText },
  { path: '/admin/templates', label: 'Templates', icon: FileText },
]

function App() {
  const [route, setRoute] = useState(getInitialRoute)
  const [currentUser, setCurrentUser] = useState(getStoredUser)
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || 'light')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [chatSessionKey, setChatSessionKey] = useState(0)
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)

  const navigate = useCallback(
    (path, replace = false) => {
      if (path === route && !replace) return
      if (replace) {
        window.history.replaceState({}, '', path)
      } else {
        window.history.pushState({}, '', path)
      }
      setRoute(path)
      setAvatarOpen(false)
    },
    [route],
  )

  useEffect(() => {
    const handlePopState = () => setRoute(getInitialRoute())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!currentUser?.id) return

    apiRequest(`/user/${currentUser.id}`)
      .then((user) => {
        setCurrentUser(user)
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
      })
      .catch(() => {
        localStorage.removeItem(USER_STORAGE_KEY)
        setCurrentUser(null)
      })
  }, [currentUser?.id])

  const handleLogin = (user) => {
    setCurrentUser(user)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
    navigate('/', true)
  }

  const handleLogout = () => {
    localStorage.removeItem(USER_STORAGE_KEY)
    setCurrentUser(null)
    navigate('/login', true)
  }

  const toggleTheme = () => {
    setTheme((value) => (value === 'light' ? 'dark' : 'light'))
  }

  const startNewChat = useCallback(() => {
    setActiveSessionId(null)
    setChatSessionKey((value) => value + 1)
    navigate('/')
  }, [navigate])

  const openChatSession = useCallback(
    (sessionId) => {
      setActiveSessionId(sessionId)
      setChatSessionKey((value) => value + 1)
      navigate('/')
    },
    [navigate],
  )

  const handleChatSessionChange = useCallback((sessionId) => {
    setActiveSessionId(sessionId)
    setHistoryRefreshKey((value) => value + 1)
  }, [])

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} />
  }

  const effectiveRoute = route === '/login' ? '/' : route === '/admin' ? '/admin/users' : route
  const isAdminRoute = effectiveRoute.startsWith('/admin')
  const isAdmin = currentUser.role === 'admin'

  return (
    <div className={`app-container ${isAdminRoute ? 'admin-container' : ''} ${sidebarCollapsed && !isAdminRoute ? 'sidebar-collapsed' : ''}`}>
      {!isAdminRoute && (
        <ChatSidebar
          currentUser={currentUser}
          activeSessionId={activeSessionId}
          collapsed={sidebarCollapsed}
          refreshKey={historyRefreshKey}
          onNewChat={startNewChat}
          onSelectSession={openChatSession}
          onHistoryChange={() => setHistoryRefreshKey((value) => value + 1)}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        />
      )}

      <main className="main-content">
        <TopBar
          currentUser={currentUser}
          avatarOpen={avatarOpen}
          isAdmin={isAdmin}
          onAvatarOpen={setAvatarOpen}
          onNavigate={navigate}
          onLogout={handleLogout}
          onToggleTheme={toggleTheme}
          theme={theme}
        />

        {renderRoute({
          route: effectiveRoute,
          currentUser,
          isAdmin,
          onNavigate: navigate,
          chatSessionKey,
          activeSessionId,
          onChatSessionChange: handleChatSessionChange,
        })}
      </main>
    </div>
  )
}

function renderRoute({ route, currentUser, isAdmin, onNavigate, chatSessionKey, activeSessionId, onChatSessionChange }) {
  if (route.startsWith('/admin')) {
    if (!isAdmin) {
      return <AccessDenied onNavigate={onNavigate} />
    }

    return (
      <AdminLayout route={route} onNavigate={onNavigate}>
        {route === '/admin/knowledge' && <KnowledgePage currentUser={currentUser} onNavigate={onNavigate} />}
        {route === '/admin/pdfs' && <PdfManagementPage currentUser={currentUser} />}
        {route === '/admin/templates' && <TemplateManagementPage currentUser={currentUser} />}
        {(route === '/admin' || route === '/admin/users') && <AdminUsersPage currentUser={currentUser} />}
      </AdminLayout>
    )
  }

  if (route === '/perfil') {
    return <ProfilePage currentUser={currentUser} />
  }

  if (route !== '/') {
    return <NotFound onNavigate={onNavigate} />
  }

  return (
    <ChatPage
      key={chatSessionKey}
      currentUser={currentUser}
      sessionId={activeSessionId}
      onSessionChange={onChatSessionChange}
    />
  )
}

function LoginPage({ onLogin, theme, onToggleTheme }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submitLogin = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const data = await apiRequest('/login', {
        method: 'POST',
        body: { email, password },
      })
      const user = data.user || (await apiRequest(`/user/${data.user_id}`))
      onLogin(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <button className="theme-toggle login-theme-toggle" onClick={onToggleTheme} aria-label="Alternar tema">
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <section className="login-card">
        <div className="brand-lockup">
          <span className="brand-mark">
            <img className="brand-logo" src="/portogpt.svg" alt="" aria-hidden="true" />
            <PanelLeftOpen className="brand-open-icon" size={18} />
          </span>
          <span className="brand-copy">
            <strong>PortoGpt</strong>
            <span>Ambiente interno</span>
          </span>
        </div>

        <div className="login-heading">
          <h1>Entrar</h1>
          <p>Acesse sua conta para consultar documentos portuários.</p>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu.email@empresa.com"
              autoComplete="email"
              required
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <div className="form-alert">
              <AlertCircle size={17} />
              {error}
            </div>
          )}

          <button className="primary-btn login-submit" type="submit" disabled={loading}>
            <Lock size={18} />
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </div>
  )
}

function ChatSidebar({
  activeSessionId,
  collapsed,
  currentUser,
  onHistoryChange,
  onNewChat,
  onSelectSession,
  onToggleCollapsed,
  refreshKey,
}) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const loadSessions = useCallback(async () => {
    if (!currentUser?.id) return
    setLoading(true)

    try {
      const payload = await apiRequest(`/chat/sessions/${currentUser.id}`)
      setSessions(payload.sessions || [])
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    loadSessions()
  }, [loadSessions, refreshKey])

  const deleteSession = async (event, sessionId) => {
    event.stopPropagation()
    const confirmed = window.confirm('Remover esta conversa do histórico?')
    if (!confirmed) return

    try {
      await apiRequest(`/chat/sessions/${sessionId}?user_id=${currentUser.id}`, {
        method: 'DELETE',
      })
      if (sessionId === activeSessionId) onNewChat()
      onHistoryChange()
    } catch {
      onHistoryChange()
    }
  }

  const visibleSessions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return sessions

    return sessions.filter((session) => {
      const title = session.title || ''
      const lastMessage = session.last_message || ''
      return title.toLowerCase().includes(query) || lastMessage.toLowerCase().includes(query)
    })
  }, [searchTerm, sessions])

  const openSearch = () => {
    if (collapsed) {
      onToggleCollapsed()
    }
    setSearchOpen(true)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button
          className="brand-lockup brand-button"
          onClick={collapsed ? onToggleCollapsed : onNewChat}
          aria-label={collapsed ? 'Abrir barra lateral' : 'Abrir tela inicial do PortoGpt'}
          title={collapsed ? 'Abrir barra lateral' : 'PortoGPT'}
        >
          <span className="brand-mark">
            <img className="brand-logo" src="/portogpt.svg" alt="" aria-hidden="true" />
            <PanelLeftOpen className="brand-open-icon" size={18} />
          </span>
          <span className="brand-copy">
            <strong>PortoGPT</strong>
          </span>
        </button>

        <button onClick={onNewChat} className="new-chat-btn">
          <Pencil size={18} />
          <span>Novo chat</span>
        </button>

        <button onClick={openSearch} className="search-chat-btn" aria-label="Buscar em chats" title="Buscar em chats">
          <Search size={18} />
          <span>Buscar em chats</span>
        </button>

        <button className="sidebar-close-btn" onClick={onToggleCollapsed} aria-label="Fechar barra lateral" title="Fechar barra lateral">
          <PanelLeftClose size={18} />
        </button>
      </div>

      {searchOpen && (
        <label className="chat-search-field">
          <Search size={16} />
          <input
            type="search"
            placeholder="Buscar em chats..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')} aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </label>
      )}

      <section className="history-panel" aria-label="Histórico de chats">
        <div className="history-heading">
          <span>Histórico</span>
          <small>{visibleSessions.length}</small>
        </div>

        <div className="history-list">
          {loading && <div className="history-state">Carregando conversas...</div>}
          {!loading && sessions.length === 0 && <div className="history-state">Nenhuma conversa salva ainda.</div>}
          {!loading && sessions.length > 0 && visibleSessions.length === 0 && (
            <div className="history-state">Nenhum chat encontrado.</div>
          )}
          {!loading &&
            visibleSessions.map((session, index) => (
              <article
                key={session.id}
                className={`history-item ${session.id === activeSessionId ? 'active' : ''}`}
                style={{ '--item-index': index }}
              >
                <button className="history-open" onClick={() => onSelectSession(session.id)}>
                  <MessageSquare size={16} />
                  <span>
                    <strong>{session.title || 'Novo chat'}</strong>
                    <small>{session.last_message || 'Conversa vazia'}</small>
                  </span>
                  <em>{formatShortDate(session.updated_at)}</em>
                </button>
                <button
                  className="history-delete"
                  onClick={(event) => deleteSession(event, session.id)}
                  aria-label="Remover conversa"
                >
                  <Trash2 size={13} />
                </button>
              </article>
            ))}
        </div>
      </section>
    </aside>
  )
}

function TopBar({
  avatarOpen,
  currentUser,
  isAdmin,
  onAvatarOpen,
  onLogout,
  onNavigate,
  onToggleTheme,
  theme,
}) {
  return (
    <header className="top-bar">
      <div className="top-left">
        <button className="model-selector" onClick={() => onNavigate('/')}>
          <img className="topbar-logo" src="/portogpt.svg" alt="" aria-hidden="true" />
          PortoGpt 1.0
          <ChevronDown size={17} />
        </button>
      </div>

      <div className="top-actions">
        <button className="theme-toggle" onClick={onToggleTheme} aria-label="Alternar tema">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="avatar-menu-wrap">
          <button className="user-profile" onClick={() => onAvatarOpen(!avatarOpen)} aria-label="Abrir menu do usuário">
            {getInitials(currentUser.name || currentUser.email)}
          </button>

          {avatarOpen && (
            <div className="avatar-menu">
              <div className="avatar-menu-header">
                <strong>{currentUser.name || 'Usuário'}</strong>
                <span>{currentUser.email}</span>
              </div>
              <button onClick={() => onNavigate('/perfil')}>
                <User size={17} />
                Meu perfil
              </button>
              {isAdmin && (
                <button onClick={() => onNavigate('/admin/users')}>
                  <Shield size={17} />
                  Administração
                </button>
              )}
              <button onClick={onLogout}>
                <LogOut size={17} />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function ChatPage({ currentUser, onSessionChange, sessionId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(Boolean(sessionId))
  const [currentSessionId, setCurrentSessionId] = useState(sessionId || null)
  const [welcomeSuggestions, setWelcomeSuggestions] = useState([])
  const [file, setFile] = useState(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const chatContainerRef = useRef(null)
  const fileInput = useRef(null)

  const baseSuggestions = useMemo(
    () => [
      {
        id: 'sug-recent',
        title: 'Documento publicado recentemente',
        subtitle: 'Carregando…',
        prompt: 'Liste os documentos mais recentes (se possível) e sugira por onde começar.',
      },
      {
        id: 'sug-top-week',
        title: 'Mais perguntado essa semana',
        subtitle: 'Carregando…',
        prompt: 'Qual tem sido o tema mais perguntado esta semana? Resuma e aponte trechos relevantes.',
      },
      {
        id: 'sug-prazos',
        title: 'Prazos e exigências',
        subtitle: 'Resumo direto + variações',
        prompt: 'Quais são os prazos, requisitos e documentos necessários para este processo? Se houver variações, detalhe por tipo.',
      },
      {
        id: 'sug-checklist',
        title: 'Checklist de procedimento',
        subtitle: 'Passo a passo operacional',
        prompt: 'Monte um checklist passo a passo (com prazos) para executar este procedimento conforme os documentos. Se faltar contexto, me pergunte exatamente o processo.',
      },
      {
        id: 'sug-perguntar-melhor',
        title: 'Pergunta vaga? Eu refino',
        subtitle: 'Evitar resposta genérica',
        prompt: 'Quero saber o prazo. Me faça 3 perguntas objetivas para eu especificar o processo e então responda com base nos documentos.',
      },
    ],
    [],
  )

  useEffect(() => {
    let active = true
    setWelcomeSuggestions(baseSuggestions)

    Promise.all([
      apiRequest('/docs').catch(() => ({ files: [] })),
      apiRequest(`/chat/insights/${currentUser.id}?days=7&top_k=1`).catch(() => ({ top_questions: [] })),
    ])
      .then(([docsPayload, insightsPayload]) => {
        if (!active) return

        const docs = Array.isArray(docsPayload?.files) ? docsPayload.files : []
        const recentDoc = docs
          .slice()
          .filter((doc) => doc?.active)
          .sort((a, b) => Number(b?.mtime || 0) - Number(a?.mtime || 0))[0]

        const topQuestion = Array.isArray(insightsPayload?.top_questions) ? insightsPayload.top_questions[0] : null

        const updated = baseSuggestions.map((tile) => {
          if (tile.id === 'sug-recent') {
            if (!recentDoc) {
              return { ...tile, subtitle: 'Nenhum PDF ativo encontrado', prompt: 'Quais documentos estão ativos hoje? Liste por título e diga para que servem.' }
            }
            const title = recentDoc.title || recentDoc.filename
            return {
              ...tile,
              subtitle: title,
              prompt: `Resuma o documento "${title}" e destaque: (1) pontos críticos, (2) prazos, (3) responsabilidades, (4) exceções e penalidades (se houver).`,
            }
          }

          if (tile.id === 'sug-top-week') {
            if (!topQuestion?.message) {
              return { ...tile, subtitle: 'Sem dados suficientes', prompt: 'Me sugira 3 perguntas úteis com base nos documentos ativos para eu começar.' }
            }
            const question = String(topQuestion.message)
            const short = question.length > 44 ? `${question.slice(0, 44).trim()}…` : question
            return { ...tile, subtitle: short, prompt: question }
          }

          return tile
        })

        setWelcomeSuggestions(updated)
      })
      .catch(() => {
        if (!active) return
        setWelcomeSuggestions(baseSuggestions)
      })

    return () => {
      active = false
    }
  }, [baseSuggestions])

  useEffect(() => {
    setCurrentSessionId(sessionId || null)
    if (!sessionId) {
      setMessages([])
      setHistoryLoading(false)
      return
    }

    let active = true
    setHistoryLoading(true)
    apiRequest(`/chat/sessions/${sessionId}/messages?user_id=${currentUser.id}`)
      .then((payload) => {
        if (!active) return
        setMessages(payload.messages || [])
      })
      .catch((err) => {
        if (!active) return
        setMessages([{ role: 'assistant', text: err.message || 'Não foi possível carregar esta conversa.' }])
      })
      .finally(() => {
        if (active) setHistoryLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentUser.id, sessionId])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, loading])

  const sendMessage = async (overrideText) => {
    const text = String(overrideText ?? input).trim()
    if (!text || loading || historyLoading) return

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const data = await apiRequest('/chat', {
        method: 'POST',
        body: { query: text, user_id: currentUser.id, session_id: currentSessionId },
      })
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id)
        onSessionChange?.(data.session_id)
      } else if (data.session_id) {
        onSessionChange?.(data.session_id)
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: data.response }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: err.message || 'Erro ao conectar com o servidor.' }])
    } finally {
      setLoading(false)
    }
  }

  const finishUpload = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    setLoading(true)

    try {
      const data = await apiRequest('/upload', {
        method: 'POST',
        userId: currentUser.id,
        body: formData,
      })
      setMessages((prev) => [...prev, { role: 'assistant', text: data.response }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: err.message }])
    } finally {
      setLoading(false)
      setShowUploadModal(false)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const closeUploadModal = () => {
    setShowUploadModal(false)
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <>
      <div className="chat-area" ref={chatContainerRef}>
        {historyLoading ? (
          <div className="welcome-screen loading-history">
            <h1>Carregando conversa</h1>
            <p>Recuperando as mensagens salvas no histórico.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="welcome-screen welcome-hero">
            <div className="welcome-orb orb-one" aria-hidden="true" />
            <div className="welcome-orb orb-two" aria-hidden="true" />

            <section className="welcome-content" aria-label="Tela inicial do PortoGPT">
              <h1>Olá, {firstName(currentUser)}</h1>
              <p>
                Como posso ajudar com os dados portuários hoje?
              </p>

              <div className="welcome-carousel-mask" aria-label="Atalhos em carrossel">
                <div className="welcome-carousel-track">
                  {(() => {
                    const items = welcomeSuggestions.length ? welcomeSuggestions : baseSuggestions
                    const duplicated = [...items, ...items]

                    return duplicated.map((item, index) => {
                      const displayIndex = String((index % items.length) + 1).padStart(2, '0')

                      return (
                        <button
                          type="button"
                          className="flip-card"
                          key={`${item.id || item.title}-${index}`}
                          onClick={() => sendMessage(item.prompt)}
                          title={item.prompt}
                          aria-label={`Enviar sugestão: ${item.title}`}
                        >
                          <div className="flip-inner">
                            <article className="glass-card front">
                              <span aria-hidden="true">{displayIndex}</span>
                              <h2>{item.title}</h2>
                            </article>

                            <article className="glass-card back">
                              <p>{item.subtitle}</p>
                            </article>
                          </div>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="messages-container">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`message-row ${message.role}`}>
                <div className="message-content">
                  <div className="message-icon">{message.role === 'assistant' ? <Bot size={18} /> : getInitials(currentUser.name || currentUser.email)}</div>
                  <div className="message-text">
                    {message.role === 'assistant' ? <ReactMarkdown>{message.text}</ReactMarkdown> : message.text}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="message-row assistant">
                <div className="message-content">
                  <div className="message-icon">
                    <Bot size={18} />
                  </div>
                  <div className="message-text loading-text">Pensando...</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="input-container">
        <div className="input-box">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') sendMessage()
            }}
            placeholder="Digite sua pergunta aqui..."
            disabled={loading || historyLoading}
          />
          <input
            type="file"
            ref={fileInput}
            onChange={(event) => {
              const selectedFile = event.target.files?.[0]
              if (!selectedFile) return
              setFile(selectedFile)
              setShowUploadModal(true)
            }}
            style={{ display: 'none' }}
          />
          <button className="icon-btn" title="Fazer upload de arquivo PDF" onClick={() => fileInput.current?.click()} disabled={loading || historyLoading}>
            <FileUp size={20} />
          </button>
          <button className="send-btn" title="Enviar mensagem" onClick={() => sendMessage()} disabled={loading || historyLoading || !input.trim()}>
            <Send size={18} />
          </button>
        </div>
        <p className="disclaimer">O PortoGpt pode cometer erros. Verifique as informações importantes.</p>
      </div>

      {showUploadModal && (
        <ConfirmModal
          title="Confirmar upload"
          description={`Deseja fazer o upload do arquivo ${file?.name}?`}
          confirmLabel="Enviar"
          onCancel={closeUploadModal}
          onConfirm={finishUpload}
        />
      )}
    </>
  )
}

function AdminLayout({ children, route, onNavigate }) {
  return (
    <section className="admin-view">
      <aside className="admin-menu">
        <div className="admin-menu-title">
          <Database size={19} />
          <span>Painel</span>
        </div>
        <nav aria-label="Menu administrativo">
          {adminNavItems.map((item) => (
            <button
              key={item.path}
              className={`admin-menu-item ${route === item.path ? 'active' : ''}`}
              onClick={() => onNavigate(item.path)}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="admin-content">{children}</div>
    </section>
  )
}

function AdminUsersPage({ currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalMode, setModalMode] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await apiRequest('/users', { userId: currentUser.id })
      setUsers(data.users || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const stats = useMemo(() => {
    const active = users.filter((userItem) => userItem.status === 'active').length
    const inactive = users.filter((userItem) => userItem.status === 'inactive').length
    const pending = users.filter((userItem) => userItem.status === 'pending').length

    return [
      { label: 'Total de usuários', value: users.length, icon: Users, tone: 'blue' },
      { label: 'Usuários ativos', value: active, icon: UserCheck, tone: 'green' },
      { label: 'Usuários inativos', value: inactive, icon: UserX, tone: 'purple' },
      { label: 'Pendentes', value: pending, icon: Clock, tone: 'pink' },
    ]
  }, [users])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((userItem) => {
      const matchesSearch =
        !query ||
        userItem.name?.toLowerCase().includes(query) ||
        userItem.email?.toLowerCase().includes(query)
      const matchesRole = roleFilter === 'all' || userItem.role === roleFilter
      const matchesStatus = statusFilter === 'all' || userItem.status === statusFilter
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [roleFilter, search, statusFilter, users])

  const openCreateModal = () => {
    setSelectedUser(null)
    setModalMode('create')
  }

  const openEditModal = (userItem) => {
    setSelectedUser(userItem)
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedUser(null)
  }

  const saveUser = async (formData) => {
    const isEditing = modalMode === 'edit'
    const body = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      status: formData.status,
    }

    if (formData.password) {
      body.password = formData.password
    }

    await apiRequest(isEditing ? `/users/${selectedUser.id}` : '/users', {
      method: isEditing ? 'PUT' : 'POST',
      userId: currentUser.id,
      body,
    })
    closeModal()
    await loadUsers()
  }

  const deleteUser = async (userItem) => {
    const confirmed = window.confirm(`Excluir ${userItem.name || userItem.email}?`)
    if (!confirmed) return

    try {
      await apiRequest(`/users/${userItem.id}`, {
        method: 'DELETE',
        userId: currentUser.id,
      })
      await loadUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-heading">
        <div>
          <h1>Usuários</h1>
          <p>Gerencie os usuários do sistema e suas permissões.</p>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((item) => (
          <article className="stat-card" key={item.label}>
            <div className={`stat-icon ${item.tone}`}>
              <item.icon size={22} />
            </div>
            <div>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="admin-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Buscar usuários..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select className="select-control" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="all">Todas as funções</option>
          <option value="admin">Administrador</option>
          <option value="editor">Editor</option>
          <option value="viewer">Visualizador</option>
        </select>
        <select className="select-control" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Todos</option>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
          <option value="pending">Pendente</option>
        </select>
        <button className="primary-btn new-user-btn" onClick={openCreateModal}>
          <Plus size={18} />
          Novo usuário
        </button>
      </div>

      {error && (
        <div className="form-alert admin-alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Função</th>
              <th>Status</th>
              <th>Criado em</th>
              <th>Último acesso</th>
              <th className="actions-col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="6" className="table-state">
                  Carregando usuários...
                </td>
              </tr>
            )}

            {!loading && filteredUsers.length === 0 && (
              <tr>
                <td colSpan="6" className="table-state">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}

            {!loading &&
              filteredUsers.map((userItem) => (
                <tr key={userItem.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar-soft">{getInitials(userItem.name || userItem.email)}</div>
                      <div>
                        <strong>{userItem.name || 'Usuário sem nome'}</strong>
                        <span title={userItem.email}>{userItem.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <RoleBadge role={userItem.role} />
                  </td>
                  <td>
                    <StatusBadge status={userItem.status} />
                  </td>
                  <td>{formatDate(userItem.created_at)}</td>
                  <td>{formatDate(userItem.last_login, 'Nunca')}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn small" onClick={() => openEditModal(userItem)} aria-label="Editar usuário">
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn small danger"
                        onClick={() => deleteUser(userItem)}
                        disabled={userItem.id === currentUser.id}
                        aria-label="Excluir usuário"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modalMode && (
        <UserModal
          mode={modalMode}
          initialUser={selectedUser}
          onClose={closeModal}
          onSave={saveUser}
        />
      )}
    </div>
  )
}

function KnowledgePage({ currentUser, onNavigate }) {
  const [docs, setDocs] = useState([])
  const [settings, setSettings] = useState(defaultAiSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadKnowledge = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [docsPayload, settingsPayload] = await Promise.all([
        apiRequest('/docs', { userId: currentUser.id }),
        apiRequest('/ai/settings', { userId: currentUser.id }),
      ])
      setDocs(docsPayload.files || [])
      setSettings({ ...defaultAiSettings, ...(settingsPayload.settings || {}) })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadKnowledge()
  }, [loadKnowledge])

  const updateSetting = (field, value) => {
    setNotice('')
    setSettings((current) => ({ ...current, [field]: value }))
  }

  const saveSettings = async () => {
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const payload = await apiRequest('/ai/settings', {
        method: 'PUT',
        userId: currentUser.id,
        body: settings,
      })
      setSettings({ ...defaultAiSettings, ...(payload.settings || settings) })
      setNotice('Parâmetros da IA atualizados com sucesso.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const activeDocs = docs.filter((doc) => doc.active)
  const totalSize = docs.reduce((sum, doc) => sum + Number(doc.size || 0), 0)

  return (
    <div className="admin-panel knowledge-panel">
      <div className="admin-heading">
        <div>
          <h1>Conhecimento da IA</h1>
          <p>Controle quais documentos orientam as respostas e ajuste o comportamento do PortoGpt.</p>
        </div>
        <button className="ghost-btn" onClick={loadKnowledge} disabled={loading}>
          <Database size={17} />
          Atualizar
        </button>
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-icon blue">
            <Brain size={22} />
          </div>
          <div>
            <strong>{docs.length}</strong>
            <span>Documentos na base</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green">
            <Check size={22} />
          </div>
          <div>
            <strong>{activeDocs.length}</strong>
            <span>Ativos para respostas</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon purple">
            <FileText size={22} />
          </div>
          <div>
            <strong>{formatFileSize(totalSize)}</strong>
            <span>Volume de arquivos</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon pink">
            <Clock size={22} />
          </div>
          <div>
            <strong>{settings.similarity_top_k}</strong>
            <span>Trechos por busca</span>
          </div>
        </article>
      </div>

      {error && (
        <div className="form-alert admin-alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {notice && (
        <div className="success-alert admin-alert">
          <Check size={17} />
          {notice}
        </div>
      )}

      <div className="knowledge-layout">
        <section className="settings-panel">
          <div className="section-heading">
            <div>
              <h2>Parâmetros da IA</h2>
              <p>Essas regras entram no prompt do assistente.</p>
            </div>
            <button className="primary-btn" onClick={saveSettings} disabled={saving || loading}>
              <Check size={17} />
              {saving ? 'Salvando...' : 'Salvar parâmetros'}
            </button>
          </div>

          <div className="settings-list">
            <SettingToggle
              checked={settings.strict_documents_only}
              label="Responder apenas sobre os documentos"
              description="Mantém o assistente focado na base interna."
              onChange={(value) => updateSetting('strict_documents_only', value)}
            />
            <SettingToggle
              checked={settings.answer_unknown_when_missing}
              label="Assumir ausência de informação"
              description="Quando não encontrar base documental, ele informa que não localizou."
              onChange={(value) => updateSetting('answer_unknown_when_missing', value)}
            />
            <SettingToggle
              checked={settings.ask_clarifying_questions}
              label="Pedir esclarecimento em perguntas vagas"
              description="Evita respostas genéricas quando o usuário precisa especificar melhor."
              onChange={(value) => updateSetting('ask_clarifying_questions', value)}
            />
            <SettingToggle
              checked={settings.include_source_hint}
              label="Mencionar documento de apoio quando possível"
              description="Ajuda a conferir de onde a resposta foi derivada."
              onChange={(value) => updateSetting('include_source_hint', value)}
            />
          </div>

          <div className="settings-grid">
            <label>
              Tom das respostas
              <select value={settings.tone} onChange={(event) => updateSetting('tone', event.target.value)}>
                <option value="professional">Profissional</option>
                <option value="simple">Simples</option>
                <option value="technical">Técnico</option>
              </select>
            </label>

            <label>
              Trechos consultados por pergunta
              <input
                type="number"
                min="1"
                max="20"
                value={settings.similarity_top_k}
                onChange={(event) => updateSetting('similarity_top_k', Number(event.target.value))}
              />
            </label>
          </div>

          <label className="textarea-field">
            Instruções personalizadas
            <textarea
              value={settings.custom_instructions}
              onChange={(event) => updateSetting('custom_instructions', event.target.value)}
              placeholder="Ex.: não responder assuntos fora dos documentos, priorizar prazos e normas internas..."
              rows={5}
            />
          </label>
        </section>

        <section className="sources-panel">
          <div className="section-heading compact">
            <div>
              <h2>Fontes de conhecimento</h2>
              <p>{loading ? 'Carregando documentos...' : `${activeDocs.length} documentos ativos de ${docs.length}`}</p>
            </div>
            <button className="ghost-btn" onClick={() => onNavigate('/admin/pdfs')}>
              <FileText size={17} />
              PDFs
            </button>
          </div>

          <div className="knowledge-source-list">
            {!loading && docs.length === 0 && <div className="empty-panel">Nenhum documento encontrado em data/.</div>}
            {docs.map((doc) => (
              <article className="knowledge-source" key={doc.filename}>
                <div className={`source-status ${doc.active ? 'active' : 'inactive'}`}>
                  {doc.active ? <Check size={16} /> : <Clock size={16} />}
                </div>
                <div>
                  <strong>{doc.title || doc.filename}</strong>
                  <span>{doc.filename}</span>
                </div>
                <small>{formatFileSize(doc.size)}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function SettingToggle({ checked, description, label, onChange }) {
  return (
    <label className="setting-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="setting-control" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </label>
  )
}

function PdfManagementPage({ currentUser }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState(null)
  const [selectedDocument, setSelectedDocument] = useState(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const payload = await apiRequest('/docs', { userId: currentUser.id })
      setDocs(payload.files || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  const filteredDocs = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return docs
    return docs.filter((doc) => {
      return (
        doc.filename?.toLowerCase().includes(query) ||
        doc.title?.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query)
      )
    })
  }, [docs, search])

  const activeDocs = docs.filter((doc) => doc.active).length
  const totalSize = docs.reduce((sum, doc) => sum + Number(doc.size || 0), 0)

  const openUploadModal = () => {
    setSelectedDocument(null)
    setModalMode('upload')
  }

  const openEditModal = (doc) => {
    setSelectedDocument(doc)
    setModalMode('edit')
  }

  const closeModal = () => {
    setSelectedDocument(null)
    setModalMode(null)
  }

  const uploadDocument = async (formData) => {
    const body = new FormData()
    body.append('file', formData.file)
    body.append('title', formData.title)
    body.append('description', formData.description)

    await apiRequest('/docs/upload', {
      method: 'POST',
      userId: currentUser.id,
      body,
    })
    setNotice('PDF enviado e registrado no banco de dados.')
    closeModal()
    await loadDocs()
  }

  const updateDocument = async (formData) => {
    await apiRequest(`/docs/${encodeURIComponent(selectedDocument.filename)}`, {
      method: 'PUT',
      userId: currentUser.id,
      body: {
        title: formData.title,
        description: formData.description,
        active: formData.active,
      },
    })
    setNotice('PDF atualizado com sucesso.')
    closeModal()
    await loadDocs()
  }

  const toggleDocument = async (doc) => {
    try {
      await apiRequest(`/docs/${encodeURIComponent(doc.filename)}/toggle`, {
        method: 'POST',
        userId: currentUser.id,
      })
      setNotice(doc.active ? 'PDF desativado na base da IA.' : 'PDF ativado na base da IA.')
      await loadDocs()
    } catch (err) {
      setError(err.message)
    }
  }

  const reindexDocument = async (doc) => {
    try {
      await apiRequest(`/docs/${encodeURIComponent(doc.filename)}/reindex`, {
        method: 'POST',
        userId: currentUser.id,
      })
      setNotice('Reindexação agendada para este PDF.')
    } catch (err) {
      setError(err.message)
    }
  }

  const reindexAllDocuments = async () => {
    try {
      await apiRequest('/docs/reindex', {
        method: 'POST',
        userId: currentUser.id,
      })
      setNotice('Reindexação completa agendada apenas com PDFs ativos.')
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteDocument = async (doc) => {
    const confirmed = window.confirm(`Remover ${doc.title || doc.filename}?`)
    if (!confirmed) return

    try {
      await apiRequest(`/docs/${encodeURIComponent(doc.filename)}`, {
        method: 'DELETE',
        userId: currentUser.id,
      })
      setNotice('PDF removido do armazenamento e do SQLite.')
      await loadDocs()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-panel pdf-panel">
      <div className="admin-heading">
        <div>
          <h1>Gerenciamento de PDFs</h1>
          <p>Envie, edite, reindexe e remova os arquivos usados como conhecimento da IA.</p>
        </div>
        <div className="heading-actions">
          <button className="ghost-btn" onClick={reindexAllDocuments}>
            <Database size={17} />
            Reindexar base
          </button>
          <button className="primary-btn" onClick={openUploadModal}>
            <FileUp size={18} />
            Enviar PDF
          </button>
        </div>
      </div>

      <div className="stats-grid pdf-stats">
        <article className="stat-card">
          <div className="stat-icon blue">
            <FileText size={22} />
          </div>
          <div>
            <strong>{docs.length}</strong>
            <span>PDFs cadastrados</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green">
            <Check size={22} />
          </div>
          <div>
            <strong>{activeDocs}</strong>
            <span>Ativos na IA</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon purple">
            <Database size={22} />
          </div>
          <div>
            <strong>SQLite</strong>
            <span>Metadados salvos</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon pink">
            <Clock size={22} />
          </div>
          <div>
            <strong>{formatFileSize(totalSize)}</strong>
            <span>Tamanho total</span>
          </div>
        </article>
      </div>

      <div className="admin-toolbar pdf-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Buscar PDFs..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="ghost-btn" onClick={loadDocs} disabled={loading}>
          <Database size={17} />
          Atualizar lista
        </button>
      </div>

      {error && (
        <div className="form-alert admin-alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {notice && (
        <div className="success-alert admin-alert">
          <Check size={17} />
          {notice}
        </div>
      )}

      <div className="documents-grid">
        {loading && <div className="empty-panel">Carregando PDFs...</div>}
        {!loading && filteredDocs.length === 0 && <div className="empty-panel">Nenhum PDF encontrado.</div>}
        {!loading &&
          filteredDocs.map((doc) => (
            <article className="document-card" key={doc.filename}>
              <div className="document-topline">
                <div className="document-icon">
                  <FileText size={22} />
                </div>
                <StatusBadge status={doc.active ? 'active' : 'inactive'} />
              </div>

              <div className="document-body">
                <h2>{doc.title || doc.filename}</h2>
                <p>{doc.description || 'Sem descrição cadastrada.'}</p>
                <span title={doc.filename}>{doc.filename}</span>
              </div>

              <div className="document-meta">
                <span>{formatFileSize(doc.size)}</span>
                <span>Atualizado em {formatDate(doc.updated_at || doc.mtime)}</span>
              </div>

              <div className="document-actions">
                <button className="icon-btn small" onClick={() => openEditModal(doc)} aria-label="Editar PDF">
                  <Pencil size={16} />
                </button>
                <button className="icon-btn small" onClick={() => toggleDocument(doc)} aria-label={doc.active ? 'Desativar PDF' : 'Ativar PDF'}>
                  <Check size={16} />
                </button>
                <button className="icon-btn small" onClick={() => reindexDocument(doc)} aria-label="Reindexar PDF">
                  <Database size={16} />
                </button>
                <button className="icon-btn small danger" onClick={() => deleteDocument(doc)} aria-label="Remover PDF">
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
      </div>

      {modalMode && (
        <DocumentModal
          mode={modalMode}
          initialDocument={selectedDocument}
          onClose={closeModal}
          onSave={modalMode === 'upload' ? uploadDocument : updateDocument}
        />
      )}
    </div>
  )
}

function TemplateManagementPage({ currentUser }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const payload = await apiRequest('/templates', { userId: currentUser.id })
      setTemplates(payload.templates || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return templates
    return templates.filter((tpl) => {
      return (
        tpl.filename?.toLowerCase().includes(query) ||
        tpl.title?.toLowerCase().includes(query) ||
        tpl.description?.toLowerCase().includes(query)
      )
    })
  }, [templates, search])

  const activeTemplates = templates.filter((tpl) => tpl.active).length
  const totalSize = templates.reduce((sum, tpl) => sum + Number(tpl.size || 0), 0)

  const openUploadModal = () => {
    setSelectedTemplate(null)
    setModalMode('upload')
  }

  const openEditModal = (tpl) => {
    setSelectedTemplate(tpl)
    setModalMode('edit')
  }

  const closeModal = () => {
    setSelectedTemplate(null)
    setModalMode(null)
  }

  const uploadTemplate = async (formData) => {
    const body = new FormData()
    body.append('file', formData.file)
    body.append('title', formData.title)
    body.append('description', formData.description)

    await apiRequest('/templates/upload', {
      method: 'POST',
      userId: currentUser.id,
      body,
    })
    setNotice('Template enviado e registrado no banco de dados.')
    closeModal()
    await loadTemplates()
  }

  const updateTemplate = async (formData) => {
    await apiRequest(`/templates/${encodeURIComponent(selectedTemplate.filename)}`, {
      method: 'PUT',
      userId: currentUser.id,
      body: {
        title: formData.title,
        description: formData.description,
        active: formData.active,
      },
    })
    setNotice('Template atualizado com sucesso.')
    closeModal()
    await loadTemplates()
  }

  const toggleTemplate = async (tpl) => {
    try {
      await apiRequest(`/templates/${encodeURIComponent(tpl.filename)}/toggle`, {
        method: 'POST',
        userId: currentUser.id,
      })
      setNotice(tpl.active ? 'Template desativado.' : 'Template ativado.')
      await loadTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteTemplate = async (tpl) => {
    const confirmed = window.confirm(`Remover ${tpl.title || tpl.filename}?`)
    if (!confirmed) return

    try {
      await apiRequest(`/templates/${encodeURIComponent(tpl.filename)}`, {
        method: 'DELETE',
        userId: currentUser.id,
      })
      setNotice('Template removido do armazenamento e do SQLite.')
      await loadTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-panel pdf-panel">
      <div className="admin-heading">
        <div>
          <h1>Templates</h1>
          <p>Cadastre templates padrão da empresa para uso em geração futura de documentos.</p>
        </div>
        <div className="heading-actions">
          <button className="primary-btn" onClick={openUploadModal}>
            <FileUp size={18} />
            Enviar template
          </button>
        </div>
      </div>

      <div className="stats-grid pdf-stats">
        <article className="stat-card">
          <div className="stat-icon blue">
            <FileText size={22} />
          </div>
          <div>
            <strong>{templates.length}</strong>
            <span>Templates cadastrados</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green">
            <Check size={22} />
          </div>
          <div>
            <strong>{activeTemplates}</strong>
            <span>Ativos</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon purple">
            <Database size={22} />
          </div>
          <div>
            <strong>SQLite</strong>
            <span>Metadados salvos</span>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon pink">
            <Clock size={22} />
          </div>
          <div>
            <strong>{formatFileSize(totalSize)}</strong>
            <span>Tamanho total</span>
          </div>
        </article>
      </div>

      <div className="admin-toolbar pdf-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Buscar templates..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="ghost-btn" onClick={loadTemplates} disabled={loading}>
          <Database size={17} />
          Atualizar lista
        </button>
      </div>

      {error && (
        <div className="form-alert admin-alert">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {notice && (
        <div className="success-alert admin-alert">
          <Check size={17} />
          {notice}
        </div>
      )}

      <div className="documents-grid">
        {loading && <div className="empty-panel">Carregando templates...</div>}
        {!loading && filteredTemplates.length === 0 && <div className="empty-panel">Nenhum template encontrado.</div>}
        {!loading &&
          filteredTemplates.map((tpl) => (
            <article className="document-card" key={tpl.filename}>
              <div className="document-topline">
                <div className="document-icon">
                  <FileText size={22} />
                </div>
                <StatusBadge status={tpl.active ? 'active' : 'inactive'} />
              </div>

              <div className="document-body">
                <h2>{tpl.title || tpl.filename}</h2>
                <p>{tpl.description || 'Sem descrição cadastrada.'}</p>
                <span title={tpl.filename}>{tpl.filename}</span>
              </div>

              <div className="document-meta">
                <span>{formatFileSize(tpl.size)}</span>
                <span>Atualizado em {formatDate(tpl.updated_at || tpl.mtime)}</span>
              </div>

              <div className="document-actions">
                <button className="icon-btn small" onClick={() => openEditModal(tpl)} aria-label="Editar template">
                  <Pencil size={16} />
                </button>
                <button className="icon-btn small" onClick={() => toggleTemplate(tpl)} aria-label={tpl.active ? 'Desativar template' : 'Ativar template'}>
                  <Check size={16} />
                </button>
                <button className="icon-btn small danger" onClick={() => deleteTemplate(tpl)} aria-label="Remover template">
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
      </div>

      {modalMode && (
        <TemplateModal
          mode={modalMode}
          initialTemplate={selectedTemplate}
          onClose={closeModal}
          onSave={modalMode === 'upload' ? uploadTemplate : updateTemplate}
        />
      )}
    </div>
  )
}

function TemplateModal({ initialTemplate, mode, onClose, onSave }) {
  const isUpload = mode === 'upload'
  const [formData, setFormData] = useState(() => ({
    ...emptyTemplateForm,
    ...(initialTemplate || {}),
    title: initialTemplate?.title || initialTemplate?.filename?.replace(/\.[^.]+$/, '') || '',
  }))
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    if (isUpload && !file) {
      setSaving(false)
      setError('Selecione um arquivo de template para enviar.')
      return
    }

    try {
      await onSave({ ...formData, file })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="modal document-modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>

        <h2>{isUpload ? 'Enviar template' : 'Editar template'}</h2>

        {isUpload && (
          <label className="file-picker">
            Arquivo
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0]
                if (!selectedFile) return
                setFile(selectedFile)
                if (!formData.title) updateField('title', selectedFile.name.replace(/\.[^.]+$/, ''))
              }}
              required
            />
          </label>
        )}

        <label>
          Título
          <input value={formData.title} onChange={(event) => updateField('title', event.target.value)} required />
        </label>

        <label className="textarea-field">
          Descrição
          <textarea
            value={formData.description || ''}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Resumo curto sobre o uso do template"
            rows={4}
          />
        </label>

        {!isUpload && (
          <label className="inline-checkbox">
            <input type="checkbox" checked={formData.active} onChange={(event) => updateField('active', event.target.checked)} />
            Ativo
          </label>
        )}

        {error && (
          <div className="form-alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        <div className="confirm-row">
          <button className="ghost-btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn" type="submit" disabled={saving}>
            <Check size={17} />
            {saving ? 'Salvando...' : isUpload ? 'Enviar' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function UserModal({ initialUser, mode, onClose, onSave }) {
  const [formData, setFormData] = useState(() => ({
    ...emptyUserForm,
    ...(initialUser || {}),
    password: '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEditing = mode === 'edit'

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    if (!isEditing && formData.password.length < 6) {
      setSaving(false)
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }

    try {
      await onSave(formData)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="modal user-modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>

        <h2>{isEditing ? 'Editar usuário' : 'Novo usuário'}</h2>

        <label>
          Nome
          <input value={formData.name} onChange={(event) => updateField('name', event.target.value)} required />
        </label>

        <label>
          E-mail
          <input
            type="email"
            value={formData.email}
            onChange={(event) => updateField('email', event.target.value)}
            required
          />
        </label>

        <label>
          {isEditing ? 'Nova senha' : 'Senha temporária'}
          <input
            type="password"
            value={formData.password}
            onChange={(event) => updateField('password', event.target.value)}
            placeholder={isEditing ? 'Deixe em branco para manter' : 'Mínimo 6 caracteres'}
            required={!isEditing}
          />
        </label>

        <div className="modal-grid">
          <label>
            Função
            <select value={formData.role} onChange={(event) => updateField('role', event.target.value)}>
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="viewer">Visualizador</option>
            </select>
          </label>

          <label>
            Status
            <select value={formData.status} onChange={(event) => updateField('status', event.target.value)}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="pending">Pendente</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="form-alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        <div className="confirm-row">
          <button className="ghost-btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn" type="submit" disabled={saving}>
            <Check size={17} />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function DocumentModal({ initialDocument, mode, onClose, onSave }) {
  const isUpload = mode === 'upload'
  const [formData, setFormData] = useState(() => ({
    ...emptyDocumentForm,
    ...(initialDocument || {}),
    title: initialDocument?.title || initialDocument?.filename?.replace(/\.[^.]+$/, '') || '',
  }))
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    if (isUpload && !file) {
      setSaving(false)
      setError('Selecione um PDF para enviar.')
      return
    }

    try {
      await onSave({ ...formData, file })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="modal document-modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>

        <h2>{isUpload ? 'Enviar PDF' : 'Editar PDF'}</h2>

        {isUpload && (
          <label className="file-picker">
            Arquivo PDF
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => {
                const selectedFile = event.target.files?.[0]
                if (!selectedFile) return
                setFile(selectedFile)
                if (!formData.title) updateField('title', selectedFile.name.replace(/\.[^.]+$/, ''))
              }}
              required
            />
          </label>
        )}

        <label>
          Título
          <input value={formData.title} onChange={(event) => updateField('title', event.target.value)} required />
        </label>

        <label className="textarea-field">
          Descrição
          <textarea
            value={formData.description || ''}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Resumo curto sobre o conteúdo do PDF"
            rows={4}
          />
        </label>

        {!isUpload && (
          <label className="inline-checkbox">
            <input type="checkbox" checked={formData.active} onChange={(event) => updateField('active', event.target.checked)} />
            Ativo na base de conhecimento da IA
          </label>
        )}

        {error && (
          <div className="form-alert">
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        <div className="confirm-row">
          <button className="ghost-btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-btn" type="submit" disabled={saving}>
            <Check size={17} />
            {saving ? 'Salvando...' : isUpload ? 'Enviar' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ProfilePage({ currentUser }) {
  return (
    <section className="profile-page">
      <div className="profile-card">
        <div className="profile-avatar">{getInitials(currentUser.name || currentUser.email)}</div>
        <div>
          <h1>{currentUser.name || 'Usuário'}</h1>
          <p>{currentUser.email}</p>
        </div>
        <dl>
          <div>
            <dt>Função</dt>
            <dd>{roleLabels[currentUser.role] || currentUser.role}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{statusLabels[currentUser.status] || currentUser.status}</dd>
          </div>
          <div>
            <dt>Criado em</dt>
            <dd>{formatDate(currentUser.created_at)}</dd>
          </div>
          <div>
            <dt>Último acesso</dt>
            <dd>{formatDate(currentUser.last_login, 'Nunca')}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function AccessDenied({ onNavigate }) {
  return (
    <section className="state-page">
      <Shield size={34} />
      <h1>Acesso restrito</h1>
      <p>Somente usuários administradores podem acessar este painel.</p>
      <button className="primary-btn" onClick={() => onNavigate('/')}>
        Voltar para o chat
      </button>
    </section>
  )
}

function NotFound({ onNavigate }) {
  return (
    <section className="state-page">
      <AlertCircle size={34} />
      <h1>Página não encontrada</h1>
      <button className="primary-btn" onClick={() => onNavigate('/')}>
        Voltar
      </button>
    </section>
  )
}

function ConfirmModal({ confirmLabel, description, onCancel, onConfirm, title }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <button className="modal-close" onClick={onCancel} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="confirm-row">
          <button className="ghost-btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary-btn" onClick={onConfirm}>
            <Check size={17} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function RoleBadge({ role }) {
  const Icon = roleIcons[role] || UserRound

  return (
    <span className={`role-badge ${role}`}>
      <Icon size={13} />
      {roleLabels[role] || role}
    </span>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${status}`}>
      <span />
      {statusLabels[status] || status}
    </span>
  )
}

async function apiRequest(endpoint, options = {}) {
  const { body, method = 'GET', userId } = options
  const headers = {}
  let requestBody = body

  if (userId) {
    headers['X-User-Id'] = String(userId)
  }

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: requestBody,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload.detail || 'Erro ao conectar com o servidor.'
    throw new Error(message)
  }

  return payload
}

function getInitialRoute() {
  return window.location.pathname || '/'
}

function getStoredUser() {
  try {
    const rawUser = localStorage.getItem(USER_STORAGE_KEY)
    return rawUser ? JSON.parse(rawUser) : null
  } catch {
    return null
  }
}

function firstName(user) {
  const value = user.name || user.email || 'Usuário'
  return value.split(' ')[0].split('@')[0]
}

function getInitials(value) {
  if (!value) return 'U'
  const parts = value.replace('@', ' ').split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatDate(value, fallback = '-') {
  if (!value) return fallback
  const raw = value
  const numeric =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? Number(raw.trim())
        : null

  const date = numeric !== null ? new Date(numeric < 1e12 ? numeric * 1000 : numeric) : new Date(String(raw).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatShortDate(value) {
  if (!value) return ''
  const raw = value
  const numeric =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? Number(raw.trim())
        : null

  const date = numeric !== null ? new Date(numeric < 1e12 ? numeric * 1000 : numeric) : new Date(String(raw).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function formatFileSize(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default App
