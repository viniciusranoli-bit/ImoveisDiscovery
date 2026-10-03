# Plano de multiagentes para pós-deploy

Objetivo: após cada deploy, um **agente de testes** valida a aplicação em camadas, sem substituir testes unitários locais (`npm test`).

## Papéis

| Agente | Responsabilidade |
| --- | --- |
| **Orquestrador** | Dispara a suíte, consolida resultado e bloqueia promoção se uma camada falhar. |
| **Smoke HTTP** | Verifica que a app responde (`GET /login`, `GET /api/auth/session` sem cookie → 401). |
| **Fluxo autenticado** | Login local de teste (credenciais em secret do CI), leitura de histórico e favoritos. |
| **Coleta controlada** | Opcional e em ambiente de staging: uma busca com filtros mínimos e timeout alto; não roda em produção sem flag. |
| **Regressão visual** | Playwright captura Busca, Resultados, Histórico de compra (três blocos), Favoritos e Admin. |

## Camadas e ordem

1. **L1 — Disponibilidade:** processo Next.js, página de login, APIs públicas de auth.
2. **L2 — Sessão:** registro/login de usuário de teste, cookie de sessão, logout.
3. **L3 — Dados:** histórico aluguel/compra, favoritos, cota de busca refletida em `/api/auth/session`.
4. **L4 — Coleta (staging):** um `POST /api/collect` com quota disponível; falha de quota deve retornar 403, não 500.

Parar na primeira camada com falha; camadas seguintes só rodam se a anterior passou.

## Gatilhos

- **Pull request:** L1 + L2 + L3 (sem coleta real).
- **Deploy em staging:** L1–L4 com `MONITOR_DEEP_ENABLED=true`.
- **Cron diário:** L1 + screenshot da home logada.

## Configuração (secrets, nunca no repositório)

- `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` — usuário descartável.
- `AUTH_SECRET`, `DB_*`, `SEARCH_API_KEY` — já usados pela app.
- `STAGING_BASE_URL` — URL do ambiente alvo.

## Artefatos

- Relatório JSON: `{ layer, passed, durationMs, error? }`.
- Screenshots em `artifacts/e2e/` (gitignored).
- Comentário no PR com resumo em uma linha por camada.

## Critérios de aceite do agente

- Nenhum secret aparece em log ou artefato publicado.
- Falha de login ou histórico impede merge automático.
- Coleta real só com flag explícita e quota de teste dedicada.
- O mesmo fluxo roda localmente via script (`npm test` permanece obrigatório no CI).

## Próximo passo de implementação

1. Workflow GitHub Actions com job `agent-smoke` chamando Playwright headless contra `STAGING_BASE_URL`.
2. Script `scripts/agent-post-deploy.ts` reutilizável fora do CI.
3. Usuário E2E criado por migration seed opcional apenas em staging.
