/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';

const root = path.resolve(import.meta.dirname, '../..');

// esbuild-based bundle tasks (drop-in replacement for bundle-vscode / minify-vscode)

export function runEsbuildTranspile(outDir: string, excludeTests: boolean): Promise<void> {
	const args = ['transpile', '--out', outDir];
	if (excludeTests) {
		args.push('--exclude-tests');
	}
	return runEsbuild(args);
}

export function runEsbuildNLS(outDir: string): Promise<void> {
	return runEsbuild(['nls', '--out', outDir]);
}

export function runEsbuildBundle(outDir: string, minify: boolean, nls: boolean, target: 'desktop' | 'server' | 'server-web' | 'web' = 'desktop', sourceMapBaseUrl?: string, nlsCatalog?: string): Promise<void> {
	const args = ['bundle', '--out', outDir, '--target', target];
	if (minify) {
		args.push('--minify');
		args.push('--mangle-privates');
	}
	if (nls) {
		args.push('--nls');
	}
	if (nlsCatalog) {
		args.push('--nls-catalog', nlsCatalog);
	}
	if (sourceMapBaseUrl) {
		args.push('--source-map-base-url', sourceMapBaseUrl);
	}
	return runEsbuild(args);
}

function runEsbuild(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = cp.spawn(process.execPath, [path.join(root, 'build/next/index.ts'), ...args], {
			cwd: root,
			stdio: 'inherit'
		});

		proc.on('error', reject);
		proc.on('close', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`esbuild ${args.join(' ')} failed with exit code ${code}`));
			}
		});
	});
}
