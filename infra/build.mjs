import fs from 'fs';
import path from 'path';

import rimraf from 'rimraf';
import { buildSync } from 'esbuild';

const subDirs = fs.readdirSync(path.resolve('src'));

rimraf(path.resolve('dist'), {}, () => {
  buildSync({
    entryPoints: subDirs.map((dir) => path.resolve('src', dir, 'index.ts')),
    platform: 'node',
    bundle: true,
    treeShaking: true,
    outdir: 'dist',
    target: ['node16'],
    format: 'cjs',
  });
});
