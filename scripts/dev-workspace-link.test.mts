/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('./dev-workspace-link.mts', import.meta.url));

test('links and retargets only valid built Markdown packages without deleting their contents', async () => {
	const root = await mkdtemp(join(tmpdir(), 'workspace-markdown-link-'));
	const destination = join(root, 'extensions', 'markdown-language-features', 'node_modules', '@vscode', 'markdown-editor');
	async function packageAt(directory: string, name = '@vscode/markdown-editor') {
		await mkdir(join(directory, 'dist'), { recursive: true });
		await writeFile(join(directory, 'package.json'), JSON.stringify({ name }));
		await writeFile(join(directory, 'dist', 'commands.js'), 'export {};');
	}
	const configure = (value: string) => exec(process.execPath, [script], {
		cwd: root, env: { ...process.env, DEV_WORKSPACE_INPUTS: JSON.stringify({ markdownEditorPath: { kind: 'value', value } }) },
	});
	try {
		await packageAt(destination);
		const first = join(root, 'first');
		const second = join(root, 'second');
		const invalid = join(root, 'invalid');
		await packageAt(first);
		await packageAt(second);
		await packageAt(invalid, 'other-package');
		await configure(first);
		assert.equal(await realpath(destination), await realpath(first));
		await assert.rejects(configure(invalid), /Not a Markdown editor package/);
		assert.equal(await realpath(destination), await realpath(first));
		await configure(second);
		assert.equal(await realpath(destination), await realpath(second));
		assert.equal(await readFile(join(first, 'dist', 'commands.js'), 'utf8'), 'export {};');
		assert.match((await configure(second)).stdout, /already linked/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
