/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real-SDK integration test for the git-driven session diff path.
 *
 * Disabled by default. Run with:
 *
 *   AGENT_HOST_REAL_SDK=1 ./scripts/test-integration.sh \
 *     --run src/vs/platform/agentHost/test/node/protocol/sessionDiffsRealSdk.integrationTest.ts
 *
 * Authentication: token from `gh auth token` (or `GITHUB_TOKEN`).
 *
 * SAFETY: Working directory is always a freshly-`git init`-ed temp folder
 * scoped to a single test, removed in teardown.
 */

import assert from 'assert';
import * as cp from 'child_process';
import { execSync } from 'child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/sessionCapabilities.js';
import type { INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import type { SessionState } from '../../../common/state/sessionState.js';
import type { SessionAddedNotification, SessionDiffsChangedAction, SessionToolCallReadyAction } from '../../../common/state/sessionActions.js';
import {
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	startRealServer,
	TestProtocolClient,
} from './testHelpers.js';

const REAL_SDK_ENABLED = process.env['AGENT_HOST_REAL_SDK'] === '1';

const hasGit = (() => {
	try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

function resolveGitHubToken(): string {
	const envToken = process.env['GITHUB_TOKEN'];
	if (envToken) {
		return envToken;
	}
	return execSync('gh auth token', { encoding: 'utf-8' }).trim();
}

(REAL_SDK_ENABLED && hasGit ? suite : suite.skip)('Protocol WebSocket — Real Copilot SDK git-driven diffs', function () {

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
			try { await client.call('disposeSession', { session }, 5000); } catch { /* best-effort */ }
		}
		createdSessions.length = 0;
		client.close();
		for (const dir of tempDirs) {
			rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.length = 0;
	});

	test('terminal-driven file edit shows up in summary.diffs (no ToolResultFileEditContent emitted)', async function () {
		this.timeout(180_000);

		// Initialize a tmp git repo as the working directory.
		const tempDir = mkdtempSync(`${tmpdir()}/ahp-real-diff-`);
		tempDirs.push(tempDir);
		const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
		const runGit = (...args: string[]) => execSync(`git ${args.join(' ')}`, { cwd: tempDir, env, stdio: 'pipe' });
		runGit('init', '-q', '-b', 'main');
		writeFileSync(join(tempDir, 'seed.txt'), 'seed\n');
		runGit('add', '.');
		runGit('commit', '-q', '-m', 'init');

		const workingDirUri = URI.file(tempDir).toString();

		await client.call('initialize', { protocolVersion: PROTOCOL_VERSION, clientId: 'real-sdk-git-diffs' }, 30_000);
		await client.call('authenticate', { resource: 'https://api.github.com', token: resolveGitHubToken() }, 30_000);

		const sessionUri = URI.from({ scheme: 'copilotcli', path: `/real-diff-${Date.now()}` }).toString();
		await client.call('createSession', { session: sessionUri, provider: 'copilotcli', workingDirectory: workingDirUri }, 30_000);

		const addedNotif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded',
			15_000,
		);
		const realSessionUri = ((addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;
		createdSessions.push(realSessionUri);

		await client.call<SubscribeResult>('subscribe', { resource: realSessionUri });
		client.clearReceived();

		// Approve any tool call the agent issues. Restricted to `bash`-style
		// shell tools so the model can't trick the test into running arbitrary
		// other tools.
		let approvalSeq = 1;
		const approve = (action: SessionToolCallReadyAction & { session: string; turnId: string }) => {
			client.notify('dispatchAction', {
				clientSeq: ++approvalSeq,
				action: {
					type: 'session/toolCallConfirmed',
					session: action.session,
					turnId: action.turnId,
					toolCallId: action.toolCallId,
					approved: true,
				},
			});
		};
		const seenSeqs = new Set<number>();
		let approverActive = true;
		const approverLoop = (async () => {
			while (approverActive) {
				try {
					const ready = await client.waitForNotification(n => isActionNotification(n, 'session/toolCallReady') && !seenSeqs.has(getActionEnvelope(n).serverSeq), 2_000);
					const env = getActionEnvelope(ready);
					seenSeqs.add(env.serverSeq);
					approve(env.action as SessionToolCallReadyAction & { session: string; turnId: string });
				} catch { /* timeout — keep polling */ }
			}
		})();

		// Ask the agent to use bash to write a specific file. The exact filename
		// is fixed so we can assert on it. The model is instructed to use bash
		// (not a write_file tool) so the edit isn't reported via the SDK's
		// file-edit content events — the diff has to come from git.
		const targetFile = join(tempDir, 'from-bash.txt');
		// Quote/escape targetFile for the shell so paths containing spaces or
		// shell metacharacters don't break the test.
		const shellQuotedTargetFile = `'${targetFile.replace(/'/g, `'\\''`)}'`;
		const prompt = `Use the bash shell tool to run exactly: echo hello > ${shellQuotedTargetFile}\nDo not use any file-write tool. Use only bash.`;
		client.notify('dispatchAction', {
			clientSeq: 1,
			action: { type: 'session/turnStarted', session: realSessionUri, turnId: 'turn-diff', userMessage: { text: prompt } },
		});

		await client.waitForNotification(n => isActionNotification(n, 'session/turnComplete'), 150_000);
		approverActive = false;
		await approverLoop;

		// Sanity: file was actually written by the agent.
		const files = readdirSync(tempDir);
		assert.ok(files.includes('from-bash.txt'), `agent did not write the requested file. dir contents: ${files.join(', ')}`);

		// The diff broadcast may have already arrived during the turn — accept
		// any matching one received during the run, or look at the final state.
		const targetUri = URI.file(targetFile).toString();
		const diffNotifs = client.receivedNotifications(n => isActionNotification(n, 'session/diffsChanged'));
		const sawInLive = diffNotifs.some(n => {
			const a = getActionEnvelope(n).action as SessionDiffsChangedAction;
			return a.diffs.some(d => d.after?.uri === targetUri || d.before?.uri === targetUri);
		});

		if (!sawInLive) {
			// Fall back to the final snapshot.
			const result = await client.call<SubscribeResult>('subscribe', { resource: realSessionUri });
			const state = result.snapshot.state as SessionState;
			const diffs = state.summary.diffs ?? [];
			const matching = diffs.find(d => d.after?.uri === targetUri || d.before?.uri === targetUri);
			assert.ok(matching, `expected git-driven diff for ${targetUri}; live notifications=${diffNotifs.length}; snapshot diffs=${JSON.stringify(diffs.map(d => d.after?.uri ?? d.before?.uri))}`);
		}
	});
});
