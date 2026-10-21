/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

test('workspace packageOverride sets or clears the environment and forwards watcher arguments', async () => {
	const root = await mkdtemp(join(tmpdir(), 'workspace-markdown-'));
	const script = fileURLToPath(new URL('./markdown.mts', import.meta.url));
	try {
		const extension = join(root, 'extensions', 'markdown-language-features');
		await mkdir(extension, { recursive: true });
		await writeFile(join(extension, 'esbuild.markdownEditor.mts'),
			'console.log(JSON.stringify({override:process.env.VSCODE_MARKDOWN_EDITOR_PATH??null,watch:process.argv.includes("--watch"),cwd:process.cwd()}));');
		const run = (value: unknown) => promisify(execFile)(process.execPath, [script, '--watch'], {
			cwd: root,
			env: {
				...process.env, VSCODE_MARKDOWN_EDITOR_PATH: 'ambient-must-not-win',
				DEV_WORKSPACE_INPUTS: JSON.stringify({ packageOverride: { value } }),
			},
		});
		assert.deepEqual(JSON.parse((await run('local package')).stdout), {
			override: join(root, 'local package'), watch: true, cwd: extension,
		});
		assert.deepEqual(JSON.parse((await run(null)).stdout), { override: null, watch: true, cwd: extension });
		await assert.rejects(run(42), /local package directory or null/);
		await assert.rejects(run(undefined), /Missing packageOverride/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
