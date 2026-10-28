/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, relative } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
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
import { getToolFileEdits, MessageKind, PendingMessageKind, ResponsePartKind, ROOT_STATE_URI, type ChangesetState, type ChatState, type ISessionFileDiff } from '../../../common/state/sessionState.js';
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
	let releaseResponse: DeferredPromise<void> | undefined;
	// /rename exercises host-local history on Windows without depending on PTY command completion.
	const localCommand = '/rename kept-local-command';

	setup(function () {
		if (!CODEX_SDK_ROOT) {
			this.skip();
		}
		clientSeq = 0;
	});

	teardown(async function () {
		releaseResponse?.complete();
		releaseResponse = undefined;
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

	async function start(initialFiles: Record<string, string>, scenarios: Record<string, readonly string[]>, settings: {
		tool?: 'native' | 'shell';
		pausedScenario?: string;
		cwdSubfolder?: string;
		extraScenarios?: NonNullable<Parameters<typeof startRealServer>[0]['mockScenarios']>;
	} = {}): Promise<void> {
		const { tool = 'native', pausedScenario, extraScenarios = [] } = settings;
		if (pausedScenario) {
			releaseResponse = new DeferredPromise<void>();
		}
		root = await realpath(await mkdtemp(join(tmpdir(), 'codex-turn-diff-')));
		const home = join(root, 'home');
		workspace = join(root, 'workspace', settings.cwdSubfolder ?? '');
		await Promise.all([mkdir(home), mkdir(workspace, { recursive: true })]);
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
			env: { [AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(['-c', 'features.plugins=false', '-c', 'features.unified_exec=true', '-c', 'features.multi_agent=true', '-c', `model_catalog_json=${JSON.stringify(modelCatalog)}`]) },
			mockScenarios: [...Object.entries(scenarios).map(([id, patches]) => ({
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
						{
							kind: 'content', chunks: pausedScenario === id
								? [{ content: 'Waiting for the test.', delayMs: 0 }, { content: 'Done.', delayMs: 0, waitFor: releaseResponse!.p }]
								: [{ content: 'Done.', delayMs: 0 }]
						},
					],
				},
			})), ...extraScenarios],
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
		await waitForTurn(turnId);
		return turnId;
	}

	async function waitForTurn(turnId: string): Promise<void> {
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, 'chat/turnComplete')) {
				return false;
			}
			const envelope = getActionEnvelope(notification);
			return envelope.channel === defaultChatChannel(session) && envelope.action.type === ActionType.ChatTurnComplete && envelope.action.turnId === turnId;
		}, 60_000);
		assert.deepStrictEqual(client.receivedNotifications(notification => isActionNotification(notification, 'chat/error')), []);
	}

	async function beginPausedTurn(scenario: string): Promise<string> {
		const turnId = generateUuid();
		dispatchTurn(client, session, turnId, `[scenario:${scenario}] Apply the patches.`, ++clientSeq);
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.ChatDelta)) {
				return false;
			}
			const { action } = getActionEnvelope(notification);
			return action.type === ActionType.ChatDelta && action.turnId === turnId && action.content.includes('Waiting');
		}, 30_000);
		return turnId;
	}

	async function restart(): Promise<ChatState> {
		client.close();
		await stopServer(server!);
		server = await startRealServer(options);
		await connect();
		await client.call('subscribe', { channel: session });
		const result = await client.call<SubscribeResult>('subscribe', { channel: defaultChatChannel(session) });
		clientSeq = 0;
		return result.snapshot!.state as ChatState;
	}

	/** Observes the real child conversation after its native patch completed and its final response is paused. */
	async function waitForPausedChild(): Promise<void> {
		const added = getActionEnvelope(await client.waitForNotification(notification => isActionNotification(notification, ActionType.SessionChatAdded))).action;
		assert.ok(added.type === ActionType.SessionChatAdded);
		const child = await client.call<SubscribeResult>('subscribe', { channel: added.summary.resource });
		const childState = child.snapshot!.state as ChatState;
		if (!childState.activeTurn?.responseParts.some(part => part.kind === ResponsePartKind.Markdown && part.content.includes('Waiting'))) {
			await client.waitForNotification(notification => {
				if (!isActionNotification(notification, ActionType.ChatDelta)) { return false; }
				const { action } = getActionEnvelope(notification);
				return action.type === ActionType.ChatDelta && action.content.includes('Waiting');
			}, 30_000);
		}
	}

	async function truncate(turnId?: string): Promise<void> {
		await changes();
		client.clearReceived();
		client.dispatch({ channel: defaultChatChannel(session), clientSeq: ++clientSeq, action: { type: ActionType.ChatTruncated, turnId } });
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.ChangesetStatusChanged)) {
				return false;
			}
			const envelope = getActionEnvelope(notification);
			return envelope.channel === buildSessionChangesetUri(session) && envelope.action.type === ActionType.ChangesetStatusChanged && envelope.action.status === 'ready';
		}, 30_000);
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

	async function waitUntil(condition: () => Promise<boolean>): Promise<void> {
		const deadline = Date.now() + 30_000;
		while (!await condition()) {
			if (Date.now() > deadline) {
				throw new Error('Timed out waiting for the condition');
			}
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}

	/** Reads changes once a recompute for snapshots stored after an earlier read has settled. */
	async function settledChanges(turnId: string | undefined, expected: unknown): Promise<unknown> {
		let actual: unknown;
		await waitUntil(async () => {
			actual = await changes(turnId).catch(error => String(error));
			try {
				assert.deepStrictEqual(actual, expected);
				return true;
			} catch {
				return false;
			}
		}).catch(() => undefined);
		return actual;
	}

	/** Holds a turn changeset read open until Codex stops waiting for the turn's snapshots, as the workbench does while a request runs. */
	async function observeUntilSnapshotWaitEnds(turnId: string): Promise<void> {
		const channel = buildTurnChangesetUri(defaultChatChannel(session), turnId);
		let subscribed = await client.call<SubscribeResult>('subscribe', { channel });
		let status = (subscribed.snapshot!.state as ChangesetState).status;
		while (status === 'computing' || status === 'recomputing') {
			const fromSeq = subscribed.snapshot!.fromSeq;
			await client.waitForNotification(notification => isActionNotification(notification, 'changeset/statusChanged')
				&& getActionEnvelope(notification).channel === channel && getActionEnvelope(notification).serverSeq > fromSeq, 60_000);
			subscribed = await client.call<SubscribeResult>('subscribe', { channel });
			status = (subscribed.snapshot!.state as ChangesetState).status;
		}
	}

	/** The agent id a `spawn_agent` call returned, for scripting later collab calls. */
	function spawnedChildId(request: readonly any[]): string {
		for (const item of request) {
			const match = item?.type === 'function_call_output' && /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(typeof item.output === 'string' ? item.output : JSON.stringify(item.output));
			if (match) {
				return match[0];
			}
		}
		throw new Error('The spawn_agent result carries no agent id');
	}
	const waitForChild = { toolNamePattern: /^wait_agent$/, namespace: 'multi_agent_v1', arguments: (request: readonly any[]) => ({ targets: [spawnedChildId(request)], timeout_ms: 60_000 }) };

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

	// This fixture deliberately exercises a Bash heredoc; native patch coverage remains enabled on Windows.
	(isWindows ? test.skip : test)('shell-intercepted patches use the same turn-diff tracking', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-shell': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch'],
		}, { tool: 'shell' });
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

	test('steering splits cumulative edits into independent host checkpoints', async () => {
		await start({ 'edit.txt': 'a\n' }, {
			'codex-diff-steer-first': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-a\n+b\n*** End Patch'],
			'codex-diff-steer-second': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-b\n+c\n*** End Patch'],
		}, { pausedScenario: 'codex-diff-steer-first' });
		const first = await beginPausedTurn('codex-diff-steer-first');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'b\n');
		client.dispatch({
			channel: defaultChatChannel(session), clientSeq: ++clientSeq, action: {
				type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Steering, id: 'steer-edit',
				message: { text: '[scenario:codex-diff-steer-second] Apply the next patch.', origin: { kind: MessageKind.User } },
			}
		});
		await client.waitForNotification(notification => isActionNotification(notification, ActionType.ChatPendingMessageSet));
		releaseResponse!.complete();
		const started = await client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.ChatTurnStarted)) {
				return false;
			}
			const { action } = getActionEnvelope(notification);
			return action.type === ActionType.ChatTurnStarted && action.queuedMessageId === 'steer-edit';
		}, 30_000);
		const action = getActionEnvelope(started).action;
		assert.ok(action.type === ActionType.ChatTurnStarted);
		await waitForTurn(action.turnId);
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'c\n');
		assert.deepStrictEqual({ first: await changes(first), second: await changes(action.turnId) }, {
			first: [{ before: { path: 'edit.txt', content: 'a\n' }, after: { path: 'edit.txt', content: 'b\n' } }],
			second: [{ before: { path: 'edit.txt', content: 'b\n' }, after: { path: 'edit.txt', content: 'c\n' } }],
		});
		await truncate(first);
		assert.deepStrictEqual(await changes(), [{ before: { path: 'edit.txt', content: 'a\n' }, after: { path: 'edit.txt', content: 'b\n' } }]);
		await restart();
		assert.deepStrictEqual(await changes(action.turnId), []);
	});

	test('cancellation exposes the edited checkpoint before native completion is consumed', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-cancel': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch'],
		}, { pausedScenario: 'codex-diff-cancel' });
		const turn = await beginPausedTurn('codex-diff-cancel');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'after\n');
		await changes();
		client.dispatch({ channel: defaultChatChannel(session), clientSeq: ++clientSeq, action: { type: ActionType.ChatTurnCancelled, turnId: turn, duration: 0 } });
		await client.waitForNotification(notification => isActionNotification(notification, ActionType.ChatTurnCancelled));
		const turnChanges = await changes(turn);
		await client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.ChangesetContentChanged)) {
				return false;
			}
			const envelope = getActionEnvelope(notification);
			return envelope.channel === buildSessionChangesetUri(session) && envelope.action.type === ActionType.ChangesetContentChanged && envelope.action.files.length > 0;
		}, 30_000);
		assert.deepStrictEqual({ session: await changes(), turn: turnChanges }, {
			session: [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'after\n' } }],
			turn: [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'after\n' } }],
		});
	});

	test('truncation preserves a retained local command before the first native turn', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-local-boundary': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch'],
		});
		const local = generateUuid();
		dispatchTurn(client, session, local, localCommand, ++clientSeq);
		await waitForTurn(local);
		await runTurn('codex-diff-local-boundary');
		await truncate(local);
		const restored = await restart();
		assert.deepStrictEqual(restored.turns.map(turn => ({ id: turn.id, text: turn.message.text })), [{ id: local, text: localCommand }]);
		assert.deepStrictEqual(restored.turns[0].responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content), ['Renamed: kept-local-command']);
	});

	for (const reloadBeforeTruncation of [false, true]) {
		test(`truncation preserves a retained local command after a native turn (reload first: ${reloadBeforeTruncation})`, async () => {
			await start({ 'edit.txt': 'before\n' }, {
				'codex-diff-before-local': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+middle\n*** End Patch'],
				'codex-diff-after-local': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-middle\n+after\n*** End Patch'],
			});
			await runTurn('codex-diff-before-local');
			const local = generateUuid();
			dispatchTurn(client, session, local, localCommand, ++clientSeq);
			await waitForTurn(local);
			if (reloadBeforeTruncation) {
				const restored = await restart();
				assert.ok(restored.turns.some(turn => turn.id === local), 'the local command survives a reload before any truncation');
			}
			await runTurn('codex-diff-after-local');
			await truncate(local);
			const restored = await restart();
			assert.deepStrictEqual(restored.turns.map(turn => turn.message.text), ['[scenario:codex-diff-before-local] Apply the patches.', localCommand]);
			assert.deepStrictEqual(restored.turns[1].responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content), ['Renamed: kept-local-command']);
			assert.deepStrictEqual(await changes(), [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'middle\n' } }]);
		});
	}

	test('shared parent and child edits retain their checkpoint across cancellation and a replacement send', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-child': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-parent edit\n+child edit\n*** End Patch'],
			'codex-diff-replacement': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-child edit\n+replacement edit\n*** End Patch'],
		}, {
			pausedScenario: 'codex-diff-child',
			extraScenarios: [{
				id: 'codex-diff-spawn', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ kind: 'custom', toolNamePattern: /^apply_patch$/, input: '*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+parent edit\n*** End Patch' }] },
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^spawn_agent$/, namespace: 'multi_agent_v1', arguments: { agent_type: 'default', message: '[scenario:codex-diff-child] Apply the patch.' } }] },
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				},
			}],
		});
		client.clearReceived();
		const parent = generateUuid();
		dispatchTurn(client, session, parent, '[scenario:codex-diff-spawn] Apply the patches.', ++clientSeq);
		await waitForPausedChild();
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'child edit\n');
		client.dispatch({ channel: defaultChatChannel(session), clientSeq: ++clientSeq, action: { type: ActionType.ChatTurnCancelled, turnId: parent, duration: 0 } });
		await client.waitForNotification(notification => isActionNotification(notification, ActionType.ChatTurnCancelled));
		const replacement = await runTurn('codex-diff-replacement');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'replacement edit\n');
		const checkpoint = changes(parent);
		releaseResponse!.complete();
		assert.deepStrictEqual(await checkpoint, [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'child edit\n' } }]);
		assert.deepStrictEqual(await changes(replacement), [{ before: { path: 'edit.txt', content: 'child edit\n' }, after: { path: 'edit.txt', content: 'replacement edit\n' } }]);
		assert.deepStrictEqual(await changes(), [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'replacement edit\n' } }]);
	});

	test('a child editing first supplies the original when its parent edits the same path later', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-child-first': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+child first\n*** End Patch'],
		}, {
			pausedScenario: 'codex-diff-child-first',
			extraScenarios: [{
				id: 'codex-diff-parent-last', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^spawn_agent$/, namespace: 'multi_agent_v1', arguments: { agent_type: 'default', message: '[scenario:codex-diff-child-first] Apply the patch.' } }] },
						{
							kind: 'tool-calls', toolCalls: [{
								toolNamePattern: /^exec_command$/, arguments: {
									cmd: `node -e "const fs=require('fs');const timer=setInterval(()=>{if(fs.readFileSync('edit.txt','utf8').trim()==='child first'){clearInterval(timer);process.exit(0);}},10);setTimeout(()=>process.exit(1),10000)"`, login: false,
								}
							}]
						},
						{ kind: 'tool-calls', toolCalls: [{ kind: 'custom', toolNamePattern: /^apply_patch$/, input: '*** Begin Patch\n*** Update File: edit.txt\n@@\n-child first\n+parent last\n*** End Patch' }] },
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				}
			}],
		});
		const parent = await runTurn('codex-diff-parent-last');
		await waitForPausedChild();
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'parent last\n');
		const checkpoint = changes(parent);
		releaseResponse!.complete();
		assert.deepStrictEqual(await checkpoint, [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'parent last\n' } }]);
	});

	test('a turn observed while it runs past the snapshot wait keeps its edits', async function () {
		this.timeout(180_000);
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-long-turn': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch'],
		}, { pausedScenario: 'codex-diff-long-turn' });
		const turn = await beginPausedTurn('codex-diff-long-turn');
		await observeUntilSnapshotWaitEnds(turn);
		releaseResponse!.complete();
		await waitForTurn(turn);
		const edit = [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'after\n' } }];
		assert.deepStrictEqual({ turn: await settledChanges(turn, edit), session: await settledChanges(undefined, edit) }, { turn: edit, session: edit });
	});

	test('a steered native turn running past the snapshot wait keeps both host turns\' edits', async function () {
		this.timeout(180_000);
		const releaseSecond = new DeferredPromise<void>();
		await start({ 'edit.txt': 'a\n' }, {}, {
			extraScenarios: [{
				id: 'codex-diff-steer-long-first', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ kind: 'custom', toolNamePattern: /^apply_patch$/, input: '*** Begin Patch\n*** Update File: edit.txt\n@@\n-a\n+b\n*** End Patch' }] },
						// The native turn waits here until the steering message was sent, so it cannot end before Codex receives it.
						{
							kind: 'tool-calls', toolCalls: [{
								toolNamePattern: /^exec_command$/, arguments: () => ({
									cmd: `node -e "const fs=require('fs');const timer=setInterval(()=>{if(fs.existsSync('../steered')){clearInterval(timer);process.exit(0);}},50);setTimeout(()=>process.exit(1),30000)"`,
									workdir: workspace, login: false, yield_time_ms: 30_000,
								}),
							}]
						},
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				},
			}, {
				id: 'codex-diff-steer-long-second', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ kind: 'custom', toolNamePattern: /^apply_patch$/, input: '*** Begin Patch\n*** Update File: edit.txt\n@@\n-b\n+c\n*** End Patch' }] },
						{ kind: 'content', chunks: [{ content: 'Still working.', delayMs: 0 }, { content: 'Done.', delayMs: 0, waitFor: releaseSecond.p }] },
					]
				},
			}],
		});
		try {
			const first = generateUuid();
			dispatchTurn(client, session, first, '[scenario:codex-diff-steer-long-first] Apply the patches.', ++clientSeq);
			// The host handled the native turn's start before its patch completed, so the steering message goes straight to Codex.
			await client.waitForNotification(notification => {
				if (!isActionNotification(notification, ActionType.ChatToolCallComplete)) {
					return false;
				}
				const { action } = getActionEnvelope(notification);
				return action.type === ActionType.ChatToolCallComplete && action.turnId === first;
			}, 30_000);
			client.dispatch({
				channel: defaultChatChannel(session), clientSeq: ++clientSeq, action: {
					type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Steering, id: 'steer-long',
					message: { text: '[scenario:codex-diff-steer-long-second] Apply the next patch.', origin: { kind: MessageKind.User } },
				}
			});
			await client.waitForNotification(notification => isActionNotification(notification, ActionType.ChatPendingMessageSet));
			await writeFile(join(root!, 'steered'), '');
			const started = getActionEnvelope(await client.waitForNotification(notification => {
				if (!isActionNotification(notification, ActionType.ChatTurnStarted)) {
					return false;
				}
				const { action } = getActionEnvelope(notification);
				return action.type === ActionType.ChatTurnStarted && action.queuedMessageId === 'steer-long';
			}, 30_000)).action;
			assert.ok(started.type === ActionType.ChatTurnStarted);
			const second = started.turnId;
			await client.waitForNotification(notification => {
				if (!isActionNotification(notification, ActionType.ChatDelta)) {
					return false;
				}
				const { action } = getActionEnvelope(notification);
				return action.type === ActionType.ChatDelta && action.turnId === second && action.content.includes('Still working');
			}, 30_000);
			// The first host turn has ended while its native turn keeps working for the steering message.
			await observeUntilSnapshotWaitEnds(first);
			releaseSecond.complete();
			await waitForTurn(second);
			const expected = {
				first: [{ before: { path: 'edit.txt', content: 'a\n' }, after: { path: 'edit.txt', content: 'b\n' } }],
				second: [{ before: { path: 'edit.txt', content: 'b\n' }, after: { path: 'edit.txt', content: 'c\n' } }],
				session: [{ before: { path: 'edit.txt', content: 'a\n' }, after: { path: 'edit.txt', content: 'c\n' } }],
			};
			assert.deepStrictEqual({
				first: await settledChanges(first, expected.first),
				second: await settledChanges(second, expected.second),
				session: await settledChanges(undefined, expected.session),
			}, expected);
		} finally {
			releaseSecond.complete();
		}
	});

	test('a child reused through send_input records its later edits in the turn that resumed it', async () => {
		await start({ 'edit.txt': 'a\n' }, {
			'codex-diff-reused-first': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-a\n+b\n*** End Patch'],
			'codex-diff-reused-second': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-b\n+c\n*** End Patch'],
		}, {
			extraScenarios: [{
				id: 'codex-diff-reuse-spawn', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^spawn_agent$/, namespace: 'multi_agent_v1', arguments: { agent_type: 'default', message: '[scenario:codex-diff-reused-first] Apply the patch.' } }] },
						{ kind: 'tool-calls', toolCalls: [waitForChild] },
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				},
			}, {
				id: 'codex-diff-reuse-send', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^send_input$/, namespace: 'multi_agent_v1', arguments: (request: readonly any[]) => ({ target: spawnedChildId(request), message: '[scenario:codex-diff-reused-second] Apply the next patch.' }) }] },
						{ kind: 'tool-calls', toolCalls: [waitForChild] },
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				},
			}],
		});
		const first = await runTurn('codex-diff-reuse-spawn');
		const second = await runTurn('codex-diff-reuse-send');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'c\n');
		assert.deepStrictEqual({ first: await changes(first), second: await changes(second), session: await changes() }, {
			first: [{ before: { path: 'edit.txt', content: 'a\n' }, after: { path: 'edit.txt', content: 'b\n' } }],
			second: [{ before: { path: 'edit.txt', content: 'b\n' }, after: { path: 'edit.txt', content: 'c\n' } }],
			session: [{ before: { path: 'edit.txt', content: 'a\n' }, after: { path: 'edit.txt', content: 'c\n' } }],
		});
	});

	test('a child that finishes before its parent edits the same file keeps its edit in the turn', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-delegated': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+child edit\n*** End Patch'],
		}, {
			extraScenarios: [{
				id: 'codex-diff-delegate', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^spawn_agent$/, namespace: 'multi_agent_v1', arguments: { agent_type: 'default', message: '[scenario:codex-diff-delegated] Apply the patch.' } }] },
						{ kind: 'tool-calls', toolCalls: [waitForChild] },
						{ kind: 'tool-calls', toolCalls: [{ kind: 'custom', toolNamePattern: /^apply_patch$/, input: '*** Begin Patch\n*** Update File: edit.txt\n@@\n-child edit\n+parent edit\n*** End Patch' }] },
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				},
			}],
		});
		const turn = await runTurn('codex-diff-delegate');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'parent edit\n');
		const edit = [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'parent edit\n' } }];
		assert.deepStrictEqual({ turn: await changes(turn), session: await changes() }, { turn: edit, session: edit });
	});

	test('a child completing after truncation removed its turn does not bring the turn back', async () => {
		const disk = () => readFile(join(workspace, 'edit.txt'), 'utf8');
		await start({ 'edit.txt': 'a\n' }, {}, {
			extraScenarios: [{
				id: 'codex-diff-detached-child', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ kind: 'custom', toolNamePattern: /^apply_patch$/, input: '*** Begin Patch\n*** Update File: edit.txt\n@@\n-a\n+b\n*** End Patch' }] },
						{
							kind: 'tool-calls', toolCalls: [{
								toolNamePattern: /^exec_command$/, arguments: () => ({
									cmd: `node -e "const fs=require('fs');const timer=setInterval(()=>{if(fs.existsSync('../release')){clearInterval(timer);process.exit(0);}},50);setTimeout(()=>process.exit(1),30000)"`,
									workdir: workspace, login: false, yield_time_ms: 30_000,
								}),
							}]
						},
						{ kind: 'tool-calls', toolCalls: [{ kind: 'custom', toolNamePattern: /^apply_patch$/, input: '*** Begin Patch\n*** Update File: edit.txt\n@@\n-b\n+c\n*** End Patch' }] },
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				},
			}, {
				id: 'codex-diff-detached-parent', definition: {
					type: 'multi-turn', turns: [
						{ kind: 'tool-calls', toolCalls: [{ toolNamePattern: /^spawn_agent$/, namespace: 'multi_agent_v1', arguments: { agent_type: 'default', message: '[scenario:codex-diff-detached-child] Apply the patches.' } }] },
						{ kind: 'content', chunks: [{ content: 'Done.', delayMs: 0 }] },
					]
				},
			}],
		});
		await runTurn('codex-diff-detached-parent');
		await waitUntil(async () => await disk() === 'b\n');
		// Start Over removes the turn whose child is still running.
		await truncate();
		await writeFile(join(root!, 'release'), '');
		await waitUntil(async () => await disk() === 'c\n');
		// Give the child's snapshots time to be stored, if they were.
		await new Promise(resolve => setTimeout(resolve, 3000));
		assert.deepStrictEqual(await changes(), []);
	});

	test('a working directory below the repository root preserves native display paths', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-subfolder': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+after\n*** End Patch'],
		}, { cwdSubfolder: 'nested' });
		await promisify(execFile)('git', ['init', join(root!, 'workspace')]);
		const turn = await runTurn('codex-diff-subfolder');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'after\n');
		assert.deepStrictEqual(await changes(turn), [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'after\n' } }]);
	});

	test('partial truncation after restart removes discarded native snapshots', async () => {
		await start({ 'edit.txt': 'before\n' }, {
			'codex-diff-partial-first': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-before\n+middle\n*** End Patch'],
			'codex-diff-partial-second': ['*** Begin Patch\n*** Update File: edit.txt\n@@\n-middle\n+after\n*** End Patch'],
		});
		await runTurn('codex-diff-partial-first');
		await runTurn('codex-diff-partial-second');
		assert.strictEqual(await readFile(join(workspace, 'edit.txt'), 'utf8'), 'after\n');
		const restored = await restart();
		assert.strictEqual(restored.turns.length, 2);
		await truncate(restored.turns[0].id);
		assert.deepStrictEqual(await changes(), [{ before: { path: 'edit.txt', content: 'before\n' }, after: { path: 'edit.txt', content: 'middle\n' } }]);
	});
});
