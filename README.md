# 🚢 PortoGPT

Sistema web desenvolvido como Trabalho de Conclusão de Curso (TCC) com o objetivo de centralizar, organizar e facilitar o acesso à documentação institucional da Autoridade Portuária de Santos.

## 📋 Sobre o Projeto

O PortoGPT foi criado para resolver dificuldades relacionadas à busca e gerenciamento de documentos corporativos, oferecendo uma plataforma intuitiva para consulta, organização e administração de conteúdos institucionais.

A solução permite que usuários encontrem documentos de forma rápida através de filtros e pesquisas, enquanto administradores possuem ferramentas para gerenciamento completo do acervo documental.

## 🎯 Objetivos

* Centralizar documentos institucionais em um único ambiente.
* Facilitar a localização de informações.
* Melhorar a organização documental.
* Reduzir o tempo gasto em buscas manuais.
* Disponibilizar uma interface moderna e intuitiva.
* Garantir maior controle administrativo sobre os documentos.

## ✨ Funcionalidades

### Usuário Comum

* Visualização de documentos disponíveis.
* Pesquisa por palavras-chave.
* Filtros por categoria.
* Download de documentos.
* Consulta de informações e metadados.

### Administrador

* Cadastro de documentos.
* Edição de documentos existentes.
* Exclusão de documentos.
* Gerenciamento de categorias.
* Controle de usuários.
* Acompanhamento das informações cadastradas.

## 🏗️ Arquitetura

O sistema foi desenvolvido seguindo uma arquitetura em camadas, separando responsabilidades entre:

* Front-end
* Back-end
* Banco de Dados
* Camada de Serviços
* Camada de Persistência

Essa estrutura proporciona maior organização, manutenção e escalabilidade do projeto.

## 🛠️ Tecnologias Utilizadas

### Front-end

* React
* TypeScript
* Vite
* CSS

### Back-end

* PHP
* Laravel

### Banco de Dados

* PostgreSQL

### Ferramentas

* Git
* GitHub
* Postman

## 📸 Protótipos

### Área do Usuário

Interface voltada para consulta e localização rápida de documentos.

### Área Administrativa

Interface destinada ao gerenciamento completo do sistema e dos documentos.

## 🚀 Como Executar o Projeto

### Pré-requisitos

* PHP 8+
* Composer
* Node.js
* PostgreSQL

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/portogpt.git

# Entrar na pasta
cd portogpt

# Instalar dependências do backend
composer install

# Instalar dependências do frontend
npm install

# Configurar variáveis de ambiente
cp .env.example .env

# Executar migrações
php artisan migrate

# Iniciar backend
php artisan serve

# Iniciar frontend
npm run dev
```

Desenvolvido como Trabalho de Conclusão de Curso em Análise e Desenvolvimento de Sistemas.

## 📄 Licença

Este projeto foi desenvolvido para fins acadêmicos.
