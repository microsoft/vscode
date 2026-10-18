/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { PassThrough } from 'stream';
import sinon from 'sinon';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { dirname, join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { preserveAgentHostE2ELogs } from './e2e/harness/agentHostE2EDiagnostics.js';
import { AgentHostE2EServerLease } from './e2e/harness/agentHostE2ETestHarness.js';
import { CapiReplayProxy } from './e2e/harness/capiReplayProxy.js';
import { TestProtocolClient } from './serverIntegrationTestHelpers.js';

class TestServerProcess extends ChildProcess {
	override exitCode: number | null = 0;
}

suite('Agent Host E2E server lease diagnostics', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createHarness() {
		const lease = new AgentHostE2EServerLease({
			suiteTitle: 'Diagnostics',
			provider: 'copilotcli',
			scheme: 'copilotcli',
			shellToolName: 'bash',
			fileOperationStrategy: 'fileTools',
			subagentToolNames: [],
			exitPlanModeToolName: 'exit_plan_mode',
			enabled: true,
			supportsWorktreeIsolation: false,
			supportsHostTerminalTool: false,
			supportsSubagents: false,
			supportsMultipleChats: false,
			supportsChatFork: false,
			supportsChatForkE2E: false,
		});
		const internals = lease as unknown as {
			_client: Pick<TestProtocolClient, 'call' | 'close'> | undefined;
			_server: {
				process: ChildProcess;
				port: number;
				capiReplay: Pick<CapiReplayProxy, 'close' | 'stop' | 'assertNoReplayMismatches'>;
			} | undefined;
			_needsFreshDataDirectory: boolean;
			_startOptions: { homeDir: string; userDataDir: string };
		};
		const { homeDir, userDataDir } = internals._startOptions;
		disposables.add(toDisposable(() => rmSync(homeDir, { recursive: true, force: true })));
		const destination = mkdtempSync(join(tmpdir(), 'agent-host-retained-'));
		disposables.add(toDisposable(() => rmSync(destination, { recursive: true, force: true })));
		const log = join(userDataDir, 'logs', 'host', 'agenthost-server.log');
		mkdirSync(dirname(log), { recursive: true });
		writeFileSync(log, 'before cleanup\n');
		const captures: string[] = [];
		sinon.stub(lease, 'dumpRuntimeLogsOnFailure').callsFake(label => {
			preserveAgentHostE2ELogs(userDataDir, homeDir, destination, label);
			captures.push(readFileSync(join(destination, 'host', 'host', 'agenthost-server.log'), 'utf8'));
		});
		const proxy = sinon.createStubInstance(CapiReplayProxy);
		proxy.close.callsFake(async () => { appendFileSync(log, 'shutdown\n'); });
		proxy.stop.callsFake(async () => { appendFileSync(log, 'shutdown\n'); });
		const serverProcess = new TestServerProcess();
		internals._server = { process: serverProcess, port: 0, capiReplay: proxy };
		return { lease, internals, proxy, serverProcess, homeDir, destination, log, captures };
	}

	for (const failure of ['session disposal', 'replay verification', 'replay stop', 'server shutdown']) {
		test(`retains logs when a passing test fails during ${failure}`, async () => {
			const { lease, internals, proxy, serverProcess, homeDir, destination, log, captures } = createHarness();
			const error = new Error(`${failure} failed`);
			const sessions: string[] = [];
			if (failure === 'session disposal') {
				internals._client = {
					call: async () => { throw error; },
					close: () => { },
				};
				sessions.push('copilotcli:/session');
			} else if (failure === 'replay verification') {
				proxy.assertNoReplayMismatches.throws(error);
			} else if (failure === 'replay stop') {
				internals._needsFreshDataDirectory = true;
				proxy.stop.callsFake(async () => {
					appendFileSync(log, 'shutdown\n');
					throw error;
				});
			} else {
				internals._needsFreshDataDirectory = true;
				proxy.stop.resolves();
				serverProcess.exitCode = null;
				const stdin = new PassThrough();
				disposables.add(toDisposable(() => stdin.destroy()));
				serverProcess.stdin = stdin;
				sinon.stub(stdin, 'end').callsFake(() => {
					appendFileSync(log, 'shutdown\n');
					serverProcess.exitCode = 0;
					throw error;
				});
			}

			await assert.rejects(lease.release(sessions), actual =>
				actual instanceof AggregateError && actual.errors.includes(error));
			const replacementRequired = internals._needsFreshDataDirectory;
			await lease.dispose();

			assert.deepStrictEqual({
				captures,
				retained: readFileSync(join(destination, 'host', 'host', 'agenthost-server.log'), 'utf8'),
				homeRemoved: !existsSync(homeDir),
				replacementRequired,
			}, {
				captures: failure === 'server shutdown' || failure === 'replay stop'
					? ['before cleanup\nshutdown\n', 'before cleanup\nshutdown\n']
					: ['before cleanup\n', 'before cleanup\nshutdown\n'],
				retained: 'before cleanup\nshutdown\n',
				homeRemoved: true,
				replacementRequired: true,
			});
		});
	}

	test('refreshes retained logs after shutdown even when the test body already failed', async () => {
		const { lease, homeDir, destination, captures } = createHarness();

		await lease.release([], true);
		await lease.dispose();

		assert.deepStrictEqual({
			captures,
			retained: readFileSync(join(destination, 'host', 'host', 'agenthost-server.log'), 'utf8'),
			homeRemoved: !existsSync(homeDir),
		}, {
			captures: ['before cleanup\nshutdown\n'],
			retained: 'before cleanup\nshutdown\n',
			homeRemoved: true,
		});
	});

	test('retains suite cleanup failure logs before removing the isolated home', async () => {
		const { lease, proxy, homeDir, destination, log, captures } = createHarness();
		const error = new Error('suite cleanup failed');
		proxy.close.callsFake(async () => {
			appendFileSync(log, 'shutdown\n');
			throw error;
		});

		await assert.rejects(lease.dispose(), actual => actual === error);

		assert.deepStrictEqual({
			captures,
			retained: readFileSync(join(destination, 'host', 'host', 'agenthost-server.log'), 'utf8'),
			homeRemoved: !existsSync(homeDir),
		}, {
			captures: ['before cleanup\nshutdown\n'],
			retained: 'before cleanup\nshutdown\n',
			homeRemoved: true,
		});
	});
});
