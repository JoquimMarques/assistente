# Assistente Virtual de Voz

Projeto completo de assistente virtual com:

- reconhecimento de voz (fala para texto)
- sintese de voz (texto para fala)
- memoria local (MySQL ou fallback em arquivo JSON)
- busca externa (Wikipedia)
- fallback por IA gratuita

## Estrutura

assistente-virtual/

- frontend/
  - index.html
  - css/style.css
  - js/app.js
  - js/speech.js
  - js/synthesis.js
  - js/processor.js
  - js/commands.js
  - js/ui.js
- backend/
  - server.js
  - routes/api.js
  - services/memoryService.js
  - services/aiService.js
  - services/searchService.js
  - config/db.js
- database/
  - schema.sql

## Como rodar

1. Instale dependencias:
   npm install

2. (Opcional) Configure MySQL:
   - copie .env.example para .env
   - ajuste credenciais
   - execute database/schema.sql

3. Suba o sistema:
   npm start

4. Abra no navegador:
   http://localhost:3000

## Comandos suportados

- mostrar memorias
- ensinar algo
- abrir memoria sua pergunta
- ensinar: pergunta | resposta

## Pipeline implementado

1. comando
2. memoria exata
3. similaridade
4. busca externa (Wikipedia)
5. fallback (IA gratuita)
6. fallback final para aprendizado

## Deploy em producao (Render + Vercel)

### 1. Deploy do backend no Render

1. Suba o projeto para um repositorio no GitHub.
2. No Render, crie um novo Web Service conectado ao repositorio.
3. Configure:
   - Environment: Node
   - Build Command: npm install
   - Start Command: npm start
4. Adicione as variaveis de ambiente no Render:
   - PORT=3000
   - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (se for usar MySQL)
   - CORS_ORIGINS=https://SEU_FRONTEND.vercel.app
5. Faça deploy e copie a URL publica do backend, exemplo:
   - https://seu-backend.onrender.com
6. Teste saude da API:
   - GET https://seu-backend.onrender.com/api/health

### 2. Deploy do frontend no Vercel

1. No Vercel, importe o mesmo repositorio.
2. Em Project Settings, defina Root Directory como frontend.
3. Framework Preset: Other.
4. Build Command: (deixe vazio).
5. Output Directory: (deixe vazio).
6. Antes de deploy, edite frontend/index.html e configure:
   - <meta name="api-base-url" content="https://seu-backend.onrender.com" />
7. Faça o deploy do frontend.

### 3. Ajuste final de CORS

1. Copie a URL final da Vercel, exemplo:
   - https://seu-frontend.vercel.app
2. Volte no Render e atualize CORS_ORIGINS com esse dominio.
3. Se tiver dominio customizado, pode usar multiplos dominios separados por virgula.

### 4. Fluxo de teste em producao

1. Abra o frontend na Vercel.
2. Permita microfone no navegador.
3. Envie uma pergunta por texto e por voz.
4. Valide no backend:
   - GET /api/health
   - POST /api/memory/exact
   - GET /api/search/wiki
