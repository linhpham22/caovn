// caovn-api: family sync store for Thực Đơn Cao Lớn.
// Data model: per family code, a flat key/value map with server timestamps (last write wins per key).
const ORIGINS = ['https://caovn.linhizi.com', 'http://caovn.linhizi.com', 'https://linhpham22.github.io', 'null'];
const CODE_RE = /^[A-Z2-9]{16}$/;
const KEY_RE = /^[A-Za-z0-9_\/.\-]{1,100}$/;
const MAX_OPS = 500, MAX_VAL = 300, MAX_ROWS = 20000;

function cors(req) {
  const o = req.headers.get('Origin');
  const allow = !o || ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return {
    'Access-Control-Allow-Origin': allow ? (o || '*') : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (req, body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(req) } });

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS kv (fam TEXT NOT NULL, k TEXT NOT NULL, v TEXT, t INTEGER NOT NULL, PRIMARY KEY (fam, k))').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS kv_fam_t ON kv (fam, t)').run();
  schemaReady = true;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return json(req, { ok: true, now: Date.now() });
    const m = url.pathname.match(/^\/f\/([A-Za-z0-9]+)$/);
    if (!m || !CODE_RE.test(m[1])) return json(req, { error: 'not_found' }, 404);
    const fam = m[1];
    await ensureSchema(env);

    if (req.method === 'GET') {
      const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
      const { results } = await env.DB.prepare('SELECT k, v, t FROM kv WHERE fam = ? AND t > ? ORDER BY t LIMIT 20000').bind(fam, since).all();
      return json(req, { rows: results.map(r => [r.k, r.v == null ? null : JSON.parse(r.v), r.t]), now: Date.now() });
    }

    if (req.method === 'POST') {
      const len = parseInt(req.headers.get('content-length') || '0', 10);
      if (len > 200000) return json(req, { error: 'too_large' }, 413);
      let body;
      try { body = await req.json(); } catch { return json(req, { error: 'bad_json' }, 400); }
      const ops = Array.isArray(body && body.ops) ? body.ops : null;
      if (!ops || !ops.length || ops.length > MAX_OPS) return json(req, { error: 'bad_ops' }, 400);
      for (const op of ops) {
        if (!Array.isArray(op) || op.length !== 2 || typeof op[0] !== 'string' || !KEY_RE.test(op[0])) return json(req, { error: 'bad_key' }, 400);
        const v = JSON.stringify(op[1] === undefined ? null : op[1]);
        if (v.length > MAX_VAL) return json(req, { error: 'value_too_long' }, 400);
      }
      const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM kv WHERE fam = ?').bind(fam).first();
      if (cnt && cnt.n + ops.length > MAX_ROWS) return json(req, { error: 'family_full' }, 429);
      const t = Date.now();
      const stmt = env.DB.prepare('INSERT INTO kv (fam, k, v, t) VALUES (?, ?, ?, ?) ON CONFLICT (fam, k) DO UPDATE SET v = excluded.v, t = excluded.t');
      await env.DB.batch(ops.map(([k, v]) => stmt.bind(fam, k, JSON.stringify(v === undefined ? null : v), t)));
      return json(req, { ok: true, t });
    }
    return json(req, { error: 'method' }, 405);
  },
};
