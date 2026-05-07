# PortoGpt API - Documentação

## Autenticação

### Registrar Novo Usuário
**POST** `/api/register`

```json
{
  "email": "usuario@example.com",
  "password": "senha123"
}
```

**Resposta (201):**
```json
{
  "message": "Usuário criado com sucesso",
  "user_id": 1
}
```

### Login
**POST** `/api/login`

```json
{
  "email": "usuario@example.com",
  "password": "senha123"
}
```

**Resposta (200):**
```json
{
  "message": "Autenticação bem-sucedida",
  "user_id": 1
}
```

### Obter Informações do Usuário
**GET** `/api/user/{user_id}`

**Resposta (200):**
```json
{
  "id": 1,
  "email": "usuario@example.com",
  "created_at": "2024-05-06 10:30:00"
}
```

---

## Chat com Histórico

### Enviar Mensagem (salva automaticamente no histórico)
**POST** `/api/chat`

```json
{
  "query": "Qual é o prazo de entrega?",
  "user_id": 1
}
```

**Resposta (200):**
```json
{
  "response": "De acordo com os documentos, o prazo de entrega é de 30 dias úteis..."
}
```

### Obter Histórico de Chat
**GET** `/api/chat/history/{user_id}?limite=50`

**Resposta (200):**
```json
{
  "historico": [
    {
      "id": 1,
      "message": "Qual é o prazo de entrega?",
      "response": "De acordo com os documentos...",
      "created_at": "2024-05-06 10:30:00"
    }
  ]
}
```

### Deletar Uma Mensagem do Histórico
**DELETE** `/api/chat/history/{user_id}/{chat_id}`

**Resposta (200):**
```json
{
  "success": true,
  "message": "Mensagem deletada com sucesso"
}
```

### Limpar Todo o Histórico
**DELETE** `/api/chat/history/{user_id}`

**Resposta (200):**
```json
{
  "success": true,
  "deleted_count": 42,
  "message": "42 mensagens deletadas"
}
```

---

## Endpoints Existentes

### Upload de Documento
**POST** `/api/upload`
- Envia um PDF que será processado e indexado no ChromaDB

### Listar Documentos
**GET** `/api/docs`
- Lista todos os arquivos na pasta data/

### Reindexar um Documento
**POST** `/api/docs/{filename}/reindex`

### Ativar/Desativar um Documento
**POST** `/api/docs/{filename}/toggle`

### Deletar um Documento
**DELETE** `/api/docs/{filename}`

---

## Estrutura do Banco de Dados

### Tabela: users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP
)
```

### Tabela: chat_history
```sql
CREATE TABLE chat_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

---

## Fluxo de Uso Recomendado

1. **Cliente registra**: `POST /api/register`
2. **Cliente faz login**: `POST /api/login` → recebe `user_id`
3. **Cliente envia pergunta**: `POST /api/chat` com `user_id`
4. **Sistema salva automaticamente** no banco SQLite
5. **Cliente recupera histórico**: `GET /api/chat/history/{user_id}`

---

## Notas Técnicas

- **Banco de Dados**: SQLite (`portogpt.db`)
- **Hash de Senha**: PBKDF2 com SHA256 (100.000 iterações)
- **Histórico**: Ordenado por data (mais recentes primeiro)
- **CORS**: Habilitado para frontend acessar a API
