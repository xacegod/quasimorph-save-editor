/**
 * Run all wiki/data maintenance scrapers + builds in order.
 * Usage: node scripts/scrape-all.mjs [--skip-icons] [--skip-pacts]
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const args = new Set(process.argv.slice(2));

const steps = [
  { name: "scrape:pacts", cmd: ["node", "scripts/scrape-wiki-pacts.mjs"], skip: args.has("--skip-pacts") },
  { name: "build:pacts", cmd: ["node", "scripts/build-pact-library.mjs"], skip: args.has("--skip-pacts") },
  { name: "scrape:classes", cmd: ["node", "scripts/scrape-merc-classes.mjs"] },
  { name: "scrape:tech", cmd: ["node", "scripts/scrape-tech-tree.mjs"] },
  { name: "scrape:icons", cmd: ["node", "scripts/scrape-wiki-icons.mjs"], skip: args.has("--skip-icons") },
  { name: "build:perk-meta", cmd: ["node", "scripts/build-perk-meta.mjs"] },
  { name: "build:equip-projects", cmd: ["node", "scripts/build-equip-project-library.mjs"] },
];

function run(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd.join(" ")} exited ${code}`));
    });
  });
}

async function main() {
  console.log("=== scrape:all ===\n");
  for (const step of steps) {
    if (step.skip) {
      console.log(`— skip ${step.name}`);
      continue;
    }
    console.log(`\n>>> ${step.name}`);
    await run(step.cmd);
  }
  console.log("\n=== scrape:all done ===");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
