/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentCreateSessionConfig, IAgentModelInfo, IAgentSessionMetadata } from '../../common/agentService.js';
import { SessionStatus } from '../../common/state/protocol/channels-session/state.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, TurnState, withSessionGitState, withSessionGitHubState, type ResponsePart, type ToolCallState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import {
	applyCreateChatTool,
	applyDeleteSessionTool,
	applySendMessageTool,
	createChatToolName,
	createSessionServerToolGroup,
	createSessionToolName,
	deleteSessionToolName,
	getCreateChatArgs,
	getCreateSessionArgs,
	getCurrentSessionToolName,
	getDeleteSessionArgs,
	getSendMessageArgs,
	getSessionContextArgs,
	serializeSessionContext,
	getSessionContextToolName,
	filterSessions,
	getListSessionsArgs,
	listSessionsToolName,
	sendMessageToolName,
	sessionServerToolDefinitions,
	sessionToolRequiresConfirmation,
	serializeSessions,
	type IChatContextSnapshot,
	type ISessionServerToolAccessor,
} from '../../node/shared/sessionServerTools.js';

suite('SessionServerTools', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const workspace = URI.parse('file:///workspace/app');
	const model: IAgentModelInfo = { provider: 'copilot', id: 'gpt-4o', name: 'GPT-4o', supportsVision: false };

	function sessionMeta(id: string, status: SessionStatus, dir: URI): IAgentSessionMetadata {
		return { session: URI.parse(`copilot:/${id}`), startTime: 0, modifiedTime: 0, status, workingDirectory: dir, summary: `title-${id}` };
	}

	function createAccessor(overrides?: Partial<ISessionServerToolAccessor> & { onCreate?: (config: IAgentCreateSessionConfig) => void; onPrompt?: (session: URI, chat: URI, prompt: string) => void; onCreateChat?: (session: URI, chat: URI, options?: { title?: string; model?: IAgentModelInfo }) => void; onDelete?: (session: URI) => void; depths?: Map<string, number> }): ISessionServerToolAccessor {
		const depths = overrides?.depths ?? new Map<string, number>();
		return {
			listSessions: overrides?.listSessions ?? (async () => [sessionMeta('s1', SessionStatus.InProgress, workspace)]),
			createSession: overrides?.createSession ?? (async config => { overrides?.onCreate?.(config); return URI.parse('copilot:/new'); }),
			getModels: overrides?.getModels ?? (() => [model]),
			startPrompt: overrides?.startPrompt ?? (async (session, chat, prompt) => { overrides?.onPrompt?.(session, chat, prompt); }),
			createChat: overrides?.createChat ?? (async (session, chat, options) => { overrides?.onCreateChat?.(session, chat, options); }),
			deleteSession: overrides?.deleteSession ?? (async session => { overrides?.onDelete?.(session); }),
			getChatContext: overrides?.getChatContext ?? (() => undefined),
			getSessionSpawnDepth: overrides?.getSessionSpawnDepth ?? (session => depths.get(session.toString()) ?? 0),
			setSessionSpawnDepth: overrides?.setSessionSpawnDepth ?? ((session, depth) => { depths.set(session.toString(), depth); }),
		};
	}

	test('definitions and confirmation', () => {
		assert.deepStrictEqual(sessionServerToolDefinitions.map(d => d.name), [listSessionsToolName, getCurrentSessionToolName, createSessionToolName, createChatToolName, sendMessageToolName, getSessionContextToolName, deleteSessionToolName]);
		assert.strictEqual(sessionToolRequiresConfirmation(createSessionToolName), true);
		assert.strictEqual(sessionToolRequiresConfirmation(createChatToolName), true);
		assert.strictEqual(sessionToolRequiresConfirmation(sendMessageToolName), true);
		assert.strictEqual(sessionToolRequiresConfirmation(deleteSessionToolName), true);
		assert.strictEqual(sessionToolRequiresConfirmation(listSessionsToolName), false);
		assert.strictEqual(sessionToolRequiresConfirmation(getCurrentSessionToolName), false);
		assert.strictEqual(sessionToolRequiresConfirmation(getSessionContextToolName), false);
	});

	test('serializeSessions produces compact metadata', () => {
		const text = serializeSessions([sessionMeta('s1', SessionStatus.InputNeeded, workspace)]);
		assert.deepStrictEqual(JSON.parse(text), {
			sessions: [{
				session: 'copilot:/s1',
				status: 'inputNeeded',
				workingDirectory: workspace.toString(),
				title: 'title-s1',
			}],
		});
	});

	test('serializeSessions includes meaningful metadata when present', () => {
		let meta = withSessionGitState(undefined, { branchName: 'feature/x', baseBranchName: 'main', outgoingChanges: 2, incomingChanges: 1, uncommittedChanges: 3 });
		meta = withSessionGitHubState(meta, { owner: 'microsoft', repo: 'vscode', pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1' });
		const rich: IAgentSessionMetadata = {
			session: URI.parse('copilot:/rich'),
			startTime: 0,
			modifiedTime: 1700000000000,
			status: SessionStatus.InProgress,
			activity: 'Running tests',
			workingDirectory: workspace,
			project: { uri: workspace, displayName: 'app' },
			isRead: false,
			summary: 'Rich session',
			changes: { files: 1, additions: 2, deletions: 0 },
			_meta: meta,
		};
		assert.deepStrictEqual(JSON.parse(serializeSessions([rich])), {
			sessions: [{
				session: 'copilot:/rich',
				title: 'Rich session',
				status: 'inProgress',
				activity: 'Running tests',
				workingDirectory: workspace.toString(),
				project: 'app',
				unread: true,
				modifiedAt: new Date(1700000000000).toISOString(),
				changes: { files: 1, additions: 2, deletions: 0 },
				git: { branch: 'feature/x', baseBranch: 'main', ahead: 2, behind: 1, uncommittedChanges: 3 },
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1' },
			}],
		});
	});

	test('getCreateSessionArgs resolves workspace by working directory and model by id/name', () => {
		const sessions = [sessionMeta('s1', SessionStatus.Idle, workspace)];
		const byId = getCreateSessionArgs({ workspace: workspace.toString(), prompt: 'hi', model: 'gpt-4o' }, sessions, [model]);
		assert.strictEqual(byId.workspace.toString(), workspace.toString());
		assert.strictEqual(byId.model?.id, 'gpt-4o');
		const byName = getCreateSessionArgs({ workspace: workspace.toString(), prompt: 'hi', model: 'GPT-4o' }, sessions, [model]);
		assert.strictEqual(byName.model?.name, 'GPT-4o');
	});

	test('getCreateSessionArgs accepts an absolute filesystem path as workspace', () => {
		const resolved = getCreateSessionArgs({ workspace: '/Users/me/work/repo', prompt: 'hi' }, [], []);
		assert.strictEqual(resolved.workspace.scheme, 'file');
		// Compare `path` (always forward-slash) rather than `fsPath`, which is
		// platform-specific (backslashes on Windows).
		assert.strictEqual(resolved.workspace.path, '/Users/me/work/repo');
	});

	test('getCreateSessionArgs throws on invalid input', () => {
		assert.throws(() => getCreateSessionArgs({ workspace: 'not a uri', prompt: 'hi' }, [], []), /workspace/);
		assert.throws(() => getCreateSessionArgs({ workspace: workspace.toString(), prompt: 'hi', model: 'nope' }, [], [model]), /model/);
		assert.throws(() => getCreateSessionArgs({ workspace: workspace.toString() }, [], []), /prompt/);
	});

	test('create_session builds config, starts the default chat, and returns an open link', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		let created: IAgentCreateSessionConfig | undefined;
		let prompted: { chat: URI; prompt: string } | undefined;
		const accessor = createAccessor({ onCreate: c => { created = c; }, onPrompt: (_s, chat, prompt) => { prompted = { chat, prompt }; } });
		const group = createSessionServerToolGroup(accessor);

		const text = await group.execute(stateManager, 'copilot:/caller', createSessionToolName, { workspace: workspace.toString(), prompt: 'do it', model: 'gpt-4o' });

		assert.deepStrictEqual(created, { workingDirectory: workspace, provider: 'copilot', model: { id: 'gpt-4o' } });
		assert.strictEqual(prompted?.prompt, 'do it');
		assert.strictEqual(prompted?.chat.toString(), buildDefaultChatUri(URI.parse('copilot:/new')));
		assert.ok(text.includes('agent-host-session://copilot/new'), 'result carries the open-session link for the pill');
		assert.ok(!text.includes('copilot:/new'), 'result does not echo the raw backend session URI');
		store.dispose();
	});

	test('list_sessions execute returns serialized sessions', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const group = createSessionServerToolGroup(createAccessor());
		const text = await group.execute(stateManager, 'copilot:/caller', listSessionsToolName, {});
		assert.deepStrictEqual(JSON.parse(text).sessions.map((s: { session: string }) => s.session), ['copilot:/s1']);
		store.dispose();
	});

	test('list_sessions filters by status, workspace, changes, archived and creation time', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const other = URI.parse('file:///workspace/other');
		const idle = { ...sessionMeta('idle', SessionStatus.Idle, workspace), startTime: 1000, changes: { files: 2, additions: 5, deletions: 1 } };
		const needsInput = { ...sessionMeta('needsInput', SessionStatus.InputNeeded, workspace), startTime: 3000, isRead: false };
		const elsewhere = { ...sessionMeta('elsewhere', SessionStatus.Idle, other), startTime: 5000 };
		const archived = { ...sessionMeta('archived', SessionStatus.Idle, workspace), startTime: 2000, isArchived: true };
		const withPr = { ...sessionMeta('withPr', SessionStatus.Idle, workspace), startTime: 4000, _meta: withSessionGitHubState(undefined, { pullRequestUrl: 'https://github.com/o/r/pull/2' }) };
		const sessions = [idle, needsInput, elsewhere, archived, withPr];
		const group = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions }));

		const ids = async (args: object) => JSON.parse(await group.execute(stateManager, 'copilot:/caller', listSessionsToolName, args)).sessions.map((s: { session: string }) => s.session);

		assert.deepStrictEqual({
			byStatus: await ids({ status: ['inputNeeded'] }),
			byWorkspace: await ids({ workspace: workspace.toString() }),
			withChanges: await ids({ withChanges: true }),
			unread: await ids({ unread: true }),
			withPullRequest: await ids({ withPullRequest: true }),
			withArchived: await ids({ includeArchived: true }),
			createdAfter: await ids({ createdAfter: new Date(3000).toISOString() }),
			createdBefore: await ids({ createdBefore: new Date(3000).toISOString() }),
			combined: await ids({ status: ['idle'], workspace: workspace.toString(), withChanges: true }),
			all: await ids({}),
		}, {
			byStatus: ['copilot:/needsInput'],
			byWorkspace: ['copilot:/idle', 'copilot:/needsInput', 'copilot:/withPr'],
			withChanges: ['copilot:/idle'],
			unread: ['copilot:/needsInput'],
			withPullRequest: ['copilot:/withPr'],
			withArchived: ['copilot:/idle', 'copilot:/needsInput', 'copilot:/elsewhere', 'copilot:/archived', 'copilot:/withPr'],
			createdAfter: ['copilot:/needsInput', 'copilot:/elsewhere', 'copilot:/withPr'],
			createdBefore: ['copilot:/idle', 'copilot:/needsInput'],
			combined: ['copilot:/idle'],
			all: ['copilot:/idle', 'copilot:/needsInput', 'copilot:/elsewhere', 'copilot:/withPr'],
		});
		store.dispose();
	});

	test('getListSessionsArgs validates filter input', () => {
		assert.deepStrictEqual(getListSessionsArgs({}), { session: undefined, status: undefined, workspace: undefined, withChanges: undefined, unread: undefined, withPullRequest: undefined, includeArchived: undefined, createdAfter: undefined, createdBefore: undefined });
		assert.throws(() => getListSessionsArgs({ status: ['bogus'] }), /status/);
		assert.throws(() => getListSessionsArgs({ withChanges: 'yes' }), /withChanges/);
		assert.throws(() => getListSessionsArgs({ includeArchived: 'no' }), /includeArchived/);
		assert.throws(() => getListSessionsArgs({ createdAfter: 'not-a-date' }), /createdAfter/);
		assert.strictEqual(filterSessions([sessionMeta('s1', SessionStatus.Idle, workspace)], getListSessionsArgs({})).length, 1);
	});

	test('list_sessions fetches a single session by URI or open link, bypassing other filters', () => {
		const archived = { ...sessionMeta('archived', SessionStatus.Idle, workspace), isArchived: true };
		const sessions = [sessionMeta('s1', SessionStatus.Idle, workspace), archived];
		const ids = (args: object) => filterSessions(sessions, getListSessionsArgs(args)).map(s => s.session.toString());
		assert.deepStrictEqual({
			byUri: ids({ session: 'copilot:/s1' }),
			byLink: ids({ session: 'agent-host-session://copilot/s1' }),
			// A direct lookup returns an archived session even though archived are hidden by default.
			archivedByUri: ids({ session: 'copilot:/archived' }),
			unknown: ids({ session: 'copilot:/nope' }),
		}, {
			byUri: ['copilot:/s1'],
			byLink: ['copilot:/s1'],
			archivedByUri: ['copilot:/archived'],
			unknown: [],
		});
	});

	test('create_session stamps spawn depth and enforces the recursion depth limit', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const depths = new Map<string, number>();
		const group = createSessionServerToolGroup(createAccessor({ depths }));
		const args = { workspace: workspace.toString(), prompt: 'go' };

		// From a top-level (depth 0) session, the created session is stamped depth 1.
		await group.execute(stateManager, 'copilot:/caller', createSessionToolName, args);
		assert.strictEqual(depths.get('copilot:/new'), 1);

		// A session already at the max spawn depth may not create further sessions.
		depths.set('copilot:/deep', 3);
		await assert.rejects(
			async () => { await group.execute(stateManager, 'copilot:/deep', createSessionToolName, args); },
			/recursion limit/,
		);
		store.dispose();
	});

	test('create_session enforces a process-wide breadth backstop', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		// Each created session gets a unique URI so depth never blocks (all children of a depth-0 caller).
		let n = 0;
		const group = createSessionServerToolGroup(createAccessor({ createSession: async () => URI.parse(`copilot:/s${n++}`) }));
		const args = { workspace: workspace.toString(), prompt: 'go' };
		for (let i = 0; i < 25; i++) {
			await group.execute(stateManager, 'copilot:/caller', createSessionToolName, args);
		}
		await assert.rejects(async () => { await group.execute(stateManager, 'copilot:/caller', createSessionToolName, args); }, /more than 25 sessions/);
		store.dispose();
	});

	test('getCreateChatArgs resolves an explicit session, model, falls back to current, and validates', () => {
		const sessions = [sessionMeta('s1', SessionStatus.Idle, workspace)];
		const explicit = getCreateChatArgs({ session: 'copilot:/s1', prompt: 'hi', title: 'My chat', model: 'gpt-4o' }, sessions, [model]);
		assert.strictEqual(explicit.session.toString(), 'copilot:/s1');
		assert.strictEqual(explicit.title, 'My chat');
		assert.strictEqual(explicit.model?.id, 'gpt-4o');
		const current = getCreateChatArgs({ prompt: 'hi' }, sessions, [model], URI.parse('copilot:/s1'));
		assert.strictEqual(current.session.toString(), 'copilot:/s1');
		assert.throws(() => getCreateChatArgs({ session: 'copilot:/unknown', prompt: 'hi' }, sessions, [model]), /session/);
		assert.throws(() => getCreateChatArgs({ prompt: 'hi' }, sessions, [model]), /session/);
		assert.throws(() => getCreateChatArgs({ prompt: 'hi', model: 'nope' }, sessions, [model], URI.parse('copilot:/s1')), /model/);
	});

	test('create_chat adds a chat to the session, starts the prompt, and returns an open link', async () => {
		let createdChat: { session: URI; chat: URI; options?: { title?: string; model?: IAgentModelInfo } } | undefined;
		let prompted: { session: URI; chat: URI; prompt: string } | undefined;
		const accessor = createAccessor({
			listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace)],
			onCreateChat: (session, chat, options) => { createdChat = { session, chat, options }; },
			onPrompt: (session, chat, prompt) => { prompted = { session, chat, prompt }; },
		});
		const result = await applyCreateChatTool(accessor, { session: 'copilot:/s1', prompt: 'do it', title: 'T', model: 'gpt-4o' });
		assert.strictEqual(result.session, 'copilot:/s1');
		const chatId = URI.parse(result.chat).authority;
		assert.strictEqual(result.openLink, `agent-host-session://copilot/s1?chat=${chatId}`);
		assert.strictEqual(createdChat?.session.toString(), 'copilot:/s1');
		assert.strictEqual(createdChat?.options?.title, 'T');
		assert.strictEqual(createdChat?.options?.model?.id, 'gpt-4o');
		assert.strictEqual(createdChat?.chat.toString(), result.chat);
		assert.strictEqual(prompted?.chat.toString(), result.chat);
		assert.strictEqual(prompted?.prompt, 'do it');
	});

	test('send_message targets the default chat / a specific chat, refuses the current chat, and validates', async () => {
		const prompts: { session: URI; chat: URI; prompt: string }[] = [];
		const accessor = createAccessor({
			listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace), sessionMeta('s2', SessionStatus.Idle, workspace)],
			onPrompt: (session, chat, prompt) => { prompts.push({ session, chat, prompt }); },
		});
		const currentChannel = buildDefaultChatUri('copilot:/s1');

		// Explicit session -> owning session's default chat.
		const toSession = await applySendMessageTool(accessor, { session: 'copilot:/s2', message: 'hi' }, currentChannel);
		assert.strictEqual(prompts.at(-1)?.session.toString(), 'copilot:/s2');
		assert.strictEqual(prompts.at(-1)?.chat.toString(), buildDefaultChatUri('copilot:/s2'));
		assert.strictEqual(prompts.at(-1)?.prompt, 'hi');
		assert.ok(toSession.includes('agent-host-session://copilot/s2'));

		// A create_chat open link -> that specific chat channel.
		await applySendMessageTool(accessor, { session: 'agent-host-session://copilot/s2?chat=c9', message: 'yo' }, currentChannel);
		assert.strictEqual(prompts.at(-1)?.chat.toString(), buildChatUri('copilot:/s2', 'c9'));

		// Refuses messaging the exact current chat channel (self-loop guard).
		await assert.rejects(() => applySendMessageTool(accessor, { session: 'copilot:/s1', message: 'loop' }, currentChannel), /current chat/);
		// Unknown session and missing session/message are rejected.
		await assert.rejects(() => applySendMessageTool(accessor, { session: 'copilot:/nope', message: 'x' }, currentChannel), /known session/);
		assert.throws(() => getSendMessageArgs({ message: 'x' }, []), /session/);
		assert.throws(() => getSendMessageArgs({ session: 'copilot:/s2' }, []), /message/);
	});

	suite('get_session_context', () => {
		const toolCall = (toolName: string, input: object): ToolCallState => ({
			toolCallId: 't', toolName, displayName: toolName,
			invocationMessage: '', toolInput: JSON.stringify(input),
			status: ToolCallStatus.Completed, confirmed: ToolCallConfirmationReason.NotNeeded,
			success: true, pastTenseMessage: '',
		});
		const md = (content: string): ResponsePart => ({ kind: ResponsePartKind.Markdown, id: 'm', content });
		const toolPart = (tc: ToolCallState): ResponsePart => ({ kind: ResponsePartKind.ToolCall, toolCall: tc });
		const turn = (id: string, user: string, parts: ResponsePart[], state = TurnState.Complete): Turn =>
			({ id, message: { text: user, origin: { kind: MessageKind.User } }, responseParts: parts, usage: undefined, state });

		const snapshot: IChatContextSnapshot = {
			turns: [
				turn('t1', 'do the thing', [toolPart(toolCall('read_file', { path: 'a.ts' })), md('Working on it.')]),
				turn('t2', 'now finish it', [toolPart(toolCall('apply_patch', { patch: '@@' })), md('Here is the result.')]),
			],
			hasMoreHistory: true,
		};

		test('summary returns per-turn gists (message + reply snippet), no tool calls', () => {
			assert.deepStrictEqual(JSON.parse(serializeSessionContext(URI.parse('copilot:/s1'), undefined, snapshot, 'summary', 10)), {
				session: 'copilot:/s1',
				openLink: 'agent-host-session://copilot/s1',
				detail: 'summary',
				transcript: [
					{ turn: 1, state: 'complete', user: 'do the thing', assistant: 'Working on it.' },
					{ turn: 2, state: 'complete', user: 'now finish it', assistant: 'Here is the result.' },
				],
				hasMoreHistory: true,
				truncated: false,
			});
		});

		test('digest adds assistant text and tool-call names', () => {
			const digest = JSON.parse(serializeSessionContext(URI.parse('copilot:/s1'), undefined, snapshot, 'digest', 10));
			assert.deepStrictEqual(digest.transcript[0], { turn: 1, state: 'complete', user: 'do the thing', assistant: 'Working on it.', toolCalls: ['read_file'] });
		});

		test('detail=full targeting a specific chat carries the chat link and tool inputs', () => {
			const full = JSON.parse(serializeSessionContext(URI.parse('copilot:/s1'), 'c9', snapshot, 'full', 10));
			assert.strictEqual(full.openLink, 'agent-host-session://copilot/s1?chat=c9');
			assert.deepStrictEqual(full.transcript[1].toolCalls, [{ name: 'apply_patch', input: '{"patch":"@@"}' }]);
		});

		test('transcriptLimit drops older turns and flags truncated', () => {
			const limited = JSON.parse(serializeSessionContext(URI.parse('copilot:/s1'), undefined, snapshot, 'summary', 1));
			assert.deepStrictEqual({ turns: limited.transcript.map((t: { turn: number }) => t.turn), truncated: limited.truncated }, { turns: [2], truncated: true });
		});

		test('execute reads from the accessor; cold session returns identity + empty transcript', async () => {
			const store = new DisposableStore();
			const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
			const sessions = [sessionMeta('s1', SessionStatus.Idle, workspace)];
			const withCtx = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions, getChatContext: () => snapshot }));
			const live = JSON.parse(await withCtx.execute(stateManager, 'copilot:/caller', getSessionContextToolName, { session: 'copilot:/s1' }));
			assert.strictEqual(live.transcript.length, 2);

			const cold = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions, getChatContext: () => undefined }));
			assert.deepStrictEqual(JSON.parse(await cold.execute(stateManager, 'copilot:/caller', getSessionContextToolName, { session: 'copilot:/s1' })), {
				session: 'copilot:/s1', openLink: 'agent-host-session://copilot/s1', detail: 'summary', transcript: [], hasMoreHistory: false, truncated: false,
			});
			store.dispose();
		});

		test('getSessionContextArgs validates input', () => {
			assert.throws(() => getSessionContextArgs({}, []), /session/);
			assert.throws(() => getSessionContextArgs({ session: 'copilot:/nope' }, [sessionMeta('s1', SessionStatus.Idle, workspace)]), /known session/);
			assert.throws(() => getSessionContextArgs({ session: 'copilot:/s1', detail: 'huge' }, [sessionMeta('s1', SessionStatus.Idle, workspace)]), /detail/);
			assert.strictEqual(getSessionContextArgs({ session: 'copilot:/s1', transcriptLimit: 999 }, [sessionMeta('s1', SessionStatus.Idle, workspace)]).transcriptLimit, 50);
		});
	});

	test('get_current_session returns the current session link + metadata', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const group = createSessionServerToolGroup(createAccessor({ listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace)] }));
		// Tool call runs on the session's default chat channel; the tool resolves the owning session.
		const chatChannel = buildDefaultChatUri('copilot:/s1');
		const text = await group.execute(stateManager, chatChannel, getCurrentSessionToolName, {});
		const parsed = JSON.parse(text);
		assert.strictEqual(parsed.session, 'copilot:/s1');
		assert.strictEqual(parsed.openLink, 'agent-host-session://copilot/s1');
		store.dispose();
	});

	test('getDeleteSessionArgs validates and refuses the current session', () => {
		const sessions = [sessionMeta('s1', SessionStatus.Idle, workspace), sessionMeta('s2', SessionStatus.Idle, workspace)];
		assert.strictEqual(getDeleteSessionArgs({ session: 'copilot:/s2' }, sessions).toString(), 'copilot:/s2');
		// Accepts the agent-host-session:// open link form (as returned by create_session).
		assert.strictEqual(getDeleteSessionArgs({ session: 'agent-host-session://copilot/s2' }, sessions).toString(), 'copilot:/s2');
		assert.throws(() => getDeleteSessionArgs({ session: 'copilot:/unknown' }, sessions), /session/);
		assert.throws(() => getDeleteSessionArgs({}, sessions), /session/);
		assert.throws(() => getDeleteSessionArgs({ session: 'copilot:/s1' }, sessions, URI.parse('copilot:/s1')), /current session/);
		assert.throws(() => getDeleteSessionArgs({ session: 'agent-host-session://copilot/s1' }, sessions, URI.parse('copilot:/s1')), /current session/);
	});

	test('delete_session deletes the target and returns a confirmation', async () => {
		let deleted: URI | undefined;
		const accessor = createAccessor({
			listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace), sessionMeta('s2', SessionStatus.Idle, workspace)],
			onDelete: session => { deleted = session; },
		});
		const text = await applyDeleteSessionTool(accessor, { session: 'copilot:/s2' }, URI.parse('copilot:/s1'));
		assert.strictEqual(deleted?.toString(), 'copilot:/s2');
		assert.ok(text.includes('copilot:/s2'));
	});
});
