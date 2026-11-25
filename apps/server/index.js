import http from 'node:http';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { checkEnvelope, ensure, MAX_PAYLOAD, PROTOCOL_VERSION } from '../../packages/protocol/index.js';
import { Room } from './room.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.txt': 'text/plain', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const hash = value => createHash('sha256').update(value).digest();
const clock = () => Date.now();
const MAX_BUFFER = 256 * 1024;
const STALE_BUFFER = 1024 * 1024;
const contentPaths = new Set(['/packages/content/classes.js', '/packages/content/economy.js', '/packages/content/balls.js', '/packages/content/forge.js', '/packages/protocol/index.js',
  '/packages/sim/index.js', '/packages/sim/arena.js', '/packages/sim/random.js']);
function localJoinOrigin(req, listener) {
  if (!req.headers.origin || !listener || typeof listener === 'string') return;
  const origin = new URL(req.headers.origin);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.protocol !== 'http:') return;
  if (!['::', '0.0.0.0'].includes(listener.address) || origin.host !== req.headers.host) return;
  const adapters = Object.entries(networkInterfaces()).sort(([a],[b]) =>
    Number(/virtual|hyper-v|vethernet|vmware|docker|wsl|vpn/i.test(a)) - Number(/virtual|hyper-v|vethernet|vmware|docker|wsl|vpn/i.test(b)));
  for (const [,addresses] of adapters) for (const a of addresses || []) {
    if (a.internal || a.family !== 'IPv4' || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
    origin.hostname = a.address;
    return origin.origin;
  }
}

function output(ws, packet, frame = false) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > STALE_BUFFER) return ws.close(1013, 'slow connection');
  if (frame && ws.bufferedAmount > MAX_BUFFER) return;
  ws.send(typeof packet === 'string' ? packet : JSON.stringify(packet));
}

