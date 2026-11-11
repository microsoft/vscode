/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import esbuild from 'esbuild';

export async function buildTaskProgressHtml(taskProgressDir: string): Promise<string> {
	const guest = await esbuild.build({
		entryPoints: [path.join(taskProgressDir, 'taskProgressGuest.ts')],
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		target: ['es2024'],
		minify: true,
	});
	const template = await readFile(path.join(taskProgressDir, 'taskProgress.html'), 'utf8');
	return template.replace('<script src="./taskProgressGuest.ts"></script>',
		() => `<script>${guest.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
}
