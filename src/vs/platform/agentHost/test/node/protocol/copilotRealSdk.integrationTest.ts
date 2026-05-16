/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real Copilot SDK integration tests.
 *
 * The cross-provider portion lives in {@link defineSharedRealSdkTests}; this
 * file layers on Copilot-specific assertions (cost metadata, cd-prefix
 * stripping).
 *
 * Disabled by default. To run them, set `AGENT_HOST_REAL_SDK=1`:
 *
 *   AGENT_HOST_REAL_SDK=1 ./scripts/test-integration.sh --run src/vs/platform/agentHost/test/node/protocol/copilotRealSdk.integrationTest.ts
 *
 * Authentication: By default the token is obtained from `gh auth token`.
 * You can override it by setting `GITHUB_TOKEN=ghp_xxx`.
 *
 * SAFETY: These tests create real agent sessions backed by the Copilot SDK.
 * Prompts are kept to read-only questions, safe `echo` commands, and isolated
 * temp directories.
 */

import assert from 'assert';
import * as cp from 'child_process';
import { execSync } from 'child_process';
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { type SessionState } from '../../../common/state/sessionState.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import type { SessionDiffsChangedAction, SessionUsageAction } from '../../../common/state/sessionActions.js';
import {
	createRealSession, defineSharedRealSdkTests, dispatchTurn, startBackgroundApprovalLoop,
	type IRealSdkProviderConfig,
} from './realSdkTestHelpers.js';
import { getActionEnvelope, isActionNotification, IServerHandle, startRealServer, TestProtocolClient } from './testHelpers.js';

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

