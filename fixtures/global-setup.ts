import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CONTAINER_LABEL } from "./server.js";

const run = promisify(execFile);

/**
 * Remove containers left behind by an interrupted run. A killed runner never
 * reaches fixture teardown, and the server image runs until it is stopped, so
 * its `--rm` never fires. Pruning here also covers a hard kill, which no
 * in-process signal handler can catch.
 */
export default async function globalSetup(): Promise<void> {
  const { stdout } = await run("docker", [
    "ps",
    "-aq",
    "--filter",
    `label=${CONTAINER_LABEL}`,
  ]).catch(() => ({ stdout: "" }));
  const ids = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (ids.length === 0) return;
  console.log(`[global-setup] removing ${ids.length} orphaned container(s) from a previous run`);
  await run("docker", ["rm", "-f", ...ids]).catch(() => {});
}
