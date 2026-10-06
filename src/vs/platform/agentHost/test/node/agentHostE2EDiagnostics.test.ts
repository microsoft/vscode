/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { dirname, join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { preserveAgentHostE2ELogs, preserveAgentHostOperationLogs } from './e2e/harness/agentHostE2EDiagnostics.js';

suite('Agent Host E2E diagnostics', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('retains logs from before and after a restart even after the isolated home is removed', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const home = join(root, 'home');
		const destination = join(root, 'retained');
		const files = [
			['logs/first/agenthost-server.log', 'host/first/agenthost-server.log', 'shutdown timed out'],
			['logs/second/agenthost-server.log', 'host/second/agenthost-server.log', 'restarted'],
			['.copilot/logs/process-1.log', 'copilot/process-1.log', 'provider shutdown'],
		];
		for (const [source, , content] of files) {
			const path = join(home, source);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, content);
		}

		preserveAgentHostE2ELogs(home, home, destination, 'restart failure');
		rmSync(home, { recursive: true });

		assert.deepStrictEqual({
			label: readFileSync(join(destination, 'failures.log'), 'utf8'),
			logs: files.map(([, retained]) => readFileSync(join(destination, retained), 'utf8')),
		}, {
			label: 'restart failure\n',
			logs: files.map(([, , content]) => content),
		});
	});

	test('records missing host and provider logs without inventing log files', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const destination = join(root, 'retained');

		preserveAgentHostE2ELogs(join(root, 'missing'), join(root, 'missing'), destination, 'startup failure');

		assert.deepStrictEqual({
			label: readFileSync(join(destination, 'failures.log'), 'utf8'),
			host: existsSync(join(destination, 'host')),
			provider: existsSync(join(destination, 'copilot')),
		}, {
			label: 'startup failure\n',
			host: false,
			provider: false,
		});

		test('retains only operation timings across successful restarts and log rotation', () => {
			const root = mkdtempSync(join(tmpdir(), 'agent-host-operation-diagnostics-'));
			disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
			const home = join(root, 'home');
			const destination = join(root, 'retained');
			const files = ['first/agenthost-server.1.log', 'first/agenthost-server.log', 'second/agenthost-server.log'];
			for (const file of files) {
				const source = join(home, 'logs', file);
				mkdirSync(dirname(source), { recursive: true });
				writeFileSync(source, 'unrelated provider content\n[AgentHostOperation] phase=read outcome=started\nunrelated error content\n');
			}

			preserveAgentHostOperationLogs(home, destination);
			preserveAgentHostOperationLogs(home, destination);
			rmSync(home, { recursive: true });

			assert.deepStrictEqual(files.map(file => readFileSync(join(destination, 'operations', file), 'utf8')), files.map(() => '[AgentHostOperation] phase=read outcome=started\n'));
		});

		test('operation diagnostics tolerate absent logs but surface invalid destinations', () => {
			const root = mkdtempSync(join(tmpdir(), 'agent-host-operation-diagnostics-'));
			disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
			const destination = join(root, 'retained');
			preserveAgentHostOperationLogs(join(root, 'missing'), destination);
			assert.strictEqual(existsSync(destination), false);

			mkdirSync(join(root, 'logs', 'run'), { recursive: true });
			writeFileSync(join(root, 'logs', 'run', 'agenthost-server.log'), '[AgentHostOperation] phase=read outcome=started');
			writeFileSync(destination, '');
			assert.throws(() => preserveAgentHostOperationLogs(root, destination));
		});
	});

	test('surfaces errors other than absent log directories', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const invalidDestination = join(root, 'not-a-directory');
		writeFileSync(invalidDestination, '');

		assert.throws(() => preserveAgentHostE2ELogs(root, root, invalidDestination, 'failure'));
	});
});
