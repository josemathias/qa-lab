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
- porta 8080

Conceito:
- você acessa `http://localhost:8080`
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

## [ ] 1.4 Criar dashboards mínimos (MVP)
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

### Plano detalhado (Parte 3)
1) Mapear estado atual (S3 + Neon)  
   - O que: inspecionar chaves existentes no bucket e colunas/população real nas tabelas (`qa_build`, `qa_run`, `qa_failure`).  
   - Por quê: evitar romper dados já coletados e entender lacunas antes de padronizar.

2) Definir esquema de chaves S3 definitivo  
   - O que: formalizar padrão único para manifest, resultados por camada, logs e artefatos (`<prefix>/<repo>/<branch>/<build_id>/...`). Documentar no README/contract.  
   - Por quê: garante previsibilidade para o portal (link de evidências) e para o Grafana (links profundos), reduzindo variação por repositório.

3) Aplicar padronização das chaves no runner/workflow  
   - O que: ajustar `runner/s3.js` (ou equivalente) para gerar keys no padrão, criar migração simples para builds futuros, e manter compatibilidade retroativa (ex.: fallback para keys antigas se existirem).  
   - Por quê: sem mudança no produtor, o padrão não se mantém; fallback evita quebrar dados históricos.

4) Reforçar o “índice navegável” no Neon  
   - Status: concluído.
   - O que foi feito:
     1) Campos confirmados/expandidos: `qa_build` ganhou `actor`; `qa_run` ganhou `suite` e `metadata` (jsonb); `qa_failure` ganhou `run_id` (FK opcional, mantendo compatibilidade via build_id/layer).
     2) Índices criados/aplicados: repo/branch/status/started_at em builds; build/layer/status/created_at em runs; build/layer/message_hash/created_at em failures.
     3) Resumo/metadata: `qa_run.metadata` armazena comando, attempt, exit_code, started_at, finished_at; suite vem de `QA_SUITE_<LAYER>` ou nome da camada; actor vem do `GITHUB_ACTOR`.
     4) DDL: `infra/db/ddl_columns.sql` e `infra/db/ddl_indexes.sql` aplicados no Neon.
     5) Validação: EXPLAIN/ANALYZE em builds/runs/failures retornam em ms; portal atualizado para exibir actor/suite/metadata e usar `run_id` em falhas com fallback legacy.

5) Criar tabela de decisões (`qa_decision`)  
   - Status: concluído.
   - O que foi feito:
     - Schema/tabela aplicada via `infra/db/ddl_decision.sql` (FK opcional para `qa_run`, índices em build_id/run_id/type/created_at).
     - Persistência server-side (`recordDecision`) disponível; runner não escreve decisões.
     - API `/api/decisions` (POST/GET) criada; portal build/run exibe decisões e inclui formulário para registrar.
     - Docs atualizados (README, contract, architecture).
     - Testes: L0 já cobrem runner; L1 (Vitest) cobre API de decisões com mock de DB.

6) Validação end-to-end  
   - O que: rodar um build de teste, conferir keys geradas no S3, checar inserções no Neon, medir tempos de consulta e verificar se portal/Grafana continuam operando com o novo padrão.  
   - Por quê: fecha o ciclo garantindo que o plano não quebrou consumo existente e que os ganhos (padronização e índice) se materializaram.

## 3.1 Padronizar S3 Keys
Esquema definitivo (multi-tenant, multi-layer, com tentativas e IA):
- Base: `s3://<bucket>/<prefix>/<tenant>/<repo_slug>/<build_id>/`
  - `<prefix>` carrega ambiente (ex.: `dev`, `stg`, `prod`) e pode incluir célula/região se necessário.
