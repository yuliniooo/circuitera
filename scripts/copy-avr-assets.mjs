import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(projectRoot, "node_modules", "@horang-corp", "avr-gcc-wasm");
const destination = path.join(projectRoot, "dist", "avr");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(path.join(packageRoot, "tools"), path.join(destination, "tools"), { recursive: true });
await cp(path.join(projectRoot, "public/avr/curated"), path.join(destination, "curated"), { recursive: true });
await cp(path.join(projectRoot, "vendor/libraries"), path.join(destination, "sources/libraries"), { recursive: true });
await cp(path.join(projectRoot, "vendor/arduino-core/cores/arduino"), path.join(destination, "sources/arduino-core"), { recursive: true });
await cp(path.join(projectRoot, "vendor/arduino-core/variants/standard"), path.join(destination, "sources/uno-variant"), { recursive: true });
await cp(path.join(projectRoot, "vendor/arduino-core/variants/eightanaloginputs"), path.join(destination, "sources/nano-variant"), { recursive: true });
await cp(path.join(projectRoot, "vendor/arduino-core/boards.txt"), path.join(destination, "sources/boards.txt"));
await cp(path.join(projectRoot, "vendor/sources.lock.json"), path.join(destination, "sources/sources.lock.json"));
await cp(
  path.join(packageRoot, "THIRD_PARTY_NOTICES.md"),
  path.join(destination, "THIRD_PARTY_NOTICES.md"),
);

console.log("Copied AVR-GCC WASM, Uno core, and pinned library sources into dist/avr.");

await cp(path.join(projectRoot, 'vendor/atmega328pb'), path.join(destination, 'sources/atmega328pb'), {recursive:true});
