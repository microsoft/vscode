/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, relative } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostCodexAgentBinaryArgsEnvVar } from '../../../common/agentService.js';
import { buildSessionChangesetUri, buildTurnChangesetUri } from '../../../common/changesetUri.js';
import { CodexSessionConfigKey } from '../../../common/codexSessionConfigKeys.js';
import { ContentEncoding } from '../../../common/state/protocol/common/commands.js';
import type { ResourceReadResult, SubscribeResult } from '../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { getToolFileEdits, ROOT_STATE_URI, type ChangesetState, type ISessionFileDiff } from '../../../common/state/sessionState.js';
import { CODEX_SDK_ROOT } from '../e2e/providers/codexTestConfiguration.js';
import { preserveAgentHostE2ELogs } from '../e2e/harness/agentHostE2EDiagnostics.js';
import { dispatchTurn } from '../providerIntegrationTestHelpers.js';
import { defaultChatChannel, getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient, type IServerHandle } from '../serverIntegrationTestHelpers.js';

suite('Agent Host Provider Integration — Codex Turn Diffs', function () {
	this.timeout(120_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	let root: string | undefined;
	let workspace: string;
	let server: IServerHandle | undefined;
	let client: TestProtocolClient;
	let session: string;
	let options: Parameters<typeof startRealServer>[0];
	let clientSeq: number;

	setup(function () {
		if (!CODEX_SDK_ROOT) {
			this.skip();
		}
		clientSeq = 0;
	});

	teardown(async function () {
		if (root && this.currentTest?.state === 'failed') {
			const destination = join(process.cwd(), '.build', 'logs', 'integration-tests', `codex-turn-diff-${process.pid}`);
			preserveAgentHostE2ELogs(join(root, 'data'), join(root, 'home'), destination, this.currentTest.fullTitle());
			await mkdir(destination, { recursive: true });
			await writeFile(join(destination, 'protocol.json'), JSON.stringify(client?.receivedNotifications(), null, 2));
			await writeFile(join(destination, 'model.log'), server?.mockLlm?.logMessages.join('\n') ?? '');
		}
		client?.close();
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

	async function connect(): Promise<void> {
		client = new TestProtocolClient(server!.port);
		await client.connect();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'codex-turn-diff' }, 30_000);
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: 'not-a-real-token' }, 30_000);
	}

	async function start(initialFiles: Record<string, string>, scenarios: Record<string, readonly string[]>, tool: 'native' | 'shell' = 'native'): Promise<void> {
		root = await realpath(await mkdtemp(join(tmpdir(), 'codex-turn-diff-')));
		const home = join(root, 'home');
		workspace = join(root, 'workspace');
		await Promise.all([mkdir(home), mkdir(workspace)]);
		await Promise.all(Object.entries(initialFiles).map(([name, contents]) => writeFile(join(workspace, name), contents)));
		// Give the synthetic model native patch support independently of Codex's bundled model catalog.
		const modelCatalog = join(root, 'models.json');
		await writeFile(modelCatalog, JSON.stringify({
			models: [{
				slug: 'gpt-5.3-codex', display_name: 'Mock Codex', supported_reasoning_levels: [],
				shell_type: 'unified_exec', visibility: 'list', supported_in_api: true, priority: 0,
				support_verbosity: false, apply_patch_tool_type: 'freeform',
				base_instructions: 'Apply the requested patches.',
				truncation_policy: { mode: 'bytes', limit: 10000 }, experimental_supported_tools: [],
			}]
		}));
		options = {
			homeDir: home, userDataDir: join(root, 'data'), codexSdkRoot: CODEX_SDK_ROOT, mockLlm: true,
			env: { [AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(['-c', 'features.plugins=false', '-c', 'features.unified_exec=true', '-c', `model_catalog_json=${JSON.stringify(modelCatalog)}`]) },
			mockScenarios: Object.entries(scenarios).map(([id, patches]) => ({
				id,
				definition: {
					type: 'multi-turn',
					turns: [
						...patches.map(patch => ({
							kind: 'tool-calls',
							toolCalls: [tool === 'native'
								? { kind: 'custom', toolNamePattern: /^apply_patch$/, input: patch }
								: { toolNamePattern: /^exec_command$/, arguments: { cmd: `apply_patch <<'PATCH'\n${patch}\nPATCH\n`, workdir: workspace, login: false } }],
						})),
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					],
				},
			})),
		};
		server = await startRealServer(options);
		await connect();
		session = URI.from({ scheme: 'codex', path: `/${generateUuid()}` }).toString();
		await client.call('createSession', {
			channel: session, provider: 'codex', workingDirectories: [URI.file(workspace).toString()],
			config: { isolation: 'folder', [CodexSessionConfigKey.PermissionsPreset]: 'full-access' },
			activeClient: { clientId: 'codex-turn-diff', tools: [], customizations: [] },
		}, 30_000);
		await client.call('subscribe', { channel: session });
		await client.call('subscribe', { channel: defaultChatChannel(session) });
	}

	async function runTurn(scenario: string): Promise<string> {
		client.clearReceived();
		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, `[scenario:${scenario}] Apply the patches.`, ++clientSeq);
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, 'chat/turnComplete')) {
				return false;
			}
			const envelope = getActionEnvelope(notification);
			return envelope.channel === defaultChatChannel(session) && envelope.action.type === ActionType.ChatTurnComplete && envelope.action.turnId === turnId;
		}, 60_000);
		assert.deepStrictEqual(client.receivedNotifications(notification => isActionNotification(notification, 'chat/error')), []);
		return turnId;
	}

	async function changes(turnId?: string) {
		const channel = turnId === undefined ? buildSessionChangesetUri(session) : buildTurnChangesetUri(defaultChatChannel(session), turnId);
		let subscribed = await client.call<SubscribeResult>('subscribe', { channel });
		let state = subscribed.snapshot!.state as ChangesetState;
		while (state.status === 'computing' || state.status === 'recomputing') {
			const fromSeq = subscribed.snapshot!.fromSeq;
			await client.waitForNotification(notification => isActionNotification(notification, 'changeset/statusChanged')
				&& getActionEnvelope(notification).channel === channel && getActionEnvelope(notification).serverSeq > fromSeq, 30_000);
			subscribed = await client.call<SubscribeResult>('subscribe', { channel });
			state = subscribed.snapshot!.state as ChangesetState;
		}
		assert.strictEqual(state.status, 'ready');
		const read = async (side: NonNullable<ISessionFileDiff['before']>) => {
			const result = await client.call<ResourceReadResult>('resourceRead', { channel: ROOT_STATE_URI, uri: side.content.uri, encoding: ContentEncoding.Utf8 });
			return { path: relative(workspace, URI.parse(side.uri).fsPath), content: result.data };
		};
		const files = await Promise.all(state.files.map(async ({ edit }) => ({
			before: edit.before && await read(edit.before),
			after: edit.after && await read(edit.after),
		})));
		return files.sort((a, b) => (a.after?.path ?? a.before!.path).localeCompare(b.after?.path ?? b.before!.path));
	}

	test('native patches retain the cumulative turn diff across later turns and a host restart', async () => {
		await start({ 'edit.txt': 'before\n', 'untouched.txt': 'unrelated\n' }, {
			'codex-diff-first': [
				'*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+middle\n*** Add File: transient.txt\n+temporary\n*** End Patch',
				'*** Begin Patch\n*** Update File: edit.txt\n@@\n-middle\n+after\n*** Delete File: transient.txt\n*** End Patch',
			],
			'codex-diff-second': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-after\n+restored\n*** End Patch'],
		});
		const first = await runTurn('codex-diff-first');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'after\n');
		const expectedFirst = [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'after\n' } }];
		assert.deepStrictEqual(await changes(first), expectedFirst);
		const toolEdits = client.receivedNotifications(notification => isActionNotification(notification, 'chat/toolCallComplete')).flatMap(notification => {
			const action = getActionEnvelope(notification).action;
			return action.type === ActionType.ChatToolCallComplete ? getToolFileEdits(action.result) : [];
		});
		assert.deepStrictEqual(toolEdits, [], 'turn tracking must not create synthetic edit-tool pills');

		client.close();
		await stopServer(server!);
		server = await startRealServer(options);
		await connect();
		await client.call('subscribe', { channel: session });
		await client.call('subscribe', { channel: defaultChatChannel(session) });
		clientSeq = 0;
		const second = await runTurn('codex-diff-second');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'restored\n');
		assert.deepStrictEqual({ first: await changes(first), second: await changes(second) }, {
			first: expectedFirst,
			second: [{ before: { path: 'edit.txt', content: 'after\n' }, after: { path: 'edit.txt', content: 'restored\n' } }],
		});
	});

	test('a move over an existing destination retains both original files', async () => {
		await start({ 'a.txt': 'apple\n', 'b.txt': 'banana\n' }, {
			'codex-diff-overwrite': ['*** Begin Patch\n*** Update File: a.txt\n*** Move to: b.txt\n@@\n-apple\n+pear\n*** End Patch'],
		});
		const turn = await runTurn('codex-diff-overwrite');
		assert.deepStrictEqual({ files: (await readdir(workspace)).filter(name => name.endsWith('.txt')).sort(), destination: await readFile(join(workspace, 'b.txt'), 'utf8') }, { files: ['b.txt'], destination: 'pear\n' });
		assert.deepStrictEqual(await changes(turn), [
			{ before: { path: 'a.txt', content: 'apple\n' }, after: undefined },
			{ before: { path: 'b.txt', content: 'banana\n' }, after: { path: 'b.txt', content: 'pear\n' } },
		]);
	});

	test('a move that recreates an earlier source tracks every physical path', async () => {
		await start({ 'a.txt': 'apple\n', 'c.txt': 'cherry\n' }, {
			'codex-diff-recreate': ['*** Begin Patch\n*** Update File: a.txt\n*** Move to: b.txt\n@@\n-apple\n+pear\n*** Update File: c.txt\n*** Move to: a.txt\n@@\n-cherry\n+replacement\n*** End Patch'],
		});
		const turn = await runTurn('codex-diff-recreate');
		assert.deepStrictEqual({ files: (await readdir(workspace)).filter(name => name.endsWith('.txt')).sort(), a: await readFile(join(workspace, 'a.txt'), 'utf8'), b: await readFile(join(workspace, 'b.txt'), 'utf8') }, { files: ['a.txt', 'b.txt'], a: 'replacement\n', b: 'pear\n' });
		assert.deepStrictEqual(await changes(turn), [
			{ before: { path: 'a.txt', content: 'apple\n' }, after: { path: 'a.txt', content: 'replacement\n' } },
			{ before: undefined, after: { path: 'b.txt', content: 'pear\n' } },
			{ before: { path: 'c.txt', content: 'cherry\n' }, after: undefined },
		]);
	});

	test('shell-intercepted patches use the same turn-diff tracking', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-shell': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch'],
		}, 'shell');
		const turn = await runTurn('codex-diff-shell');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'after\n');
		assert.deepStrictEqual(await changes(turn), [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'after\n' } }]);
	});

	test('reverting every edit leaves an empty turn changeset', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-revert': [
				'*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch',
				'*** Begin Patch\n*** Update File: edit.txt\n@@\n-after\n+before\n*** End Patch',
			],
		});
		const turn = await runTurn('codex-diff-revert');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'before\n');
		assert.deepStrictEqual(await changes(turn), []);
	});

	test('truncating a chat removes its persisted turn and session diffs', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-truncate': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch'],
		});
		const turn = await runTurn('codex-diff-truncate');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'after\n');
		assert.deepStrictEqual(await changes(), [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'after\n' } }]);
		client.clearReceived();
		client.dispatch({ channel: defaultChatChannel(session), clientSeq: ++clientSeq, action: { type: ActionType.ChatTruncated, turnId: undefined } });
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, 'changeset/statusChanged')) {
				return false;
			}
			const envelope = getActionEnvelope(notification);
			return envelope.channel === buildSessionChangesetUri(session) && envelope.action.type === ActionType.ChangesetStatusChanged && envelope.action.status === 'ready';
		}, 30_000);
		assert.deepStrictEqual({ session: await changes(), turn: await changes(turn) }, { session: [], turn: [] });
	});
});
