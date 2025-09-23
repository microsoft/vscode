/*
 * index.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { build, Format, Platform } from 'esbuild';
import { AssetPair, copy } from 'esbuild-plugin-copy';

export interface BuildOptions {
  entryPoints: string[];
  outfile?: string;
  outdir?: string;
  assets?: Array<AssetPair>;
  bundle?: boolean;    // true
  minify?: boolean;    // false
  format?: Format;     // cjs
  platform?: Platform; // node
  external?: string[]; // []
  dev?: boolean;       // false
}

export async function runBuild(options: BuildOptions) {
  const {
    entryPoints,
    outfile,
    outdir,
    assets,
    bundle = true,
    minify = false,
    format = 'cjs',
    platform = 'node',
    external,
    dev = false
  } = options;

  await build({
    entryPoints,
    outfile,
    outdir,
    bundle,
    minify,
    format,
    platform,
    external,
    sourcemap: dev,
    watch: dev ? {
      onRebuild(error) {
        if (error)
          console.error('[watch] build failed:', error)
        else
          console.log('[watch] build finished')
      },
    } : false,
    plugins: assets ? [
      copy({
        resolveFrom: 'cwd',
        assets,
      }),
    ] : [],
  });

  if (dev) {
    console.log("[watch] build finished, watching for changes...");
  }
}
