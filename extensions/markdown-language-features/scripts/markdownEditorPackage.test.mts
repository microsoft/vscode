/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import esbuild from 'esbuild';
import { markdownEditorOverridePlugin, resolveMarkdownEditorPackage } from './markdownEditorPackage.mts';

test('Markdown editor package selection without dependency links', async t => {
	const root = await mkdtemp(join(import.meta.dirname, 'markdown-package-override-'));
	const previous = process.env.VSCODE_MARKDOWN_EDITOR_PATH;
	try {
		await t.test('uses the installed commands export by default', async () => {
			delete process.env.VSCODE_MARKDOWN_EDITOR_PATH;
			assert.deepEqual(await resolveMarkdownEditorPackage(), {
				commandsUrl: import.meta.resolve('@vscode/markdown-editor/commands'),
			});

		});

		const generatorDirectory = join(root, 'generator');
		const generatorScripts = join(generatorDirectory, 'scripts');
		await mkdir(generatorScripts, { recursive: true });
		for (const script of ['updateMarkdownEditorPackageJson.mts', 'markdownEditorPackage.mts']) {
			await copyFile(join(import.meta.dirname, script), join(generatorScripts, script));
		}
		await writeFile(join(generatorDirectory, 'package.json'), JSON.stringify({ contributes: {} }));
		await writeFile(join(generatorDirectory, 'package.nls.json'), '{}');
		for (const name of ['first', 'second']) {
			await t.test(`selects ${name} for JavaScript, subpaths, CSS, and generated commands`, async () => {
				const directory = join(root, `${name} package`);
				await mkdir(join(directory, 'lib'), { recursive: true });
				await mkdir(join(directory, 'styles'));
				await writeFile(join(directory, 'package.json'), JSON.stringify({
					name: '@vscode/markdown-editor', type: 'module',
					exports: {
						'.': { import: './lib/index.js' },
						'./commands': { import: './lib/actions.js' },
						'./value': './lib/value.js',
						'./theme.css': './styles/theme.css',
						'./base.css': './styles/base.css',
					},
				}));
				await writeFile(join(directory, 'lib', 'index.js'), `export { source } from '@vscode/markdown-editor/value';`);
				await writeFile(join(directory, 'lib', 'value.js'), `export const source = '${name}';`);
				await writeFile(join(directory, 'lib', 'actions.js'), `export const commands = [{ id: 'markdown.editor.${name}', title: '${name}', keybindings: [], action: { kind: 'cursor', command: 'left', extend: false } }];`);
				await writeFile(join(directory, 'styles', 'theme.css'), `@import '@vscode/markdown-editor/base.css'; body { --selected-package: ${name}; }`);
				await writeFile(join(directory, 'styles', 'base.css'), `body { --base-package: ${name}; }`);
				process.env.VSCODE_MARKDOWN_EDITOR_PATH = relative(process.cwd(), directory);
				const selected = await resolveMarkdownEditorPackage();
				assert.deepEqual(selected, {
					directory: await realpath(directory),
					commandsUrl: pathToFileURL(join(await realpath(directory), 'lib', 'actions.js')).href,
				});
				assert.equal((await lstat(directory)).isSymbolicLink(), false);
				assert.equal(fileURLToPath(selected.commandsUrl), join(selected.directory!, 'lib', 'actions.js'));
				const build = await esbuild.build({
					stdin: { contents: `export { source } from '@vscode/markdown-editor'; import '@vscode/markdown-editor/theme.css';`, resolveDir: root },
					outfile: join(root, 'bundle.js'), bundle: true, write: false, format: 'esm',
					plugins: [markdownEditorOverridePlugin(selected.directory!)],
				});
				const js = build.outputFiles.find(file => file.path.endsWith('.js'))!.text;
				const css = build.outputFiles.find(file => file.path.endsWith('.css'))!.text;
				assert.equal((await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).source, name);
				assert.match(css, new RegExp(`--selected-package: ${name}`));
				assert.match(css, new RegExp(`--base-package: ${name}`));
				await assert.rejects(esbuild.build({
					stdin: { contents: `import '@vscode/markdown-editor/not-exported';`, resolveDir: root },
					bundle: true, write: false, logLevel: 'silent',
					plugins: [markdownEditorOverridePlugin(selected.directory!)],
				}), /Could not resolve/);

				await promisify(execFile)(process.execPath, [join(generatorScripts, 'updateMarkdownEditorPackageJson.mts'), '--write'], { timeout: 30_000 });
				const manifest = JSON.parse(await readFile(join(generatorDirectory, 'package.json'), 'utf8'));
				const titles = JSON.parse(await readFile(join(generatorDirectory, 'package.nls.json'), 'utf8'));
				assert.deepEqual({
					commands: manifest.contributes.commands.map((command: { command: string }) => command.command),
					title: titles[`markdown.editor.${name}.title`].message,
				}, {
					commands: [`markdown.editor.${name}`],
					title: name,
				});
			});
		}

		await t.test('rejects invalid explicit selections instead of using the installed package', async () => {
			for (const value of ['', '   ']) {
				process.env.VSCODE_MARKDOWN_EDITOR_PATH = value;
				await assert.rejects(resolveMarkdownEditorPackage(), /nonempty/);
			}
			process.env.VSCODE_MARKDOWN_EDITOR_PATH = join(root, 'missing');
			await assert.rejects(resolveMarkdownEditorPackage(), /ENOENT/);
			process.env.VSCODE_MARKDOWN_EDITOR_PATH = join(root, 'generator', 'package.json');
			await assert.rejects(resolveMarkdownEditorPackage(), /ENOTDIR|ENOENT/);
			process.env.VSCODE_MARKDOWN_EDITOR_PATH = root;
			await assert.rejects(resolveMarkdownEditorPackage(), /ENOENT/);
			await writeFile(join(root, 'package.json'), '{');
			await assert.rejects(resolveMarkdownEditorPackage(), SyntaxError);
			await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'other-package' }));
			await assert.rejects(resolveMarkdownEditorPackage(), /Not a Markdown editor package/);
			for (const exports of [undefined, null, [], './index.js']) {
				await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@vscode/markdown-editor', exports }));
				await assert.rejects(resolveMarkdownEditorPackage(), /must declare exports/);
			}
			for (const exports of [{ '.': './index.js' }, { './commands': './missing.js' }, { './commands': '../outside.js' }]) {
				await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@vscode/markdown-editor', exports }));
				await assert.rejects(resolveMarkdownEditorPackage(), /Could not resolve/);
			}
		});
	} finally {
		if (previous === undefined) {
			delete process.env.VSCODE_MARKDOWN_EDITOR_PATH;
		} else {
			process.env.VSCODE_MARKDOWN_EDITOR_PATH = previous;
		}
		await rm(root, { recursive: true, force: true });
	}
});

