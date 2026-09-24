// Runs the real attest and verify functions locally against a PGlite database
// with the repo migrations applied, on http://127.0.0.1:54321/functions/v1/*.
// Useful for manual testing without a Supabase project:
//   npm run dev:functions
// Set JITTER_SERVER_KEY_JWK (see supabase/scripts/gen-server-key.mjs) to get
// countersigned attestations. GET /__sql?q=... runs a query (dev only).
// deno-lint-ignore-file no-explicit-any
import { makeDb } from './db.mjs';

const g = globalThis as any;
g.__SERVICE_KEY = 'service-role-key-for-local-dev';
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', g.__SERVICE_KEY);
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-for-local-dev');
g.__pg = await makeDb({ log: (m: string) => console.log('[migrate]', m) });
await import('../functions/attest/index.ts');
await import('../functions/verify/index.ts');
const [attestH, verifyH] = g.__handlers;

const port = Number(Deno.env.get('PORT') || 54321);
Deno.serve({ hostname: '127.0.0.1', port, onListen: () => console.log(`functions listening on http://127.0.0.1:${port}/functions/v1/{attest,verify}`) }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/__sql') {
    const r = await g.__pg.query(url.searchParams.get('q') || 'select 1');
    return Response.json(r.rows);
  }
  const fn = url.pathname === '/functions/v1/attest' ? attestH : url.pathname === '/functions/v1/verify' ? verifyH : null;
  if (!fn) return new Response('not found', { status: 404 });
  try { return await fn(req); }
  catch (e) { console.error(e); return new Response('Internal Server Error', { status: 500 }); }
});
