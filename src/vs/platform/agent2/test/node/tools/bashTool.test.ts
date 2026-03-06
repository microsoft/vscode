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

function createContext(workingDirectory: string, token: CancellationToken = CancellationToken.None): IToolContext {
	return {
		token,
		workingDirectory,
		scratchpad: new Map(),
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
		const result = await tool.execute({ command: 'echo hello' }, createContext(tmpDir));
		assert.strictEqual(result.content.trim(), 'hello');
		assert.strictEqual(result.isError, undefined);
	});

	test('uses working directory', async () => {
		await fs.promises.writeFile(join(tmpDir, 'marker.txt'), 'found');

		const result = await tool.execute({ command: 'cat marker.txt' }, createContext(tmpDir));
		assert.strictEqual(result.content.trim(), 'found');
	});

	test('captures stderr', async () => {
		const result = await tool.execute({ command: 'echo err >&2' }, createContext(tmpDir));
		assert.ok(result.content.includes('stderr:'));
		assert.ok(result.content.includes('err'));
	});

	test('reports non-zero exit code as error', async () => {
		const result = await tool.execute({ command: 'exit 42' }, createContext(tmpDir));
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('42'));
	});

	test('returns error for missing command argument', async () => {
		const result = await tool.execute({}, createContext(tmpDir));
		assert.strictEqual(result.isError, true);
		assert.ok(result.content.includes('"command" argument'));
	});

	test('handles timeout', async () => {
		const result = await tool.execute(
			{ command: 'sleep 30', timeout: 500 },
			createContext(tmpDir),
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
			createContext(tmpDir, cts.token),
		);

		// Tool should complete (either with error or killed)
		assert.ok(result.isError || result.content.includes('killed'));
	});

	test('handles multi-line output', async () => {
		const result = await tool.execute(
			{ command: 'printf "line1\\nline2\\nline3"' },
			createContext(tmpDir),
		);
		assert.strictEqual(result.content, 'line1\nline2\nline3');
	});

	test('returns "(no output)" for quiet commands', async () => {
		const result = await tool.execute({ command: 'true' }, createContext(tmpDir));
		assert.strictEqual(result.content, '(no output)');
	});
});