test('package watching includes exported assets but excludes nested dependencies and Git metadata', async () => {
	const root = await mkdtemp(join(import.meta.dirname, 'markdown-package-watch-'));
	const srcDir = join(root, 'src');
	const directory = join(root, 'node_modules', 'editor');
	await mkdir(srcDir);
	await mkdir(join(directory, 'node_modules', 'dependency'), { recursive: true });
	await mkdir(join(directory, '.git'));
	await mkdir(join(directory, 'styles'));
	const entry = join(srcDir, 'entry.js');
	await writeFile(entry, 'export const value = 1;');
	const runner = new URL('../../esbuild-common.mts', import.meta.url).href;
	const child = spawn(process.execPath, ['--input-type=module', '-e',
		`import { runBuild } from ${JSON.stringify(runner)};
		await runBuild(${JSON.stringify({ srcDir, outdir: join(root, 'out'), entryPoints: [entry], additionalWatchPaths: [directory] })},
			{}, ['--watch'], () => console.log('BUILT'));`,
	], { stdio: ['ignore', 'pipe', 'pipe'] });
	const exited = once(child, 'exit');
	let stdout = '';
	let stderr = '';
	child.stdout.on('data', data => { stdout += data; });
	child.stderr.on('data', data => { stderr += data; });
	const builds = () => stdout.split('BUILT').length - 1;
	async function waitForBuild(count: number) {
		const deadline = Date.now() + 15_000;
		while (builds() < count) {
			assert.equal(child.exitCode, null, stderr);
			assert.ok(Date.now() < deadline, stdout + stderr);
			await delay(50);
		}
	}
	try {
		await waitForBuild(1);
		await writeFile(join(directory, 'node_modules', 'dependency', 'index.js'), 'dependency changed');
		await writeFile(join(directory, '.git', 'index'), 'metadata changed');
		await delay(600);
		assert.equal(builds(), 1);
		await writeFile(join(directory, 'styles', 'theme.css'), 'body { color: red; }');
		await waitForBuild(2);
		await writeFile(join(directory, 'commands.js'), 'export const commands = [];');
		await waitForBuild(3);
		assert.equal(builds(), 3);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill();
		}
		await exited;
		await rm(root, { recursive: true, force: true });
	}
});
