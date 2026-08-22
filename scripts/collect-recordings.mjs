// Copy the video of each recorded spec from test-results/ into recordings/,
// named after the spec directory Playwright created for it.
import { cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const resultsDir = "test-results";
const outDir = "recordings";
mkdirSync(outDir, { recursive: true });

let copied = 0;
for (const entry of readdirSync(resultsDir)) {
  const dir = join(resultsDir, entry);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".webm")) continue;
    const target = join(outDir, `${entry}.webm`);
    cpSync(join(dir, file), target);
    console.log(`recordings/${entry}.webm`);
    copied++;
  }
}
if (copied === 0) {
  console.error("no videos found in test-results/ (did the run use RECORD=1?)");
  process.exitCode = 1;
}
