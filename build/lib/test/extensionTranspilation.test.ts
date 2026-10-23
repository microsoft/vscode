/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { once } from 'events';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { suite, test } from 'node:test';
import { setTimeout as delay } from 'timers/promises';
import { createExtensionTasks } from '../../gulpfile.extensions.ts';
import * as task from '../gulp/task.ts';

suite('extension transpilation pipeline', () => {
	test('watcher recompiles source edits and recovers from compiler errors', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-extension-watch-'));
		try {
			const extension = path.join(root, 'extensions', 'watch-fixture');
			const source = path.join(extension, 'src', 'entry.ts');
			const output = path.join(extension, 'out', 'entry.js');
			await fs.mkdir(path.dirname(source), { recursive: true });
			await fs.writeFile(path.join(extension, 'package.json'), '{"type":"commonjs"}');
			await fs.writeFile(path.join(extension, 'tsconfig.json'), JSON.stringify({
				compilerOptions: { module: 'commonjs', target: 'es2024', rootDir: './src', outDir: './out', types: [] },
				include: ['src/**/*'],
			}));
			await fs.writeFile(source, 'export const value: number = 1;');

			const child = spawn(process.execPath, ['--input-type=module', '-e', `
				process.once('message', () => process.exit(0));
				const { createExtensionTasks } = await import(${JSON.stringify(new URL('../../gulpfile.extensions.ts', import.meta.url).href)});
				const task = await import(${JSON.stringify(new URL('../gulp/task.ts', import.meta.url).href)});
				await task.series(createExtensionTasks('extensions/watch-fixture/tsconfig.json', process.cwd()).watchTask)();
			`], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
			const exited = once(child, 'exit');
			let stdout = '';
			let stderr = '';
			child.stdout!.on('data', data => { stdout += data; });
			child.stderr!.on('data', data => { stderr += data; });

			async function waitForCompilation(count: number) {
				const deadline = Date.now() + 30_000;
				while (stdout.split('Finished compilation').length - 1 < count) {
					assert.strictEqual(child.exitCode, null, stdout + stderr);
					assert.ok(Date.now() < deadline, `Timed out waiting for compilation ${count}:\n${stdout}${stderr}`);
					await delay(50);
				}
			}

			try {
				await waitForCompilation(1);
				assert.match(await fs.readFile(output, 'utf8'), /value = 1/);
				await fs.writeFile(source, 'export const value: number = 2;');
				await waitForCompilation(2);
				assert.match(await fs.readFile(output, 'utf8'), /value = 2/);

				await fs.writeFile(source, 'export const value: number = "invalid";');
				await waitForCompilation(3);
				assert.match(stdout, /error TS2322:/);

				await fs.writeFile(source, 'export const value: number = 3;');
				await waitForCompilation(4);
				assert.match(await fs.readFile(output, 'utf8'), /value = 3/);
			} finally {
				if (child.connected) {
					child.send('stop');
				}
				await exited;
			}
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('emits loadable modules for ts, mts and cts without copying sources or declarations', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-extension-pipeline-'));
		try {
			const extension = path.join(root, 'extensions', 'pipeline-fixture');
			const source = path.join(extension, 'src');
			const out = path.join(extension, 'out');
			await fs.mkdir(source, { recursive: true });
			await fs.writeFile(path.join(extension, 'package.json'), '{"type":"commonjs"}');
			await fs.writeFile(path.join(extension, 'tsconfig.json'), JSON.stringify({
				compilerOptions: { module: 'nodenext', target: 'es2024', rootDir: './src', outDir: './out' },
				include: ['src/**/*'],
			}));
			for (const suffix of ['ts', 'mts', 'cts']) {
				await fs.writeFile(path.join(source, `entry.${suffix}`), 'export const value: number = 42;');
				await fs.writeFile(path.join(source, `types.d.${suffix}`), 'export interface Value { value: number; }');
			}
			await fs.writeFile(path.join(source, '.resource.json'), '{"resource":true}');
			const tasks = createExtensionTasks(path.join('extensions', 'pipeline-fixture', 'tsconfig.json'), root);
			await task.series(tasks.transpileTask)();
			const require = createRequire(path.join(extension, 'package.json'));
			const esm = await import(pathToFileURL(path.join(out, 'entry.mjs')).href);
			assert.deepStrictEqual({
				files: (await fs.readdir(out)).sort(),
				values: [require(path.join(out, 'entry.js')).value, esm.value, require(path.join(out, 'entry.cjs')).value],
				resource: await fs.readFile(path.join(out, '.resource.json'), 'utf8'),
			}, {
				files: ['.resource.json', 'entry.cjs', 'entry.js', 'entry.mjs'],
				values: [42, 42, 42],
				resource: '{"resource":true}',
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
