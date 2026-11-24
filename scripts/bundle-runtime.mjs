import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Keep generated files portable, including the licenses of bundled dependencies.
const result = await build({
  entryPoints: ['runtime/server.mjs'],
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  bundle: true,
  minify: true,
  legalComments: 'inline',
  metafile: true,
  write: false,
});
const packages = new Set();
for (const file of Object.keys(result.metafile.inputs)) {
  if (!file.includes('node_modules/')) continue;
  let dir = dirname(file);
  while (!/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/.test(dir)) dir = dirname(dir);
  packages.add(dir);
}
const notices = [];
for (const dir of [...packages].sort()) {
  const { name, version } = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  for (const file of (await readdir(dir)).filter((f) => /^(licen[sc]e|notice)(\.|$)/i.test(f))) {
    notices.push(name + '@' + version + '\n' + (await readFile(join(dir, file), 'utf8')));
  }
}
const licenses = '/*!\n' + notices.join('\n').replaceAll('*/', '* /') + '\n*/\n';
await writeFile('dist/runtime.bundle.cjs', licenses + result.outputFiles[0].text);
