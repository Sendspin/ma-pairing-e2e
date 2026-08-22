import { SendspinCore } from "@sendspin/sendspin-js";

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SpeakerStorage = Map<string, string>;

/**
 * The Speaker: a headless Sendspin client played by the harness process.
 * Connects unpaired (allowing unpaired access, like a factory-fresh device),
 * advertises dynamic-PIN pairing, and surfaces the PIN the server
 * negotiates with it.
 *
 * Pass the same storage map to a second instance to reconnect as the same
 * device (identity and long-term PSK live in storage).
 */
export class Speaker {
  readonly storage: SpeakerStorage;
  readonly pairingEvents: string[] = [];

  private core: SendspinCore;
  private readonly baseUrl: string;
  private readonly name: string;
  private pinWaiters: Array<(pin: string) => void> = [];
  private lastPin: string | null = null;
  private finalizedResolve!: () => void;
  readonly finalized: Promise<void>;

  constructor(sendspinBaseUrl: string, name: string, storage?: SpeakerStorage) {
    this.baseUrl = sendspinBaseUrl;
    this.name = name;
    this.storage = storage ?? new Map();
    this.finalized = new Promise((resolve) => {
      this.finalizedResolve = resolve;
    });
    this.core = this.buildCore();
  }

  async connect(): Promise<void> {
    await this.core.connect();
  }

  disconnect(): void {
    this.core.disconnect();
  }

  /** Drop the connection and reconnect as the same device. */
  async reconnect(): Promise<void> {
    this.core.disconnect();
    this.core = this.buildCore();
    await this.core.connect();
  }

  get clientId(): string {
    return this.core.clientId;
  }

  get pairingPsk(): string | null {
    return this.core.pairingPsk;
  }

  waitForPin(timeoutMs = 30_000): Promise<string> {
    if (this.lastPin) return Promise.resolve(this.lastPin);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("speaker never received a pairing PIN")),
        timeoutMs,
      );
      this.pinWaiters.push((pin) => {
        clearTimeout(timer);
        resolve(pin);
      });
    });
  }

  private buildCore(): SendspinCore {
    const storageAdapter: StorageAdapter = {
      getItem: (key: string) => this.storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        this.storage.set(key, value);
      },
    };
    return new SendspinCore({
      baseUrl: this.baseUrl,
      clientName: this.name,
      productName: "ma-e2e-test",
      codecs: ["pcm"],
      unpairedAccess: true,
      storage: storageAdapter,
      onPairing: (event: string) => {
        this.pairingEvents.push(event);
        if (event === "finalized") this.finalizedResolve();
      },
      onPairingPin: (pin: string | null) => {
        if (!pin) return;
        this.lastPin = pin;
        for (const waiter of this.pinWaiters.splice(0)) waiter(pin);
      },
    });
  }
}
