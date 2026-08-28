// Build a server image with a local server checkout and frontend build baked
// in, so unreleased changes can be recorded with the same isolation (and the
// same absent network discovery) as a released image.
//
//   node scripts/build-preview-image.mjs --server <checkout> --frontend <checkout>
//
// Then run against it:  MA_IMAGE=ma-pairing-e2e:preview pnpm record
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const serverDir = arg("server");
const frontendDir = arg("frontend");
const base = arg("base", "ghcr.io/music-assistant/server:nightly");
const tag = arg("tag", "ma-pairing-e2e:preview");
if (!serverDir) {
  console.error("--server <path to server checkout> is required");
  process.exit(1);
}

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { stdio: "inherit", ...opts });

// Where the base image keeps its packages, so the overlay lands on top of them.
const sitePackages = execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "--entrypoint",
    "python",
    base,
    "-c",
    "import music_assistant, os; print(os.path.dirname(os.path.dirname(music_assistant.__file__)))",
  ],
  { encoding: "utf8" },
).trim();
console.log(`base ${base}\nsite-packages ${sitePackages}`);

const staging = mkdtempSync(join(tmpdir(), "ma-preview-"));
try {
  console.log("staging server source");
  cpSync(join(serverDir, "music_assistant"), join(staging, "server_src"), { recursive: true });

  const dockerfile = [`FROM ${base}`, `RUN rm -rf ${sitePackages}/music_assistant`];
  const copies = [`COPY server_src ${sitePackages}/music_assistant`];

  if (frontendDir) {
    console.log("building frontend (this takes a minute)");
    const dist = join(staging, "frontend_dist");
    run("pnpm", ["exec", "vite", "build", "--outDir", dist, "--emptyOutDir"], { cwd: frontendDir });
    dockerfile.push(`RUN rm -rf ${sitePackages}/music_assistant_frontend`);
    copies.push(`COPY frontend_dist ${sitePackages}/music_assistant_frontend`);
  }

  writeFileSync(join(staging, "Dockerfile"), [...dockerfile, ...copies].join("\n") + "\n");
  console.log(`building ${tag}`);
  run("docker", ["build", "-t", tag, staging]);
  console.log(`\ndone. Run it with:\n  MA_IMAGE=${tag} pnpm record`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
