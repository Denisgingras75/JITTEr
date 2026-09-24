// Stand-in for https://deno.land/std@0.168.0/http/server.ts: records the
// handler instead of listening, so the tests can call it with real Requests.
// deno-lint-ignore no-explicit-any
export function serve(handler: (req: Request) => Response | Promise<Response>, _opts?: any) {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  (g.__handlers ??= []).push(handler);
}
