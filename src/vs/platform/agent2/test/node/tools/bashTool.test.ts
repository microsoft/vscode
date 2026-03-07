/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IToolContext } from '../../../common/tools.js';
import { BashTool } from '../../../node/tools/bashTool.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

function createContext(workingDirectory: string, disposables: DisposableStore, token: CancellationToken = CancellationToken.None): IToolContext {
	return {
		token,
		workingDirectory,
		scratchpad: new Map(),
		registerDisposable: d => disposables.add(d),
	};
}

suite('BashTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let tmpDir: string;
	const tool = new BashTool();

	setup(async () => {
		tmpDir = await fs.promises.mkdtemp(join(os.tmpdir(), 'agent2-bash-'));
	});

	teardown(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('executes a simple command', async () => {
		const result = await tool.execute({ command: 'echo hello' }, createContext(tmpDir, store));
		assert.ok(result.content.includes('hello'));
		assert.strictEqual(result.isError, undefined);
	});

	test('uses working directory', async () => {
		await fs.promises.writeFile(join(tmpDir, 'marker.txt'), 'found');

		const result = await tool.execute({ command: 'cat marker.txt' }, createContext(tmpDir, store));
		assert.ok(result.content.includes('found'));
	});

	test('captures stderr in output', async () => {
		const result = await tool.execute({ command: 'echo err >&2' }, createContext(tmpDir, store));
		assert.ok(result.content.includes('err'));
	});

	test('reports non-zero exit code as error', async () => {
		const result = await tool.execute({ command: 'exit 42' }, createContext(tmpDir, store));
		assert.strictEqual(result.isError, true);
	});

	test('returns error for missing command argument', async () => {
		const result = await tool.execute({}, createContext(tmpDir, store));
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('"command" argument'));
	});

	test('handles timeout', async () => {
		const result = await tool.execute(
			{ command: 'sleep 30', timeout: 500 },
			createContext(tmpDir, store),
		);
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('timed out'));
	});

	test('handles cancellation', async () => {
		const cts = store.add(new CancellationTokenSource());

		// Cancel after a brief delay
		setTimeout(() => cts.cancel(), 100);

		const result = await tool.execute(
			{ command: 'sleep 30' },
			createContext(tmpDir, store, cts.token),
		);

		assert.strictEqual(result.isError, true);
	});

	test('preserves state across invocations', async () => {
		const ctx = createContext(tmpDir, store);

		// Change directory and set a variable in first invocation
		await tool.execute({ command: 'mkdir -p subdir && cd subdir && export MY_VAR=hello' }, ctx);

		// Second invocation should see the directory change and variable
		const result = await tool.execute({ command: 'echo "$MY_VAR from $(basename $PWD)"' }, ctx);
		assert.ok(result.content.includes('hello'), `Expected output to contain 'hello', got: "${result.content}"`);
		assert.ok(result.content.includes('subdir'), `Expected output to contain 'subdir', got: "${result.content}"`);
	});

	test('returns "(no output)" for quiet commands', async () => {
		const result = await tool.execute({ command: 'true' }, createContext(tmpDir, store));
		assert.strictEqual(result.content, '(no output)');
	});
});
