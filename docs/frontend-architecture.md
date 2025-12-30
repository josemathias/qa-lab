# QA-Lab Front-end Architecture
Grafana + Portal (Next.js) + QA-Analyst (IA)

## Objetivo
Construir um front-end composto por dois “pontos de entrada” complementares:

1) **Grafana**: observability e telemetria (dashboards, alertas, trends, correlação)
2) **Portal leve (Next.js)**: produto e workflow humano (status, drill-down, decisões, anotações e chat IA)
3) **QA-Analyst (IA)**: serviço analítico que correlaciona evidências (Neon + S3 + Git) e sugere causa raiz + ações

Esse desenho evita reinventar observability no portal e evita tentar transformar Grafana em “produto de decisão”.

## Estado atual (validado em implementação)

Esta arquitetura não é mais apenas conceitual. Os seguintes pontos já foram validados na prática:

- Grafana rodando via Docker, conectado ao Neon/Postgres como datasource
- Dashboards MVP operacionais para visão agregada de builds e runs
- Portal Next.js (App Router) rodando no próprio repositório (`/portal`), porta 3001
- Endpoints internos funcionais:
  - `GET /api/builds`
  - `GET /api/builds/:buildId`
  - `GET /api/runs`
  - `GET /api/runs/:runId`
- Navegação funcional no portal:
  - `/builds` → `/builds/:buildId` → `/runs/:runId`
  - `/runs` → `/runs/:runId`

Aprendizados técnicos importantes:
- Next.js 16+ exige tratar `params` de rotas dinâmicas como `Promise`
- URLs absolutas no server-side são construídas via `headers()` (`host` + `x-forwarded-proto`)
- `qa_run` usa `id` (bigserial) como chave primária
- `qa_failure` **não** referencia `qa_run.id`; o vínculo atual é por `(build_id, layer)`

---

## Visão geral de componentes

### 1) Produtores de dados (já existem no qa-lab)
- **Runner / Workflow do qa-lab**
  - Executa suites (L0 e L1 inicialmente; depois L2/L3/L4)
  - Gera **manifest** (metadados do build/run)
  - Gera resultados normalizados (por camada) em JSON
  - Publica evidências no **S3**
  - Persiste índice/metadata no **Neon (Postgres)**

### 2) Camada de dados
- **Neon / Postgres (índice navegável)**
  - Armazena metadados normalizados e relacionais
  - Schema atual (MVP validado):
    - `qa_build`: `build_id (text)`, `repo`, `branch`, `head_sha`, `commit_shas`, `authors`, `status`, `started_at`, `finished_at`
    - `qa_run`: `id (bigserial)`, `build_id`, `layer`, `status`, `duration_ms`, `totals (jsonb)`, `s3_result_path`, `created_at`
    - `qa_failure`: `id (bigserial)`, `build_id`, `layer`, `test_name`, `file_path`, `message_hash`, `message_snippet`, `created_at`
  - O Neon funciona como **índice navegável**, não como storage de evidências pesadas

- **S3**
  - Armazena artefatos “pesados” e imutáveis:
    - manifest JSON (opcional, mas recomendável)
    - results JSON por camada (L0/L1/...)
    - logs completos
    - screenshots/traces/etc (futuro L4)
  - Acesso via URL assinada (preferencial) para evitar exposição pública

### 3) Consumidores / front-ends

#### A) Grafana (Observability)
- Fontes de dados (inicial):
  - **Postgres datasource** apontando para Neon
  - Painéis e queries sobre builds/runs/falhas
- Fontes de dados (evolução recomendada):
  - **Prometheus datasource** para métricas do runner e do pipeline
  - **Loki** para logs do runner e (se aplicável) logs do SUT
  - **Tempo/Jaeger** para traces (mais útil do L3/L4 em diante)
- Outputs:
  - Dashboards (quality overview, flakiness, duration, trend por branch)
  - Alertas (ex.: falha crítica, aumento de flakiness, regressão de duração)
  - Links profundos para o Portal (drill-down por build_id/run_id)

#### B) Portal (Next.js) (Produto e Decisão)
- Responsabilidades:
  - Listar builds e runs (com filtros por branch, commit, autor, janela, camada)
  - Drill-down: run → suites → casos → falhas → evidências no S3
  - Controles de decisão:
    - “gating” (block merge / allow with waiver)
    - rerun (somente falhados, ou suite específica)
    - quarantine de teste (marcar como flakey)
    - abrir issue automaticamente
    - gerar patch/PR (via IA, opcional)
  - Chat “QA-Analyst”: análise de causa raiz + sugestões acionáveis
