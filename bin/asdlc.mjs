#!/usr/bin/env node
import { run } from "../dist/cli.mjs";

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  console.error(`ASDLC failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
