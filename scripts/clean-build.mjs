import { rm, mkdir } from 'node:fs/promises';
// Generated output only. Do not carry obsolete IDE entry bundles into a release.
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