- Importante:
  - O Portal **não** acessa Neon/S3 diretamente do browser
  - O Portal usa **API routes/server actions** para:
    - consultar Neon com credenciais server-side
    - gerar URLs assinadas do S3
    - chamar o QA-Analyst com contexto da execução

##### Restrições técnicas validadas

- O browser nunca acessa Neon ou S3 diretamente
- Todo acesso a dados ocorre via:
  - API routes (`/api/*`) server-side
  - (futuro) Server Actions
- O Portal é **server-first**:
  - Server Components por padrão
  - Fetch com `cache: "no-store"` para dados de execução
- URLs absolutas são resolvidas dinamicamente no servidor
- O Portal é responsável por:
  - Navegação, contexto e decisão humana
  - Não por métricas agregadas (papel do Grafana)

#### C) QA-Analyst (IA)
- Serviço separado, stateless por padrão, com persistência opcional
- Inputs:
  - `build_id` e/ou `run_id`
  - (opcional) `layer` (L0/L1/L2...)
- Data sources:
  - Neon: metadados e falhas normalizadas
  - S3: resultados completos e evidências (logs, traces, etc.)
  - GitHub API (opcional, mas valioso): diff/PR/blame/arquivos alterados
- Outputs:
  - Resumo executivo (impacto, probabilidade, evidências)
  - Hipóteses de causa raiz (código, teste, dado, infra)
  - Sugestões de ação (comandos, mudanças, thresholds, quarantine, rerun)
  - (opcional) proposta de patch (diff textual) ou abertura de PR/issue

---

## Fluxo de dados (do pipeline ao usuário)

### 1) Execução do qa-lab (CI)
1. Pipeline dispara o runner (workflow)
2. Runner cria `manifest.json` do build/run
3. Runner executa suites por camada (L0/L1...)
4. Para cada camada gera `results.<layer>.json`
5. Runner:
   - Faz upload dos JSONs e evidências para S3
   - Persiste no Neon:
     - linha em `qa_build`
     - linhas em `qa_run`
     - linhas em `qa_failure` (e outras tabelas futuras, ex.: `qa_testcase`)

### 2) Observability
- Grafana consulta o Neon (Postgres datasource)
- Dashboards mostram status e tendências
- Alertas disparam e linkam para o Portal (build/run)

### 3) Portal e IA

Estado atual:
- Portal consulta Neon via API server-side
- Portal gera links navegáveis para builds e runs
- Links para evidências em S3 ainda não estão expostos no UI (próximo passo)

Evolução planejada:
- Portal gera URLs assinadas do S3 via endpoint dedicado
- Usuário solicita análise
- Portal chama QA-Analyst passando `build_id` / `run_id`
- QA-Analyst consulta Neon + S3 (+ GitHub opcional)
- QA-Analyst retorna:
  - resumo executivo
  - hipóteses de causa raiz
  - sugestões acionáveis
- Portal exibe e oferece ações (rerun, quarantine, issue, patch)

---

## Segurança e Acesso
- **Neon URL** e credenciais ficam apenas no servidor (Portal e QA-Analyst)
- **S3**: evitar objetos públicos:
  - gerar URL assinada (presigned URL) no servidor
  - ou usar proxy de download pelo Portal (mais controle, mais custo)
- Autenticação:
  - mínimo: login por GitHub OAuth (ou outro IdP)
  - RBAC (futuro): permissões por repo/projeto/ambiente
- Auditoria:
  - registrar decisões (waiver/quarantine/rerun) em tabela própria
  - anexar usuário, timestamp, motivo, referência de build/run

---

## Observability do próprio sistema (meta-observability)
- Registrar telemetria do Portal e do QA-Analyst:
  - latência das queries e chamadas IA
  - erros por endpoint
  - uso por usuário / volume de análises
- Preferência: exportar métricas para Prometheus e visualizar no Grafana

---

## Evolução para L2/L3/L4
- L2/L3/L4 aumentam volume de evidência (especialmente logs e traces)
- Neon permanece como “índice navegável”
- S3 permanece como “armazenamento pesado”
- Grafana ganha valor com métricas/traces/logs conforme as camadas sobem
- Portal ganha valor com workflows (quarantine, patch, PR, políticas por camada)

---

## Por que esta arquitetura
- Grafana resolve observability e tendências com baixa implementação
- Portal resolve UX e decisões sem forçar Grafana a virar app
- QA-Analyst resolve inteligência analítica de forma plugável e reutilizável
- Neon + S3 separam índice vs evidência e escalam melhor

Na prática, esta separação evitou dois erros comuns:
- tentar transformar Grafana em um produto de decisão
- tentar reimplementar observability e métricas dentro do Portal

Cada componente faz pouco, mas faz bem.