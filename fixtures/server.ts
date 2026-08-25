import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const DEFAULT_IMAGE = "ghcr.io/music-assistant/server:beta";
const WEB_PORT = 8095;
const SENDSPIN_PORT = 8927;

/** Marks containers as ours, so orphans of an interrupted run are findable. */
export const CONTAINER_LABEL = "ma-e2e-test=1";

/** What a spec needs from the server it runs against, however it is started. */
export interface ServerUnderTest {
  readonly baseUrl: string;
  readonly sendspinBaseUrl: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  logs(): Promise<string>;
}

/** Poll until the server reports itself fully started, not merely reachable. */
export async function waitForServerReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/info`);
      if (res.ok) {
        const info = (await res.json()) as { status?: string };
        if (info.status === "running") return;
      }
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server not ready within ${timeoutMs}ms`);
}

/**
 * Shared across containers: the server downloads a beat-detection model on
 * first boot and only finishes starting once it lands, which takes minutes on
 * a slow day. Persisting it keeps later boots at a few seconds.
 */
const MODEL_CACHE_VOLUME = "ma-e2e-test-model-cache";

/**
 * One fresh Music Assistant server per spec, running as the official Docker
 * image with ephemeral state and randomized host ports.
 */
export class MaServer {
  private containerId = "";
  webPort = 0;
  sendspinPort = 0;

  get baseUrl(): string {
    return `http://127.0.0.1:${this.webPort}`;
  }

  /** Base URL the headless Sendspin speaker connects to. */
  get sendspinBaseUrl(): string {
    return `http://127.0.0.1:${this.sendspinPort}`;
  }

  async start(): Promise<void> {
    const image = process.env.MA_IMAGE ?? DEFAULT_IMAGE;
    await run("docker", ["volume", "create", MODEL_CACHE_VOLUME]);
    const { stdout } = await run("docker", [
      "run",
      "-d",
      "--rm",
      "--label",
      CONTAINER_LABEL,
      "-v",
      `${MODEL_CACHE_VOLUME}:/root/.cache/torch`,
      "-p",
      `127.0.0.1::${WEB_PORT}`,
      "-p",
      `127.0.0.1::${SENDSPIN_PORT}`,
      image,
    ]);
    this.containerId = stdout.trim();
    this.webPort = await this.mappedPort(WEB_PORT);
    this.sendspinPort = await this.mappedPort(SENDSPIN_PORT);
    await this.waitForReady();
  }

  async stop(): Promise<void> {
    if (!this.containerId) return;
    await run("docker", ["stop", "-t", "3", this.containerId]).catch(() => {});
    this.containerId = "";
  }

  async logs(): Promise<string> {
    if (!this.containerId) return "";
    const { stdout, stderr } = await run("docker", ["logs", this.containerId]).catch(
      () => ({ stdout: "", stderr: "" }),
    );
    return stdout + stderr;
  }

  private async mappedPort(containerPort: number): Promise<number> {
    const { stdout } = await run("docker", ["port", this.containerId, String(containerPort)]);
    const match = stdout.match(/:(\d+)\s*$/m);
    if (!match) throw new Error(`no host mapping for container port ${containerPort}: ${stdout}`);
    return Number(match[1]);
  }

  // Generous, because a cold model cache adds minutes to the first boot.
  private async waitForReady(timeoutMs = 300_000): Promise<void> {
    try {
      await waitForServerReady(this.baseUrl, timeoutMs);
    } catch (err) {
      const logs = await this.logs();
      await this.stop();
      throw new Error(`${(err as Error).message}. Container logs:\n${logs.slice(-4000)}`);
    }
  }
}
