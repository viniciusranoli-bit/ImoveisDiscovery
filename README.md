# ImoveisDiscovery

Monorepo com frontend Next.js e API Fastify. O PostgreSQL roda fora do Compose (instalação local, WSL ou outro container à parte).

## Estrutura

- `frontend/`: interface Next.js e componentes do mapa.
- `backend/`: API Fastify, regras de negócio, coleta Playwright, IA, scheduler e banco.
- `packages/shared/`: tipos e contratos usados pelos dois serviços.

## Portas

| Ambiente | Como subir | Frontend | API |
| --- | --- | --- | --- |
| **Desenvolvimento** (Cursor) | `npm run dev` na raiz | **3005** | **3006** |
| **Homologação** (Docker) | `npm run docker:up` | **3000** | **3001** |

Não misture os dois ao mesmo tempo: o dev usa `frontend/.env.development` e `API_PORT=3006` em `backend/.env`. O Docker força `API_PORT=3001` e `FRONTEND_ORIGIN=http://localhost:3000` no Compose.

## Desenvolvimento

1. Copie `backend/.env.example` para `backend/.env` e defina `AUTH_SECRET`, credenciais do banco, `API_PORT=3006` e `FRONTEND_ORIGIN=http://localhost:3005`.
2. O arquivo `frontend/.env.development` já aponta o proxy para `http://localhost:3006`.
3. Execute `npm install`.
4. Execute `npm run dev` (tenta parar o backend Docker de homologação para evitar confusão).

Abra **http://localhost:3005**. O Next encaminha `/api/*` ao Fastify na **3006**, com cookies HTTP-only.

## Homologação (Docker)

Configure `backend/.env` (credenciais, `DATABASE_NAME`, `AUTH_SECRET`). No container, `DB_HOST=host.docker.internal` é aplicado pelo Compose.

O Postgres precisa estar **rodando no host/WSL** na porta publicada (ex.: `5432`).

Stack completa:

```bash
npm run docker:up
```

Somente um serviço:

```bash
npm run docker:up:backend
npm run docker:up:frontend
```

Arquivos: `docker-compose.yml` (raiz), `backend/docker-compose.yml`, `frontend/docker-compose.yml`.

Após mudanças no código: `npm run docker:up -- --build`.

Abra **http://localhost:3000** (API em **3001**).

## WhatsApp (Evolution API, gratuito local)

Modo **Baileys** (WhatsApp Web): sem taxa por mensagem; use **número secundário** (risco de bloqueio pelo WhatsApp).

1. Copie `docker/evolution/.env.example` para `docker/evolution/.env` e defina `AUTHENTICATION_API_KEY`.
2. Suba a stack: `npm run docker:evolution:up` (imagem `evoapicloud/evolution-api`, API em `http://127.0.0.1:8080`).
3. Crie a instância (nome = `EVOLUTION_INSTANCE_NAME`, ex. `radar-imoveis`) e escaneie o QR. O **Enviar teste** no admin tenta criar a instância; se ainda falhar, abra `http://127.0.0.1:8080/instance/connect/radar-imoveis` (com header `apikey`) ou veja a [documentação Evolution](https://www.mintlify.com/EvolutionAPI/evolution-api/quickstart).
4. Alinhe o backend: `npm run docker:evolution:sync-env` (copia a chave para `backend/.env`) ou defina manualmente `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`.
5. **Homolog Docker** (`docker compose up`): a Evolution continua no **host** (`docker/evolution`); o backend no container usa `http://host.docker.internal:8080`. A Evolution precisa publicar a porta **`8080:8080`** (não `127.0.0.1:8080`), senão o container do backend não alcança a API — após mudar o compose, rode `npm run docker:evolution:down` e `npm run docker:evolution:up`.
6. Admin → **Alertas WhatsApp**: criar regra, **Mostrar QR**, status `open`, **Enviar teste**.
