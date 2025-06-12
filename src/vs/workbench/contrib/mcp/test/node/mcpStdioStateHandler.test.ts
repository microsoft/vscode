/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import * as assert from 'assert';
import { killTree } from '../../../../../base/node/processes.js';
import { McpStdioStateHandler } from '../../node/mcpStdioStateHandler.js';
import { isWindows } from '../../../../../base/common/platform.js';

const GRACE_TIME = 100;

suite('McpStdioStateHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function run(code: string) {
		const child = spawn(process.argv0, ['-e', code], {
			stdio: 'pipe',
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		});

		return {
			child,
			handler: store.add(new McpStdioStateHandler(child, GRACE_TIME)),
			processId: new Promise<number>((resolve) => {
				child.on('spawn', () => resolve(child.pid!));
			}),
			output: new Promise<string>((resolve) => {
				let output = '';
				child.stdout.on('data', (data) => {
					output += data.toString();
				});
				child.on('close', () => resolve(output));
			}),
		};
	}

	test('stdin ends process', async () => {
		const { child, handler, output } = run(`
			const data = require('fs').readFileSync(0, 'utf-8');
			console.log('Data received:', data);
			process.on('SIGTERM', () => console.log('SIGTERM received'));
			process.on('SIGKILL', () => console.log('SIGKILL received'));
		`);

		child.stdin.write('Hello MCP!');
		handler.stop();
		const result = await output;
		assert.strictEqual(result.trim(), 'Data received: Hello MCP!');
	});


	if (!isWindows) {
		test('sigterm after grace', async () => {
			const { handler, output } = run(`
			setInterval(() => {}, 1000);
			process.stdin.on('end', () => console.log('stdin ended'));
			process.stdin.resume();
			process.on('SIGTERM', () => {
				console.log('SIGTERM received');
				process.exit(0);
			});
			process.on('SIGKILL', () => console.log('SIGKILL received'));
		`);

			const before = Date.now();
			handler.stop();
			const result = await output;
			const delay = Date.now() - before;
			assert.ok(delay >= GRACE_TIME, `Expected at least ${GRACE_TIME}ms delay, got ${delay}ms`);
			assert.strictEqual(result.trim().replaceAll('\r\n', '\n'), 'stdin ended\nSIGTERM received');
		});
	}

	test('sigkill after grace', async () => {
		const { handler, output } = run(`
			setInterval(() => {}, 1000);
			process.stdin.on('end', () => console.log('stdin ended'));
			process.stdin.resume();
			process.on('SIGTERM', () => {
				console.log('SIGTERM received');
			});
			process.on('SIGKILL', () => console.log('SIGKILL received'));
		`);

		const before = Date.now();
		handler.stop();
		const result = await output;
		const delay = Date.now() - before;
		assert.ok(delay >= GRACE_TIME * 2, `Expected at least ${GRACE_TIME * 2}ms delay, got ${delay}ms`);
		if (!isWindows) {
			assert.strictEqual(result.trim().replaceAll('\r\n', '\n'), 'stdin ended\nSIGTERM received');
		} else {
			assert.strictEqual(result.trim().replaceAll('\r\n', '\n'), 'stdin ended');
		}
	});
});
