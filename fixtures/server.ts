import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const DEFAULT_IMAGE = "ghcr.io/music-assistant/server:beta";
const WEB_PORT = 8095;
const SENDSPIN_PORT = 8927;

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
    const { stdout } = await run("docker", [
      "run",
      "-d",
      "--rm",
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

  private async waitForReady(timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.baseUrl}/info`);
        if (res.ok) {
          const info = (await res.json()) as { status?: string };
          if (info.status === "running") return;
        }
      } catch {
        // server not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const logs = await this.logs();
    await this.stop();
    throw new Error(`server not ready within ${timeoutMs}ms. Container logs:\n${logs.slice(-4000)}`);
  }
}
