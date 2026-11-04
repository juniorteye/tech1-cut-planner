// Applies any new files in supabase/migrations to the live project.
// Run with: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const folder = "supabase/migrations";

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is missing from .env.local");
  process.exit(1);
}

async function run(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json();
}

await run(`
  create table if not exists private.applied_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
`);

const applied = new Set((await run("select name from private.applied_migrations")).map((row) => row.name));
const pending = readdirSync(folder).filter((file) => file.endsWith(".sql") && !applied.has(file)).sort();

for (const file of pending) {
  const name = file.replaceAll("'", "''");
  await run(`begin;\n${readFileSync(`${folder}/${file}`, "utf8")}\ninsert into private.applied_migrations (name) values ('${name}');\ncommit;`);
  console.log(`Applied ${file}`);
}

console.log(pending.length === 0 ? "Database is up to date." : `${pending.length} applied.`);
