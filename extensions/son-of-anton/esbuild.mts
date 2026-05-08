/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Plugin } from 'esbuild';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

const corePackageRoot = path.resolve(import.meta.dirname, '..', '..', 'son-of-anton-core');
const coreSrcRoot = path.join(corePackageRoot, 'src');

// Resolve `son-of-anton-core` and `son-of-anton-core/<subpath>` to the actual
// files in the sibling package's `src/` tree. esbuild does NOT honour the
// extension tsconfig's `paths`, so we wire bare-import resolution explicitly
// here. Mirrors the type-check resolution which points at the package's
// generated `dist/` declarations — for runtime bundling we deliberately
// inline the TypeScript source so the extension binary remains a single CJS
// blob with no external dependency on the core package.
const coreResolverPlugin: Plugin = {
	name: 'son-of-anton-core-resolver',
	setup(build) {
		build.onResolve({ filter: /^son-of-anton-core(?:\/|$)/ }, args => {
			const subpath = args.path === 'son-of-anton-core'
				? 'index'
				: args.path.slice('son-of-anton-core/'.length);
			const candidates = [
				path.join(coreSrcRoot, `${subpath}.ts`),
				path.join(coreSrcRoot, subpath, 'index.ts'),
			];
			for (const candidate of candidates) {
				if (fs.existsSync(candidate)) {
					return { path: candidate };
				}
			}
			return undefined;
		});
	},
};

async function buildAll(): Promise<void> {
	await run({
		platform: 'node',
		entryPoints: {
			'extension': path.join(srcDir, 'extension.ts'),
		},
		srcDir,
		outdir: outDir,
		additionalOptions: {
			plugins: [coreResolverPlugin],
		},
	}, process.argv);

	// Chain the React board webview build. Kept in its own module because
	// the platform / format / minify settings differ enough that sharing
	// `esbuild-extension-common` would mean threading too many overrides.
	const board = await import('./esbuild.board.mts');
	await board.build();
}

buildAll().catch(err => {
	console.error(err);
	process.exit(1);
});
