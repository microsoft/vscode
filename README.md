# FITVEST — Preview local (rápido)

Este repositório é uma prévia estática de uma única página: `index.html` (pt-BR).
Use este projeto para visualizar rapidamente o site localmente ou preparar pequenas edições.

## Como visualizar localmente

1) Abrir diretamente no navegador (Windows PowerShell):

```powershell
Set-Location -Path 'C:\Users\Usuario\OneDrive\Desktop\FITVEST'
Start-Process 'index.html'
```

2) Usando Python (se estiver disponível):

```powershell
Set-Location -Path 'C:\Users\Usuario\OneDrive\Desktop\FITVEST'
python -m http.server 8000
# então abra http://localhost:8000/
```

3) Alternativa PowerShell (sem Python) — script incluído `serve.ps1`:

```powershell
Set-Location -Path 'C:\Users\Usuario\OneDrive\Desktop\FITVEST'
.\serve.ps1        # porta padrão 8000
.\serve.ps1 -Port 8080
# abra http://localhost:8000/ ou a porta escolhida
```

Dica: a extensão "Live Server" do VS Code também funciona bem para edição/preview rápidos.

## Convenções rápidas

- Idioma: conteúdo em Português do Brasil (`pt-BR`). Mantenha consistência nas traduções.
- Acessibilidade: preserve ou melhore atributos ARIA já existentes (ex.: `aria-label` no link principal).
- Estilo: atualmente o CSS está embutido em `index.html`. Se extrair, prefira `assets/css/style.css` e mantenha a aparência.
- Não altere o link de produção: `https://www.fitvestmoda.com.br` — não substitua ou redirecione sem uma issue/PR explícita.

## Commits e PRs

- Mantenha commits pequenos e focados. Exemplo de mensagem:

```
fix(html): ajustar texto de link e aria-label
```

- Em PRs, inclua uma captura de tela ou uma breve nota explicando as mudanças visuais no `index.html`.

## Quando expandir o projeto

Antes de introduzir frameworks (React, Vite, etc.) abra uma issue propondo a mudança e aguarde aprovação de um revisor humano — este repositório é intencionalmente minimalista.

## Mais documentação

Veja também: `.github/copilot-instructions.md` — instruções para agentes/colaboradores (bilíngue).


Se quiser, posso também criar pequenos exemplos: extrair o CSS para `assets/css/style.css` e atualizar `index.html`, ou adicionar um `serve` npm/script se preferir Node.js. Escolha o próximo passo.

## Rodando o projeto Next.js localmente (opcional)

Se você quiser experimentar a versão mínima do Next.js incluída aqui:

```powershell
# instalar dependências (uma vez)
npm install

# rodar em desenvolvimento
npm run dev
```

Isto cria um app Next minimal que inclui o `src/app/page.tsx` e stubs de componentes. Use esta versão só se você pretende transformar o repositório em um app React/Next.

## Firebase (inicialização cliente)

O repositório inclui um inicializador cliente mínimo em `src/firebase/index.tsx` que usa variáveis de ambiente públicas do Next (`NEXT_PUBLIC_FIREBASE_*`).

Variáveis esperadas (exemplo):

- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID

NUNCA comite chaves privadas ou credenciais sensíveis no repositório. Use o sistema de variáveis do seu provedor/CI para armazenar segredos.


## DNS (informações de deploy)

Servidores de nome usados pelo deploy/registro do domínio:

- Servidor DNS Primário: `ns1.locaweb.com.br`
- Servidor DNS Secundário: `ns2.locaweb.com.br`
- Servidor DNS Terciário: `ns3.locaweb.com.br`

Inclua estas entradas apenas em alterações aprovadas pelo time de infraestrutura ou pelo responsável do domínio.

## Privacidade e Telemetria

Este repositório inclui integração opcional com Google Analytics (gtag) e Google Tag Manager (GTM).
- Por padrão os snippets estão desativados em `assets/js/analytics.js` (variável `ENABLE_ANALYTICS = false`).
- Só habilite o rastreamento em deploys de produção com aprovação explícita da equipe responsável e garantindo conformidade com LGPD/GDPR.
- Se ativar, atualize a documentação do deploy e garanta aviso/consentimento aos usuários conforme as políticas aplicáveis.

### Como ativar/desativar (procedimento controlado)

Há um utilitário PowerShell para alternar a flag de telemetria em `assets/js/analytics.js`.

```powershell
# Ativar analytics (APENAS em deploy de produção e com aprovação)
.\scripts\enable_analytics.ps1 -Enable $true

# Desativar analytics
.\scripts\enable_analytics.ps1 -Enable $false
```

O script cria um backup do arquivo `analytics.js` antes da alteração. Use este utilitário somente em pipelines de release aprovados.

## Checklist de deploy (rápido)

Antes de publicar alterações na zona DNS ou apontar o domínio, siga estes passos mínimos:

- Verifique os registros atuais: A/AAAA/CNAME/MX/TXT usando `dig` ou `nslookup`.
- Reduza temporariamente o TTL (ex.: 300s) algumas horas antes da mudança para acelerar rollback.
- Atualize apenas os registros aprovados (A/AAAA para o host, CNAMEs conforme necessário).
- Confirme que os nameservers (`ns1/2/3.locaweb.com.br`) estão corretos na interface do registrador.
- Verifique certificação TLS/SSL: gere/renove certificados (Let's Encrypt/ACME ou provedor) e valide o HTTPS.
- Após aplicar, monitore a propagação (dig/nslookup apontando para diferentes resolvers, e ferramentas online de propagação).
- Teste o site em HTTP/HTTPS, em múltiplos dispositivos/rede, e verifique cabeçalhos e redirecionamentos.
- Se algo der errado, use o TTL reduzido para reverter rapidamente aos valores anteriores e notifique o time.

Notas: Este é um checklist mínimo. Para alterações maiores (subdomínios, uso de CDN, failover), siga o runbook de infraestrutura do time.