const hasGit = (() => {
	try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

const COPILOT_CONFIG: IRealSdkProviderConfig = {
	suiteTitle: 'Protocol WebSocket — Real Copilot SDK',
	provider: 'copilotcli',
	scheme: 'copilotcli',
	shellToolName: 'bash',
	subagentToolName: 'task',
	exitPlanModeToolName: 'exit_plan_mode',
	enabled: REAL_SDK_ENABLED,
	supportsWorktreeIsolation: true,
	supportsSubagents: true,
	supportsPlanMode: true,
};

defineSharedRealSdkTests(COPILOT_CONFIG);

(REAL_SDK_ENABLED ? suite : suite.skip)('Protocol WebSocket — Real Copilot SDK (Copilot-specific)', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];

	suiteSetup(async function () {
		this.timeout(60_000);
		server = await startRealServer();
	});

	suiteTeardown(function () {
		server?.process.kill();
	});

	setup(async function () {
		this.timeout(30_000);
		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(async function () {
		for (const session of createdSessions) {
			try {
				await client.call('disposeSession', { session }, 5000);
			} catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();

		for (const dir of tempDirs) {
			try {
				rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			} catch { /* best-effort */ }
		}
		tempDirs.length = 0;
	});

	test('usage reports include Copilot cost metadata', async function () {
		this.timeout(120_000);

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-usage', createdSessions, URI.file(tmpdir()).toString());
		dispatchTurn(client, sessionUri, 'turn-usage', 'Reply with exactly "usage-ok" and do not use tools.', 1);

		const usageNotif = await client.waitForNotification(n => isActionNotification(n, 'session/usage'), 90_000);
		const usageAction = getActionEnvelope(usageNotif).action as SessionUsageAction;
		assert.strictEqual(usageAction.session, sessionUri);
		assert.strictEqual(usageAction.turnId, 'turn-usage');
		assert.strictEqual(typeof usageAction.usage.model, 'string');
		assert.ok(usageAction.usage.model);
		assert.ok(usageAction.usage.inputTokens === undefined || usageAction.usage.inputTokens > 0);
		assert.ok(usageAction.usage.outputTokens === undefined || usageAction.usage.outputTokens > 0);

		const cost = usageAction.usage._meta?.cost;
		if (typeof cost !== 'number') {
			assert.fail(`expected usage._meta.cost to be numeric: ${JSON.stringify(usageAction.usage)}`);
		}
		assert.ok(cost > 0, `expected usage._meta.cost to be positive: ${JSON.stringify(usageAction.usage)}`);

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 90_000);
		const snapshot = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = snapshot.snapshot.state as SessionState;
		const turn = state.turns.find(t => t.id === 'turn-usage');
		assert.strictEqual(turn?.usage?._meta?.cost, cost);
	});

	test('strips redundant `cd <workingDirectory> &&` prefix from shell tool calls', async function () {
		this.timeout(180_000);

		const tempDir = mkdtempSync(`${tmpdir()}/ahp-cd-strip-test-`);
		tempDirs.push(tempDir);
		const expectedWorkingDirPath = tempDir;
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-cd-strip', createdSessions, URI.file(tempDir).toString());

		client.clearReceived();
		dispatchTurn(client, sessionUri, 'turn-cd-strip',
			`Run this exact shell command, do not modify it: cd ${expectedWorkingDirPath} && echo strip-me-please`,
			1);

		const toolReadyNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/toolCallReady')) {
				return false;
			}
			const action = getActionEnvelope(n).action as { toolInput?: string };
			return typeof action.toolInput === 'string' && action.toolInput.includes('echo strip-me-please');
		}, 90_000);

		const toolReadyAction = getActionEnvelope(toolReadyNotif).action as { toolCallId: string; toolInput?: string; confirmed?: string };
		const toolInput = toolReadyAction.toolInput!;

		const escapedWorkingDirPath = expectedWorkingDirPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const redundantWorkingDirCdPrefix = new RegExp(
			`^\\s*cd\\s+(?:"${escapedWorkingDirPath}"|'${escapedWorkingDirPath}'|${escapedWorkingDirPath})\\s*(?:&&|;)\\s*`,
		);
		assert.ok(
			!redundantWorkingDirCdPrefix.test(toolInput),
			`toolInput should not contain a redundant cd-prefix targeting the working directory; got: ${JSON.stringify(toolInput)}`,
		);
		assert.ok(
			toolInput.includes('echo strip-me-please'),
			`toolInput should contain the rewritten command body; got: ${JSON.stringify(toolInput)}`,
		);

		if (!toolReadyAction.confirmed) {
			client.notify('dispatchAction', {
				clientSeq: 2,
				action: {
					type: 'session/toolCallConfirmed',
					session: sessionUri, turnId: 'turn-cd-strip',
					toolCallId: toolReadyAction.toolCallId, approved: true,
				},
			});
		}

		const seenSeqs = new Set<number>();
		seenSeqs.add(getActionEnvelope(toolReadyNotif).serverSeq);
		let teardownSeq = 3;
		while (true) {
			const next = await client.waitForNotification(
				n => {
					if (isActionNotification(n, 'session/turnComplete') || isActionNotification(n, 'session/error')) {
						return true;
					}
					if (!isActionNotification(n, 'session/toolCallReady')) {
						return false;
					}
					return !seenSeqs.has(getActionEnvelope(n).serverSeq);
				},
				90_000,
			);
			if (isActionNotification(next, 'session/turnComplete') || isActionNotification(next, 'session/error')) {
				break;
			}
			const envelope = getActionEnvelope(next);
			seenSeqs.add(envelope.serverSeq);
			const action = envelope.action as { session: string; turnId: string; toolCallId: string; confirmed?: string };
			if (!action.confirmed) {
				client.notify('dispatchAction', {
					clientSeq: ++teardownSeq,
					action: {
						type: 'session/toolCallConfirmed',
						session: action.session, turnId: action.turnId,
						toolCallId: action.toolCallId, approved: true,
					},
				});
			}
		}
	});

	(hasGit ? test : test.skip)('terminal-driven file edit shows up in summary.diffs (no ToolResultFileEditContent emitted)', async function () {
		this.timeout(180_000);

		// Initialize a tmp git repo as the working directory. `realpathSync`
		// canonicalizes the path so it matches what the agent reports back —
		// on macOS `mkdtempSync` returns a `/var/...` path that resolves to
		// `/private/var/...`, and the diff URIs surfaced by the agent always
		// use the resolved form.
		const tempDir = realpathSync(mkdtempSync(`${tmpdir()}/ahp-real-diff-`));
		tempDirs.push(tempDir);
		const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
		const runGit = (...args: string[]) => execSync(`git ${args.join(' ')}`, { cwd: tempDir, env, stdio: 'pipe' });
		runGit('init', '-q', '-b', 'main');
		writeFileSync(join(tempDir, 'seed.txt'), 'seed\n');
		runGit('add', '.');
		runGit('commit', '-q', '-m', 'init');

		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'real-sdk-git-diffs', createdSessions, URI.file(tempDir).toString());

		// Approve any `bash` tool call the agent issues. Restricted to bash so
		// the model can't trick the test into running other tools.
		const approvalLoop = startBackgroundApprovalLoop(client, {
			approvalSeqStart: 100,
			allow: [{ toolName: COPILOT_CONFIG.shellToolName }],
		});

		// Ask the agent to use bash to write a specific file. The exact filename
		// is fixed so we can assert on it. The model is instructed to use bash
		// (not a write_file tool) so the edit isn't reported via the SDK's
		// file-edit content events — the diff has to come from git.
		const targetFile = join(tempDir, 'from-bash.txt');
		const shellQuotedTargetFile = `'${targetFile.replace(/'/g, `'\\''`)}'`;
		const prompt = `Use the bash shell tool to run exactly: echo hello > ${shellQuotedTargetFile}\nDo not use any file-write tool. Use only bash.`;
		dispatchTurn(client, sessionUri, 'turn-diff', prompt, 1);

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 150_000);
		await approvalLoop.stop();

		assert.deepStrictEqual(approvalLoop.errors, [],
			`unexpected approval-loop errors: ${approvalLoop.errors.join('; ')}`);

		// Sanity: file was actually written by the agent.
		const files = readdirSync(tempDir);
		assert.ok(files.includes('from-bash.txt'), `agent did not write the requested file. dir contents: ${files.join(', ')}`);

		// Diff recomputation is fired-and-forgotten from the `turnComplete`
		// side-effect handler, so the matching `diffsChanged` may arrive
		// after we observe `turnComplete`. Wait a few seconds for one that
		// carries our target file before falling back to the snapshot.
		const targetUri = URI.file(targetFile).toString();
		const matches = (a: SessionDiffsChangedAction) =>
			a.diffs.some(d => d.after?.uri === targetUri || d.before?.uri === targetUri);

		let saw = client.receivedNotifications(n => isActionNotification(n, 'session/diffsChanged'))
			.some(n => matches(getActionEnvelope(n).action as SessionDiffsChangedAction));
		if (!saw) {
			try {
				await client.waitForNotification(n =>
					isActionNotification(n, 'session/diffsChanged')
					&& matches(getActionEnvelope(n).action as SessionDiffsChangedAction),
					10_000);
				saw = true;
			} catch { /* fall through to snapshot */ }
		}
		if (saw) {
			return;
		}

		// Fall back to the final snapshot.
		const result = await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		const state = result.snapshot.state as SessionState;
		const diffs = state.summary.diffs ?? [];
		const matching = diffs.find(d => d.after?.uri === targetUri || d.before?.uri === targetUri);
		const diffNotifs = client.receivedNotifications(n => isActionNotification(n, 'session/diffsChanged'));
		const liveDiffUris = diffNotifs.flatMap(n => {
			const a = getActionEnvelope(n).action as SessionDiffsChangedAction;
			return a.diffs.map(d => d.after?.uri ?? d.before?.uri);
		});
		assert.ok(matching, `expected git-driven diff for ${targetUri}; tempDir=${tempDir}, workingDirectory=${state.summary.workingDirectory}; live notifications=${diffNotifs.length}, live diff uris=${JSON.stringify(liveDiffUris)}; snapshot diffs=${JSON.stringify(diffs.map(d => d.after?.uri ?? d.before?.uri))}`);
	});
});
