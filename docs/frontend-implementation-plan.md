# Plano de Implementação (Learn-by-Doing)
Grafana + Portal Next.js + QA-Analyst (IA) no qa-lab

## Status (até agora)
- ✅ Grafana local via Docker + datasource Postgres (Neon) conectado
- ✅ Dashboard MVP “QA Overview (MVP)” provisionado/visível
- ✅ Portal Next.js dentro do repo (portal/) rodando em :3001
- ✅ Endpoints funcionando: GET /api/builds, GET /api/builds/:buildId, GET /api/runs, GET /api/runs/:runId
- ✅ Páginas: /builds, /builds/[buildId], /runs, /runs/[runId]
- ✅ Aprendizado sobre schema: qa_run usa `id` (bigserial) e qa_failure liga por (build_id, layer), não run_id
- ⏳ Próximos: endpoint S3 presign, stub do serviço QA-Analyst, tokens/componentes de identidade visual

---

# Parte 0: Pré-requisitos (sem mágica)
## 0.1 Ferramentas básicas
- Node.js 20+ (recomendado usar nvm)
- Git
- Docker Desktop (para Grafana e serviços auxiliares)
- Acesso ao Neon e ao S3 já existentes (ou credenciais equivalentes)

## 0.2 Convenções de variáveis
Vamos padronizar em `.env` e secrets do CI:

- `QA_DB_URL` (Neon connection string)
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ROLE_ARN` (para OIDC no GitHub Actions)
- `QA_S3_PREFIX` (ex.: `qa-lab/` ou `qa/<repo>/`)
- `QA_ANALYST_URL` (URL do serviço IA)

---

# Parte 1: Plugar Grafana no qa-lab (sem reinventar observability)
Objetivo: subir Grafana localmente e conectar ao Neon via Postgres datasource.

## [x] 1.1 Criar um diretório de infraestrutura
No repo qa-lab, criar:
- `infra/grafana/`

Estrutura sugerida:
infra/
  grafana/
    docker-compose.yml
    provisioning/
      datasources/
        datasources.yml
      dashboards/
        dashboards.yml
    dashboards/
      qa-overview.json

## [x] 1.2 Subir Grafana com Docker Compose
Criar `infra/grafana/docker-compose.yml` com:
- serviço grafana
- volume para persistência
- porta 3000

Conceito:
- você acessa `http://localhost:3000`
- credenciais default (admin/admin) e troca na primeira entrada

## [x] 1.3 Configurar datasource Postgres (Neon)
Criar `infra/grafana/provisioning/datasources/datasources.yml`:
- tipo: postgres
- host: o host do Neon
- user/password/db: do connection string
- SSL: obrigatório (Neon)

IMPORTANTE:
- Não comitar segredo no Git.
- Para desenvolvimento local, usar um `.env` carregado pelo docker-compose.

Aprendizado:
- Grafana “provisioning” permite versionar a configuração, evitando “clicar” manualmente.

## [x] 1.4 Criar dashboards mínimos (MVP)
Dashboards recomendados (primeira semana):
1) **QA Overview**
   - builds por status (pass/fail)
   - runs por camada (L0/L1)
   - top falhas por teste/arquivo
   - duração média por camada
2) **Flakiness básico**
   - mesma falha repetida em janelas (ex.: 7 dias)
   - falha que “some e volta”

Implementação:
- Primeiro, dashboards simples com queries SQL no datasource Postgres
- Você pode exportar JSON do dashboard e salvar em `infra/grafana/dashboards/`

## [ ] 1.5 Alertas (opcional no MVP, mas recomendado cedo)
- Alertar quando:
  - taxa de falha passa de X%
  - build crítico falha em main
  - duração do pipeline dobra

Aprendizado:
- Alertas do Grafana são “o primeiro ROI” de observability.

---

# Parte 2: Criar o Portal Next.js no repo qa-lab
Objetivo: um portal leve para workflow humano e IA.

## [x] 2.1 Decidir onde o portal vive
Opção A (recomendado):
- Portal dentro do repo qa-lab:
  - `portal/` (Next.js)
Opção B:
- Repo separado (só quando já estiver maduro)

Vamos seguir com A para reduzir fricção.

## [x] 2.2 Inicializar Next.js
Dentro do repo:
- criar pasta `portal`
- inicializar Next.js com TypeScript
- Portal roda em http://localhost:3001

Aprendizado:
- Next traz SSR + rotas + server APIs no mesmo lugar.

## [ ] 2.3 Instalar UI base e identidade visual (NordFlux)
Objetivo: reaproveitar identidade do nordflux-react sem copiar o app inteiro.

Estratégia:
1) Extrair do nordflux-react:
   - tokens (cores, tipografia, spacing)
   - componentes base (Card, Button, Badge, Layout)
   - padrões de UI (headers, sections)
2) Criar no portal:
   - `portal/styles/tokens.css` (ou tailwind config)
   - `portal/components/nord/` para componentes equivalentes

Abordagem recomendada:
- TailwindCSS + um pequeno set de componentes “Nord”
- Evitar reimplementar tudo no começo: só o necessário para:
  - lista de builds
  - detalhe de run
  - chat IA

## [x] 2.4 Conexão segura com Neon e S3 (server-side)
Regra de ouro:
- Browser não fala direto com Neon e não carrega credenciais AWS.

No Next:
- usar API routes (`/api/*`) ou server actions para:
  1) Consultar builds/runs no Neon
  2) Gerar URL assinada do S3 para baixar evidências

Endpoints mínimos:
- ✅ GET /api/builds
- ✅ GET /api/builds/:buildId
- ✅ GET /api/runs
- ✅ GET /api/runs/:runId
- ⏳ POST /api/s3/presign
- ⏳ POST /api/analyst/analyze

