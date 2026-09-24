// A PGlite database that looks like a fresh hosted Supabase project (API
// roles, default grants, an auth schema stub) with the repo migrations applied.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(HERE, '..', 'migrations');

export const SUPABASE_PRELUDE = `
  CREATE ROLE anon NOLOGIN NOINHERIT;
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  -- Supabase grants every new public table/sequence/function to the API roles;
  -- RLS policies and explicit REVOKEs are all that stand between the anon key and the data.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
`;

export function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort().map(f => path.join(MIGRATIONS_DIR, f));
}

export async function makeDb({ log = () => {} } = {}) {
  const db = new PGlite({
    parsers: {
      1700: v => Number(v), // numeric -> JSON number (PostgREST behaviour)
      20: v => Number(v),   // int8 -> number
    },
  });
  await db.exec(SUPABASE_PRELUDE);
  for (const f of migrationFiles()) {
    await db.exec(fs.readFileSync(f, 'utf8'));
    log(`applied ${path.basename(f)}`);
  }
  return db;
}
