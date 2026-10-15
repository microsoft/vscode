/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostCodexAgentBinaryArgsEnvVar } from '../../../common/agentService.js';
import { buildTurnChangesetUri } from '../../../common/changesetUri.js';
import { CodexSessionConfigKey } from '../../../common/codexSessionConfigKeys.js';
import { ContentEncoding } from '../../../common/state/protocol/common/commands.js';
import type { ResourceReadResult, SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI, type ChangesetState } from '../../../common/state/sessionState.js';
import { CODEX_SDK_ROOT } from '../e2e/providers/codexTestConfiguration.js';
import { dispatchTurn } from '../providerIntegrationTestHelpers.js';
import { defaultChatChannel, getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient, type IServerHandle } from '../serverIntegrationTestHelpers.js';

suite('Agent Host Provider Integration — Codex Edit Tracking', function () {
	this.timeout(120_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	let root: string | undefined;
	let server: IServerHandle | undefined;
	let client: TestProtocolClient | undefined;

	async function assertTurnChanges(client: TestProtocolClient, chat: string, turnId: string, expected: { before: string; after: string }): Promise<void> {
		const channel = buildTurnChangesetUri(chat, turnId);
		let subscribed = await client.call<SubscribeResult>('subscribe', { channel });
		let state = subscribed.snapshot!.state as ChangesetState;
		while (state.status === 'computing' || state.status === 'recomputing') {
			const fromSeq = subscribed.snapshot!.fromSeq;
			await client.waitForNotification(notification =>
				isActionNotification(notification, 'changeset/statusChanged')
				&& getActionEnvelope(notification).channel === channel
				&& getActionEnvelope(notification).serverSeq > fromSeq, 30_000);
			subscribed = await client.call<SubscribeResult>('subscribe', { channel });
			state = subscribed.snapshot!.state as ChangesetState;
		}
		assert.strictEqual(state.files.length, 1, 'the last-turn changeset must contain the patched file');
		const edit = state.files[0].edit;
		assert.ok(edit.before && edit.after);
		const [before, after] = await Promise.all([edit.before, edit.after].map(side =>
			client.call<ResourceReadResult>('resourceRead', { channel: ROOT_STATE_URI, uri: side.content.uri, encoding: ContentEncoding.Utf8 })));
		assert.deepStrictEqual({ before: before.data, after: after.data }, expected);
	}

	teardown(async () => {
		client?.close();
		client = undefined;
		try {
			if (server) {
				await stopServer(server);
				server = undefined;
			}
		} finally {
			if (root) {
				await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
				root = undefined;
			}
		}
	});

	test('a shell-intercepted apply_patch populates the last-turn changeset', async function () {
		if (!CODEX_SDK_ROOT) {
			this.skip();
		}
		root = await realpath(await mkdtemp(join(tmpdir(), 'codex-edit-tracking-')));
		const home = join(root, 'home');
		const workspace = join(root, 'workspace');
		await Promise.all([mkdir(home), mkdir(workspace)]);
		await writeFile(join(workspace, 'edit.txt'), 'before\n');
		const patch = '*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch';
		const scenario = 'codex-shell-patch';
		const options = {
			homeDir: home, userDataDir: join(root, 'data'), codexSdkRoot: CODEX_SDK_ROOT, mockLlm: true,
			env: { [AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(['-c', 'features.plugins=false', '-c', 'features.unified_exec=true']) },
			mockScenarios: [{
				id: scenario,
				definition: {
					type: 'multi-turn',
					turns: [{
						kind: 'tool-calls',
						toolCalls: [{ toolNamePattern: /^exec_command$/, arguments: { cmd: `apply_patch <<'PATCH'\n${patch}\nPATCH`, workdir: workspace, login: false } }],
					}, { kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] }],
				},
			}],
		};
		server = await startRealServer(options);
		client = new TestProtocolClient(server.port);
		await client.connect();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: scenario }, 30_000);
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
		const session = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
		await client.call('createSession', {
			channel: session, provider: 'codex', workingDirectories: [URI.file(workspace).toString()],
			config: { isolation: 'folder', [CodexSessionConfigKey.PermissionsPreset]: 'full-access' },
			activeClient: { clientId: scenario, tools: [], customizations: [] },
		}, 30_000);
		await client.call('subscribe', { channel: session });
		const chat = defaultChatChannel(session);
		await client.call('subscribe', { channel: chat });
		const turnId = 'shell-patch-turn';
		dispatchTurn(client, session, turnId, `[scenario:${scenario}] Apply the test patch.`, 1);
		await client.waitForNotification(notification =>
			isActionNotification(notification, 'chat/turnComplete') && getActionEnvelope(notification).channel === chat, 60_000);
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'after\n', 'the real patch must execute');
		await assertTurnChanges(client, chat, turnId, { before: 'before\n', after: 'after\n' });

		client.close();
		await stopServer(server);
		server = await startRealServer({
			...options,
			mockScenarios: [{
				id: scenario,
				definition: {
					type: 'multi-turn',
					turns: [{
						kind: 'tool-calls',
						toolCalls: [{ toolNamePattern: /^exec_command$/, arguments: { cmd: `apply_patch <<'PATCH'\n${patch.replace('-before\n+after', '-after\n+restored')}\nPATCH`, workdir: workspace, login: false } }],
					}, { kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] }],
				},
			}],
		});
		client = new TestProtocolClient(server.port);
		await client.connect();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: scenario }, 30_000);
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
		await client.call('subscribe', { channel: session });
		await client.call('subscribe', { channel: chat });
		dispatchTurn(client, session, 'restored-turn', `[scenario:${scenario}] Apply the second test patch.`, 1);
		await client.waitForNotification(notification =>
			isActionNotification(notification, 'chat/turnComplete') && getActionEnvelope(notification).channel === chat, 60_000);
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'restored\n', 'the restored native thread must execute the second patch');
		await assertTurnChanges(client, chat, 'restored-turn', { before: 'after\n', after: 'restored\n' });
	});
});
