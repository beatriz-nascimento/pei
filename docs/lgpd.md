# LGPD — como o sistema trata os dados

O sistema guarda dados pessoais **sensíveis** (saúde) de **crianças e adolescentes**. Abaixo,
o que já está implementado e o que precisa de validação jurídica antes de abrir para clientes.

> Este documento descreve medidas técnicas. Não é parecer jurídico.

## Implementado

| Medida                        | Onde                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| Dados no Brasil               | Supabase sa-east-1 e Cloud Run southamerica-east1                   |
| Isolamento entre contas       | RLS em todas as tabelas + chaves compostas (`supabase/migrations`)  |
| Acesso mínimo                 | Editor e só leitura veem apenas alunos vinculados                   |
| Trilha de auditoria           | `audit_log` append-only: quem, quando, tabela, registro, campos     |
| Auditoria sem duplicar dados  | O log guarda **quais** campos mudaram, não os valores               |
| Exportações registradas       | Cada PDF/DOCX gerado vira um evento `export` na auditoria           |
| Consentimento da família      | Termo versionado, aceito antes de ver os dados (`family_consents`)  |
| Portal com dados mínimos      | Só primeiro nome, metas, adaptações, serviços e níveis de progresso |
| Tokens não reversíveis        | Links de convite e da família guardados como hash SHA-256           |
| IP minimizado                 | Acessos da família registram hash do IP com sal, nunca o IP         |
| Direito de eliminação         | Admin pode excluir o aluno (apaga PEIs e registros em cascata)      |
| Sem rastreadores de terceiros | Fontes e ícones servidos pelo próprio app (sem Google Fonts)        |
| Logs sem credenciais          | Tokens de URL e cabeçalho `Authorization` são removidos dos logs    |

## Validar com o jurídico

1. **Texto do termo de consentimento** do portal da família
   (`apps/web/src/app/features/family/family-portal.page.html`). Ao mudar o texto, troque
   `CONSENT_TERMS_VERSION` em `packages/shared/src/schemas.ts`: as famílias aceitam de novo.
2. **Papéis LGPD**: a escola é controladora e o SaaS operador? Isso define o contrato
   (DPA) e as responsabilidades em incidentes.
3. **Base legal** de cada tratamento. A coluna `audit_log.legal_basis` existe e está vazia
   até haver parecer.
4. **Retenção**: por quanto tempo guardar PEIs arquivados, alunos arquivados e a auditoria.
   Hoje nada é apagado automaticamente.
5. **Consentimento para o cadastro** do aluno pela escola (hoje o consentimento registrado é
   o da família para o portal).
6. **Exportação dos dados** (portabilidade, art. 18): ainda não há um "baixar tudo do aluno".

## Antes de produção

- Teste de intrusão básico (já previsto no plano do projeto).
- Backups e ponto de restauração do Supabase (PITR) habilitados no plano pago.
- SMTP próprio com SPF/DKIM para os e-mails de login.
