/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { rewriteSourceMappingURL } from './source-map-url.ts';

export const missionControlWebCryptoOutDir = 'vs/platform/agentHost/browser';

const REPO_ROOT = path.dirname(path.dirname(import.meta.dirname));
const HPKE_ROOT = path.join(REPO_ROOT, 'node_modules', '@hpke') + path.sep;

/** Bundle the existing sealing dependencies for lazy use in browser and Electron renderers. */
export async function bundleMissionControlWebCrypto(options: { outDir: string; minify?: boolean; sourceMapBaseUrl?: string }): Promise<void> {
	const outDir = path.resolve(REPO_ROOT, options.outDir);
	const result = await esbuild.build({
		stdin: {
			contents: `export { default as sodium } from 'libsodium-wrappers'; export * as hpke from '@hpke/core';`,
			resolveDir: REPO_ROOT,
			sourcefile: 'missionControlWebCryptoEntry.js',
		},
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2024',
		minify: options.minify,
		sourcemap: 'linked',
		outfile: path.join(outDir, 'missionControlCryptoModule.js'),
		metafile: true,
		write: false,
		logLevel: 'warning',
		plugins: [{
			name: 'mission-control-web-crypto',
			setup(build) {
				build.onResolve({ filter: /^crypto$/ }, args => args.importer.startsWith(HPKE_ROOT)
					? { path: 'native-webcrypto', namespace: 'mission-control-web-crypto' }
					: undefined);
				build.onLoad({ filter: /.*/, namespace: 'mission-control-web-crypto' }, () => ({
					contents: 'export const webcrypto = globalThis.crypto; if (!webcrypto?.subtle || !webcrypto?.getRandomValues) { throw new Error("Web Crypto is unavailable."); }',
					loader: 'js',
				}));
			},
		}],
	});
	const externalImports = Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(entry => entry.external));
	if (externalImports.length > 0) {
		throw new Error(`Mission Control browser crypto has unresolved dependencies: ${externalImports.map(entry => entry.path).join(', ')}`);
	}
	for (const output of result.outputFiles) {
		await fs.promises.mkdir(path.dirname(output.path), { recursive: true });
		await fs.promises.writeFile(output.path, output.path.endsWith('.js')
			? rewriteSourceMappingURL(output.text, path.relative(outDir, output.path), options.sourceMapBaseUrl)
			: output.contents);
	}
}
