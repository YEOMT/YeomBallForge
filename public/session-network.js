const STORAGE_KEY = "ds-ball-forge-session-v1";
const terminalMessages = {
  4001: "다른 창에서 이 참가 정보로 접속했습니다.",
  4002: "수업 방이 닫혔거나 만료되었습니다.",
  4003: "교사가 이 방에서 참가를 종료했습니다.",
};

export function getSavedSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return value?.token && value.code ? value : null;
  } catch { return null; }
}

function remember(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* A live connection also works with storage disabled. */ }
}

function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function socketAddress(address) {
  const url = new URL(address || "/ws", location.href);
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";
  return url;
}

export class GameConnection {
  constructor(url, handlers) {
    this.url = socketAddress(url);
    this.handlers = handlers;
    this.requests = new Map();
    this.closed = false;
    this.ready = false;
    this.runId = null;
    this.retries = 0;
  }

  request(type, fields = {}, handshake = false) {
    if (this.ws?.readyState !== WebSocket.OPEN || (!handshake && !this.ready)) {
      return Promise.reject(new Error("서버에 다시 연결한 뒤 시도해 주세요."));
    }
    const commandId = requestId();
    const payload = { ...fields, type, commandId };
    if (!handshake) payload.runId = this.runId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(commandId);
        reject(new Error("응답이 늦어지고 있습니다. 현재 상태를 확인해 주세요."));
      }, 15000);
      this.requests.set(commandId, { resolve, reject, timer, payload, handshake });
      try { this.ws.send(JSON.stringify(payload)); }
      catch { this.reject(commandId, "연결을 확인해 주세요."); }
    });
  }

  reject(id, message) {
    const entry = this.requests.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.requests.delete(id);
    entry.reject(new Error(message));
  }

  async open(args, reconnect = false) {
    const saved = getSavedSession() || this.identity;
    if (args.mode === "resume" && !saved) throw new Error("복원할 참가 정보가 없습니다.");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    let authenticated = false;
    try {
      await new Promise((resolve, reject) => {
        const fail = () => reject(new Error("게임 서버에 연결하지 못했습니다. 서버 주소와 네트워크를 확인해 주세요."));
        const timer = setTimeout(() => { ws.close(); fail(); }, 9000);
        ws.onopen = () => { clearTimeout(timer); resolve(); };
        ws.onerror = ws.onclose = () => { clearTimeout(timer); fail(); };
      });
      if (this.closed) throw new Error("접속을 취소했습니다.");
      ws.onmessage = event => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type === "ack") {
          const entry = this.requests.get(msg.commandId);
          if (!entry) return;
          clearTimeout(entry.timer);
          this.requests.delete(msg.commandId);
          if (msg.ok) entry.resolve(msg.data || {});
          else {
            if (entry.handshake && args.mode === "resume") {
              remember(null);
              this.identity = null;
            }
            entry.reject(new Error(typeof msg.error === "string" ? msg.error : "요청을 처리할 수 없습니다."));
          }
        } else {
          if (msg.type === "state") this.runId = msg.room.runId;
          this.handlers.message(msg);
        }
      };
      ws.onclose = event => {
        if (this.closed || this.ws !== ws) return;
        this.ready = false;
        for (const [id, entry] of this.requests) {
          if (entry.handshake) this.reject(id, "서버 연결이 종료되었습니다.");
        }
        if (terminalMessages[event.code]) {
          this.end(true);
          this.handlers.terminal(terminalMessages[event.code]);
        } else if (authenticated) this.retry();
      };
      const fields = args.mode === "create" ? { password: args.password || "" }
        : args.mode === "join" ? { code: String(args.code).trim(), name: String(args.name).trim() }
        : { code: saved.code, token: saved.token };
      const data = await this.request(args.mode, fields, true);
      authenticated = true;
      this.ready = true;
      this.retries = 0;
      this.identity = { ...saved, ...data, name: args.name || (args.mode === "resume" ? saved?.name : "") };
      remember(this.identity);
      if (reconnect) {
        this.handlers.status("");
        for (const entry of this.requests.values()) {
          if (!entry.handshake) ws.send(JSON.stringify(entry.payload));
        }
      }
      return this.identity;
    } catch (error) {
      ws.close();
      throw error;
    }
  }

  retry() {
    if (this.closed) return;
    this.handlers.status("연결을 복원하고 있습니다. 전투는 서버에서 계속 진행됩니다.");
    const delay = Math.min(8000, 500 * 2 ** this.retries++);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(async () => {
      try { await this.open({ mode: "resume" }, true); }
      catch (error) {
        if (this.closed) return;
        if (this.identity) this.retry();
        else {
          this.end(true);
          this.handlers.terminal(error.message);
        }
      }
    }, delay);
  }

  end(clearIdentity) {
    this.closed = true;
    this.ready = false;
    clearTimeout(this.retryTimer);
    for (const id of this.requests.keys()) this.reject(id, "연결이 종료되었습니다.");
    this.ws?.close();
    if (clearIdentity) remember(null);
  }
}
