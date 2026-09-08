import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { ZodError } from 'zod';
import { Store, atomicWrite } from '../core/store.js';
import { Fault } from '../core/model.js';

const json = (res: ServerResponse, code: number, value: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
function equal(a: string, b: string) { const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) throw new Fault(413, 'Update exceeds 128 KiB'); chunks.push(Buffer.from(chunk)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Fault(400, 'Invalid JSON'); }
}
export async function startServer(options: { dataDir: string; webDir: string; port: number; serveWeb?: boolean; onEvent?: (event: any) => void }) {
  const dataDir = resolve(options.dataDir); await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = join(dataDir, 'server.lock');
  try { await writeFile(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Fault(409, 'Invalid server.lock; inspect it before removal');
    try { process.kill(pid, 0); throw new Fault(409, 'Data directory already owned by a running process'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
    await unlink(lockPath); await writeFile(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
  }
  const store = new Store(join(dataDir, 'sessions')); await store.init();
  // This app capability persists across restarts so open browsers can reconnect.
  // It is unrelated to any CLI/model credential.
  let token: string;
  try {
    const authPath = join(dataDir, 'access.key');
    try { token = await readFile(authPath, 'utf8'); if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid access key'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; token = randomBytes(32).toString('hex'); await writeFile(authPath, token, { flag: 'wx', mode: 0o600 }); }
  } catch (e) { await unlink(lockPath); throw e; }
  const clients = new Set<ServerResponse>(); let origin = '';
  function broadcast(value: unknown) {
    options.onEvent?.(value);
    for (const res of clients) {
      if (res.writableLength > 256 * 1024) { res.destroy(); clients.delete(res); }
      else res.write(`data: ${JSON.stringify(value)}\n\n`);
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    let sessionId: string | undefined;
    try {
      if (req.headers.host !== new URL(origin).host) throw new Fault(403, 'Invalid Host');
      if (req.headers.origin && req.headers.origin !== origin) throw new Fault(403, 'Origin denied');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new Fault(403, 'Cross-site request denied');
      const url = new URL(req.url || '/', origin);
      const bearer = req.headers.authorization?.replace(/^Bearer /, '') || '';
      const cookiePrefix = `brainpane_${new URL(origin).port}=`;
      const cookie = req.headers.cookie?.split('; ').find(c => c.startsWith(cookiePrefix))?.slice(cookiePrefix.length) || '';
      if (url.pathname === '/api/auth' && req.method === 'POST') {
        if (!equal(bearer, token)) throw new Fault(401, 'Open the access URL printed by brainpane start');
        res.setHeader('Set-Cookie', `${cookiePrefix}${token}; HttpOnly; SameSite=Strict; Path=/`);
        return json(res, 200, { ok: true });
      }
      if (url.pathname.startsWith('/api/')) {
        const bearerOk = equal(bearer, token);
        if (!bearerOk && !equal(cookie, token)) throw new Fault(401, 'Open the access URL printed by brainpane start');
        if (req.method !== 'GET' && !bearerOk && req.headers.origin !== origin) throw new Fault(403, 'Same-origin write required');
        if (req.method !== 'GET' && req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Fault(415, 'Use application/json');
        if (url.pathname === '/api/events' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.write('retry: 1500\nevent: ready\ndata: {}\n\n'); clients.add(res);
          req.on('close', () => clients.delete(res)); return;
        }
        if (url.pathname === '/api/sessions') {
          if (req.method === 'GET') return json(res, 200, await store.list());
          if (req.method === 'POST') { const s = await store.create(await body(req)); broadcast({ type: 'state', session: s }); return json(res, 201, s); }
        }
        const match = /^\/api\/sessions\/([a-zA-Z0-9_-]+)(?:\/(publish|edit|active))?$/.exec(url.pathname);
        if (match) {
          sessionId = match[1];
          if (req.method === 'GET' && !match[2]) return json(res, 200, await store.get(sessionId));
          if (req.method === 'POST' && match[2]) {
            const s = await store.mutate(sessionId, match[2] as 'publish' | 'edit' | 'active', await body(req));
            broadcast({ type: 'state', session: s }); return json(res, 200, s);
          }
        }
        throw new Fault(404, 'Unknown API route');
      }
      if (req.method !== 'GET') throw new Fault(405, 'Method not allowed');
      if (options.serveWeb === false) throw new Fault(404, 'Terminal mode: no web UI');
      // Only built frontend assets; there is deliberately no local-file/source API.
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (relative !== 'index.html' && !/^assets\/[a-zA-Z0-9_.-]+$/.test(relative)) throw new Fault(404, 'Not found');
      const content = await readFile(join(options.webDir, relative)).catch(() => { throw new Fault(404, 'Frontend missing; run npm run build'); });
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(relative)] || 'application/octet-stream');
      res.end(content);
    } catch (error) {
      const code = error instanceof Fault ? error.status : error instanceof ZodError ? 422 : 500;
      // No submitted text, repository paths, tokens or raw validation values in errors/logs.
      const message = error instanceof Fault ? error.message : error instanceof ZodError ? 'Schema validation failed; check patch fields and limits' : 'Storage/server failure; last saved state retained';
      if (sessionId && req.method === 'POST') broadcast({ type: 'error', sessionId, message, at: new Date().toISOString() });
      if (!res.headersSent) json(res, code, { error: message }); else res.end();
    }
  });
  server.requestTimeout = 10000;
  try {
    await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(options.port, '127.0.0.1', () => ok()); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
    origin = `http://127.0.0.1:${address.port}`;
    await atomicWrite(join(dataDir, 'runtime.json'), JSON.stringify({ origin, token, pid: process.pid }));
  } catch (e) { server.close(); await unlink(lockPath); throw e; }
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': heartbeat\n\n'); }, 15000);
  async function close() {
    clearInterval(heartbeat); for (const res of clients) res.end(); clients.clear();
    await new Promise<void>((ok) => { server.close(() => ok()); server.closeAllConnections(); });
    await unlink(join(dataDir, 'runtime.json')).catch(() => {}); await unlink(lockPath).catch(() => {});
  }
  return { origin, token, store, close };
}