Aprendizado real:
- Next.js 16 exige tratar `params` dinâmicos como Promise
- URL base absoluta é construída a partir de `headers()` (host + x-forwarded-proto)

Aprendizado:
- separa dados sensíveis do client e permite RBAC depois.

## [x] 2.5 Páginas do Portal (MVP)
1) `/builds`
   - tabela com builds (status, branch, sha, duração, created_at)
   - filtros
2) `/builds/[buildId]`
   - lista runs (L0/L1)
   - status por camada
3) `/runs`
   - lista runs geral (adicionado para refletir endpoints)
4) `/runs/[runId]`
   - falhas detalhadas (teste, mensagem, arquivo, links)
   - botões: “Analisar com IA”, “Rerun”, “Quarentenar”
5) Componente “Evidence”
   - quando clicar, portal pede URL assinada e abre o artefato no browser

---

# Parte 3: Ajustes na infraestrutura atual do qa-lab (para suportar os dois front-ends)
Objetivo: padronizar outputs e garantir que Neon + S3 tenham o que o Grafana/Portal precisam.

## 3.1 Padronizar S3 Keys
Definir um padrão previsível:
- `s3://<bucket>/<prefix>/<repo>/<branch>/<build_id>/manifest.json`
- `.../results/L0.json`
- `.../results/L1.json`
- `.../logs/runner.log`
- `.../artifacts/...`

Aprendizado:
- Sem padrão, você vira arqueólogo digital.

## 3.2 Garantir que Neon tenha “índice navegável”
Revisar se as tabelas guardam:
- build_id, repo, branch, sha, actor, timestamps, status
- run_id, build_id, layer, suite, status, duration
- failure_id, run_id, test_id/name, file_path, message (resumo), s3_key(s)

Estado atual:
- qa_build: build_id (text), repo, branch, head_sha, commit_shas, authors, status, started_at, finished_at
- qa_run: id (bigserial), build_id, layer, status, duration_ms, totals (jsonb), s3_result_path, created_at
- qa_failure: id (bigserial), build_id, layer, test_name, file_path, message_hash, message_snippet, created_at

Nota importante:
- failures são ligados a runs por (build_id, layer) no MVP atual.

Se algo estiver “apenas no JSON”, considerar replicar um resumo no Neon.

## 3.3 Adicionar uma tabela de decisões (Portal)
Criar (futuro próximo):
- `qa_decision`
  - decision_id
  - build_id / run_id
  - type: waiver | quarantine | rerun_request | issue_opened
  - author (usuário)
  - reason
  - created_at

Aprendizado:
- decisão sem trilha vira “opinião”.

---

# Parte 4: QA-Analyst (IA) e melhor alternativa para plugar cedo
Objetivo: IA útil cedo, sem casar com o front.

## 4.1 Melhor arquitetura: serviço separado
Criar `services/qa-analyst/` (ou repo separado depois)

API mínima:
- `POST /analyze`
  - input: { build_id?, run_id?, layer? }
  - output: { summary, hypotheses[], actions[], evidence_links[] }

## 4.2 Primeira versão (sem LLM ainda, se quiser)
MVP “heurístico” (rápido e já útil):
- correlacionar falhas repetidas (mesma assinatura)
- detectar flakiness básico (falha intermitente)
- sugerir ações padrão por padrão de erro
- apontar arquivos alterados no commit (via GitHub API) e cruzar com falhas

Depois plugar LLM:
- o LLM entra para:
  - explicar hipóteses
  - priorizar causa provável
  - propor patch textual
  - sugerir ações com base em evidências

## 4.3 Onde rodar a IA
Opções:
- Rodar como container (Docker) no mesmo stack do portal (dev/local)
- Rodar como serviço em cloud (prod), com:
  - acesso ao Neon
  - acesso ao S3
  - (opcional) GitHub token para ler diffs

## 4.4 Integração com Portal
O Portal chama:
- `/api/analyst/analyze` (server-side)
Que proxy para:
- `QA_ANALYST_URL/analyze`

Motivo:
- evita CORS, esconde credenciais, permite audit log.

---

# Parte 5: Grafana + Portal coexistindo (como não virar bagunça)
## 5.1 Links cruzados
- Grafana dashboard: link para `portal/runs/<runId>`
- Portal: “Ver dashboard no Grafana” com query params (build_id/run_id)

## 5.2 Permissões
- Se você usar GitHub OAuth no Portal, pense:
  - Grafana com auth separada (ok no começo)
  - depois: SSO unificado

---

# Parte 6: Deploy (quando chegar a hora)
## 6.1 Grafana
- Pode rodar como container (VM/K8s)
- Provisioning versionado no Git
- Datasource Neon com SSL

## 6.2 Portal Next.js
- Pode rodar em:
  - Vercel (mais simples)
  - container em VM/K8s (mais controle)
- Requer env vars:
  - `QA_DB_URL`
  - `AWS_*`
  - `QA_ANALYST_URL`

## 6.3 QA-Analyst
- Container em VM/K8s
- Observability própria (métricas e logs) para aparecer no Grafana

---

# Checklist final (o que você costuma esquecer e depois xinga)
- [ ] Padronizar S3 key scheme (sem isso, nada escala)
- [ ] Garantir índice suficiente no Neon (para navegação rápida)
- [ ] URLs assinadas do S3 (não deixar público)
- [ ] Uma tabela de decisões/auditoria
- [ ] Links cruzados Grafana ↔ Portal
- [ ] Pipeline exportando campos consistentes (status/duration/layer)
- [ ] Plano de identidade visual (tokens e componentes mínimos)
- [ ] Observability do QA-Analyst (latência, erros, custo)