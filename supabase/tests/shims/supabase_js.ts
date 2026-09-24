// Stand-in for https://esm.sh/@supabase/supabase-js@2 that runs against a
// PGlite database (globalThis.__pg). Every call runs in its own transaction
// with `SET LOCAL ROLE <role>`, the way PostgREST executes each request; the
// role comes from the key passed to createClient. Row shaping follows
// PostgREST: PGRST116 for .single() on 0 or >1 rows, timestamps as ISO
// strings, set-returning RPCs as arrays.
// deno-lint-ignore-file no-explicit-any

type Res = { data: any; error: any; status?: number };

function roleForKey(key: string): string {
  const g = globalThis as any;
  if (key && key === g.__SERVICE_KEY) return 'service_role';
  return 'anon';
}

function normalizeRow(r: any) {
  const o: any = {};
  for (const [k, v] of Object.entries(r)) o[k] = v instanceof Date ? v.toISOString() : v;
  return o;
}

async function run(role: string, sql: string, params: any[] = []) {
  const pg = (globalThis as any).__pg;
  return await pg.transaction(async (tx: any) => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return await tx.query(sql, params);
  });
}

const ident = (s: string) => '"' + String(s).replace(/"/g, '""') + '"';
const param = (v: any) => (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;

class Builder implements PromiseLike<Res> {
  private op: 'select' | 'insert' | 'upsert' | null = null;
  private cols = '*';
  private filters: [string, any][] = [];
  private isSingle = false;
  private body: any = null;
  private onConflict: string | null = null;
  constructor(private table: string, private role: string) {}

  select(cols = '*') { if (!this.op) this.op = 'select'; this.cols = cols; return this; }
  eq(col: string, val: any) { this.filters.push([col, val]); return this; }
  single() { this.isSingle = true; return this; }
  insert(body: any) { this.op = 'insert'; this.body = body; return this; }
  upsert(body: any, opts?: { onConflict?: string }) {
    this.op = 'upsert'; this.body = body; this.onConflict = opts?.onConflict ?? null; return this;
  }

  private async exec(): Promise<Res> {
    try {
      if (this.op === 'select') {
        const cols = this.cols.split(',').map(c => ident(c.trim())).join(', ');
        const where = this.filters.map(([c], i) => `${ident(c)} = $${i + 1}`).join(' AND ');
        const sql = `SELECT ${cols} FROM ${ident(this.table)}${where ? ' WHERE ' + where : ''}`;
        const r = await run(this.role, sql, this.filters.map(([, v]) => v == null ? v : String(v)));
        const rows = r.rows.map(normalizeRow);
        if (this.isSingle) {
          if (rows.length !== 1) {
            return { data: null, status: 406, error: { code: 'PGRST116',
              message: 'JSON object requested, multiple (or no) rows returned',
              details: `The result contains ${rows.length} rows` } };
          }
          return { data: rows[0], error: null, status: 200 };
        }
        return { data: rows, error: null, status: 200 };
      }
      if (this.op === 'insert' || this.op === 'upsert') {
        const payload = JSON.parse(JSON.stringify(this.body)); // PostgREST drops undefined
        const keys = Object.keys(payload);
        const cols = keys.map(ident).join(', ');
        let sql = `INSERT INTO ${ident(this.table)} (${cols}) SELECT ${cols} FROM json_populate_record(NULL::${ident(this.table)}, $1::json)`;
        if (this.op === 'upsert') {
          const target = this.onConflict ?? 'id';
          sql += ` ON CONFLICT (${ident(target)}) DO UPDATE SET ` + keys.map(k => `${ident(k)} = EXCLUDED.${ident(k)}`).join(', ');
        }
        await run(this.role, sql, [JSON.stringify(payload)]);
        return { data: null, error: null, status: 201 };
      }
      return { data: null, error: { message: 'unsupported op in shim' } };
    } catch (e: any) {
      return { data: null, error: { code: e?.code ?? 'PGERR', message: e?.message ?? String(e) }, status: 400 };
    }
  }

  then<T1 = Res, T2 = never>(ok?: ((v: Res) => T1 | PromiseLike<T1>) | null,
                             bad?: ((r: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return this.exec().then(ok, bad);
  }
}

export function createClient(_url: string, key: string) {
  const role = roleForKey(key);
  return {
    from: (table: string) => new Builder(table, role),
    // PostgREST: POST /rpc/<fn> with named arguments; set-returning functions come back as arrays.
    rpc: async (fn: string, args: Record<string, any> = {}): Promise<Res> => {
      try {
        const keys = Object.keys(args);
        const named = keys.map((k, i) => `${ident(k)} := $${i + 1}`).join(', ');
        const r = await run(role, `SELECT * FROM ${ident(fn)}(${named})`, keys.map(k => param(args[k])));
        return { data: r.rows.map(normalizeRow), error: null, status: 200 };
      } catch (e: any) {
        return { data: null, error: { code: e?.code ?? 'PGERR', message: e?.message ?? String(e) }, status: 400 };
      }
    },
  };
}
