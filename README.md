# QA Lab

Orquestrador de QA multi-camada via GitHub Actions. Ele não define ferramentas de teste: apenas coleta contexto do build, executa os comandos declarados pelo repositório (L0/L1, e futuro L2+), normaliza resultados, publica artefatos no S3 e grava índices no Neon/Postgres.

## Estado atual
- Workflow reutilizável (`.github/workflows/qa-lab.yml`) exposto via `workflow_call`.
- Runner Node 20+: executa L0 (obrigatório) e L1 (opcional), gera manifest, salva resultados em JSON, publica no S3 e persiste no Neon.
- Formato de resultado já inclui esqueleto de `totals` e `failures` (parsers específicos de JUnit/JSON virão depois).

## Observability e Portal Web (NOVO)

Além do runner e do workflow reutilizável, o qa-lab agora possui duas camadas de observability e exploração de dados:

### 1) Portal Web (Next.js)
Um portal web server-side (Next.js App Router) para navegação e inspeção dos dados gravados no Neon/Postgres.

Funcionalidades atuais (MVP):
- Lista de builds (`qa_build`)
- Detalhe de build com suas runs (`qa_run`)
- Lista global de runs
- Detalhe de run com suas failures (`qa_failure`)
- Navegação cruzada Builds → Runs → Failures

Características técnicas:
- Server Components (sem chamadas client-side diretas ao banco)
- Endpoints internos (`/api/*`) acessam o Neon via pool Postgres
- URLs absolutas resolvidas dinamicamente via `headers()` (compatível com dev/prod)
- Compatível com Next.js 16+ (tratamento de `params` como Promise)

### 2) Grafana
Grafana é utilizado como frontend de observability para métricas e visões agregadas, conectado diretamente ao Neon/Postgres como datasource.

Uso típico:
- Dashboards de visão geral (ex: total de builds, status por camada, falhas ao longo do tempo)
- Exploração ad-hoc dos dados persistidos pelo qa-lab
- Base para alertas futuros (ex: regressões, aumento de falhas, instabilidade)

Essas duas camadas são complementares:
- **Grafana**: visão agregada, métricas e observability
- **Portal**: exploração detalhada, navegação por entidades e base para IA analítica

## Como usar (repo consumidor)
1) Crie secrets no repo consumidor:  
   - `AWS_ROLE_ARN`: role com trust para o repo (OIDC) e permissão de Put/List/Get no bucket.  
   - `QA_DB_URL`: connection string do Neon.
2) Adicione um workflow chamando o reusável, por exemplo:
   ```yaml
   name: QA (qa-lab)
   on:
     pull_request:
     push:
       branches: [ "main" ]
   permissions:
     contents: read
     id-token: write
   jobs:
     qa:
       uses: josemathias/qa-lab/.github/workflows/qa-lab.yml@main
       with:
         tenant_key: 'ligacoop'
         repo_slug: 'my-repo'
         build_id: '${{ github.run_id }}'
         workdir: '.'
         l0_command: 'npm ci && npm run test:l0'
         l1_command: '' # opcional
         s3_bucket: 'qa-lab-results-dev'
         s3_prefix: 'dev'
       secrets:
         AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN }}
         QA_DB_URL: ${{ secrets.QA_DB_URL }}
   ```
3) O workflow faz checkout com `fetch-depth: 50` para coletar SHAs/autores, instala Node, configura AWS via OIDC e roda o runner.

## O que é gerado
- Manifest do build (contexto: SHAs, autores, repo, branch, run info).
- Resultados por camada em `.qa-lab-artifacts/<build>-<layer>.json` e enviados ao S3 em `prefix/tenant/repoSlug/buildId/results/<layer>.json`.
- Linhas no Neon:  
  - `qa_build` (status do build, SHAs, autores).  
  - `qa_run` (por camada: status, duração, totals, link S3).  
  - `qa_failure` (falhas individuais – esqueleto preenchido com snippet de stderr/stdout).

## Rodar local
```bash
npm ci
QA_DB_URL="postgres://..." AWS_REGION="us-east-2" \
node runner/index.js \
  --tenant tenantKey \
  --repo owner/repo \
  --repoSlug repo-slug \
  --buildId local-123 \
  --workdir . \
  --s3Bucket qa-lab-results-dev \
  --s3Prefix dev \
  --l0 "npm test" \
  --l1 ""
```
Exige AWS creds configurados no ambiente para publicar no S3.

## Portal Web (Next.js)

O portal web vive dentro do próprio repositório do qa-lab, no diretório `portal/`.

### Pré-requisitos
- Node.js 18+ (recomendado 20)
- Acesso ao Neon/Postgres usado pelo qa-lab

### Variáveis de ambiente (portal/.env.local)
O portal usa acesso direto ao Neon para seus endpoints internos:

```env
QA_DB_URL=postgres://user:password@host:port/dbname
```

> A conexão é somente leitura para fins de observability.

### Rodar o portal localmente
```bash
cd portal
npm install
npm run dev
```

Por padrão:
- Portal: http://localhost:3001
- Builds: http://localhost:3001/builds
- Runs: http://localhost:3001/runs

### Endpoints internos expostos
- `GET /api/builds`
- `GET /api/builds/:buildId`
- `GET /api/runs`
- `GET /api/runs/:runId`

Esses endpoints refletem diretamente o schema atual:
- `qa_build`
- `qa_run`
- `qa_failure`

## Mais detalhes
- Arquitetura completa: `docs/architecture.md`
- Contrato (em evolução): `docs/contract.md`

## Roadmap curto
- Parsers de resultados (JUnit/JSON) para preencher `totals`/`failures` reais.
- Camadas L2/L3/L4 com contrato de configuração (`qa-lab.config.*`).
- Notificações, análise de flake e seleção de testes por impacto.

## Grafana (Observability)

O qa-lab pode ser acompanhado via Grafana, usando o Neon/Postgres como datasource.

Características:
- Datasource Postgres apontando para o mesmo banco usado pelo qa-lab
- Dashboards provisionados via arquivos (`grafana/provisioning`)
- Ideal para métricas agregadas e acompanhamento histórico

Exemplos de painéis:
- Total de builds executados
- Builds por status (pass/fail)
- Runs por camada (L0, L1, futuro L2+)
- Falhas ao longo do tempo

O Grafana não substitui o portal:
- Grafana = métricas, visão macro, alertas
- Portal = exploração detalhada e base para análises assistidas por IA
