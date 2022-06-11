import fs from 'fs';
import path from 'path';

import { buildSync } from 'esbuild';

const subDirs = fs.readdirSync(path.resolve('src'));

buildSync({
  entryPoints: subDirs.map((dir) => path.resolve('src', dir, 'index.ts')),
  bundle: true,
  treeShaking: true,
  outdir: 'dist',
  target: ['node16'],
  format: 'cjs',
});
