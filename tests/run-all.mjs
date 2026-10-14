// ==========================================================================
// TEST RUNNER — Runs all *.test.js files in /tests using plain node
// ==========================================================================

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const testFiles = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

console.log("================================================================");
console.log(`  RUNNING ALL AUTOMATED TESTS (${testFiles.length} test suites)`);
console.log("================================================================\n");

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  console.log(`\n▶ Running: tests/${file}`);
  console.log("----------------------------------------------------------------");

  const result = spawnSync(process.execPath, [filePath], {
    stdio: "inherit",
    cwd: rootDir
  });

  if (result.status === 0) {
    passed++;
  } else {
    failed++;
    console.error(`\n❌ FAILED: tests/${file} exited with status ${result.status}`);
  }
}

console.log("\n================================================================");
console.log(`  OVERALL TEST SUITE SUMMARY: ${passed}/${testFiles.length} SUITES PASSED (${failed} FAILED)`);
console.log("================================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
