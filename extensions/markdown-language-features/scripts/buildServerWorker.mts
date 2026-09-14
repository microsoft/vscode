/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'node:path';
import { runBuild } from '../../esbuild-common.mts';

/** Re-emits the dependency worker so output edits have a valid map, even when its package omits one. */
export async function buildServerWorker(platform: 'node' | 'browser', outdir: string): Promise<void> {
	const source = path.join(import.meta.dirname, '..', 'node_modules', 'vscode-markdown-languageserver', 'dist', platform, 'workerMain.js');
	await runBuild({
		srcDir: path.dirname(source),
		outdir,
		entryPoints: { serverWorkerMain: source },
	}, {
		bundle: false,
		platform: 'neutral',
		minify: false,
		sourcemap: 'linked',
		sourcesContent: true,
		legalComments: 'inline',
	}, []);
}
