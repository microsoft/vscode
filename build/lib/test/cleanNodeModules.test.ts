/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import path from 'path';
import { suite, test } from 'node:test';
import File from 'vinyl';
import { cleanNodeModules } from '../util.ts';

suite('cleanNodeModules - extension SDK exceptions', () => {
	const root = path.resolve(import.meta.dirname, '../../..');
	const files = [
		'@github/copilot/package.json',
		'@github/copilot/LICENSE.md',
		'@github/copilot/sdk/index.js',
		'@github/copilot/sdk/worker/worker.js',
		'@github/copilot/sdk/prebuilds/win32-x64/runtime.node',
		'@github/copilot/index.js',
		'@github/copilot/prebuilds/win32-x64/copilot.exe',
		'@github/copilot-win32-x64/copilot.exe',
		'@github/copilot-sdk/index.js',
	];

	async function packaged(includes: readonly string[] = []): Promise<string[]> {
		const stream = cleanNodeModules(path.join(root, 'build', '.moduleignore'), includes);
		const output: string[] = [];
		stream.on('data', (file: File) => output.push(file.relative.split(path.sep).join('/')));
		const finished = once(stream, 'end');
		for (const file of files) {
			stream.write(new File({ base: root, path: path.join(root, 'node_modules', file), contents: Buffer.from('test') }));
		}
		stream.end();
		await finished;
		return output.sort();
	}

	test('root application keeps the SDK-based runtime but excludes the standalone CLI', async () => {
		assert.deepStrictEqual(await packaged(), ['node_modules/@github/copilot-sdk/index.js']);
	});

	test('extension packaging preserves only its external SDK, package metadata and license', async () => {
		assert.deepStrictEqual(await packaged(['@github/copilot/package.json', '@github/copilot/LICENSE.md', '@github/copilot/sdk/**']), [
			'node_modules/@github/copilot-sdk/index.js',
			'node_modules/@github/copilot/LICENSE.md',
			'node_modules/@github/copilot/package.json',
			'node_modules/@github/copilot/sdk/index.js',
			'node_modules/@github/copilot/sdk/prebuilds/win32-x64/runtime.node',
			'node_modules/@github/copilot/sdk/worker/worker.js',
		]);
	});
});
