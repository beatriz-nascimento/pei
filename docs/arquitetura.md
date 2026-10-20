# Decisões de arquitetura

Registro curto das decisões e do porquê. Cada uma pode ser revista; o custo de mudar está
indicado.

## 1. Monorepo com npm workspaces

`apps/api`, `apps/web` e `packages/shared` no mesmo repositório. O pacote compartilhado tem
os esquemas zod usados **nos formulários Angular e na validação da API** — uma regra muda
num lugar só. Ficou em npm workspaces simples (sem Nx) para manter o Angular CLI e o Nest
CLI no seu uso normal; o Nx pode ser adicionado depois com `nx init` se o build ficar lento.

## 2. Multi-tenancy com Row-Level Security (RLS)

Cada escola ou profissional é um _tenant_. Todas as tabelas têm `tenant_id`, e o Postgres
filtra as linhas pela identidade de quem consulta:

- A API abre uma transação por requisição, injeta os claims do JWT
  (`request.jwt.claims`) e assume o papel `authenticated` — o mesmo mecanismo do Supabase.
  Mesmo que um endpoint esqueça um `where tenant_id = ...`, o banco não devolve dados de
  outra conta.
- Chaves estrangeiras compostas `(id, tenant_id)` impedem que um PEI aponte para aluno de
  outra conta, inclusive por erro de aplicação.
- As funções auxiliares das políticas retornam conjuntos (`setof uuid`) e são usadas como
  `x in (select private.fn())`, para o Postgres calculá-las uma vez por consulta.
- Funções `SECURITY DEFINER` (criar conta, aceitar convite, portal da família) ficam no
  schema `private`, que não é exposto pela API REST automática do Supabase.

Os testes em `apps/api/test/rls.spec.ts` acessam o banco direto, sem a API, para garantir
que o isolamento vale também para quem usar a chave pública do Supabase.

**Mudar depois:** caro. É a decisão mais importante do projeto.

## 3. Permissões por papel + vínculo com o aluno

- `admin`: tudo dentro da conta.
- `editor` (Edita PEI): lê e edita alunos/PEIs aos quais está vinculado.
- `viewer` (Só leitura): lê os alunos aos quais está vinculado.

Escolha guiada pela LGPD (acesso mínimo necessário a dados de saúde de menores). Se a
escola quiser que toda a equipe veja todos os alunos, basta mudar
`private.readable_student_ids()`.

## 4. Autenticação: Supabase Auth, validada na API

O frontend faz login com o `supabase-js` (senha ou link mágico). A API valida o access
token com as **chaves públicas (JWKS)** do projeto — sem segredo compartilhado. Para
projetos com chave legada HS256, basta definir `SUPABASE_JWT_SECRET`.

## 5. Documentos gerados na hora

PDF (pdfmake) e Word (docx) são montados a partir de um **modelo neutro**
(`document-model.ts`): o conteúdo é definido uma vez e renderizado nos dois formatos, que
não divergem. Nada é armazenado: cada exportação é registrada na auditoria e o arquivo vai
direto para o navegador. Guardar versões assinadas fica para quando houver assinatura
digital.

## 6. Portal da família por link

Token aleatório de 256 bits; o banco guarda só o hash SHA-256. O link expira, pode ser
revogado e cada acesso é contado (com hash do IP, nunca o IP). Antes dos dados, a família
aceita o termo de consentimento (versão registrada). O portal mostra só o primeiro nome do
aluno, metas, adaptações, serviços e níveis de progresso — sem condições clínicas, estudo de
caso ou anotações da equipe.

## 7. Frontend

Angular 22 com componentes standalone, `OnPush`, signals, `httpResource` para leituras e
**Signal Forms** com `validateStandardSchema` (os esquemas zod do pacote compartilhado). A
configuração (URLs, chave pública) é lida de `/config.json` em tempo de execução, então a
mesma imagem serve homologação e produção. Fontes e ícones são servidos pelo próprio app.

## 8. Infraestrutura

Cloud Run em São Paulo para API e frontend (escala a zero, sem servidor para manter),
Supabase em São Paulo para banco e auth. Terraform cria o ambiente; o GitHub Actions troca
só a imagem a cada deploy (`lifecycle.ignore_changes`), e as migrações rodam antes da API
nova subir.
