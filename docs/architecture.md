# QA Lab – Arquitetura

## Propósito
Orquestrar suites de QA sem acoplar ferramenta: coletar contexto do build, executar camadas declaradas (hoje L0/L1), normalizar resultados, publicar artefatos no S3 e registrar índices no Neon/Postgres para histórico, flake e seleção por impacto.

## Componentes
- **Reusable Workflow** (`.github/workflows/qa-lab.yml`): expõe `workflow_call`, faz checkout do repo caller (`fetch-depth: 50`), configura Node, assume role AWS via OIDC e invoca o runner.
- **Runner** (`runner/`):
  - `manifest.js`: coleta SHA, commits, autores, branch, workflow/run IDs.
  - `exec.js`: executa comandos; `runLayer` retorna status/exec metadata + esqueleto de stats/failures.
  - `result.js`: monta payload padrão e grava em `.qa-lab-artifacts/<build>-<layer>.json`.
  - `s3.js`: cria key e publica JSON em S3 (`prefix/tenant/repoSlug/buildId/results/<layer>.json`).
  - `persist.js`/`db.js`: conexão Neon (via `QA_DB_URL`), grava `qa_build`, `qa_run`, `qa_failure`.
- **Portal Web (Next.js)** (`portal/`):
  - Interface de exploração e decisão humana
  - Consome dados do Neon exclusivamente via endpoints server-side (`/api/*`)
  - Navegação por builds, runs e failures
  - Registro e exibição de decisões (`/api/decisions`) associadas a build/run/layer
  - Planejado: endpoint `/api/s3/presign` para gerar URLs assinadas de artefatos (GET-only, TTL curto, validadas por build/layer)
  - Base para futuras interações com IA (QA-Analyst)
- **Esquema de S3** (definitivo):
  - Base: `s3://<bucket>/<prefix>/<tenant>/<repo_slug>/<build_id>/`
  - Manifest: `manifest.json` (com `contract_version`/`schema_version`)
  - Runs: `runs/<layer>/attempt-<n>/result.json` (referência em `qa_run.s3_result_path`) + alias `runs/<layer>/latest/result.json`
  - Artefatos/logs/raw por camada: `runs/<layer>/attempt-<n>/logs|artifacts|raw/...`
  - IA/Flakiness/Seleção de testes: `analyst/<layer>/attempt-<n>/analysis-*.json`, `flaky-check-*.json`, `selection/...`

- **Grafana (Observability)**:
  - Ferramenta de observability e métricas agregadas
  - Conectado diretamente ao Neon/Postgres como datasource (read-only)
  - Usado para visão macro, tendências e alertas

- **Docs/contract** (`docs/contract.md`): contrato de camadas/config (em evolução).

## Fluxo de execução
1) Workflow caller passa inputs (tenant, repo_slug, build_id, comandos L0/L1, bucket/prefix etc.) e secrets (`AWS_ROLE_ARN`, `QA_DB_URL`).
2) Checkout do repo caller com histórico (50 commits) para coletar SHAs/autores.
3) Runner:
   - Gera `manifest`.
   - Marca `qa_build` como `running`.
   - Roda L0 (sempre) e L1 (se fornecido) com `runLayer`.
   - Grava resultado em disco (`writeResult`), publica no S3 (`publishToS3`), registra `qa_run` e falhas (`qa_failure`).
   - Recalcula status final (failed se qualquer camada falhar), atualiza `qa_build` com `finished_at`.
4) Artefatos ficam no workspace e no S3; índices ficam no Neon.
5) Dados persistidos passam a ser consumidos por:
   - Grafana, para visão agregada e observability
   - Portal Web, para exploração detalhada, navegação e tomada de decisão

## Persistência (DB Neon)
Schema esperado (já provisionado):  
- `qa_build`: build_id (PK), repo, branch, head_sha, commit_shas (text[]), authors (text[]), actor, status, started_at, finished_at.  
- `qa_run`: id, build_id (FK), layer, status, duration_ms, totals (jsonb), s3_result_path, suite, metadata (jsonb), created_at.  
- `qa_failure`: id, build_id, layer, run_id (FK opcional), test_name, file_path, message_hash, message_snippet, created_at.
- `qa_decision`: id, build_id, run_id (FK opcional), layer, type (waiver/quarantine/rerun_request/issue_opened/patch_suggested), actor, reason, metadata (jsonb), created_at.
`commit_shas`/`authors` são arrays de texto; `totals` é jsonb.

O acesso de leitura aos dados segue o contrato definido em `docs/contract.md`.
O Runner é o único componente autorizado a escrever no banco.

## Armazenamento em S3
- Bucket configurável (`s3_bucket`, default `qa-lab-results-dev`).
- Prefix configurável (`s3_prefix`, default `dev`).
- Chave: `<prefix>/<tenant>/<repoSlug>/<buildId>/results/<layer>.json`.
- Upload via IAM Role assumida por OIDC (permissões Put/List/Get).

## Inputs e secrets do workflow
- Inputs obrigatórios: `tenant_key`, `repo_slug`, `build_id`, `workdir`, `l0_command`.  
- Inputs opcionais: `l1_command`, `node_version` (default 20), `s3_bucket`, `s3_prefix`.  
- Secrets: `AWS_ROLE_ARN`, `QA_DB_URL`.
- Permissões do job: `id-token: write`, `contents: read`.

## Limitações e próximos passos
- `totals`/`failures` são placeholders; precisa de parsers por runner (JUnit/JSON) para preencher stats reais e falhas granulares.
- Apenas L0/L1 estão ligados; L2/L3/L4 serão adicionadas via contrato de config.
- O checkout usa `fetch-depth: 50`; ajustar se precisar de mais histórico.
- Portal Web e Grafana já estão operacionais como consumidores de leitura; próximos passos incluem URLs assinadas de S3 e IA analítica (QA-Analyst).

## Segurança e OIDC
- O role AWS deve confiar nos repos callers (`token.actions.githubusercontent.com` + `sub` com `repo:<owner>/<repo>:*`).
- Nunca comitar URLs/creds reais; usar `QA_DB_URL` como secret e `AWS_ROLE_ARN` com trust restrito.
