# Controle de NF-e e boletos

App instalável (PWA) para lançar notas fiscais e boletos vinculados, acompanhar vencimentos e receber avisos de pagamento.

- **Site:** GitHub Pages (estático, gratuito)
- **Dados e login:** Supabase (Postgres + Auth), com acesso liberado só para os e-mails cadastrados em `membros`
- **Instalação:** pelo navegador, no celular ou no PC; abre sem internet mostrando a última cópia dos dados

## Estrutura

| Arquivo | Para que serve |
|---|---|
| `index.html`, `styles.css`, `app.js` | O app |
| `config.js` | Endereço e chave pública (anon) do Supabase |
| `manifest.webmanifest`, `sw.js`, `icons/` | Instalação como app e funcionamento offline |
| `supabase/schema.sql` | Tabelas, regras de acesso e tempo real |

## No ar

- App: https://ellevenmkt.github.io/controle-nfe/
- Supabase: projeto `controle-nfe` (sa-east-1)

## Configuração (já feita)

1. **Supabase:** crie um projeto e rode `supabase/schema.sql` no SQL Editor.
2. **Liberar acesso:** a primeira conta criada no app é liberada automaticamente. As próximas precisam ser adicionadas em `membros` (veja abaixo).
3. **Auth → URL Configuration:** em *Site URL* e *Redirect URLs*, coloque o endereço do GitHub Pages (ex.: `https://usuario.github.io/controle-nfe/`).
4. **config.js:** preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` (Project Settings → API).
5. **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / raiz.

## Instalar

- **Android / Chrome no PC:** botão **Instalar app** no topo, ou menu ⋮ → *Instalar app*.
- **iPhone:** abra no Safari → Compartilhar → *Adicionar à Tela de Início*. (Notificações no iPhone só funcionam com o app instalado.)

## Liberar mais pessoas

A pessoa cria a conta no app e você adiciona o e-mail dela:

```sql
insert into public.membros(email) values ('colega@empresa.com');
```

Para remover: `delete from public.membros where email = 'colega@empresa.com';`

## Atualizar o app

Depois de mudar os arquivos, aumente a versão em `sw.js` (`const CACHE = 'nfe-v2'`) para que os aparelhos baixem a versão nova.
