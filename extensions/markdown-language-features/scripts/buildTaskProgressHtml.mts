/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import esbuild from 'esbuild';
import { assertBundledPackagesDeclared } from '../../../build/lib/bundledPackages.ts';

export async function buildTaskProgressHtml(taskProgressDir: string): Promise<string> {
	const guest = await esbuild.build({
		entryPoints: [path.join(taskProgressDir, 'taskProgressGuest.ts')],
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		target: ['es2024'],
		minify: true,
		metafile: true,
	});
	// The editor bundle embeds this script, so the outer build's check doesn't see its packages.
	assertBundledPackagesDeclared(guest.metafile, { workingDirectory: process.cwd(), project: path.dirname(import.meta.dirname) });
	const template = await readFile(path.join(taskProgressDir, 'taskProgress.html'), 'utf8');
	return template.replace('<script src="./taskProgressGuest.ts"></script>',
		() => `<script>${guest.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
}
