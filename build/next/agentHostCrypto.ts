/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { rewriteSourceMappingURL } from './source-map-url.ts';

export const agentHostCryptoOutDir = 'vs/platform/agentHost/browser';
const repoRoot = path.dirname(path.dirname(import.meta.dirname));

/** Emits the lazily loaded credential-encryption dependencies for browser and desktop clients. */
export async function bundleAgentHostCrypto(options: { outDir: string; minify?: boolean; sourceMapBaseUrl?: string }): Promise<void> {
	const outDir = path.resolve(repoRoot, options.outDir);
	const result = await esbuild.build({
		entryPoints: [path.join(import.meta.dirname, 'agentHostCryptoEntry.ts')],
		outfile: path.join(outDir, 'agentHostCryptoModule.js'),
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: ['es2024'],
		// Both libraries use Web Crypto in browsers; their Node-only fallback remains unreachable there.
		external: ['crypto', 'node:crypto'],
		minify: options.minify,
		sourcemap: 'linked',
		write: false,
		logLevel: 'warning',
	});
	for (const output of result.outputFiles) {
		await fs.promises.mkdir(path.dirname(output.path), { recursive: true });
		await fs.promises.writeFile(output.path, output.path.endsWith('.js')
			? rewriteSourceMappingURL(output.text, path.relative(outDir, output.path), options.sourceMapBaseUrl)
			: output.contents);
	}
}
