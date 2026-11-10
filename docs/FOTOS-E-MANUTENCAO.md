# Fotos no Storage, keep-alive e registro de erros

Passo a passo da Fase 5. Quase tudo é feito pelo `schema.sql`. Aqui ficam só as conferências e o que precisa de um clique no painel.

---

## 1 · Fotos no Supabase Storage

O `schema.sql` **cria sozinho** o balde `portraits` e as regras de acesso:
- **leitura pública:** a foto aparece para todos, pelo endereço dela;
- **escrita restrita:** cada pessoa só envia, troca ou apaga fotos dentro da própria pasta;
- **limites:** até 1 MB por foto, só JPEG, PNG ou WebP.

### Conferir (1 minuto)
1. Supabase → **Storage**. O balde **portraits** deve aparecer com a etiqueta **Public**.
2. Clique nele → **Policies** (ou **Storage → Policies**). Devem aparecer quatro regras: `portraits_select`, `portraits_insert`, `portraits_update` e `portraits_delete`.

### Se o SQL der erro na parte do Storage
Algumas versões do painel não deixam criar regras do Storage pelo SQL Editor (erro do tipo `must be owner of table objects`). Nesse caso, faça à mão:
1. **Storage** → **New bucket** → nome `portraits` → ligue **Public bucket** → em **Additional configuration**:
   - **File size limit:** `1 MB`;
   - **Allowed MIME types:** `image/jpeg, image/png, image/webp`.

   Clique em **Save**.
2. **Storage** → **Policies** → no balde `portraits`, clique em **New policy** → **For full customization** e crie **quatro** regras (uma para cada operação: SELECT, INSERT, UPDATE e DELETE), todas com:
   - **Target roles:** `authenticated`
   - **Policy definition:**
     ```
     bucket_id = 'portraits' and (storage.foldername(name))[1] = auth.uid()::text
     ```
3. Rode o `schema.sql` de novo. Agora o resto passa sem erro.

### O que acontece com as fotos antigas
- Quando alguém entra na conta, as fotos que estavam **dentro das fichas** sobem para o Storage sozinhas, e a ficha fica guardando só o endereço. Ela fica bem mais leve no tempo real.
- O mesmo vale para as criaturas do bestiário, quando o mestre abre a aba **Bestiário**.
- Fichas usadas **sem conta** continuam com a foto dentro, porque não há onde guardar fora do aparelho.
- Fotos trocadas viram arquivos órfãos no balde (não são apagadas). Ocupam pouco; dá para limpar depois.

---

## 2 · Keep-alive (o Supabase não pausar)

O arquivo `.github/workflows/keepalive.yml` faz uma consulta leve ao banco **toda segunda e quinta**.

### Ligar e testar
1. No GitHub do projeto → aba **Actions**.
2. Na lista da esquerda, clique em **Manter o Supabase acordado**.
3. Clique em **Run workflow** → **Run workflow**. Em ~20 segundos ele deve ficar verde ✅, com `resposta: true` no log.

### Atenção
- O GitHub **desliga workflows agendados depois de 60 dias sem nenhum commit** no repositório. Se ficar 2 meses sem mexer no site, abra **Actions → Manter o Supabase acordado → Enable workflow**.
- Se o ping falhar, o GitHub manda um e-mail para você.
- Se mesmo assim o Supabase pausar, o site mostra uma faixa: "O servidor da mesa não está respondendo…". Para reativar: painel do Supabase → o projeto → **Restore project**.

---

## 3 · Registro de erros

Quando alguma tela quebra para alguém, o erro vai para a tabela `client_errors`, sem precisar que a pessoa mande print.

### Ver os erros
- Supabase → **Table Editor** → `client_errors`. Cada linha tem a mensagem, onde aconteceu (`url`), o navegador (`agent`) e quem estava logado (`user_id`).
- Ninguém consegue ler essa tabela pelo site, só pelo painel.
- Ela guarda só os 1000 erros mais recentes.
- Erros de rede e de extensões do navegador são ignorados.

---

## 4 · Chat

Nada para configurar:
- **Histórico:** o banco guarda só as **500 mensagens mais novas** de cada campanha. As rolagens já eram limitadas a 200.
- **Ritmo:** cada pessoa pode mandar no máximo **5 mensagens a cada 3 segundos**. Acima disso, o site mostra "muitas mensagens seguidas, espere uns segundos".
