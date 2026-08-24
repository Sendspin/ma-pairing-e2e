interface ApiMessage {
  message_id?: string;
  result?: unknown;
  error_code?: string;
}

/**
 * Minimal WS API client for harness-side (non-browser) checks.
 */
export class WsApi {
  private ws!: WebSocket;
  private msgId = 0;
  private pending = new Map<string, (msg: ApiMessage) => void>();

  static async connect(baseUrl: string, token: string): Promise<WsApi> {
    const api = new WsApi();
    api.ws = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/ws`);
    api.ws.onmessage = (ev: MessageEvent) => {
      const msg = JSON.parse(String(ev.data)) as ApiMessage;
      if (msg.message_id && api.pending.has(msg.message_id)) {
        api.pending.get(msg.message_id)!(msg);
        api.pending.delete(msg.message_id);
      }
    };
    await new Promise((resolve, reject) => {
      api.ws.onopen = resolve;
      api.ws.onerror = reject;
    });
    await api.command("auth", { token });
    return api;
  }

  command(command: string, args: Record<string, unknown>): Promise<ApiMessage> {
    return new Promise((resolve) => {
      const message_id = String(++this.msgId);
      this.pending.set(message_id, resolve);
      this.ws.send(JSON.stringify({ message_id, command, args }));
    });
  }

  close(): void {
    this.ws.close();
  }
}

export interface PlayerSnapshot {
  name?: string;
  display_name?: string;
  available?: boolean;
  needs_setup?: boolean;
}

/**
 * Wait until a player with the given name is registered on the server and
 * satisfies the optional predicate, then return its state. Unpaired Sendspin
 * clients are protocol players, so those are included.
 */
export async function waitForPlayerRegistered(
  baseUrl: string,
  token: string,
  name: string,
  predicate?: (player: PlayerSnapshot) => boolean,
  timeoutMs = 60_000,
): Promise<PlayerSnapshot> {
  const api = await WsApi.connect(baseUrl, token);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await api.command("players/all", {
        return_protocol_players: true,
        return_unavailable: true,
      });
      const players = (res.result ?? []) as PlayerSnapshot[];
      const player = players.find((p) => (p.name ?? p.display_name) === name);
      if (player && (!predicate || predicate(player))) return player;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`player "${name}" not in expected state within ${timeoutMs}ms`);
  } finally {
    api.close();
  }
}
