# QA Lab

Orquestrador de QA multi-camada via GitHub Actions. Ele não define ferramentas de teste: apenas coleta contexto do build, executa os comandos declarados pelo repositório (L0/L1, e futuro L2+), normaliza resultados, publica artefatos no S3 e grava índices no Neon/Postgres.

## Estado atual
- Workflow reutilizável (`.github/workflows/qa-lab.yml`) exposto via `workflow_call`.
- Runner Node 20+: executa L0 (obrigatório) e L1 (opcional), gera manifest, salva resultados em JSON, publica no S3 e persiste no Neon.
- Formato de resultado já inclui esqueleto de `totals` e `failures` (parsers específicos de JUnit/JSON virão depois).

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

## Mais detalhes
- Arquitetura completa: `docs/architecture.md`
- Contrato (em evolução): `docs/contract.md`

## Roadmap curto
- Parsers de resultados (JUnit/JSON) para preencher `totals`/`failures` reais.
- Camadas L2/L3/L4 com contrato de configuração (`qa-lab.config.*`).
- Notificações, análise de flake e seleção de testes por impacto.
