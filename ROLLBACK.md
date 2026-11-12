# Voltar à versão anterior ao redesign

Versão marcada: tag `pre-redesign` (commit `2b38a2b`, no ar em 12/11/2026).
Backups do banco: pasta `C:\Users\Arthur\projetorpg\backups` (fora do repositório).

## 1. Código (o site), em uns 2 minutos

**Mais rápido:** no GitHub, abra *Actions*, encontre a publicação do commit
"Mesa: a ficha abre num resumo de combate…" e clique em **Re-run all jobs**.
O site volta a essa versão em cerca de 1 minuto. (Vale até o próximo push na main.)

**Definitivo** (desfaz os commits sem apagar o histórico), no PowerShell:

```powershell
cd C:\Users\Arthur\projetorpg\app
git checkout main
git pull
git revert --no-commit pre-redesign..HEAD
git commit -m "Volta para a versão pre-redesign"
git push origin main
```

A publicação automática põe o site antigo no ar em 1 a 2 minutos.

## 2. Dados (o banco), só se for preciso

A migração da ficha só **acrescenta** campos novos e não muda nem apaga os antigos;
a versão antiga do site ignora o que não conhece. Por isso voltar o código costuma bastar.
Para devolver o banco inteiro ao estado de um backup:

1. No Supabase, abra **Connect** → *Session pooler* e copie o endereço (`postgresql://…`),
   trocando `[YOUR-PASSWORD]` pela senha do banco.
2. No PowerShell (o endereço fica só no seu terminal):

```powershell
cd C:\Users\Arthur\projetorpg\app
$env:DATABASE_URL = "postgresql://..."
node scripts/db-restore.mjs ..\backups\grimorio-backup-AAAA-MM-DDTHH-MM-SS.json          # só mostra o que tem no arquivo
node scripts/db-restore.mjs ..\backups\grimorio-backup-AAAA-MM-DDTHH-MM-SS.json --sim    # restaura de verdade
```

Tudo acontece numa transação: se algo falhar, nada muda.
Não inclui as imagens (retratos, mapas), que o redesign não mexe, nem as contas de login.

**Atenção:** cada aparelho guarda uma cópia da ficha. Depois de restaurar, peça para os jogadores
recarregarem a página; se alguém editou a ficha enquanto o banco estava sendo restaurado,
essa edição pode voltar por cima.

## Backup novo

```powershell
cd C:\Users\Arthur\projetorpg\app
$env:DATABASE_URL = "postgresql://..."
node scripts/db-backup.mjs
```
