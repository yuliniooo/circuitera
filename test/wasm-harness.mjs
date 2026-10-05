import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
export const assetsBase = pathToFileURL(path.resolve('dist/avr') + '/').href;
const nativeFetch = globalThis.fetch;
// Filesystem transport only: all compile/link/objcopy instructions still execute
// in the exact WASM modules shipped to Chrome. No native AVR executables.
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('file:')) return nativeFetch(input, init);
  try { return new Response(await readFile(fileURLToPath(url)), { status: 200 }); }
  catch { return new Response('Not found', { status: 404 }); }
};
