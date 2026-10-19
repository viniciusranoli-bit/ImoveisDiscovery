
1) [x] Criar um temporizador de hora em hora baseado nos filtros salvos para fazer buscas na API

2) [x] Criar um temporizador configuravel baseado nos filtros salvos para fazer a analise da IA

3) [x] Melhorr a UX criando um menu lateral com as informacoes

4) [x] Analisar o codigo e garantir que as mesmas funçoes irao funcionar para aluguel, garantindo que o filtro historico e por tipo (aluguel/compra) independentes

5) [x] Criar um plano no Canvas de como fazer o envio via whatsapp dentro do apartamento esperado, onde apartamento esperado para compra atende as necessidade de direito a laje e/ou churrasqueira ou cobertura abaixo de 2 milhoes.

6) [x] Adicionar login usando o autenticador do Google, e uma tela de login com uma opcao de criar um novo usuario. Para isso, o login e a senha.

7) [x] Mudar a estrutura de tabela para uma padronizacao onde tabelas comecam com TB_, procedures com PR_ e assim por diante. Garantir que todas os objetos tem nos comentararios o motivo da existencia.

8) [x] Criar um plano para termos multiagentes, o agente nesse caso seria um agente de testes para executar depois de cada deploy da solucao

9) [x] Dividir o historico no menu laterial em compra e aluguel

10) [x] O filtro de bairro ser um combo de multiplas escolhas

11) [x] Nos casos de aluguel, nao precisa da IA executar pq nao preciso da informacao sobre laje e churrasqueira

12) [x] Apresentar o agendamento da pesquisa no site e a possibilidade de editar e apagar

13) [x] Apresentar  todos os agendamentos, tanto a execuçao da API para buscar, e a chamada da IA, com permissão de editar e apagar.

14) [x] Adicionar no card de aluguel o valor do aluguel.

15) [x] Tirar o nome da Server do frontend

16) [x] Historico de aluguel, separar aluguel acima e abaixo de 12000 

17) [ ] Permitir pesquisas simultaneas, exemplo, eu quero pesquisar na compra de apartamento com laje ou compra de cobertura ou aluguel de cobertura.

18) [x] Criar o docker compose para subir no docker

19) [x] Melhorar UX com um tom mais executivo, azul claro e branco

20) [x] Colocar limite por usuarios logados, criar menu lateral com a opcao de administracao. Nessa funcao listar os usuarios que por padrao podem fazer 10 pesquisas, ate o administrador aumentar a quantidade de pesquisas

21) [x] Criar uma lista de favoritos, para isso, coloque uma estrela nos cards de apartamentos, tanto de alguel como no de compra. Adicione essa funcionalidade no menu.

22) [x] No Historico de compras, separar em tres blocos (com interesse, sem laje/churrasqueira, cobertura sem interesse) com filtro na lista com interesse.

23) [x] Adicionar dois botões nos cards de compra de cobertura, salvar ou descartar. Descartadas vão ao histórico cobertura sem interesse.
 
24) [x] Criar umuma nova funcionalidae, um mapa com o endereco de todas os imoveis com endereco. No caso de mais de um na mesma rua, apresentar a quantidade. Esse mapa precisa ser navegavel e possivel escolher os apartamentos nele, abrir o card do imovel. Para apartamentos sem endereco, descartar no mapa.

---

## Login Google em produção (planejamento — fazer depois)

O fluxo OAuth já existe no backend (Fastify) e na tela `/login`. Falta configurar Google Cloud, variáveis e ajustes de proxy/deploy antes de abrir na internet.

### Google Cloud Console

- [ ] Criar ou escolher projeto no Google Cloud.
- [ ] Configurar tela de consentimento OAuth (Interno para Workspace, ou Externo em modo Teste com usuários de teste).
- [ ] Criar credencial OAuth 2.0 tipo **Aplicativo da Web**.
- [ ] Cadastrar URI de redirecionamento **exatamente** igual à pública do app:
  - Dev: `http://localhost:3000/api/auth/google/callback`
  - Prod: `https://<domínio>/api/auth/google/callback`

### Variáveis de ambiente (`backend/.env` / servidor)

- [ ] `AUTH_SECRET` — segredo forte, único por ambiente (obrigatório para sessão).
- [ ] `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
- [ ] `GOOGLE_REDIRECT_URI` — URL pública do callback (obrigatório com proxy Next → API; sem isso o backend usa `:3001` e o Google rejeita).
- [ ] `FRONTEND_ORIGIN` — URL do site no browser (redirect após login e erros OAuth).
- [ ] `ADMIN_EMAILS` — e-mails que viram admin no cadastro/vinculação.
- [ ] Frontend: `API_URL` apontando para o Fastify (local ou Docker).

### Código e infra (bloqueiam OAuth pelo `:3000`)

- [ ] Ajustar `frontend/app/lib/api-proxy.ts` para repassar `Set-Cookie` e `Location` nas rotas `/api/auth/google` e `/api/auth/google/callback`.
- [ ] Produção: HTTPS, `NODE_ENV=production` (cookie `Secure`), mesma redirect URI no Google.
- [ ] Se houver reverse proxy direto no backend: `trustProxy` e headers `X-Forwarded-*` (ou manter auth só via Next).

### Política de acesso (antes de domínio público)

- [ ] Definir se cadastro local permanece ou só Google.
- [ ] Não depender do “primeiro usuário vira admin”: promover admin via script e `ADMIN_EMAILS` antes do primeiro login.
- [ ] (Opcional) Restringir login Google a lista/domínio de e-mails; checar `email_verified` no perfil Google.

### Checklist de teste local

- [ ] `npm run dev` (frontend + backend).
- [ ] `/login` → Continuar com Google → volta autenticado; `GET /api/auth/session` ok.
- [ ] Logout e novo login; mesma conta local + Google vincula `google_sub`.
- [ ] Conferir `GET /api/auth/setup`: redirect URI exibido = cadastro no Google Cloud.

### Deploy

- [ ] HTTPS no domínio do frontend; variáveis de prod; proxy OAuth corrigido.
- [ ] Se app OAuth Externo sair do modo Teste: verificação do Google (política de privacidade, escopos mínimos `openid email profile`).

