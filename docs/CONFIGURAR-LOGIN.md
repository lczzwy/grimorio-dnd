# Configurar o login: senha por e-mail e Discord

Passo a passo para a Fase 3. São quatro partes, todas feitas uma vez só, no navegador. O site já está pronto para elas.

> **Nunca cole o Client Secret do Discord no chat, no código ou no GitHub.** Ele vai só no painel do Supabase.

---

## Parte 1 · Endereços do site no Supabase (obrigatório)

Sem isto, o link de "esqueci minha senha" e o retorno do Discord caem num endereço errado.

1. Abra o [painel do Supabase](https://supabase.com/dashboard) e entre no projeto do Grimório.
2. Menu lateral: **Authentication** → **URL Configuration**.
3. Em **Site URL**, coloque:
   ```
   https://lczzwy.github.io/grimorio-dnd/
   ```
4. Em **Redirect URLs**, clique em **Add URL** e adicione cada um destes:
   ```
   https://lczzwy.github.io/grimorio-dnd/
   http://localhost:5175/
   http://localhost:5177/
   ```
   Os dois de `localhost` servem só para testes no computador.
5. Clique em **Save**.

---

## Parte 2 · "Esqueci minha senha" por e-mail

O site já envia o e-mail de redefinição; o Supabase cuida do envio.

**Limite importante do e-mail padrão do Supabase:**
- ele **só manda e-mail para quem faz parte da equipe do projeto** no Supabase (o seu e-mail funciona, o dos seus amigos não);
- e manda **poucos e-mails por hora**.

Para os amigos receberem o link, é preciso um serviço de e-mail próprio (SMTP). O **Resend** é grátis até 3.000 e-mails por mês:
1. Crie uma conta em [resend.com](https://resend.com) e gere uma **API Key**.
2. No Resend, use o remetente de teste `onboarding@resend.dev`. Para mandar de um endereço próprio, é preciso ter um domínio, que pode ficar para depois.
3. No Supabase: **Authentication** → **Emails** → **SMTP Settings** → ligue **Enable Custom SMTP** e preencha:
   - **Host:** `smtp.resend.com` · **Port:** `465`
   - **Username:** `resend` · **Password:** a API Key do Resend
   - **Sender email:** `onboarding@resend.dev` · **Sender name:** `Grimório`
4. Clique em **Save**.

Enquanto isso não for feito, o login com Discord (parte 3) resolve a recuperação para os amigos: quem entra pelo Discord não precisa de senha.

(Opcional) Para traduzir o e-mail: **Authentication** → **Emails** → **Templates** → **Reset Password**. Troque o assunto para `Grimório: criar uma senha nova` e o texto do link para `Criar senha nova`, mantendo o `{{ .ConfirmationURL }}`.

---

## Parte 3 · Criar o app no Discord Developer Portal

1. Abra [discord.com/developers/applications](https://discord.com/developers/applications) e entre com a sua conta do Discord.
2. Clique em **New Application**, dê o nome `Grimório`, aceite os termos e clique em **Create**.
3. (Opcional) Em **General Information**, coloque um ícone e uma descrição. É isso que os amigos veem na tela "Autorizar".
4. Menu lateral: **OAuth2**.
5. Em **Redirects**, clique em **Add Redirect** e cole exatamente:
   ```
   https://lnvrptqcjcmvsmeprkfk.supabase.co/auth/v1/callback
   ```
   Clique em **Save Changes**.
6. Ainda em **OAuth2**:
   - copie o **Client ID**;
   - clique em **Reset Secret**, confirme e copie o **Client Secret**. Ele só aparece uma vez; se perder, é só gerar outro.

---

## Parte 4 · Ligar o Discord no Supabase

1. No Supabase: **Authentication** → **Sign In / Providers** (em versões antigas do painel: **Providers**).
2. Encontre **Discord** e ative **Enable Sign in with Discord**.
3. Cole o **Client ID** e o **Client Secret** do passo anterior.
4. Confira que o **Callback URL** mostrado ali é `https://lnvrptqcjcmvsmeprkfk.supabase.co/auth/v1/callback`, o mesmo que você colou no Discord.
5. Clique em **Save**.
6. Na mesma tela de configurações de login, ligue **Allow manual linking**. Isso permite que quem já tem conta por e-mail conecte o Discord à **mesma** conta, pela página **Sua conta** → **Conectar meu Discord a esta conta**.

---

## Como fica para os jogadores

- **Quem é novo:** na tela de entrar, clica em **Entrar com Discord**, autoriza e volta para o site já conectado, com o nome de exibição do Discord como nome da mesa (dá para trocar em **Sua conta**).
- **Quem já tem conta por e-mail:** entra por e-mail **uma vez** e, em **Sua conta**, clica em **Conectar meu Discord a esta conta**. Depois disso, os dois jeitos abrem a mesma conta, com as mesmas fichas.

> Atenção: se alguém que já tem conta por e-mail clicar direto em "Entrar com Discord" sem conectar antes, o Supabase cria **uma conta nova e vazia**, separada da antiga. Peça para o grupo conectar primeiro.

- **Quem entrou pelo Discord e quer senha também:** em **Sua conta** → **Segurança** → **Criar uma senha**.