- Manifest do build: `manifest.json` (contrato versionado, contexto de git, pipeline e inputs).
- Runs por camada (L0…L4):  
  - Resultado normalizado: `runs/<layer>/attempt-<n>/result.json` (único caminho referenciado por `s3_result_path` no DB).  
  - Raw/artefatos de runner: `runs/<layer>/attempt-<n>/raw/<vendor>/...` (ex.: junit, json do cypress/playwright).  
  - Logs: `runs/<layer>/attempt-<n>/logs/runner.log` (stdout/stderr consolidado).  
  - Evidências leves: `runs/<layer>/attempt-<n>/artifacts/<type>/...` (ex.: screenshots, videos, traces, coverage).  
  - Alias para última tentativa: `runs/<layer>/latest/result.json` (cópia do último `attempt-n`) para consumo rápido; sempre manter tentativa numerada como fonte de verdade.
- IA (QA-Analyst) e flakiness:  
  - Saída de análise: `analyst/<layer>/attempt-<n>/analysis-<timestamp>.json` (resumo executivo, hipóteses, ações).  
  - Insumos/derivados de flaky: `analyst/<layer>/attempt-<n>/flaky-check-<timestamp>.json` (evidências de rerun/quarantine).
- IA de seleção/priorização de testes (impact-based test selection):  
  - Entrada usada pelo agente (diff e metadados): `analyst/selection/<layer>/attempt-<n>/inputs-<timestamp>.json` (arquivos alterados, cobertura prévia, histórico de falhas).  
  - Lista de testes priorizados/despriorizados: `analyst/selection/<layer>/attempt-<n>/plan-<timestamp>.json` (inclui skip/only, motivações, score de risco).  
  - Decisão aplicada (log de execução com filtros): `analyst/selection/<layer>/attempt-<n>/applied-<timestamp>.json` (quais testes rodaram, quais foram pulados, razão e impacto esperado).  
  - Alias de último plano aplicado: `analyst/selection/<layer>/latest/plan.json` (cópia do plano mais recente; fonte de verdade é a versão com timestamp).
- Decisões humanas (se precisarmos guardar em S3): `decisions/<build_id>-<run_or_layer>-<timestamp>.json` (espelha tabela `qa_decision`, mas opcional porque o índice oficial fica no DB).
- Downloads pesados opcionais: `logs/global/` (pipeline completo) e `artifacts/global/` (ex.: bundle de screenshots/traces) se excederem o escopo de uma camada.

Regras:
- Sempre usar tentativas numeradas para reruns (ex.: `attempt-1` default, `attempt-2` para rerun/flaky fix); o alias `latest` é apenas conveniência.
- `s3_result_path` deve apontar para o resultado normalizado da tentativa efetiva (`runs/<layer>/attempt-<n>/result.json`), nunca para o alias `latest`.
- Guardar `contract_version` e `schema_version` dentro de `manifest.json` e `result.json` para migrações futuras.

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

# Parte 4A: Presigned URLs (S3)
Objetivo: fornecer URLs temporárias para evidências no S3 sem expor credenciais.

Contrato do endpoint (server-side):
- `POST /api/s3/presign`
- Corpo (JSON ou form):
  - `key`: caminho completo no bucket, ou
  - `build_id`, `layer`, `artifact_path` (ex.: `runs/L0/attempt-1/result.json`), opcional `run_id`
- Resposta: `{ url: string, expires_in: number }`
- Validações:
  - `key` deve estar dentro de `<prefix>/<tenant>/<repo>/<build_id>/...`
  - `artifact_path` permitido apenas em prefixos conhecidos (`runs/<layer>/...`, `logs/...`, `artifacts/...`)
  - TTL curto (10-30 min), método GET apenas.
- Autorização mínima (fase 1): checar existência de build/run no DB e combinar `build_id` com `key` solicitado; futura: RBAC/actor.
- Observabilidade: logar build_id/run_id/layer/key e erros.

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

# Checklist final (pendências e concluídos)
Pendências:
- [ ] URLs assinadas do S3 (não deixar público)
- [ ] Links cruzados Grafana ↔ Portal
- [ ] Pipeline exportando campos consistentes (status/duration/layer)
- [ ] Plano de identidade visual (tokens e componentes mínimos)
- [ ] Observability do QA-Analyst (latência, erros, custo)

Concluídos:
- [x] Padronizar S3 key scheme (sem isso, nada escala)
- [x] Garantir índice suficiente no Neon (para navegação rápida)
- [x] Uma tabela de decisões/auditoria
