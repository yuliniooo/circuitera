import { assetsBase } from './wasm-harness.mjs';
import { compileUno } from '../src/compiler-engine.js';
import { examples } from '../src/examples.js';
const name = process.argv[2] || 'Blink';
const result = await compileUno(examples[name], { assetsBase, onProgress: console.log });
console.log(result.output);
console.log(result.stats);
if (!result.ok) process.exitCode = 1;
