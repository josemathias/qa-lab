# qa-lab — Contract v1

Este documento define os **contratos explícitos** entre os componentes do qa-lab.
Ele existe para reduzir ambiguidade, evitar acoplamentos acidentais e permitir evolução controlada da plataforma.

Este é um **contrato vivo**, versionado conforme o sistema amadurece.

---

## 1. Princípios do contrato

1. **Neon é o índice, não a evidência**
   - Neon/Postgres armazena metadados navegáveis
   - Evidências pesadas vivem fora (S3)

2. **Portal e Grafana são consumidores**
   - Nenhum deles escreve dados no Neon
   - Escrita é responsabilidade exclusiva do Runner

3. **Sem acesso direto a infraestrutura**
   - Browser nunca acessa Neon ou S3 diretamente
   - Todo acesso passa por camadas server-side

4. **Contratos explícitos > convenções implícitas**
   - Campos, chaves e relações são documentados
   - “Funciona hoje” não é contrato

---

## 2. Contrato de dados (Neon / Postgres)

### 2.1 Tabela `qa_build`

| Campo        | Tipo        | Descrição |
|-------------|-------------|-----------|
| build_id    | text (PK)   | Identificador lógico do build |
| repo        | text        | Repositório |
| branch      | text        | Branch |
| head_sha    | text        | SHA principal |
| commit_shas | text[]      | SHAs envolvidos |
| authors     | text[]      | Autores |
| status      | text        | pass \| fail \| error |
| started_at | timestamptz | Início |
| finished_at| timestamptz | Fim |

---

### 2.2 Tabela `qa_run`

| Campo          | Tipo        | Descrição |
|----------------|-------------|-----------|
| id             | bigserial (PK) | Identificador técnico da run |
| build_id       | text (FK lógica) | Referência a qa_build.build_id |
| layer          | text        | L0, L1, L2… |
| status         | text        | pass \| fail \| error |
| duration_ms    | int         | Duração |
| totals         | jsonb       | Totais agregados |
| s3_result_path | text        | Prefixo no S3 |
| created_at     | timestamptz | Criação |

---

### 2.3 Tabela `qa_failure`

| Campo           | Tipo        | Descrição |
|-----------------|-------------|-----------|
| id              | bigserial (PK) | Identificador técnico |
| build_id        | text        | Build associado |
| layer           | text        | Camada |
| test_name       | text        | Nome do teste |
| file_path       | text        | Arquivo |
| message_hash    | text        | Hash normalizado |
| message_snippet | text        | Trecho da mensagem |
| created_at      | timestamptz | Criação |

#### Nota importante
Atualmente **não existe relação direta entre qa_failure e qa_run.id**.
A associação é feita por `(build_id, layer)`.

---

## 3. Contrato de escrita (Runner)

O Runner é o **único componente autorizado a escrever** no Neon.

Responsabilidades:
- Criar registros em `qa_build`
- Criar registros em `qa_run`
- Criar registros em `qa_failure`
- Garantir consistência mínima entre build, run e failures

Não responsabilidades:
- Decisão humana
- Visualização
- Análise semântica

---

## 4. Contrato de leitura (Portal e Grafana)

### 4.1 Portal (Next.js)

O Portal:
- Consome dados via endpoints internos `/api/*`
- Usa Server Components
- Nunca acessa Neon diretamente

Endpoints garantidos (v1):
- `GET /api/builds`
- `GET /api/builds/:buildId`
- `GET /api/runs`
- `GET /api/runs/:runId`

Garantias:
- Campos listados no contrato de dados
- Ordem temporal consistente
- Respostas JSON estáveis

---

### 4.2 Grafana

O Grafana:
- Lê diretamente do Neon/Postgres
- Não escreve dados
- Não implementa lógica de negócio

Garantias:
- Schema estável
- Colunas documentadas
- Queries somente leitura

---

## 5. Contrato de evidências (S3)

- Esquema definitivo de chaves S3 (multi-tenant, multi-layer, com tentativas):
  - Base: `s3://<bucket>/<prefix>/<tenant>/<repo_slug>/<build_id>/` (prefix reflete ambiente)
  - Manifest: `manifest.json` (com `contract_version` e `schema_version`)
  - Runs por camada (L0…L4):
    - Resultado normalizado: `runs/<layer>/attempt-<n>/result.json` (único caminho em `qa_run.s3_result_path`)
    - Alias conveniência: `runs/<layer>/latest/result.json` (cópia do último attempt; não é fonte de verdade)
    - Logs/artefatos/raw: `runs/<layer>/attempt-<n>/logs|artifacts|raw/...`
  - IA/Flakiness/Seleção de testes:
    - `analyst/<layer>/attempt-<n>/analysis-<timestamp>.json`
    - `analyst/<layer>/attempt-<n>/flaky-check-<timestamp>.json`
    - `analyst/selection/<layer>/attempt-<n>/inputs|plan|applied-<timestamp>.json`
    - Alias: `analyst/selection/<layer>/latest/plan.json`
  - Decisões (opcional em S3): `decisions/<build_id>-<run_or_layer>-<timestamp>.json` (índice oficial fica no DB)
- Evidências pesadas (logs, traces, artefatos) vivem no S3
- Neon armazena apenas o **ponteiro** (`s3_result_path`)
- URLs públicas não são expostas diretamente

Evolução prevista:
- `POST /api/s3/presign`
- URLs temporárias, escopo mínimo

---

## 6. Contrato de IA (QA-Analyst) — FUTURO

O QA-Analyst será um **consumidor de leitura**, nunca escritor.

Entrada:
- build_id e/ou run_id
- Acesso somente leitura ao Neon
- Acesso controlado ao S3

Saída:
- Resumo executivo
- Hipóteses de causa raiz
- Recomendações acionáveis

Contrato explícito:
- IA sugere, humano decide
- Nenhuma ação automática sem confirmação

---

## 7. Evolução do contrato

Mudanças no contrato exigem:
- Atualização deste documento
- Versionamento explícito
- Compatibilidade retroativa sempre que possível

Este contrato define a **linha de base** para evolução segura do qa-lab.
