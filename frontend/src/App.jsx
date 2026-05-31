import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  AlertCircle,
  Bell,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Code2,
  Database,
  Download,
  Eye,
  FileText,
  FileUp,
  Home,
  LayoutTemplate,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
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
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import './App.css'

const API_BASE = 'http://localhost:8000/api'
const USER_STORAGE_KEY = 'portogpt_user'
const THEME_STORAGE_KEY = 'portogpt_theme'

const ACCENT_COLORS = [
  { id: 'porto', label: 'Azul Porto', primary: '#0b4fd8', accent: '#00a6c8', soft: '#dce9ff' },
  { id: 'ocean', label: 'Oceano', primary: '#0077b6', accent: '#00b4d8', soft: '#d9f4fb' },
  { id: 'violet', label: 'Violeta', primary: '#7c3aed', accent: '#c65aa8', soft: '#ede7ff' },
  { id: 'emerald', label: 'Esmeralda', primary: '#0f8f68', accent: '#2dd4bf', soft: '#dff8f2' },
  { id: 'sunset', label: 'Coral', primary: '#e35d6a', accent: '#f59e0b', soft: '#ffe8ec' },
]

const DEFAULT_ACCENT = ACCENT_COLORS[0]

const roleLabels = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Usuário',
}

const statusLabels = {
  active: 'Ativo',
  inactive: 'Inativo',
  pending: 'Pendente',
  pendente: 'Pendente',
  aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    reenviado: 'Reenviado',
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

const TEMPLATE_CATEGORIES = ['Relatório', 'Ofício', 'Memorando', 'Declaração', 'Contrato', 'Outro']

const TEMPLATE_FIELD_TYPES = [
  { value: 'text', label: 'Texto curto' },
  { value: 'paragraph', label: 'Parágrafo' },
  { value: 'table', label: 'Tabela' },
]

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
  { path: '/admin/approvals', label: 'Aprovações', icon: Clock },
  { path: '/admin/templates', label: 'Templates', icon: LayoutTemplate },
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
  const [adminSidebarCollapsed, setAdminSidebarCollapsed] = useState(true)

  const selectedAccent = useMemo(
    () => ACCENT_COLORS.find((color) => color.id === currentUser?.accentColor) || DEFAULT_ACCENT,
    [currentUser?.accentColor],
  )
  const accentStyle = useMemo(
    () => ({
      '--primary': selectedAccent.primary,
      '--accent': selectedAccent.accent,
      '--primary-soft': selectedAccent.soft,
    }),
    [selectedAccent],
  )

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
        const updatedUser = { ...user, accentColor: currentUser.accentColor || DEFAULT_ACCENT.id }
        setCurrentUser(updatedUser)
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser))
      })
      .catch(() => {
        localStorage.removeItem(USER_STORAGE_KEY)
        setCurrentUser(null)
      })
  }, [currentUser?.id])

  const handleLogin = (user) => {
    const storedUser = getStoredUser()
    const updatedUser = { ...user, accentColor: storedUser?.accentColor || DEFAULT_ACCENT.id }
    setCurrentUser(updatedUser)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updatedUser))
    navigate('/', true)
  }

  const handleLogout = () => {
    localStorage.removeItem(USER_STORAGE_KEY)
    setCurrentUser(null)
    setActiveSessionId(null)
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

  const updateAccentColor = useCallback((accentColor) => {
    setCurrentUser((user) => {
      if (!user) return user
      const updated = { ...user, accentColor }
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} theme={theme} onToggleTheme={toggleTheme} />
  }

  const effectiveRoute = route === '/login' ? '/' : route === '/admin' ? '/admin/dashboard' : route
  const isAdminRoute = effectiveRoute.startsWith('/admin')
  const isAdmin = currentUser.role === 'admin'
  const canManagePdfs = currentUser.role === 'admin' || currentUser.role === 'editor'

  return (
    <div
      className={`app-container ${isAdminRoute ? 'admin-container' : ''} ${sidebarCollapsed && !isAdminRoute ? 'sidebar-collapsed' : ''} ${adminSidebarCollapsed && isAdminRoute ? 'admin-sidebar-collapsed' : ''}`}
      style={accentStyle}
    >
      {!isAdminRoute && (
        <ChatSidebar
          currentUser={currentUser}
          activeSessionId={activeSessionId}
          theme={theme}
          collapsed={sidebarCollapsed}
          refreshKey={historyRefreshKey}
          onNavigate={navigate}
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
          isAdminRoute={isAdminRoute}
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
          canManagePdfs,
          onNavigate: navigate,
          chatSessionKey,
          activeSessionId,
          onChatSessionChange: handleChatSessionChange,
          onAccentChange: updateAccentColor,
          onToggleTheme: toggleTheme,
          theme,
          adminSidebarCollapsed,
          onToggleAdminSidebar: () => setAdminSidebarCollapsed((value) => !value),
        })}
      </main>
    </div>
  )
}

function renderRoute({ route, currentUser, isAdmin, canManagePdfs, onNavigate, chatSessionKey, activeSessionId, onChatSessionChange, onAccentChange, onToggleTheme, theme, adminSidebarCollapsed, onToggleAdminSidebar }) {
  if (route.startsWith('/admin')) {
    if (!isAdmin && !(canManagePdfs && route === '/admin/pdfs')) {
      return <AccessDenied onNavigate={onNavigate} />
    }

    return (
      <AdminLayout collapsed={adminSidebarCollapsed} route={route} currentUser={currentUser} onNavigate={onNavigate} onToggleCollapsed={onToggleAdminSidebar}>
        {(route === '/admin' || route === '/admin/dashboard') && isAdmin && <AdminDashboardPage currentUser={currentUser} onNavigate={onNavigate} />}
        {route === '/admin/knowledge' && isAdmin && <KnowledgePage currentUser={currentUser} onNavigate={onNavigate} />}
        {route === '/admin/pdfs' && <PdfManagementPage currentUser={currentUser} />}
        {route === '/admin/approvals' && isAdmin && <ApprovalRequestsPage currentUser={currentUser} />}
        {route === '/admin/templates' && isAdmin && <TemplateManagementPage currentUser={currentUser} />}
        {route === '/admin/users' && isAdmin && <AdminUsersPage currentUser={currentUser} />}
      </AdminLayout>
    )
  }

  if (route === '/perfil') {
    return <ProfilePage currentUser={currentUser} onAccentChange={onAccentChange} onNavigate={onNavigate} />
  }

  if (route === '/notificacoes') {
    return <NotificationsPage currentUser={currentUser} onNavigate={onNavigate} />
  }

  if (route === '/pdfs') {
    return <AvailablePdfsPage currentUser={currentUser} />
  }

  if (route === '/solicitacoes') {
    return <MySubmissionsPage currentUser={currentUser} />
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
            <img className="brand-logo" src={theme === 'dark' ? '/logo-white.svg' : '/logo-dark.svg'} alt="" aria-hidden="true" />
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
  onNavigate,
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

  const roleNavItems = useMemo(() => {
    const homeItem = { path: '/', label: 'Home', icon: Home }
    if (currentUser.role === 'editor') {
      return [homeItem, { path: '/admin/pdfs', label: 'Gerenciar PDFs', icon: FileText }]
    }
    if (currentUser.role === 'admin') {
      return [
        homeItem,
        { path: '/admin/dashboard', label: 'Administração', icon: Shield },
      ]
    }
    return [
      homeItem,
      { path: '/pdfs', label: 'PDFs disponíveis', icon: FileText },
      { path: '/solicitacoes', label: 'Minhas solicitações', icon: Clock },
    ]
  }, [currentUser.role])

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        
        <button
          className="brand-lockup brand-button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Abrir barra lateral' : 'Fechar barra lateral'}
          title={collapsed ? 'Abrir barra lateral' : 'Fechar barra lateral'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
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

        {roleNavItems.map((item) => (
          <button key={item.path} onClick={() => onNavigate(item.path)} className="sidebar-nav-btn">
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
        
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
  isAdminRoute,
  onAvatarOpen,
  onLogout,
  onNavigate,
  onToggleTheme,
  theme,
}) {
  const [notifications, setNotifications] = useState({ pending_documents: 0, items: [] })
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationClosedByClick, setNotificationClosedByClick] = useState(false)

  useEffect(() => {
    let active = true
    if (!currentUser?.id) return undefined

    const loadNotifications = () => {
      apiRequest('/notifications', { userId: currentUser.id })
        .then((payload) => {
          if (active) setNotifications(payload)
        })
        .catch(() => {
          if (active) setNotifications({ pending_documents: 0, items: [] })
        })
    }

    loadNotifications()
    const timer = window.setInterval(loadNotifications, 30000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [currentUser?.id])

  const latestUserNotice = currentUser.role === 'viewer' ? notifications.items?.[0] : null
  const notificationItems = notifications.items || []
  const unreadCount = isAdmin ? Number(notifications.pending_documents || 0) : notificationItems.length
  const showNotifications = currentUser.role !== 'editor'
  const clearNotifications = async () => {
    try {
      await apiRequest('/notifications/read', { method: 'POST', userId: currentUser.id })
    } catch {
      // A limpeza visual continua mesmo se a persistencia falhar momentaneamente.
    }
    setNotifications({ pending_documents: 0, items: [] })
    setNotificationOpen(false)
    setNotificationClosedByClick(true)
  }

  return (
    <div className="top-bar">
      <div className="top-left">
      </div>

      <div className="top-actions">
        {showNotifications && (
        <div
          className={`notification-wrap ${notificationOpen ? 'open' : ''} ${notificationClosedByClick ? 'closed' : ''}`}
          onMouseEnter={() => setNotificationClosedByClick(false)}
          onMouseLeave={() => {
            setNotificationOpen(false)
            setNotificationClosedByClick(false)
          }}
        >
          <button
            className={`notification-bell ${latestUserNotice ? latestUserNotice.status : ''}`}
            onClick={() => {
              setNotificationOpen((value) => {
                const next = !value
                setNotificationClosedByClick(!next)
                return next
              })
            }}
            title={isAdmin ? 'Notificações de solicitações' : 'Notificações de documentos'}
          >
            <Bell size={18} />
            {unreadCount > 0 && <span>{unreadCount}</span>}
          </button>
          <div className="notification-popover">
            <div className="notification-popover-head">
                <strong>Notificações</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={clearNotifications}>Limpar</button>
                  <button onClick={() => onNavigate('/notificacoes')}>Ver todas</button>
                </div>
            </div>
            <div className="notification-popover-list">
              {notificationItems.length === 0 && <p>Nenhuma notificação nova.</p>}
              {notificationItems.slice(0, 4).map((item) => (
                <button key={item.id} onClick={() => onNavigate(isAdmin ? '/admin/approvals' : '/solicitacoes')}>
                  <span>{notificationMessage(item, currentUser)}</span>
                  <small>{formatDateTime(item.updated_at || item.created_at)}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
        )}

        <div
          className="avatar-menu-wrap"
          onMouseEnter={() => onAvatarOpen(true)}
          onMouseLeave={() => onAvatarOpen(false)}
        >
          <button className="user-profile" onClick={() => onAvatarOpen(!avatarOpen)} aria-label="Abrir menu do usuário">
            {getInitials(currentUser.name || currentUser.email)}
          </button>

          <div className={`avatar-menu ${avatarOpen ? 'open' : ''}`}>
              <div className="avatar-menu-header">
                <strong>{currentUser.name || 'Usuário'}</strong>
                <span>{currentUser.email}</span>
              </div>
              <button onClick={() => onNavigate('/perfil')}>
                <User size={17} />
                Meu perfil
              </button>
              <button onClick={() => onNavigate('/notificacoes')}>
                <Bell size={17} />
                Minhas notificações
              </button>
              <button onClick={onToggleTheme}>
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                {theme === 'light' ? 'Modo escuro' : 'Modo claro'}
              </button>
              <button onClick={onLogout}>
                <LogOut size={17} />
                Sair
              </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const TEMPLATE_INTENT_RE = /template|aplicar\s+template|colocar\s+no\s+template|encaixar\s+no\s+template|usar\s+template|formatar\s+com\s+template|gerar\s+com\s+template|quero\s+template/i

function ChatPage({ currentUser, onSessionChange, sessionId }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(Boolean(sessionId))
  const [currentSessionId, setCurrentSessionId] = useState(sessionId || null)
  const [welcomeSuggestions, setWelcomeSuggestions] = useState([])
  const [file, setFile] = useState(null)
  const [lastUploadedPdfText, setLastUploadedPdfText] = useState('')
  const [templateViewerHtml, setTemplateViewerHtml] = useState(null)
  const [templateViewerTitle, setTemplateViewerTitle] = useState('')
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

  const applyTemplateWithFile = async (template, file) => {
    setLoading(true)
    setMessages((prev) => [...prev, {
      role: 'assistant',
      text: `Aplicando o template **${template.title || template.filename}** ao arquivo **${file.name}**…`,
    }])
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await apiRequest(`/templates/${encodeURIComponent(template.filename)}/apply-file`, {
        method: 'POST',
        userId: currentUser.id,
        body: formData,
      })
      // Usa o identificador do documento extraído como nome; fallback para título do template
      const fields = result.fields || {}
      const docName =
        fields.numero_relatorio ||
        fields.numero ||
        fields.codigo ||
        fields.titulo ||
        template.title ||
        'documento'
      const assistantText = 'Documento formatado com sucesso! Clique para visualizar.'
      const templateResult = { html: result.html, title: docName }
      try {
        const saveRes = await apiRequest('/chat/history', {
          method: 'POST',
          body: {
            user_id: currentUser.id,
            session_id: currentSessionId,
            user_message: `*Aplicou template ${template.title || template.filename} no arquivo ${file.name}*`,
            assistant_message: assistantText,
            metadata: { templateResult },
          }
        })
        if (saveRes.session_id && saveRes.session_id !== currentSessionId) {
          setCurrentSessionId(saveRes.session_id)
          onSessionChange?.(saveRes.session_id)
        }
      } catch (e) {}

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: assistantText,
          templateResult,
        },
      ])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Erro ao aplicar template: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (overrideText) => {
    const text = String(overrideText ?? input).trim()
    if (!text || loading || historyLoading) return

    if (TEMPLATE_INTENT_RE.test(text)) {
      setMessages((prev) => [...prev, { role: 'user', text }])
      setInput('')
      setLoading(true)
      try {
        const payload = await apiRequest('/templates', { userId: currentUser.id })
        const activeTemplates = (payload.templates || []).filter((t) => t.active)
        // Preferir o texto extraído diretamente do PDF enviado; fallback para histórico do chat
        const pdfContext = lastUploadedPdfText || messages.map((m) => m.text).filter(Boolean).join('\n')
        if (!activeTemplates.length) {
          const assistantText = 'Nenhum template ativo cadastrado. Peça ao administrador para criar ou ativar um.'
          try {
            const saveRes = await apiRequest('/chat/history', {
              method: 'POST',
              body: { user_id: currentUser.id, session_id: currentSessionId, user_message: text, assistant_message: assistantText }
            })
            if (saveRes.session_id && saveRes.session_id !== currentSessionId) {
              setCurrentSessionId(saveRes.session_id)
              onSessionChange?.(saveRes.session_id)
            }
          } catch (e) {}
          setMessages((prev) => [...prev, { role: 'assistant', text: assistantText }])
        } else {
          const assistantText = 'Escolha o template desejado e selecione o PDF a formatar:'
          try {
            const saveRes = await apiRequest('/chat/history', {
              method: 'POST',
              body: { user_id: currentUser.id, session_id: currentSessionId, user_message: text, 
                assistant_message: assistantText, metadata: {templateSelect: { templates: activeTemplates, pdfContext }} }
            })
            if (saveRes.session_id && saveRes.session_id !== currentSessionId) {
              setCurrentSessionId(saveRes.session_id)
              onSessionChange?.(saveRes.session_id)
            }
          } catch (e) {}
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: assistantText,
              templateSelect: { templates: activeTemplates, pdfContext },
            },
          ])
        }
      } catch {
        setMessages((prev) => [...prev, { role: 'assistant', text: 'Não foi possível carregar os templates.' }])
      } finally {
        setLoading(false)
      }
      return
    }

    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const data = await apiStreamChat(
        { query: text, user_id: currentUser.id, session_id: currentSessionId },
        (chunk) => {
          setMessages((prev) => {
              const lastMessage = prev[prev.length - 1];
              if (!lastMessage || lastMessage.role !== 'assistant') {
                return [...prev, { role: 'assistant', text: chunk }];
              }
              return prev.map((message, index) =>
                index === prev.length - 1 ? { ...message, text: `${message.text}${chunk}` } : message,
              )
            }
          )
        },
      )

      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id)
        onSessionChange?.(data.session_id)
      } else if (data.session_id) {
        onSessionChange?.(data.session_id)
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: err.message || 'Erro ao conectar com o servidor.' }])
    } finally {
      setLoading(false)
    }
  }

  const finishUpload = async () => {
    if (!file) return

    const text = input.trim()
    const selectedFile = file
    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('message', text)
    if (currentSessionId) formData.append('session_id', String(currentSessionId))

    setMessages((prev) => [...prev, {
      role: 'user',
      text: text || `Enviei o PDF ${selectedFile.name}.`,
      fileName: selectedFile.name,
    }])
    setInput('')
    setLoading(true)

    try {
      const data = await apiRequest('/upload', {
        method: 'POST',
        userId: currentUser.id,
        body: formData,
      })
      if (data.session_id && data.session_id !== currentSessionId) {
        setCurrentSessionId(data.session_id)
        onSessionChange?.(data.session_id)
      } else if (data.session_id) {
        onSessionChange?.(data.session_id)
      }
      if (data.pdf_text) setLastUploadedPdfText(data.pdf_text)
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: data.response,
        previewUrl: data.document?.id ? buildSubmissionUrl(data.document.id, 'processed', currentUser.id) : null,
        previewLabel: 'Prévia do PDF formatado',
      }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: err.message }])
    } finally {
      setLoading(false)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const closeUploadModal = () => {
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <>
      {templateViewerHtml && (
        <HtmlDocViewer
          html={templateViewerHtml}
          title={templateViewerTitle}
          onClose={() => { setTemplateViewerHtml(null); setTemplateViewerTitle('') }}
        />
      )}
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

                    return duplicated.map((item, index) => (
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
                              <h2>{item.title}</h2>
                            </article>

                            <article className="glass-card back">
                              <p>{item.subtitle}</p>
                            </article>
                          </div>
                        </button>
                      ))
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
                  <div className="message-text">
                    {message.role === 'assistant' ? <ReactMarkdown>{message.text}</ReactMarkdown> : message.text}
                    {message.fileName && (
                      <div className="attached-file-chip">
                        <FileText size={15} />
                        {message.fileName}
                      </div>
                    )}
                    {message.previewUrl && (
                      <PdfPreview url={message.previewUrl} label={message.previewLabel || 'Prévia do PDF'} />
                    )}
                    {message.templateSelect && (
                      <div className="template-select-buttons">
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
                          Clique no template e selecione o PDF a formatar:
                        </p>
                        {message.templateSelect.templates.map((tpl) => (
                          <button
                            key={tpl.filename}
                            className="template-select-btn"
                            disabled={loading}
                            onClick={() => {
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = '.pdf'
                              input.onchange = (e) => {
                                const f = e.target.files?.[0]
                                if (f) applyTemplateWithFile(tpl, f)
                              }
                              input.click()
                            }}
                          >
                            <LayoutTemplate size={15} />
                            {tpl.title || tpl.filename}
                          </button>
                        ))}
                      </div>
                    )}
                    {message.templateResult && (
                      <button
                        className="primary-btn template-result-btn"
                        onClick={() => {
                          setTemplateViewerHtml(message.templateResult.html)
                          setTemplateViewerTitle(message.templateResult.title)
                        }}
                      >
                        <Eye size={15} />
                        Visualizar documento formatado
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="message-row assistant">
                <div className="message-content">
                  <div className="message-text loading-text">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="input-container">
        {file && (
          <div className="composer-attachment">
            <FileText size={16} />
            <span>{file.name}</span>
            <button onClick={closeUploadModal} aria-label="Remover anexo">
              <X size={14} />
            </button>
          </div>
        )}
        <div className="input-box">
          <div className="composer-model-selector" aria-label="Modelo atual">
            PortoGpt 1.0
            <ChevronDown size={15} />
          </div>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (file) finishUpload()
                else sendMessage()
              }
            }}
            placeholder={file ? 'Escreva uma mensagem para enviar com o PDF...' : 'Digite sua pergunta aqui...'}
            disabled={loading || historyLoading}
          />
          <input
            type="file"
            ref={fileInput}
            onChange={(event) => {
              const selectedFile = event.target.files?.[0]
              if (!selectedFile) return
              setFile(selectedFile)
            }}
            style={{ display: 'none' }}
          />
          <button className="icon-btn" title="Fazer upload de arquivo PDF" onClick={() => fileInput.current?.click()} disabled={loading || historyLoading}>
            <FileUp size={20} />
          </button>
          <button className="send-btn" title="Enviar mensagem" onClick={() => (file ? finishUpload() : sendMessage())} disabled={loading || historyLoading || (!input.trim() && !file)}>
            <Send size={18} />
          </button>
        </div>
        <p className="disclaimer">O PortoGpt pode cometer erros. Verifique as informações importantes.</p>
      </div>

    </>
  )
}

