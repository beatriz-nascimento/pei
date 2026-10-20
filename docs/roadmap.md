# Próximas iterações

Fora do escopo deste MVP, em ordem sugerida:

1. **E-mail de convite automático** (hoje o admin copia o link) e de envio do link da família.
2. **Motor de regras + banco de metas SMART/BNCC** filtrado por perfil (TEA, TDAH, TAG, T21,
   dislexia, discalculia), com orientação contextual — o núcleo do documento do projeto.
   Precisa do especialista em educação especial para montar o banco.
3. **Estudo de caso e PAEE como documentos separados**, conforme o Decreto 12.773/2025
   (hoje o estudo de caso sai dentro do documento do PEI).
4. **Lembretes de revisão** de metas e PEIs (Cloud Scheduler + e-mail).
5. **Painel do coordenador**: PEIs vencendo, metas sem registro há X dias, adesão da família.
6. **Assinatura digital** do documento e armazenamento das versões assinadas.
7. **Testes ponta a ponta no navegador** (Playwright) rodando no CI com `supabase start`.
8. **Domínio próprio** via Load Balancer HTTPS no Terraform.
9. **Agendamento de consultoria** (Cal.com) e cobrança dos planos.
10. **OpenAPI** gerada a partir dos esquemas zod (`z.toJSONSchema`).
