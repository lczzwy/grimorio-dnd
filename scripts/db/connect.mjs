import pg from 'pg';

/** Opens the database from DATABASE_URL, with a plain message for the usual mistakes. */
export async function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Falta a variável DATABASE_URL (endereço de conexão do Supabase, Session pooler).'); process.exit(1); }
  if (/\[|YOUR-PASSWORD/i.test(url)) { console.error('O endereço ainda tem [YOUR-PASSWORD] ou colchetes: troque pela senha do banco, sem os colchetes.'); process.exit(1); }
  const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await db.connect();
  } catch (e) {
    const code = e?.code;
    if (code === '28P01') console.error('Senha recusada. Confira a senha do banco (não a da conta do Supabase). Se ela tiver símbolos como @ # / : ? %, crie uma só com letras e números em Project Settings > Database.');
    else if (code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ENETUNREACH') console.error('Não consegui chegar ao servidor. Use o endereço do "Session pooler" (termina em pooler.supabase.com:5432).');
    else console.error('Não consegui conectar:', e?.message || e);
    process.exit(1);
  }
  return db;
}