function AdminLayout({ children, collapsed, currentUser, route, onNavigate, onToggleCollapsed }) {
  const visibleNavItems = adminNavItems.filter((item) => {
    if (currentUser.role === 'admin') return true
    return item.path === '/admin/pdfs'
  })

  return (
    <section className="admin-view">
      <aside className="admin-menu">
        <div className="admin-menu-title">
          <button
            className="admin-menu-toggle"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Abrir menu administrativo' : 'Fechar menu administrativo'}
            title={collapsed ? 'Abrir menu administrativo' : 'Fechar menu administrativo'}
          >
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            <span>Painel</span>
          </button>
        </div>
        <nav aria-label="Menu administrativo">
          <button className="admin-menu-item" onClick={() => onNavigate('/')}>
            <Home size={18} />
            <span>Chat inicial</span>
          </button>
          {visibleNavItems.map((item) => (
            <button
              key={item.path}
              className={`admin-menu-item ${route === item.path ? 'active' : ''}`}
              onClick={() => onNavigate(item.path)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="admin-content">{children}</div>
    </section>
  )
}

function AdminDashboardPage({ currentUser, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await apiRequest('/admin/dashboard', { userId: currentUser.id })
      setStats(payload.stats)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const users = stats?.users || { total: 0, active: 0, by_role: {} }
  const docs = stats?.documents || { total: 0, approved: 0, pending: 0, rejected: 0, recent: [] }
  const chat = stats?.chat || { sessions: 0, messages: 0, messages_7d: 0 }
  const templates = stats?.templates || { total: 0 }

  return (
    <div className="admin-panel dashboard-panel">
      <div className="admin-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral da operação, conhecimento e uso do PortoGpt.</p>
        </div>
        <div className="heading-actions">
          <button className="ghost-btn" onClick={() => onNavigate('/')}>
            <Home size={17} />
            Chat
          </button>
          <button className="ghost-btn" onClick={loadDashboard} disabled={loading}>
            <Database size={17} />
            Atualizar
          </button>
        </div>
      </div>

      {error && <div className="form-alert admin-alert"><AlertCircle size={17} />{error}</div>}

      <div className="dashboard-grid">
        <article className="dashboard-card hero-metric">
          <span>Documentos</span>
          <strong>{docs.total}</strong>
          <p>{docs.approved} aprovados · {docs.pending} pendentes · {docs.rejected} reprovados</p>
        </article>
        <article className="dashboard-card">
          <FileText size={22} />
          <span>Templates</span>
          <strong>{templates.total}</strong>
          <p>Modelos prontos para o fluxo de formatação.</p>
        </article>
        <article className="dashboard-card">
          <Users size={22} />
          <span>Usuários ativos</span>
          <strong>{users.active}</strong>
          <p>{users.by_role?.admin || 0} admins · {users.by_role?.editor || 0} editores · {users.by_role?.viewer || 0} usuários</p>
        </article>
        <article className="dashboard-card">
          <MessageSquare size={22} />
          <span>Conversas</span>
          <strong>{chat.sessions}</strong>
          <p>{chat.messages} mensagens registradas, {chat.messages_7d} nos últimos 7 dias.</p>
        </article>
      </div>

      <div className="dashboard-split">
        <section className="dashboard-section">
          <div className="section-heading compact">
            <div>
              <h2>Saúde da base</h2>
              <p>Publicação e validação dos documentos.</p>
            </div>
          </div>
          <div className="health-bars">
            <DashboardBar label="Aprovados" value={docs.approved} total={docs.total} tone="success" />
            <DashboardBar label="Pendentes" value={docs.pending} total={docs.total} tone="warning" />
            <DashboardBar label="Reprovados" value={docs.rejected} total={docs.total} tone="danger" />
          </div>
        </section>

        <section className="dashboard-section">
          <div className="section-heading compact">
            <div>
              <h2>Atividade recente</h2>
              <p>Últimas movimentações na base documental.</p>
            </div>
          </div>
          <div className="dashboard-activity">
            {!docs.recent?.length && <div className="empty-panel">Nenhuma movimentação recente.</div>}
            {docs.recent?.map((doc) => (
              <article key={doc.id}>
                <StatusBadge status={(doc.resubmission_count || 0) > 0 && (doc.status === 'pendente' || doc.status === 'pending') ? 'reenviado' : (doc.status || (doc.active ? 'aprovado' : 'inactive'))} />
                <div>
                  <strong>{doc.title}</strong>
                  <span>{doc.uploader_name || doc.uploader_email || 'Sistema'} · {formatDateTime(doc.updated_at || doc.created_at)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function DashboardBar({ label, total, value, tone }) {
  const pct = total > 0 ? Math.round((Number(value || 0) / Number(total)) * 100) : 0
  return (
    <div className="dashboard-bar">
      <div>
        <strong>{label}</strong>
        <span>{value || 0}</span>
      </div>
      <div className="bar-track">
        <span className={tone} style={{ width: `${pct}%` }} />
      </div>
    </div>
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
  const [historyDocument, setHistoryDocument] = useState(null)
  const canReindex = currentUser.role === 'admin'

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
      setNotice('PDF removido do armazenamento e do banco de dados.')
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
          {canReindex && (
            <button className="ghost-btn" onClick={reindexAllDocuments}>
              <Database size={17} />
              Reindexar base
            </button>
          )}
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
                <StatusBadge status={(doc.resubmission_count || 0) > 0 && (doc.status === 'pendente' || doc.status === 'pending') ? 'reenviado' : (doc.status || (doc.active ? 'aprovado' : 'inactive'))} />
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

              <div className="document-origin">
                <span>
                  Origem: {doc.source === 'chat' ? 'upload de usuário no chat' : doc.source === 'gerenciamento' ? 'gerenciamento de PDFs' : 'base inicial'}
                </span>
                <span>
                  Enviado por {doc.uploader_name || doc.uploader_email || 'Sistema'}
                </span>
                {doc.approved_by && (
                  <span>
                    Aprovado por {doc.approved_by_name || doc.approved_by_email || 'administrador'} em {formatDateTime(doc.approved_at)}
                  </span>
                )}
              </div>

              <div className="document-actions">
                <a className="icon-btn small link-btn" href={buildDocumentUrl(doc.filename, currentUser.id)} target="_blank" rel="noreferrer" aria-label="Abrir PDF">
                  <Eye size={16} />
                </a>
                <button className="icon-btn small" onClick={() => openEditModal(doc)} aria-label="Editar PDF">
                  <Pencil size={16} />
                </button>
                <button className="icon-btn small" onClick={() => toggleDocument(doc)} aria-label={doc.active ? 'Desativar PDF' : 'Ativar PDF'}>
                  <Check size={16} />
                </button>
                <button className="icon-btn small" onClick={() => setHistoryDocument(doc)} aria-label="Ver histórico do PDF">
                  <Clock size={16} />
                </button>
                {canReindex && (
                  <button className="icon-btn small" onClick={() => reindexDocument(doc)} aria-label="Reindexar PDF">
                    <Database size={16} />
                  </button>
                )}
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

      {historyDocument && (
        <HistoryModal
          item={historyDocument}
          title="Histórico do PDF"
          onClose={() => setHistoryDocument(null)}
        />
      )}
    </div>
  )
}

function AvailablePdfsPage({ currentUser }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

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
    return docs.filter((doc) =>
      [doc.title, doc.filename, doc.description, doc.status].some((value) =>
        String(value || '').toLowerCase().includes(query),
      ),
    )
  }, [docs, search])

  return (
    <div className="admin-panel pdf-panel standalone-panel">
      <div className="admin-heading">
        <div>
          <h1>PDFs disponíveis</h1>
          <p>Documentos aprovados para consulta na base do PortoGpt.</p>
        </div>
      </div>

      <div className="admin-toolbar pdf-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input type="search" placeholder="Buscar PDFs..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <button className="ghost-btn" onClick={loadDocs} disabled={loading}>
          <Database size={17} />
          Atualizar
        </button>
      </div>

      {error && <div className="form-alert admin-alert"><AlertCircle size={17} />{error}</div>}

      <DocumentCards
        docs={filteredDocs}
        currentUser={currentUser}
        emptyText={loading ? 'Carregando PDFs...' : 'Nenhum PDF aprovado encontrado.'}
      />
    </div>
  )
}

function MySubmissionsPage({ currentUser }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await apiRequest('/submissions', { userId: currentUser.id })
      setSubmissions(payload.submissions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadSubmissions()
  }, [loadSubmissions])

  const resubmitSubmission = async (submission, selectedFile) => {
    if (!selectedFile) return
    const body = new FormData()
    body.append('file', selectedFile)
    try {
      await apiRequest(`/submissions/${submission.id}/resubmit`, {
        method: 'POST',
        userId: currentUser.id,
        body,
      })
      await loadSubmissions()
    } catch (err) {
      setError(err.message)
    }
  }

  const filteredSubmissions = useMemo(
    () => filterSubmissions(submissions, search, dateFilter),
    [submissions, search, dateFilter],
  )

  return (
    <div className="admin-panel pdf-panel standalone-panel">
      <div className="admin-heading">
        <div>
          <h1>Minhas solicitações</h1>
          <p>Acompanhe documentos enviados, saída processada e feedback do administrador.</p>
        </div>
      </div>

      {error && <div className="form-alert admin-alert"><AlertCircle size={17} />{error}</div>}

      <SubmissionFilters
        search={search}
        dateFilter={dateFilter}
        onSearchChange={setSearch}
        onDateChange={setDateFilter}
        onClear={() => {
          setSearch('')
          setDateFilter('')
        }}
      />

      <SubmissionList
        submissions={filteredSubmissions}
        currentUser={currentUser}
        emptyText={loading ? 'Carregando solicitações...' : 'Nenhuma solicitação enviada.'}
              onResubmit={resubmitSubmission}
      />
    </div>
  )
}

function NotificationsPage({ currentUser, onNavigate }) {
  const [payload, setPayload] = useState({ pending_documents: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest('/notifications', { userId: currentUser.id })
      setPayload(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const items = [...(payload.items || [])].sort((a, b) =>
    String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')),
  )

  const clearNotifications = async () => {
    try {
      await apiRequest('/notifications/read', { method: 'POST', userId: currentUser.id })
      setPayload({ pending_documents: 0, items: [] })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="admin-panel standalone-panel notifications-page">
      <div className="admin-heading">
        <div>
          <h1>Minhas notificações</h1>
          <p>Atualizações de documentos, solicitações e aprovações.</p>
        </div>
        <div className="heading-actions">
          <button className="ghost-btn" onClick={() => onNavigate('/')}>
            <Home size={17} />
            Home
          </button>
          <button className="ghost-btn" onClick={loadNotifications} disabled={loading}>
            <Database size={17} />
            Atualizar
          </button>
          <button className="ghost-btn" onClick={clearNotifications} disabled={loading || items.length === 0}>
            <X size={17} />
            Limpar
          </button>
        </div>
      </div>

      {error && <div className="form-alert admin-alert"><AlertCircle size={17} />{error}</div>}
      {!error && items.length === 0 && <div className="empty-panel">{loading ? 'Carregando notificações...' : 'Nenhuma notificação encontrada.'}</div>}

      <div className="notification-timeline">
        {items.map((item) => (
          <article className="notification-card" key={item.id}>
            <span className={`notification-dot ${item.status || 'pendente'}`} />
            <div>
              <strong>{notificationMessage(item, currentUser)}</strong>
              <small>{formatDateTime(item.updated_at || item.created_at)}</small>
              {item.feedback && <p>{item.feedback}</p>}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function ApprovalRequestsPage({ currentUser }) {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rejectingSubmission, setRejectingSubmission] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await apiRequest('/submissions', { userId: currentUser.id })
      setSubmissions(payload.submissions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    loadSubmissions()
  }, [loadSubmissions])

  const approveSubmission = async (submission) => {
    try {
      await apiRequest(`/submissions/${submission.id}/approve`, { method: 'POST', userId: currentUser.id })
      setNotice('Documento aprovado e publicado na base de PDFs.')
      await loadSubmissions()
    } catch (err) {
      setError(err.message)
    }
  }

  const rejectSubmission = (submission) => {
    setRejectingSubmission(submission)
  }

  const confirmRejectSubmission = async (submission, feedback) => {
    if (!feedback.trim()) {
      setError('Informe o motivo da reprovacao.')
      return
    }
    try {
      await apiRequest(`/submissions/${submission.id}/reject`, {
        method: 'POST',
        userId: currentUser.id,
        body: { feedback },
      })
      setNotice('Documento reprovado com feedback salvo.')
      setRejectingSubmission(null)
      await loadSubmissions()
    } catch (err) {
      setError(err.message)
    }
  }

  const filteredSubmissions = useMemo(
    () => filterSubmissions(submissions, search, dateFilter),
    [submissions, search, dateFilter],
  )

  return (
    <div className="admin-panel pdf-panel">
      <div className="admin-heading">
        <div>
          <h1>Solicitações de documentos</h1>
          <p>Acompanhe o fluxo completo e aprove ou reprove itens pendentes.</p>
        </div>
        <div className="heading-actions">
          <button className="ghost-btn" onClick={loadSubmissions} disabled={loading}>
            <Database size={17} />
            Atualizar
          </button>
        </div>
      </div>

      {error && <div className="form-alert admin-alert"><AlertCircle size={17} />{error}</div>}
      {notice && <div className="success-alert admin-alert"><Check size={17} />{notice}</div>}

      <SubmissionFilters
        search={search}
        dateFilter={dateFilter}
        onSearchChange={setSearch}
        onDateChange={setDateFilter}
        onClear={() => {
          setSearch('')
          setDateFilter('')
        }}
      />

      <SubmissionList
        submissions={filteredSubmissions}
        currentUser={currentUser}
        emptyText={loading ? 'Carregando solicitações...' : 'Nenhuma solicitação encontrada.'}
        onApprove={approveSubmission}
        onReject={rejectSubmission}
      />

      {rejectingSubmission && (
        <RejectReasonModal
          submission={rejectingSubmission}
          onClose={() => setRejectingSubmission(null)}
          onConfirm={(feedback) => confirmRejectSubmission(rejectingSubmission, feedback)}
        />
      )}
    </div>
  )
}

function DocumentCards({ docs, currentUser, emptyText, actions }) {
  if (!docs.length) return <div className="empty-panel">{emptyText}</div>

  return (
    <div className="documents-grid">
      {docs.map((doc) => (
        <article className="document-card" key={doc.id || doc.filename}>
          <div className="document-topline">
            <div className="document-icon"><FileText size={22} /></div>
            <StatusBadge status={doc.status || (doc.active ? 'aprovado' : 'inactive')} />
          </div>
          <div className="document-body">
            <h2>{doc.title || doc.filename}</h2>
            <p>{doc.description || 'Sem descrição cadastrada.'}</p>
            <span title={doc.filename}>{doc.filename}</span>
          </div>
          <div className="document-meta">
            <span>{formatFileSize(doc.size)}</span>
            <span>{formatDate(doc.updated_at || doc.created_at || doc.mtime)}</span>
          </div>
          <div className="document-actions">
            <a className="icon-btn small link-btn" href={buildDocumentUrl(doc.filename, currentUser.id)} target="_blank" rel="noreferrer" aria-label="Abrir PDF">
              <Eye size={16} />
            </a>
            {actions?.(doc)}
          </div>
        </article>
      ))}
    </div>
  )
}

function SubmissionFilters({ search, dateFilter, onSearchChange, onDateChange, onClear }) {
  return (
    <div className="admin-toolbar submission-filters">
      <label className="search-field">
        <Search size={18} />
        <input
          type="search"
          placeholder="Buscar por documento, usuário ou status..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <label className="date-filter-field">
        <Clock size={17} />
        <input
          type="date"
          value={dateFilter}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </label>
      {(search || dateFilter) && (
        <button className="ghost-btn" onClick={onClear}>
          <X size={16} />
          Limpar filtros
        </button>
      )}
    </div>
  )
}

function SubmissionList({ currentUser, emptyText, onApprove, onReject, onResubmit, submissions }) {
  const [historySubmission, setHistorySubmission] = useState(null)

  if (!submissions.length) return <div className="empty-panel">{emptyText}</div>

  return (
    <>
      <div className="submission-list">
        {submissions.map((submission) => (
          <article className="submission-card" key={submission.id}>
          <div className="submission-main">
            <div className="document-icon"><FileText size={21} /></div>
            <div>
              <h2>{submission.title || submission.original_name || submission.filename}</h2>
              <p>
                {submission.uploader_name || submission.uploader_email || 'Usuário'} · Enviado em {formatDate(submission.created_at)}
              </p>
              {submission.feedback && <small>{submission.feedback}</small>}
            </div>
            <StatusBadge status={(submission.resubmission_count || 0) > 0 && (submission.status === 'pendente' || submission.status === 'pending') ? 'reenviado' : (submission.status || (submission.active ? 'aprovado' : 'inactive'))} />
          </div>
          <div className="submission-actions">
            <a className="ghost-btn" href={buildSubmissionUrl(submission.id, 'raw', currentUser.id)} target="_blank" rel="noreferrer">
              <Eye size={16} />
              Original
            </a>
            <a className="ghost-btn" href={buildSubmissionUrl(submission.id, 'processed', currentUser.id)} target="_blank" rel="noreferrer">
              <FileText size={16} />
              Processado
            </a>
            <button className="ghost-btn" onClick={() => setHistorySubmission(submission)}>
              <Clock size={16} />
              Histórico
            </button>
            {onApprove && submission.status === 'pendente' && (
              <button className="primary-btn" onClick={() => onApprove(submission)}>
                <Check size={16} />
                Aprovar
              </button>
            )}
            {onReject && submission.status === 'pendente' && (
              <button className="ghost-btn danger-text" onClick={() => onReject(submission)}>
                <X size={16} />
                Reprovar
              </button>
            )}
            {onResubmit && submission.status === 'reprovado' && Number(submission.resubmission_count || 0) < 1 && (
              <label className="ghost-btn file-resubmit-btn">
                <FileUp size={16} />
                Reenviar
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(event) => {
                    const selectedFile = event.target.files?.[0]
                    event.target.value = ''
                    onResubmit(submission, selectedFile)
                  }}
                />
              </label>
            )}
          </div>
          </article>
        ))}
      </div>
      {historySubmission && (
        <HistoryModal
          item={historySubmission}
          title="Histórico da solicitação"
          onClose={() => setHistorySubmission(null)}
        />
      )}
    </>
  )
}

function HistoryModal({ item, onClose, title }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal reject-modal history-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-back" onClick={onClose}>
          <ChevronDown size={16} />
          Voltar
        </button>
        <div>
          <h2>{title}</h2>
          <p>{item.title || item.original_name || item.filename}</p>
        </div>
        <DocumentTimeline events={item.history || []} fallbackDocument={item} />
      </div>
    </div>
  )
}

function DocumentTimeline({ events, fallbackDocument }) {
  const timeline = events.length
    ? events
    : [{
        id: `fallback-${fallbackDocument.id}`,
        event_type: fallbackDocument.status || 'pendente',
        status: fallbackDocument.status,
        created_at: fallbackDocument.updated_at || fallbackDocument.created_at,
        user_name: fallbackDocument.uploader_name,
        user_email: fallbackDocument.uploader_email,
      }]

  return (
    <div className="document-timeline" aria-label="Linha do tempo da solicitação">
      {timeline.map((event, index) => (
        <div className="document-timeline-item" key={event.id || `${event.event_type}-${index}`}>
          <span className={`timeline-dot ${event.status || event.event_type}`} />
          <div>
            <strong>{index + 1}. {eventLabel(event)}</strong>
            <small>
              {formatDateTime(event.created_at)}
              {(event.user_name || event.user_email) && ` · ${event.user_name || event.user_email}`}
            </small>
            {event.message && <p>{event.message}</p>}
          </div>
        </div>
      ))}
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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState(null)

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

  const openHtmlEditor = async (tpl) => {
    try {
      const payload = await apiRequest(`/templates/${encodeURIComponent(tpl.filename)}/html`, {
        userId: currentUser.id,
      })
      setEditorTemplate({ ...tpl, html: payload.html })
    } catch {
      // Arquivo novo ainda não existe no servidor — usa HTML gerado localmente
      setEditorTemplate({ ...tpl, html: tpl._html || generateDefaultHtml(tpl) })
    }
  }

  const handleCreateTemplate = async (formData) => {
    const html = generateTemplateHtml(formData)
    setCreateModalOpen(false)
    setEditorTemplate({
      title: formData.name,
      description: `${formData.category} criado via formulário`,
      html,
      isNew: true,
    })
  }

  const handleSaveHtml = async (html) => {
    if (!editorTemplate) return
    try {
      if (editorTemplate.isNew) {
        await apiRequest('/templates/create', {
          method: 'POST',
          userId: currentUser.id,
          body: {
            name: editorTemplate.title,
            html,
            description: editorTemplate.description || '',
          },
        })
        setNotice('Template criado com sucesso.')
      } else {
        await apiRequest(`/templates/${encodeURIComponent(editorTemplate.filename)}/html`, {
          method: 'PUT',
          userId: currentUser.id,
          body: { html },
        })
        setNotice('HTML do template salvo com sucesso.')
      }
      await loadTemplates()
      setEditorTemplate(null)
    } catch (err) {
      setError(err.message)
    }
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
      setNotice('Template removido do armazenamento e do banco de dados.')
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
        <button className="primary-btn" onClick={() => setCreateModalOpen(true)}>
          <Plus size={17} />
          Criar template
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
                <button className="icon-btn small" onClick={() => openHtmlEditor(tpl)} aria-label="Editar HTML do template" title="Editar HTML">
                  <Code2 size={16} />
                </button>
                <button className="icon-btn small" onClick={() => openEditModal(tpl)} aria-label="Editar template" title="Editar metadados">
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

      {createModalOpen && (
        <CreateTemplateModal
          onClose={() => setCreateModalOpen(false)}
          onCreate={handleCreateTemplate}
        />
      )}

      {editorTemplate && (
        <TemplateEditorView
          template={editorTemplate}
          onBack={() => setEditorTemplate(null)}
          onSave={handleSaveHtml}
          currentUser={currentUser}
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

function generateDefaultHtml(tpl) {
  const title = tpl.title || tpl.filename?.replace(/\.[^.]+$/, '') || 'Template'
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12pt; color: #222; background: #fff; }
    header { display: flex; align-items: center; padding: 18px 40px; border-bottom: 2px solid #0b4fd8; position: relative; }
    .logo-ph { height: 48px; width: 80px; background: #dce9ff; color: #0b4fd8; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10pt; border-radius: 4px; flex-shrink: 0; }
    .company { position: absolute; left: 0; right: 0; text-align: center; font-size: 18pt; font-weight: 700; color: #0b4fd8; pointer-events: none; }
    .doc-title { text-align: center; padding: 28px 40px 12px; font-size: 16pt; font-weight: 700; }
    main { padding: 0 40px 40px; }
    .field { margin-bottom: 22px; }
    .field-label { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #0b4fd8; margin-bottom: 6px; }
    .field-value { font-size: 11pt; color: #333; line-height: 1.6; }
    footer { display: flex; align-items: center; justify-content: space-between; padding: 12px 40px; border-top: 1px solid #ddd; }
    .footer-ph { height: 28px; width: 48px; background: #dce9ff; color: #0b4fd8; display: flex; align-items: center; justify-content: center; font-size: 8pt; border-radius: 3px; }
    .page-num { font-size: 9pt; color: #888; }
  </style>
</head>
<body>
  <header>
    <div class="logo-ph">LOGO</div>
    <span class="company">{{ company_name }}</span>
  </header>

  <h1 class="doc-title">${title}</h1>

  <main>
    <section class="field">
      <h3 class="field-label">Campo 1</h3>
      <span class="field-value">{{ campo_1 }}</span>
    </section>

    <section class="field">
      <h3 class="field-label">Conteúdo</h3>
      <p class="field-value">{{ conteudo }}</p>
    </section>
  </main>

  <footer>
    <div class="footer-ph">LOGO</div>
    <span class="page-num">Página {{ page_number }} de {{ total_pages }}</span>
  </footer>
</body>
</html>`
}

function generateTemplateHtml({ name, category, header, footer, fields }) {
  const makeVar = (label) =>
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '') || 'campo'

  const fieldHtml = fields
    .map((f) => {
      const v = makeVar(f.label)
      const val =
        f.type === 'paragraph'
          ? `<div class="field-value">{{ ${v} }}</div>`
          : f.type === 'table'
          ? `<table class="field-table">\n        {% for row in ${v}_rows %}\n        <tr>{% for cell in row %}<td>{{ cell }}</td>{% endfor %}</tr>\n        {% endfor %}\n      </table>`
          : `<span class="field-value">{{ ${v} }}</span>`
      return `    <section class="field">\n      <h3 class="field-label">${f.label || 'Campo'}</h3>\n      ${val}\n    </section>`
    })
    .join('\n\n')

  const logoSrc = header.logoDataUrl || null
  const logoHtml = logoSrc
    ? `<img src="${logoSrc}" class="header-logo" alt="Logo" />`
    : `<div class="logo-ph">LOGO</div>`

  const footerLogoHtml =
    footer.logoPosition !== 'none'
      ? logoSrc
        ? `<img src="${logoSrc}" class="footer-logo" alt="Logo" />`
        : `<div class="footer-ph">LOGO</div>`
      : ''

  const pageHtml =
    footer.pagination === 'Sem paginação'
      ? ''
      : footer.pagination === 'Página X de Y'
      ? `<span class="page-num">Página {{ page_number }} de {{ total_pages }}</span>`
      : `<span class="page-num">Página {{ page_number }}</span>`

  const footerJustify = footer.logoPosition === 'right' ? 'flex-end' : 'space-between'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12pt; color: #222; background: #fff; min-height: 100vh; display: flex; flex-direction: column; padding-bottom: 64px; }
    header { display: flex; align-items: center; padding: 18px 40px; border-bottom: 2px solid #0b4fd8; position: relative; }
    .header-logo { height: 48px; max-width: 120px; object-fit: contain; }
    .logo-ph { height: 48px; width: 80px; background: #dce9ff; color: #0b4fd8; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10pt; border-radius: 4px; flex-shrink: 0; }
    .company { position: absolute; left: 0; right: 0; text-align: center; font-size: 18pt; font-weight: 700; color: #0b4fd8; pointer-events: none; }
    .doc-title { text-align: center; padding: 28px 40px 12px; font-size: 16pt; font-weight: 700; }
    .doc-category { text-align: center; font-size: 10pt; color: #666; margin-bottom: 28px; }
    main { flex: 1; padding: 0 40px 40px; }
    .field { margin-bottom: 22px; }
    .field-label { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #0b4fd8; margin-bottom: 6px; }
    .field-value { font-size: 11pt; color: #333; line-height: 1.6; }
    .field-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .field-table td { border: 1px solid #ddd; padding: 6px 10px; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: ${footerJustify}; padding: 12px 40px; border-top: 1px solid #ddd; background: #fff; z-index: 10; }
    .footer-logo { height: 32px; max-width: 80px; object-fit: contain; }
    .footer-ph { height: 32px; width: 56px; background: #dce9ff; color: #0b4fd8; display: flex; align-items: center; justify-content: center; font-size: 8pt; border-radius: 3px; }
    .page-num { font-size: 9pt; color: #888; }
  </style>
</head>
<body>
  <header>
    ${logoHtml}
    <span class="company">${header.companyName || '{{ company_name }}'}</span>
  </header>

  <h1 class="doc-title">${name || '{{ titulo }}'}</h1>
  <p class="doc-category">${category}</p>

  <main>
${fieldHtml}
  </main>

  <footer>
    ${footer.logoPosition !== 'right' ? footerLogoHtml : ''}
    ${pageHtml}
    ${footer.logoPosition === 'right' ? footerLogoHtml : ''}
  </footer>
</body>
</html>`
}

function CreateTemplateModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Relatório')
  const [headerOpen, setHeaderOpen] = useState(true)
  const [footerOpen, setFooterOpen] = useState(true)
  const [headerData, setHeaderData] = useState({ logoDataUrl: '', companyName: 'Nome da Empresa' })
  const [footerData, setFooterData] = useState({ pagination: 'Página X de Y', logoPosition: 'left' })
  const [fields, setFields] = useState([
    { id: 1, label: 'Título', type: 'text' },
    { id: 2, label: 'Conteúdo', type: 'paragraph' },
  ])
  const [nextId, setNextId] = useState(3)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const addField = () => {
    setFields((prev) => [...prev, { id: nextId, label: '', type: 'text' }])
    setNextId((prev) => prev + 1)
  }

  const removeField = (id) => setFields((prev) => prev.filter((f) => f.id !== id))

  const updateFieldProp = (id, key, val) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: val } : f)))

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setHeaderData((h) => ({ ...h, logoDataUrl: ev.target.result }))
    reader.readAsDataURL(file)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await onCreate({ name: name.trim(), category, header: headerData, footer: footerData, fields })
    } catch (err) {
      setSubmitError(err.message || 'Erro ao criar template. Verifique se o servidor está ativo.')
      setSubmitting(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="modal ct-modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <h2>Criar template</h2>

        <div className="modal-grid">
          <label>
            Nome do template
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Relatório Mensal" />
          </label>
          <label>
            Categoria
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ct-section">
          <button type="button" className="ct-toggle" onClick={() => setHeaderOpen((o) => !o)}>
            <span>Cabeçalho</span>
            <span className="ct-hint">pré-preenchido · editável</span>
            {headerOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {headerOpen && (
            <div className="ct-body">
              <label className="ct-logo-picker">
                Logo da empresa (PNG, JPG, SVG)
                <input type="file" accept="image/*" onChange={handleLogoChange} />
                {headerData.logoDataUrl && (
                  <img src={headerData.logoDataUrl} alt="Logo preview" className="ct-logo-preview" />
                )}
              </label>
              <label className="ct-company-label">
                Nome da empresa
                <input
                  className="ct-company-input"
                  value={headerData.companyName}
                  onChange={(e) => setHeaderData((h) => ({ ...h, companyName: e.target.value }))}
                />
              </label>
            </div>
          )}
        </div>

        <div className="ct-section">
          <div className="ct-fields-header">
            <span>Campos do documento</span>
            <button type="button" className="ghost-btn ct-add-btn" onClick={addField}>
              <Plus size={14} />
              Adicionar campo
            </button>
          </div>
          <div className="ct-fields-list">
            {fields.map((f, i) => (
              <div key={f.id} className="ct-field-row">
                <span className="ct-field-index">{i + 1}</span>
                <input
                  className="ct-field-label-input"
                  value={f.label}
                  onChange={(e) => updateFieldProp(f.id, 'label', e.target.value)}
                  placeholder="Rótulo (ex: Destinatário)"
                />
                <select
                  className="ct-field-type-select"
                  value={f.type}
                  onChange={(e) => updateFieldProp(f.id, 'type', e.target.value)}
                >
                  {TEMPLATE_FIELD_TYPES.map((ft) => (
                    <option key={ft.value} value={ft.value}>
                      {ft.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-btn small danger"
                  onClick={() => removeField(f.id)}
                  disabled={fields.length === 1}
                  aria-label="Remover campo"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="ct-section">
          <button type="button" className="ct-toggle" onClick={() => setFooterOpen((o) => !o)}>
            <span>Rodapé</span>
            <span className="ct-hint">pré-preenchido · editável</span>
            {footerOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {footerOpen && (
            <div className="ct-body modal-grid">
              <label>
                Paginação
                <select value={footerData.pagination} onChange={(e) => setFooterData((f) => ({ ...f, pagination: e.target.value }))}>
                  <option>Página X de Y</option>
                  <option>Página X</option>
                  <option>Sem paginação</option>
                </select>
              </label>
              <label>
                Logo no rodapé
                <select value={footerData.logoPosition} onChange={(e) => setFooterData((f) => ({ ...f, logoPosition: e.target.value }))}>
                  <option value="left">Esquerda</option>
                  <option value="right">Direita</option>
                  <option value="none">Sem logo</option>
                </select>
              </label>
            </div>
          )}
        </div>

        {submitError && (
          <div className="form-alert">
            <AlertCircle size={16} />
            {submitError}
          </div>
        )}

        <div className="confirm-row">
          <button className="ghost-btn" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button className="primary-btn" type="submit" disabled={submitting}>
            <Check size={16} />
            {submitting ? 'Salvando...' : 'Criar e abrir editor'}
          </button>
        </div>
      </form>
    </div>
  )
}

function HtmlDocViewer({ html, title, onClose }) {
  const [zoom, setZoom] = useState(100)
  const iframeRef = useRef(null)

  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  const handleDownloadPdf = async () => {
    setDownloading(true)
    setDownloadError(null)
    const safeName =
      String(title || 'documento')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .trim() || 'documento'

    try {
      const body = new URLSearchParams()
      body.append('html', html)
      body.append('filename', safeName)

      const res = await fetch(`${API_BASE}/render-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })

      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const payload = await res.json()
          if (payload?.detail) detail = payload.detail
        } catch {
          try {
            const txt = await res.text()
            if (txt) detail = txt
          } catch {}
        }
        throw new Error(detail)
      }

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${safeName}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (err) {
      console.error('[render-pdf] download falhou:', err)
      setDownloadError(err.message || 'Erro desconhecido ao gerar PDF')
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div className="doc-viewer-overlay">
      <div className="doc-viewer-toolbar">
        <button className="ghost-btn doc-viewer-close" onClick={onClose} title="Fechar">
          <X size={18} />
          Fechar
        </button>
        <span className="doc-viewer-title">{title}</span>
        <div className="doc-viewer-zoom">
          <button className="ghost-btn" onClick={() => setZoom((z) => Math.max(40, z - 10))} title="Reduzir zoom">
            <ZoomOut size={16} />
          </button>
          <span className="doc-viewer-zoom-val">{zoom}%</span>
          <button className="ghost-btn" onClick={() => setZoom((z) => Math.min(200, z + 10))} title="Aumentar zoom">
            <ZoomIn size={16} />
          </button>
        </div>
        <button className="ghost-btn" onClick={handleDownloadPdf} disabled={downloading} title="Baixar como PDF">
          <Download size={16} />
          {downloading ? 'Gerando PDF…' : 'Baixar PDF'}
        </button>
      </div>
      {downloadError && (
        <div
          className="form-alert"
          style={{ margin: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}
          role="alert"
        >
          <AlertCircle size={16} />
          <span style={{ flex: 1 }}>{downloadError}</span>
          <button className="ghost-btn" onClick={() => setDownloadError(null)} title="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="doc-viewer-body">
        <div className="doc-viewer-page-wrap" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
          <iframe
            ref={iframeRef}
            srcDoc={html}
            className="doc-viewer-iframe"
            title={title}
            sandbox="allow-same-origin allow-scripts allow-modals"
          />
        </div>
      </div>
    </div>,
    document.body
  )
}

function TemplateEditorView({ template, onBack, onSave, currentUser }) {
  const [html, setHtml] = useState(template.html)
  const [previewSrc, setPreviewSrc] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewerHtml, setViewerHtml] = useState(null)
  const prevBlobUrl = useRef(null)

  function compileLocal(source) {
    if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current)
    const blob = new Blob([source], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    prevBlobUrl.current = url
    setPreviewSrc(url)
  }

  async function compileFromServer() {
    if (!template.filename) {
      compileLocal(html)
      return
    }
    setCompiling(true)
    try {
      const rendered = await apiRequest(`/templates/${encodeURIComponent(template.filename)}/preview`, {
        method: 'POST',
        userId: currentUser.id,
        body: { html },
      })
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current)
      const blob = new Blob([rendered], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      prevBlobUrl.current = url
      setPreviewSrc(url)
    } catch {
      compileLocal(html)
    } finally {
      setCompiling(false)
    }
  }

  useEffect(() => {
    compileLocal(template.html)
    return () => {
      if (prevBlobUrl.current) URL.revokeObjectURL(prevBlobUrl.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true)
    await onSave(html)
    setSaving(false)
  }

  return (
    <>
      {viewerHtml && (
        <HtmlDocViewer html={viewerHtml} title={template.title} onClose={() => setViewerHtml(null)} />
      )}
      <div className="tpl-editor-overlay">
        <div className="tpl-editor-topbar">
          <button className="ghost-btn" onClick={onBack}>
            <ChevronLeft size={17} />
            Voltar
          </button>
          <span className="tpl-editor-name">{template.title}</span>
          <button className="ghost-btn" onClick={() => setViewerHtml(html)} title="Visualizar como documento">
            <Eye size={16} />
            Visualizar
          </button>
          <button className="primary-btn" onClick={handleSave} disabled={saving}>
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar template'}
          </button>
        </div>

        <div className="tpl-editor-body">
          <div className="tpl-editor-pane tpl-editor-code">
            <textarea
              className="tpl-html-textarea"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              wrap="off"
            />
          </div>
          <div className="tpl-editor-pane tpl-editor-preview">
            <div className="tpl-preview-bar">
              <button className="ghost-btn" onClick={compileFromServer} disabled={compiling}>
                <RefreshCw size={15} className={compiling ? 'spin' : ''} />
                {compiling ? 'Compilando...' : 'Recompilar'}
              </button>
            </div>
            <iframe src={previewSrc} className="tpl-preview-iframe" title="Preview do template" />
          </div>
        </div>
      </div>
    </>
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

function ProfilePage({ currentUser, onAccentChange, onNavigate }) {
  const selectedAccent = currentUser.accentColor || DEFAULT_ACCENT.id

  return (
    <section className="profile-page">
      <div className="profile-card">
        <button className="page-close-btn profile-close" onClick={() => onNavigate('/')} aria-label="Fechar perfil">
          <X size={18} />
        </button>
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

        <div className="profile-accent-panel">
          <div>
            <strong>Personalizacao</strong>
            <span>Ajuste a cor de destaque e o modo visual da interface.</span>
          </div>
          <div className="accent-options" role="radiogroup" aria-label="Cor de destaque">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                className={`accent-swatch ${selectedAccent === color.id ? 'active' : ''}`}
                style={{ '--swatch-primary': color.primary, '--swatch-accent': color.accent }}
                onClick={() => onAccentChange(color.id)}
                aria-label={color.label}
                title={color.label}
              >
                <span />
              </button>
            ))}
          </div>
        </div>
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

function RejectReasonModal({ onClose, onConfirm, submission }) {
  const [feedback, setFeedback] = useState(submission?.feedback || '')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    if (!feedback.trim()) {
      setError('Escreva o motivo da reprovação.')
      return
    }
    onConfirm(feedback.trim())
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <form className="modal reject-modal" onSubmit={submit}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <button className="modal-back" type="button" onClick={onClose}>
          <ChevronDown size={17} />
          Voltar
        </button>
        <h2>Reprovar solicitação</h2>
        <p>{submission?.title || submission?.original_name || submission?.filename}</p>
        <label className="textarea-field">
          Motivo para o usuário
          <textarea
            value={feedback}
            onChange={(event) => {
              setFeedback(event.target.value)
              setError('')
            }}
            placeholder="Explique claramente o que precisa ser corrigido antes do reenvio."
            rows={5}
            autoFocus
          />
        </label>
        {error && <div className="form-alert"><AlertCircle size={17} />{error}</div>}
        <div className="confirm-row">
          <button className="ghost-btn" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary-btn danger-action" type="submit">
            <X size={17} />
            Reprovar
          </button>
        </div>
      </form>
    </div>
  )
}

function PdfPreview({ label, url }) {
  return (
    <div className="pdf-preview">
      <div className="pdf-preview-head">
        <FileText size={16} />
        <strong>{label}</strong>
        <a href={url} target="_blank" rel="noreferrer">
          <Eye size={15} />
          Abrir em nova aba
        </a>
      </div>
      <iframe src={url} title={label} className="pdf-preview-iframe" />
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

function buildDocumentUrl(filename, userId) {
  return `${API_BASE}/docs/${encodeURIComponent(filename)}/file?user_id=${encodeURIComponent(userId)}`
}

function buildSubmissionUrl(documentId, kind, userId) {
  return `${API_BASE}/submissions/${encodeURIComponent(documentId)}/${kind}?user_id=${encodeURIComponent(userId)}`
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

async function apiStreamChat(body, onChunk) {
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok || !response.body) {
    let message = 'Erro ao conectar com o servidor.'
    try {
      const payload = await response.json()
      message = payload.detail || message
    } catch {
      // Mantém mensagem padrão quando o corpo não vier em JSON.
    }
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sessionId = null

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line)
      if (event.type === 'chunk') {
        onChunk(event.text || '')
      }
      if (event.type === 'done') {
        sessionId = event.session_id
      }
      if (event.type === 'error') {
        throw new Error(event.message || 'Erro ao conectar com o servidor.')
      }
    }

    if (done) break
  }

  return { session_id: sessionId }
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

function formatDateTime(value, fallback = '-') {
  if (!value) return fallback
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function notificationMessage(item, currentUser) {
  const title = item.title || item.original_name || item.filename || 'documento'
  if (currentUser?.role === 'admin' && item.status === 'pendente') {
    const name = item.uploader_name || item.uploader_email || 'Um usuário'
    return `${name} enviou solicitação: ${title}`
  }
  if (item.status === 'aprovado') return `Sua solicitação foi aprovada: ${title}`
  if (item.status === 'reprovado') return `Sua solicitação foi reprovada: ${title}`
  if (item.status === 'pendente') return `Sua solicitação está pendente: ${title}`
  return title
}

function eventLabel(event) {
  const labels = {
    enviado: 'Solicitação enviada',
    processado: 'PDF formatado/processado',
    pendente: 'Pendente de aprovação',
    reprovado: 'Reprovado pelo administrador',
    reenviado: 'Solicitação reenviada',
    aprovado: 'Aprovado e publicado',
    inserido: 'PDF inserido',
    editado: 'PDF editado',
    ativado: 'PDF ativado',
    inativado: 'PDF inativado',
    excluido: 'PDF excluído',
  }
  return labels[event.event_type] || labels[event.status] || event.event_type || 'Atualização'
}

function filterSubmissions(submissions, search, dateFilter) {
  const query = search.trim().toLowerCase()
  return [...submissions]
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
    .filter((submission) => {
      const dateSource = String(submission.updated_at || submission.created_at || '')
      const matchesDate = !dateFilter || dateSource.startsWith(dateFilter)
      if (!matchesDate) return false
      if (!query) return true
      return [
        submission.title,
        submission.original_name,
        submission.filename,
        submission.status,
        submission.uploader_name,
        submission.uploader_email,
        submission.feedback,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })
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
