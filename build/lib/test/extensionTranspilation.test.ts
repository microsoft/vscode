/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { suite, test } from 'node:test';
import { createExtensionTasks } from '../../gulpfile.extensions.ts';
import * as task from '../gulp/task.ts';

suite('extension transpilation pipeline', () => {
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
