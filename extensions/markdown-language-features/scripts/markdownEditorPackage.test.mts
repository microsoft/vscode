/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { markdownEditorOverridePlugin, resolveMarkdownEditorPackage } from './markdownEditorPackage.mts';

test('local override uses package exports for commands, JavaScript, and CSS without links', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markdown package override '));
	const previous = process.env.VSCODE_MARKDOWN_EDITOR_PATH;
	try {
		delete process.env.VSCODE_MARKDOWN_EDITOR_PATH;
		assert.deepEqual(await resolveMarkdownEditorPackage(), {
			commandsUrl: import.meta.resolve('@vscode/markdown-editor/commands'),
		});
		for (const name of ['first', 'second']) {
			const directory = join(root, name);
			await mkdir(join(directory, 'lib'), { recursive: true });
			await mkdir(join(directory, 'styles'));
			await writeFile(join(directory, 'package.json'), JSON.stringify({
				name: '@vscode/markdown-editor', type: 'module',
				exports: {
					'.': { import: './lib/index.js' },
					'./commands': { import: './lib/actions.js' },
					'./theme.css': './styles/theme.css',
				},
			}));
			await writeFile(join(directory, 'lib', 'index.js'), `export const source = '${name}';`);
			await writeFile(join(directory, 'lib', 'actions.js'), `export const commands = ['${name}'];`);
			await writeFile(join(directory, 'styles', 'theme.css'), `body { --selected-package: ${name}; }`);
			process.env.VSCODE_MARKDOWN_EDITOR_PATH = directory;
			const selected = await resolveMarkdownEditorPackage();
			assert.equal(selected.directory, await realpath(directory));
			assert.equal(fileURLToPath(selected.commandsUrl), join(selected.directory!, 'lib', 'actions.js'));
			assert.deepEqual((await import(selected.commandsUrl)).commands, [name]);
			const build = await esbuild.build({
				stdin: { contents: `export { source } from '@vscode/markdown-editor'; import '@vscode/markdown-editor/theme.css';`, resolveDir: root },
				outfile: join(root, 'bundle.js'), bundle: true, write: false, format: 'esm',
				plugins: [markdownEditorOverridePlugin(selected.directory!)],
			});
			const js = build.outputFiles.find(file => file.path.endsWith('.js'))!.text;
			const css = build.outputFiles.find(file => file.path.endsWith('.css'))!.text;
			assert.equal((await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).source, name);
			assert.match(css, new RegExp(`--selected-package: ${name}`));
			assert.equal(await readFile(join(directory, 'lib', 'index.js'), 'utf8'), `export const source = '${name}';`);
		}
		process.env.VSCODE_MARKDOWN_EDITOR_PATH = '';
		await assert.rejects(resolveMarkdownEditorPackage(), /nonempty/);
		process.env.VSCODE_MARKDOWN_EDITOR_PATH = join(root, 'missing');
		await assert.rejects(resolveMarkdownEditorPackage(), /ENOENT/);
		process.env.VSCODE_MARKDOWN_EDITOR_PATH = root;
		await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'other-package' }));
		await assert.rejects(resolveMarkdownEditorPackage(), /Not a Markdown editor package/);
		await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@vscode/markdown-editor', exports: { './commands': './missing.js' } }));
		await assert.rejects(resolveMarkdownEditorPackage(), /Could not resolve/);
	} finally {
		if (previous === undefined) {
			delete process.env.VSCODE_MARKDOWN_EDITOR_PATH;
		} else {
			process.env.VSCODE_MARKDOWN_EDITOR_PATH = previous;
		}
		await rm(root, { recursive: true, force: true });
	}
});