// Rolling windows are allocated at connection time; the IP table is expired by the heartbeat.
function take(table, key, now, max, duration) {
  let item = table.get(key);
  if (!item || now >= item.end) {
    item = { count: 0, end: now + duration };
    table.set(key, item);
  }
  return ++item.count <= max;
}
export function createGameServer(options = {}) {
  const prod = options.production ?? process.env.NODE_ENV === 'production';
  const password = options.password ?? process.env.TEACHER_PASSWORD ?? (prod ? '' : 'forge');
  const configured = options.origins ?? process.env.ALLOWED_ORIGINS ?? '';
  const allowed = new Set((Array.isArray(configured) ? configured : configured.split(',')).map(s => s.trim()).filter(Boolean));
  ensure(password && (!prod || (password !== 'forge' && password.length >= 12)), '운영용 TEACHER_PASSWORD를 12자 이상으로 설정하세요.');
  ensure(!prod || allowed.size > 0, '운영용 ALLOWED_ORIGINS를 설정하세요.');
  for (const origin of allowed) ensure(new URL(origin).origin === origin && (!prod || origin.startsWith('https://')), 'ALLOWED_ORIGINS에 정확한 웹 주소를 입력하세요.');
  const passHash = hash(password);
  const rooms = new Map(), dirty = new Set(), authLimits = new Map(), connectLimits = new Map(), qrLimits = new Map();
  function originOK(req) {
    const origin = req.headers.origin;
    if (!origin) return !prod;
    if (allowed.has(origin)) return true;
    if (prod || allowed.size) return false;
    try { const u = new URL(origin); return ['http:', 'https:'].includes(u.protocol) && u.host === req.headers.host; }
    catch { return false; }
  }
  const server = http.createServer(async (req, res) => {
    const fail = (status = 404) => { res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); };
    try {
      if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
      const u = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(u.pathname);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (pathname === '/health' || pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION }));
      }
      if (pathname === '/api/qr') {
        if (!take(qrLimits, req.socket.remoteAddress, clock(), 120, 60_000)) return fail(429);
        const value = u.searchParams.get('url') || u.searchParams.get('text');
        if (!value || value.length > 2048 || !/^https?:\/\//i.test(value)) return fail(400);
        const png = await QRCode.toBuffer(value, { width: 256, margin: 3, errorCorrectionLevel: 'M' });
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=60' });
        return res.end(req.method === 'HEAD' ? undefined : png);
      }
      let filename;
      if (contentPaths.has(pathname)) filename = path.join(root, pathname);
      else {
        const relative = pathname.replace(/^\/+/, '') || 'index.html';
        if (relative.split(/[\\/]/).some(part => part.startsWith('.') || part.includes(':')) || relative.includes('\0')) return fail();
        filename = path.resolve(root, 'public', relative);
        if (!filename.startsWith(path.join(root, 'public') + path.sep)) return fail();
      }
      const info = await stat(filename);
      if (!info.isFile()) return fail();
      const ext = path.extname(filename).toLowerCase();
      res.writeHead(200, { 'Content-Type': (mime[ext] ?? 'application/octet-stream') +
        (['.html', '.js', '.css', '.txt', '.json', '.mjs'].includes(ext) ? '; charset=utf-8' : ''),
        'Content-Length': info.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      createReadStream(filename).on('error', () => res.destroy()).pipe(res);
    } catch { if (!res.headersSent) fail(); else res.destroy(); }
  });
  // Repeated fighter fields compress well on classroom Wi-Fi. No persistent zlib
  // history per pupil; cap concurrent compression and only compress large packets.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: {
    serverNoContextTakeover: true, clientNoContextTakeover: true,
    serverMaxWindowBits: 12, concurrencyLimit: 4, threshold: 1024,
    zlibDeflateOptions: { level: 1, memLevel: 5 },
  } });
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/ws' || !originOK(req) || wss.clients.size >= 1600 ||
      !take(connectLimits, req.socket.remoteAddress, clock(), 240, 60_000)) {
      return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  function drop(room, reason) {
    rooms.delete(room.code);
    dirty.delete(room);
    room.closed = true;
    for (const user of room.members()) {
      user.socket?.close(4002, reason);
      user.socket = null;
      user.seen.clear();
    }
    room.competition = null;
  }
  wss.on('connection', (ws, req) => {
    let room, user;
    const limits = new Map();
    ws.alive = true;
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => { ws.alive = true; });
    const idle = setTimeout(() => { if (!user) ws.close(1008, 'authentication timeout'); }, 90_000).unref();
    function attach(r, p) {
      const old = p.socket;
      room = r; user = p; p.epoch++; p.socket = ws; room.emptySince = null;
      clearTimeout(idle);
      if (old && old !== ws) old.close(4001, 'session replaced');
      return { code: r.code, role: p.role, playerId: p.id, token: p.token, connectionEpoch: p.epoch,
        joinOrigin: p.role === 'teacher' && !prod ? localJoinOrigin(req, server.address()) : undefined };
    }
    ws.on('message', (raw, binary) => {
      let msg;
      const now = clock();
      try {
        if (!take(limits, 'messages', now, 160, 10_000)) return ws.close(1008, 'rate limit');
        ensure(!binary, 'JSON 문자 메시지만 사용할 수 있습니다.');
        msg = JSON.parse(raw.toString());
        checkEnvelope(msg);
        let data;
        if (!user) {
          if (msg.type === 'create') {
            ensure(take(authLimits, req.socket.remoteAddress, now, 20, 5 * 60_000), '방 생성 시도가 많습니다. 잠시 후 다시 시도하세요.');
            ensure(typeof msg.password === 'string' && msg.password.length <= 1024 && timingSafeEqual(hash(msg.password), passHash), '교사 비밀번호를 확인하세요.');
            ensure(rooms.size < 100, '현재 방이 모두 사용 중입니다.');
            let code;
            do { code = String(randomInt(1_000_000)).padStart(6, '0'); } while (rooms.has(code));
            const created = new Room(code, now);
            rooms.set(code, created);
            data = attach(created, created.teacher);
          } else {
            ensure(msg.type === 'join' || msg.type === 'resume', '먼저 방에 참가하세요.');
            const r = rooms.get(msg.code);
            ensure(r && !r.closed, '방을 찾을 수 없습니다. 코드가 다르거나 서버 재시작·만료로 종료되었습니다.');
            if (msg.type === 'join') data = attach(r, r.add(msg.name));
            else {
              const p = typeof msg.token === 'string' && r.members().find(p => p.token === msg.token);
              ensure(p, '재접속 정보가 만료되었습니다. 방 코드를 다시 입력하세요.');
              data = attach(r, p);
            }
          }
        } else {
          ensure(user.socket === ws, '다른 창에서 연결이 복원되었습니다.');
          const advanced = room.tick(now);
          if (advanced) dirty.add(room);
          ensure(!(advanced && ['advance', 'pause'].includes(msg.type)), '단계가 변경되었습니다. 현재 단계를 확인하세요.');
          if (msg.phase !== undefined) ensure(msg.phase === room.phase, '단계가 변경되었습니다.');
          data = room.dispatch(user, msg, now);
        }
        output(ws, { type: 'ack', commandId: msg.commandId, ok: true, data });
        if (room.closed) return drop(room, 'room closed');
        if (msg.type === 'bankPreview') return;
        if (msg.type === 'watch') {
          output(ws, { type: 'battle', battle: room.frame(user) }, true);
          return;
        }
        output(ws, room.state(user, now));
        if (room.phase === 'BATTLE' && msg.type === 'resume') output(ws, { type: 'battle', battle: room.frame(user) }, true);
        dirty.add(room);
      } catch (err) {
        output(ws, { type: 'ack', commandId: typeof msg?.commandId === 'string' ? msg.commandId.slice(0, 96) : null, ok: false,
          error: err instanceof SyntaxError ? '올바른 JSON 요청이 아닙니다.' : err.message });
      }
    });
    ws.on('close', () => {
      clearTimeout(idle);
      if (user?.socket !== ws) return;
      user.socket = null;
      if (!room.closed) {
        dirty.add(room);
        if (!room.members().some(p => p.socket)) room.emptySince = clock();
      }
    });
  });
  let nextSnapshot = 0, nextSummary = 0;
  const runner = setInterval(() => {
    const now = clock(), frameDue = now >= nextSnapshot;
    // Only consume a summary deadline on an iteration that will send packets.
    // Otherwise a 1-second deadline falling between 80ms frames is silently lost.
    const summaryDue = frameDue && now >= nextSummary;
    if (frameDue) nextSnapshot = now + 80;
    if (summaryDue) nextSummary = now + 1000;
    for (const room of rooms.values()) {
      if (now - room.createdAt > 12 * 3600_000 || (room.emptySince !== null && now - room.emptySince > 15 * 60_000)) {
        drop(room, 'room expired');
        continue;
      }
      if (room.tick(now)) dirty.add(room);
      if (!frameDue) continue;
      const stateDue = dirty.delete(room) || (summaryDue && room.phase === 'BATTLE');
      const cache = new Map();
      for (const p of room.members()) {
        if (!p.socket) continue;
        if (stateDue) output(p.socket, room.state(p, now));
        if (room.phase === 'BATTLE' && (!room.paused || stateDue)) {
          const privateRumble = room.isPrivateRumble(p);
          if (privateRumble && !stateDue) continue;
          // A personal summary must never share another student's cached packet.
          const focus = privateRumble ? 'personal:' + p.id : room.focus(p);
          if (!cache.has(focus)) cache.set(focus, JSON.stringify({ type: 'battle', battle: room.frame(p) }));
          output(p.socket, cache.get(focus), true);
        }
      }
    }
  }, 1000 / 60).unref();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
    const now = clock();
    for (const map of [authLimits, connectLimits, qrLimits]) for (const [k, item] of map) if (now >= item.end) map.delete(k);
  }, 30_000).unref();
  async function close() {
    clearInterval(runner); clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    rooms.clear(); dirty.clear(); wss.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
  return { server, wss, rooms, close };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const app = createGameServer();
  const args = process.argv.slice(2);
  const option = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const port = Number(option('--port') ?? process.env.PORT ?? 3000), host = option('--host') ?? process.env.HOST ?? '0.0.0.0';
  ensure(Number.isInteger(port) && port >= 1 && port <= 65535, '서버 포트는 1~65535 사이 정수여야 합니다.');
  app.server.listen(port, host, () => console.log('DS Ball Forge · http://' + host + ':' + app.server.address().port));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close());
}
