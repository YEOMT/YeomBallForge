import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import WebSocket from 'ws';

export class TestPeer {
  static async connect(url) {
    const peer = new TestPeer();
    peer.ws = new WebSocket(url);
    peer.ws.on('message', raw => peer.receive(raw));
    await once(peer.ws, 'open');
    return peer;
  }
  constructor() {
    this.pending = new Map();
    this.bytes = 0; this.frames = 0; this.maxArenas = 0;
  }
  receive(raw) {
    this.bytes += raw.length;
    const msg = JSON.parse(raw);
    if (msg.type === 'state') this.state = msg;
    if (msg.type === 'battle') {
      this.frames++;
      this.lastFrame = msg.battle;
      this.maxArenas = Math.max(this.maxArenas, msg.battle.arenas.length);
    }
    if (msg.type === 'ack') {
      const entry = this.pending.get(msg.commandId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(msg.commandId);
        if (msg.ok) entry.resolve(msg.data);
        else entry.reject(new Error(msg.error));
      }
    }
  }
  send(type, fields = {}, commandId = randomUUID()) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(commandId); reject(new Error('ack timeout: ' + type)); }, 3500);
      this.pending.set(commandId, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ runId: this.state?.room.runId, ...fields, type, commandId }));
    });
  }
  async until(check, limit = 3000) {
    const end = performance.now() + limit;
    while (!check(this)) {
      if (performance.now() >= end) throw Error('state timeout');
      await new Promise(resolve => setTimeout(resolve, 8));
    }
  }
  disconnect() { this.ws.terminate(); }
}
