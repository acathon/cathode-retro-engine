/**
 * Multiplayer, over the one transport a browser gives you for free.
 *
 * The engine's `netcode` module holds the portable half of netplay — a fixed
 * clock, deterministic lockstep, snapshot interpolation — but deliberately
 * opens no sockets: the browser wants WebRTC or a WebSocket, native wants
 * UDP, and neither belongs in a portable core.
 *
 * This file supplies the missing half with `BroadcastChannel`, which carries
 * messages between tabs of the same browser. That is a real transport with a
 * real limit: it reaches other tabs on this machine and nothing else. The
 * message shapes below are the whole protocol, so swapping in a WebSocket
 * means replacing `post` and `onmessage` and nothing above them.
 *
 * With no peers the session reports `solo` and the game fills the round with
 * bots instead.
 */

export type PeerRole = 'host' | 'guest';

export type Team = 'attack' | 'defend';

export interface PeerState {
  id: number;
  name: string;
  team: Team;
  x: number;
  y: number;
  angle: number;
  health: number;
  alive: boolean;
}

type Message =
  | { kind: 'hello'; from: number; name: string }
  | { kind: 'state'; from: number; state: PeerState }
  | { kind: 'shot'; from: number; x: number; y: number; hit: number | null }
  | { kind: 'bye'; from: number };

const CHANNEL = 'cathode-dust-protocol';
const PEER_TIMEOUT = 4;      // seconds of silence before a peer is dropped
const HELLO_INTERVAL = 1;    // seconds between presence announcements

/**
 * A lobby plus a state feed. Peers announce themselves, the lowest id acts as
 * host, and everyone broadcasts their own body every tick.
 *
 * This is state sharing, not lockstep: each tab simulates its own player
 * authoritatively and trusts the others for theirs. Lockstep would give one
 * deterministic world, but it stalls every player when one is slow, which is
 * the wrong trade for a shooter — it is the right one for something like a
 * turn-based or puzzle game, which is why the engine ships both.
 */
export class NetSession {
  private channel: BroadcastChannel | null = null;
  private lastSeen = new Map<number, number>();
  private helloIn = 0;
  private clock = 0;

  readonly id: number;
  peers = new Map<number, PeerState>();
  onShot: ((from: number, x: number, y: number) => void) | null = null;
  onHit: (() => void) | null = null;

  constructor(readonly name: string) {
    // Ids must not collide between tabs opened at the same moment.
    this.id = (Date.now() % 100000) * 10 + Math.floor(Math.random() * 10);
  }

  /** True when this browser has BroadcastChannel. */
  static get supported(): boolean {
    return typeof BroadcastChannel !== 'undefined';
  }

  connect(): boolean {
    if (!NetSession.supported) return false;
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (ev: MessageEvent<Message>) => this.receive(ev.data);
    this.post({ kind: 'hello', from: this.id, name: this.name });
    return true;
  }

  disconnect(): void {
    if (!this.channel) return;
    this.post({ kind: 'bye', from: this.id });
    this.channel.close();
    this.channel = null;
    this.peers.clear();
    this.lastSeen.clear();
  }

  get connected(): boolean {
    return this.channel !== null;
  }

  get livePeers(): PeerState[] {
    return [...this.peers.values()];
  }

  /** True when nobody else is in the channel. */
  get solo(): boolean {
    return this.peers.size === 0;
  }

  /** The lowest id present decides shared facts, such as which team you join. */
  get role(): PeerRole {
    for (const id of this.lastSeen.keys()) {
      if (id < this.id) return 'guest';
    }
    return 'host';
  }

  private post(msg: Message): void {
    this.channel?.postMessage(msg);
  }

  private receive(msg: Message): void {
    if (msg.from === this.id) return;
    const known = this.lastSeen.has(msg.from);
    this.lastSeen.set(msg.from, this.clock);

    switch (msg.kind) {
      case 'hello':
        // Answer a stranger so they learn about us at once instead of waiting
        // out a full announcement interval.
        if (!known) this.post({ kind: 'hello', from: this.id, name: this.name });
        break;
      case 'state':
        this.peers.set(msg.from, msg.state);
        break;
      case 'shot':
        this.onShot?.(msg.from, msg.x, msg.y);
        if (msg.hit === this.id) this.onHit?.();
        break;
      case 'bye':
        this.peers.delete(msg.from);
        this.lastSeen.delete(msg.from);
        break;
    }
  }

  /** Broadcast our own body, and drop peers that have gone quiet. */
  update(dt: number, self: PeerState): void {
    this.clock += dt;
    if (!this.channel) return;

    this.helloIn -= dt;
    if (this.helloIn <= 0) {
      this.helloIn = HELLO_INTERVAL;
      this.post({ kind: 'hello', from: this.id, name: this.name });
    }

    this.post({ kind: 'state', from: this.id, state: self });

    for (const [id, seen] of this.lastSeen) {
      if (this.clock - seen > PEER_TIMEOUT) {
        this.lastSeen.delete(id);
        this.peers.delete(id);
      }
    }
  }

  reportShot(x: number, y: number, hit: number | null): void {
    this.post({ kind: 'shot', from: this.id, x, y, hit });
  }
}
