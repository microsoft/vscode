/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentCreateSessionConfig, IAgentModelInfo, IAgentSessionMetadata } from '../../common/agent.js';
import { SessionStatus } from '../../common/state/protocol/channels-session/state.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, TurnState, withSessionGitState, withSessionGitHubState, withSessionOrchestration, type ISessionOrchestration, type ModelSelection, type ResponsePart, type ToolCallState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { withEphemeralSessionMeta } from '../../common/meta/agentEphemeralSessionMeta.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import {
	applyCreateChatTool,
	applyCreateSessionTool,
	applyDeleteSessionTool,
	applyRenameChatTool,
	applySendMessageTool,
	createSessionServerToolGroup,
	getCreateChatArgs,
	getCreateSessionArgs,
	getDeleteSessionArgs,
	getRenameChatArgs,
	getSendMessageArgs,
	getSessionContextArgs,
	serializeSessionContext,
	filterSessions,
	getListSessionsArgs,
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

	/** Defaults to read; tests that care about unread clear the `IsRead` bit. */
	function sessionMeta(id: string, status: SessionStatus, dir: URI): IAgentSessionMetadata {
		return { session: URI.parse(`copilot:/${id}`), startTime: 0, modifiedTime: 0, status: status | SessionStatus.IsRead, workingDirectories: dir ? [dir] : undefined, summary: `title-${id}` };
	}

	function executionContext(sessionUri: string) {
		return { sessionUri, chatUri: buildDefaultChatUri(sessionUri) };
	}

	function createAccessor(overrides?: Partial<ISessionServerToolAccessor> & { onCreate?: (config: IAgentCreateSessionConfig) => void; onPrompt?: (session: URI, chat: URI, prompt: string) => void; onCreateChat?: (session: URI, chat: URI, options?: { title?: string; model?: ModelSelection }) => void; onRenameChat?: (session: URI, chat: URI, title: string) => void; onDelete?: (session: URI) => void; depths?: Map<string, number>; orchestrations?: Map<string, ISessionOrchestration> }): ISessionServerToolAccessor {
		const depths = overrides?.depths ?? new Map<string, number>();
		const orchestrations = overrides?.orchestrations ?? new Map<string, ISessionOrchestration>();
		return {
			isActiveAgentTitleGenerationEnabled: overrides?.isActiveAgentTitleGenerationEnabled ?? (() => true),
			listSessions: overrides?.listSessions ?? (async () => [sessionMeta('s1', SessionStatus.InProgress, workspace)]),
			getSession: overrides?.getSession ?? (async session => session.toString() === 'copilot:/s1' ? sessionMeta('s1', SessionStatus.InProgress, workspace) : undefined),
			createSession: overrides?.createSession ?? (async config => { overrides?.onCreate?.(config); return URI.parse('copilot:/new'); }),
			getModels: overrides?.getModels ?? (() => [model]),
			getCreationDefaults: overrides?.getCreationDefaults ?? (() => undefined),
			startPrompt: overrides?.startPrompt ?? (async (session, chat, prompt) => { overrides?.onPrompt?.(session, chat, prompt); }),
			createChat: overrides?.createChat ?? (async (session, chat, options) => { overrides?.onCreateChat?.(session, chat, options); }),
			renameChat: overrides?.renameChat ?? (async (session, chat, title) => { overrides?.onRenameChat?.(session, chat, title); return { title }; }),
			reportToolError: overrides?.reportToolError ?? (() => { }),
			deleteSession: overrides?.deleteSession ?? (async session => { overrides?.onDelete?.(session); }),
			getChatContext: overrides?.getChatContext ?? (async () => undefined),
			getSessionSpawnDepth: overrides?.getSessionSpawnDepth ?? (session => depths.get(session.toString()) ?? 0),
			setSessionSpawnDepth: overrides?.setSessionSpawnDepth ?? ((session, depth) => { depths.set(session.toString(), depth); }),
			setSessionOrchestration: overrides?.setSessionOrchestration ?? (async (session, orchestration) => { orchestrations.set(session.toString(), orchestration); }),
		};
	}

	test('definitions and confirmation', () => {
		assert.deepStrictEqual(sessionServerToolDefinitions.map(d => d.name), [SessionServerToolName.ListSessions, SessionServerToolName.GetCurrentSession, SessionServerToolName.CreateSession, SessionServerToolName.CreateChat, SessionServerToolName.RenameChat, SessionServerToolName.SendMessage, SessionServerToolName.GetSessionContext, SessionServerToolName.DeleteSession]);
		assert.deepStrictEqual(sessionServerToolDefinitions.filter(definition => definition.enabledForEphemeralSessions).map(definition => definition.name), []);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.CreateSession), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.CreateChat), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.SendMessage), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.DeleteSession), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.RenameChat), false);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.ListSessions), false);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.GetCurrentSession), false);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.GetSessionContext), false);
		assert.strictEqual(sessionServerToolDefinitions.find(def => def.name === SessionServerToolName.CreateSession)?.inputSchema?.properties?.parentSession, undefined);
		assert.deepStrictEqual(sessionServerToolDefinitions.slice(4, 5).map(def => ({ name: def.name, required: def.inputSchema?.required })), [
			{ name: SessionServerToolName.RenameChat, required: ['title'] },
		]);
		assert.deepStrictEqual(sessionServerToolDefinitions.slice(4, 5).map(def => def.inputSchema?.properties?.title), [
			{ type: 'string', maxLength: 200, description: 'Short, descriptive chat title, ideally 1-4 words.' },
		]);
		const renameDescription = sessionServerToolDefinitions.find(def => def.name === SessionServerToolName.RenameChat)?.description;
		assert.ok(renameDescription?.includes('Renaming the default chat also names its owning session'));
		assert.ok(renameDescription?.includes('peer-chat titles remain independent'));
	});

	test('ephemeral sessions advertise no default session-management tools', () => {
		const stateManager = new AgentHostStateManager(new NullLogService());
		const session = 'copilot:/ephemeral';
		stateManager.createSession({
			resource: session,
			provider: 'copilot',
			title: 'Ephemeral',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			_meta: withEphemeralSessionMeta(undefined, true),
		});
		const host = new AgentServerToolHost(stateManager, [
			createSessionServerToolGroup(createAccessor()),
		]);

		host.advertise(session);

		assert.deepStrictEqual(stateManager.getSessionState(session)?.serverTools, []);
		stateManager.dispose();
	});

	test('new sessions use the current setting while materialized sessions keep their advertised tools', async () => {
		let enabled = false;
		const stateManager = new AgentHostStateManager(new NullLogService());
		const disabledSession = 'copilot:/s1';
		const enabledSession = 'copilot:/s2';
		for (const resource of [disabledSession, enabledSession]) {
			stateManager.createSession({
				resource,
				provider: 'copilot',
				title: 'Session',
				status: SessionStatus.Idle,
				createdAt: new Date(0).toISOString(),
				modifiedAt: new Date(0).toISOString(),
			});
		}
		const accessor = createAccessor({
			isActiveAgentTitleGenerationEnabled: () => enabled,
			listSessions: async () => [
				sessionMeta('s1', SessionStatus.Idle, workspace),
				sessionMeta('s2', SessionStatus.Idle, workspace),
			],
		});
		const host = new AgentServerToolHost(stateManager, [
			createSessionServerToolGroup(accessor),
		]);

		host.advertise(disabledSession);
		enabled = true;
		host.advertise(enabledSession);

		await assert.rejects(
			async () => host.executeTool(buildDefaultChatUri(disabledSession), SessionServerToolName.RenameChat, { title: 'Disabled' }),
			/Server tool "rename_chat" is disabled/,
		);
		assert.strictEqual(
			await host.executeTool(buildDefaultChatUri(enabledSession), SessionServerToolName.RenameChat, { title: 'Enabled' }),
			'Renamed chat to "Enabled".',
		);
		assert.deepStrictEqual({
			disabledTools: stateManager.getSessionState(disabledSession)?.serverTools?.map(tool => tool.name),
			enabledTools: stateManager.getSessionState(enabledSession)?.serverTools?.map(tool => tool.name),
		}, {
			disabledTools: [
				SessionServerToolName.ListSessions,
				SessionServerToolName.GetCurrentSession,
				SessionServerToolName.CreateSession,
				SessionServerToolName.CreateChat,
				SessionServerToolName.SendMessage,
				SessionServerToolName.GetSessionContext,
				SessionServerToolName.DeleteSession,
			],
			enabledTools: sessionServerToolDefinitions.map(tool => tool.name),
		});
		stateManager.dispose();
	});

	test('materialized rename tools remain executable after the root setting is disabled', async () => {
		let enabled = true;
		const stateManager = new AgentHostStateManager(new NullLogService());
		const session = 'copilot:/s1';
		stateManager.createSession({
			resource: session,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		const host = new AgentServerToolHost(stateManager, [
			createSessionServerToolGroup(createAccessor({ isActiveAgentTitleGenerationEnabled: () => enabled })),
		]);

		host.advertise(session);
		enabled = false;

		assert.strictEqual(
			await host.executeTool(buildDefaultChatUri(session), SessionServerToolName.RenameChat, { title: 'Still enabled' }),
			'Renamed chat to "Still enabled".',
		);
		stateManager.dispose();
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
		meta = withSessionGitHubState(meta, { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] });
		const rich: IAgentSessionMetadata = {
			session: URI.parse('copilot:/rich'),
			startTime: 0,
			modifiedTime: 1700000000000,
			status: SessionStatus.InProgress,
			activity: 'Running tests',
			workingDirectories: workspace ? [workspace] : undefined,
			project: { uri: workspace, displayName: 'app' },
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
				projectUri: workspace.toString(),
				unread: true,
				modifiedAt: new Date(1700000000000).toISOString(),
				changes: { files: 1, additions: 2, deletions: 0 },
				git: { branch: 'feature/x', baseBranch: 'main', ahead: 2, behind: 1, uncommittedChanges: 3 },
				github: { owner: 'microsoft', repo: 'vscode', pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1' },
			}],
		});
	});

	suite('orchestration metadata', () => {
		test('serializeSessions and filters expose orchestration relationships', () => {
			const child = {
				...sessionMeta('child', SessionStatus.Idle, workspace),
				_meta: withSessionOrchestration(undefined, {
					parentSession: 'copilot:/parent',
					creatorSession: 'copilot:/creator',
					coordinateWithCreator: true,
					notifyOnIdle: 'once',
					label: 'research',
				}),
			};

			assert.deepStrictEqual({
				serialized: JSON.parse(serializeSessions([child])).sessions[0],
				byParent: filterSessions([child], getListSessionsArgs({ parentSession: 'agent-host-session://copilot/parent' })).map(session => session.session.toString()),
				byLabel: filterSessions([child], getListSessionsArgs({ label: 'research' })).map(session => session.session.toString()),
			}, {
				serialized: {
					session: 'copilot:/child',
					title: 'title-child',
					status: 'idle',
					workingDirectory: workspace.toString(),
					parentSession: 'copilot:/parent',
					creator: 'copilot:/creator',
					label: 'research',
					notifyOnIdle: 'once',
				},
				byParent: ['copilot:/child'],
				byLabel: ['copilot:/child'],
			});
		});

		test('serializeSessions hides a disabled creator relationship from the child', () => {
			const child = {
				...sessionMeta('child', SessionStatus.Idle, workspace),
				_meta: withSessionOrchestration(undefined, {
					parentSession: 'copilot:/parent',
					creatorSession: 'copilot:/parent',
					coordinateWithCreator: false,
					label: 'private-child',
				}),
			};

			assert.deepStrictEqual({
				child: JSON.parse(serializeSessions([child], 'copilot:/child')).sessions[0],
				parent: JSON.parse(serializeSessions([child], 'copilot:/parent')).sessions[0],
				childFilter: filterSessions([child], getListSessionsArgs({ parentSession: 'copilot:/parent' }), 'copilot:/child'),
				parentFilter: filterSessions([child], getListSessionsArgs({ parentSession: 'copilot:/parent' }), 'copilot:/parent').map(session => session.session.toString()),
			}, {
				child: {
					session: 'copilot:/child',
					title: 'title-child',
					status: 'idle',
					workingDirectory: workspace.toString(),
					label: 'private-child',
				},
				parent: {
					session: 'copilot:/child',
					title: 'title-child',
					status: 'idle',
					workingDirectory: workspace.toString(),
					parentSession: 'copilot:/parent',
					label: 'private-child',
				},
				childFilter: [],
				parentFilter: ['copilot:/child'],
			});
		});
	});

	test('serializeSessions preserves remote project roots and multiple working directories', () => {
		const project = URI.parse('vscode-remote://ssh-remote+example/home/me/app');
		const primary = URI.parse('vscode-remote://ssh-remote+example/home/me/app-worktree');
		const secondary = URI.parse('vscode-remote://ssh-remote+example/home/me/shared');
		const remote: IAgentSessionMetadata = {
			...sessionMeta('remote', SessionStatus.Idle, primary),
			workingDirectories: [primary, secondary],
			project: { uri: project, displayName: 'Remote App' },
		};

		assert.deepStrictEqual(JSON.parse(serializeSessions([remote])).sessions[0], {
			session: 'copilot:/remote',
			title: 'title-remote',
			status: 'idle',
			workingDirectory: primary.toString(),
			workingDirectories: [primary.toString(), secondary.toString()],
			project: 'Remote App',
			projectUri: project.toString(),
		});
	});

	test('serializeSessions reports archived status from the IsArchived status bit', () => {
		const archived: IAgentSessionMetadata = { ...sessionMeta('archived', SessionStatus.Idle | SessionStatus.IsArchived, workspace) };
		const notArchived: IAgentSessionMetadata = { ...sessionMeta('notArchived', SessionStatus.Idle, workspace) };
		const noStatus: IAgentSessionMetadata = { session: URI.parse('copilot:/noStatus'), startTime: 0, modifiedTime: 0, workingDirectories: workspace ? [workspace] : undefined };
		assert.deepStrictEqual(JSON.parse(serializeSessions([archived, notArchived, noStatus])).sessions.map((s: { session: string; status?: string }) => ({ session: s.session, status: s.status })), [
			{ session: 'copilot:/archived', status: 'idle,archived' },
			{ session: 'copilot:/notArchived', status: 'idle' },
			{ session: 'copilot:/noStatus', status: undefined },
		]);
	});

	test('only sessions known to be unread report or filter as unread', () => {
		// A cold session from an agent that projects no status (e.g. Claude) has
		// no recorded read state and must not be reported as unread.
		const unknown: IAgentSessionMetadata = { session: URI.parse('copilot:/unknown'), startTime: 0, modifiedTime: 0, workingDirectories: [workspace] };
		const unread: IAgentSessionMetadata = { ...sessionMeta('unread', SessionStatus.Idle, workspace), status: SessionStatus.Idle };
		const read: IAgentSessionMetadata = sessionMeta('read', SessionStatus.Idle, workspace);
		const sessions = [unknown, unread, read];

		assert.deepStrictEqual({
			serializedUnread: JSON.parse(serializeSessions(sessions)).sessions.map((s: { session: string; unread?: boolean }) => ({ session: s.session, unread: s.unread })),
			filteredToUnread: filterSessions(sessions, getListSessionsArgs({ unread: true })).map(s => s.session.toString()),
		}, {
			serializedUnread: [
				{ session: 'copilot:/unknown', unread: undefined },
				{ session: 'copilot:/unread', unread: true },
				{ session: 'copilot:/read', unread: undefined },
			],
			filteredToUnread: ['copilot:/unread'],
		});
	});

	test('getCreateSessionArgs resolves workspace by working directory and model by id/name', () => {
		const sessions = [sessionMeta('s1', SessionStatus.Idle, workspace)];
		const byId = getCreateSessionArgs({ workspace: workspace.toString(), prompt: 'hi', model: 'gpt-4o' }, sessions, [model]);
		assert.strictEqual(byId.workspace.toString(), workspace.toString());
		assert.strictEqual(byId.model?.id, 'gpt-4o');
		const byName = getCreateSessionArgs({ workspace: workspace.toString(), prompt: 'hi', model: 'GPT-4o' }, sessions, [model]);
		assert.strictEqual(byName.model?.name, 'GPT-4o');
		assert.strictEqual(byName.coordinateWithCreator, true);
	});

	test('getCreateSessionArgs resolves a unique project name to its configured root', () => {
		const project = URI.parse('file:///workspace/vscode');
		const worktree = URI.parse('file:///worktrees/pr-331525');
		const sessions = [{
			...sessionMeta('worktree', SessionStatus.Idle, worktree),
			project: { uri: project, displayName: 'Visual Studio Code' },
		}];

		assert.deepStrictEqual({
			byName: getCreateSessionArgs({ workspace: 'visual studio code', prompt: 'hi' }, sessions, []).workspace.toString(),
			byProjectUri: getCreateSessionArgs({ workspace: project.toString(), prompt: 'hi' }, sessions, []).workspace.toString(),
		}, {
			byName: project.toString(),
			byProjectUri: project.toString(),
		});
	});

	test('getCreateSessionArgs reports ambiguous project names', () => {
		const sessions = [
			{ ...sessionMeta('one', SessionStatus.Idle, URI.parse('file:///worktrees/one')), project: { uri: URI.parse('file:///projects/one'), displayName: 'App' } },
			{ ...sessionMeta('two', SessionStatus.Idle, URI.parse('file:///worktrees/two')), project: { uri: URI.parse('file:///projects/two'), displayName: 'App' } },
		];

		assert.throws(
			() => getCreateSessionArgs({ workspace: 'app', prompt: 'hi' }, sessions, []),
			/ambiguous; use one of these project URIs: file:\/\/\/projects\/one, file:\/\/\/projects\/two/i,
		);
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
		const orchestrations = new Map<string, ISessionOrchestration>();
		const accessor = createAccessor({ orchestrations, onCreate: c => { created = c; }, onPrompt: (_s, chat, prompt) => { prompted = { chat, prompt }; } });
		const group = createSessionServerToolGroup(accessor);

		const text = await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, { workspace: workspace.toString(), prompt: 'do it', model: 'gpt-4o' });

		assert.deepStrictEqual(created, { workingDirectories: [workspace], provider: 'copilot', model: { id: 'gpt-4o' } });
		assert.strictEqual(prompted?.prompt, 'do it');
		assert.strictEqual(prompted?.chat.toString(), buildDefaultChatUri(URI.parse('copilot:/new')));
		assert.ok(text.includes('agent-host-session://copilot/new'), 'result carries the open-session link for the pill');
		assert.ok(!text.includes('copilot:/new'), 'result does not echo the raw backend session URI');
		assert.deepStrictEqual(orchestrations.get('copilot:/new'), {
			parentSession: 'copilot:/caller',
			creatorSession: 'copilot:/caller',
			coordinateWithCreator: true,
		});
		store.dispose();
	});

	test('create_session records explicit orchestration options', async () => {
		const orchestrations = new Map<string, ISessionOrchestration>();
		const sessions = [sessionMeta('caller', SessionStatus.InProgress, workspace)];
		const accessor = createAccessor({ orchestrations, listSessions: async () => sessions });

		await applyCreateSessionTool(accessor, {
			workspace: workspace.toString(),
			prompt: 'do it',
			coordinateWithCreator: false,
			notifyOnIdle: 'always',
			label: 'research',
		}, URI.parse('copilot:/caller'));

		assert.deepStrictEqual(orchestrations.get('copilot:/new'), {
			parentSession: 'copilot:/caller',
			creatorSession: 'copilot:/caller',
			coordinateWithCreator: false,
			notifyOnIdle: 'always',
			label: 'research',
		});
	});

	test('create_session inherits the calling chat model and permission config', async () => {
		const source = URI.parse(buildChatUri('copilot:/caller', 'peer'));
		let creationSource: URI | undefined;
		let created: IAgentCreateSessionConfig | undefined;
		const accessor = createAccessor({
			getCreationDefaults: uri => {
				creationSource = uri;
				return {
					provider: 'copilot',
					model: { id: 'gpt-inherited' },
					config: {
						autoApprove: 'autoApprove',
						permissions: { allow: ['shell'], deny: ['write'] },
					},
				};
			},
			onCreate: config => { created = config; },
		});

		const group = createSessionServerToolGroup(accessor);
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		await group.execute(stateManager, { sessionUri: 'copilot:/caller', chatUri: source.toString() }, SessionServerToolName.CreateSession, { workspace: workspace.toString(), prompt: 'do it' });

		assert.deepStrictEqual({
			creationSource: creationSource?.toString(),
			created,
		}, {
			creationSource: source.toString(),
			created: {
				workingDirectories: [workspace],
				provider: 'copilot',
				model: { id: 'gpt-inherited' },
				config: {
					autoApprove: 'autoApprove',
					permissions: { allow: ['shell'], deny: ['write'] },
				},
			},
		});
		store.dispose();
	});

	test('create_session inherits the calling provider when its model is the provider default', async () => {
		let created: IAgentCreateSessionConfig | undefined;
		const accessor = createAccessor({
			getCreationDefaults: () => ({
				provider: 'claude',
				config: { permissionMode: 'acceptEdits' },
			}),
			onCreate: config => { created = config; },
		});

		await applyCreateSessionTool(accessor, { workspace: workspace.toString(), prompt: 'do it' }, URI.parse('claude:/source'));

		assert.deepStrictEqual(created, {
			workingDirectories: [workspace],
			provider: 'claude',
			config: { permissionMode: 'acceptEdits' },
		});
	});

	test('create_session uses a remote project root with a model from another provider', async () => {
		const remoteProject = URI.parse('vscode-remote://ssh-remote+example/home/me/app');
		const remoteWorktree = URI.parse('vscode-remote://ssh-remote+example/home/me/app-worktree');
		const claudeModel: IAgentModelInfo = { provider: 'claude', id: 'claude-sonnet', name: 'Claude Sonnet', supportsVision: false };
		let created: IAgentCreateSessionConfig | undefined;
		const accessor = createAccessor({
			listSessions: async () => [{
				...sessionMeta('remote', SessionStatus.Idle, remoteWorktree),
				project: { uri: remoteProject, displayName: 'Remote App' },
			}],
			getModels: () => [claudeModel],
			getCreationDefaults: () => ({ provider: 'copilot', model: { id: 'gpt-4o' } }),
			onCreate: config => { created = config; },
		});

		await applyCreateSessionTool(accessor, {
			workspace: 'Remote App',
			prompt: 'do it',
			model: 'claude-sonnet',
		}, URI.parse('copilot:/source'));

		assert.deepStrictEqual(created, {
			workingDirectories: [remoteProject],
			provider: 'claude',
			model: { id: 'claude-sonnet' },
		});
	});

	test('list_sessions execute returns serialized sessions', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const group = createSessionServerToolGroup(createAccessor());
		const text = await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.ListSessions, {});
		assert.deepStrictEqual(JSON.parse(text).sessions.map((s: { session: string }) => s.session), ['copilot:/s1']);
		store.dispose();
	});

	test('list_sessions filters by status, workspace, changes, archived and creation time', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const other = URI.parse('file:///workspace/other');
		const idle = { ...sessionMeta('idle', SessionStatus.Idle, workspace), startTime: 1000, changes: { files: 2, additions: 5, deletions: 1 } };
		const needsInput = { ...sessionMeta('needsInput', SessionStatus.InputNeeded, workspace), startTime: 3000, status: SessionStatus.InputNeeded };
		const elsewhere = { ...sessionMeta('elsewhere', SessionStatus.Idle, other), startTime: 5000 };
		const archived = { ...sessionMeta('archived', SessionStatus.Idle | SessionStatus.IsArchived, workspace), startTime: 2000 };
		const withPr = { ...sessionMeta('withPr', SessionStatus.Idle, workspace), startTime: 4000, _meta: withSessionGitHubState(undefined, { pullRequestUrls: ['https://github.com/o/r/pull/2'] }) };
		const inheritedPr = { ...sessionMeta('inheritedPr', SessionStatus.Idle, workspace), startTime: 4500, _meta: withSessionGitHubState(undefined, { pullRequestUrls: ['https://github.com/o/r/pull/3'], initialPullRequestUrls: ['https://github.com/o/r/pull/3'] }) };
		const sessions = [idle, needsInput, elsewhere, archived, withPr, inheritedPr];
		const group = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions }));

		const ids = async (args: object) => JSON.parse(await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.ListSessions, args)).sessions.map((s: { session: string }) => s.session);

		assert.deepStrictEqual({
			byStatus: await ids({ status: ['inputNeeded'] }),
			byArchivedStatus: await ids({ status: ['archived'] }),
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
			byArchivedStatus: ['copilot:/archived'],
			byWorkspace: ['copilot:/idle', 'copilot:/needsInput', 'copilot:/withPr', 'copilot:/inheritedPr'],
			withChanges: ['copilot:/idle'],
			unread: ['copilot:/needsInput'],
			withPullRequest: ['copilot:/withPr'],
			withArchived: ['copilot:/idle', 'copilot:/needsInput', 'copilot:/elsewhere', 'copilot:/archived', 'copilot:/withPr', 'copilot:/inheritedPr'],
			createdAfter: ['copilot:/needsInput', 'copilot:/elsewhere', 'copilot:/withPr', 'copilot:/inheritedPr'],
			createdBefore: ['copilot:/idle', 'copilot:/needsInput'],
			combined: ['copilot:/idle'],
			all: ['copilot:/idle', 'copilot:/needsInput', 'copilot:/elsewhere', 'copilot:/withPr', 'copilot:/inheritedPr'],
		});
		store.dispose();
	});

	test('list_sessions filters by project name, project URI, and secondary working directory', () => {
		const project = URI.parse('vscode-remote://ssh-remote+example/home/me/app');
		const primary = URI.parse('vscode-remote://ssh-remote+example/home/me/app-worktree');
		const secondary = URI.parse('vscode-remote://ssh-remote+example/home/me/shared');
		const remote = {
			...sessionMeta('remote', SessionStatus.Idle, primary),
			workingDirectories: [primary, secondary],
			project: { uri: project, displayName: 'Remote App' },
		};
		const sessions = [remote, sessionMeta('local', SessionStatus.Idle, workspace)];

		assert.deepStrictEqual({
			byProjectName: filterSessions(sessions, getListSessionsArgs({ workspace: 'remote app' })),
			byProjectUri: filterSessions(sessions, getListSessionsArgs({ workspace: project.toString() })),
			bySecondaryDirectory: filterSessions(sessions, getListSessionsArgs({ workspace: secondary.toString() })),
		}, {
			byProjectName: [remote],
			byProjectUri: [remote],
			bySecondaryDirectory: [remote],
		});
	});

	test('getListSessionsArgs validates filter input', () => {
		assert.deepStrictEqual(getListSessionsArgs({}), { session: undefined, status: undefined, workspace: undefined, withChanges: undefined, unread: undefined, withPullRequest: undefined, includeArchived: undefined, createdAfter: undefined, createdBefore: undefined, parentSession: undefined, label: undefined });
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
		await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, args);
		assert.strictEqual(depths.get('copilot:/new'), 1);

		// A session already at the max spawn depth may not create further sessions.
		depths.set('copilot:/deep', 3);
		await assert.rejects(
			async () => { await group.execute(stateManager, executionContext('copilot:/deep'), SessionServerToolName.CreateSession, args); },
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
			await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, args);
		}
		await assert.rejects(async () => { await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, args); }, /more than 25 sessions/);
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
		let createdChat: { session: URI; chat: URI; options?: { title?: string; model?: ModelSelection } } | undefined;
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

	test('rename titles normalize presentation without truncating agent input', () => {
		const session = sessionMeta('s1', SessionStatus.Idle, workspace);
		assert.deepStrictEqual({
			defaultChat: getRenameChatArgs({ chat: 'agent-host-session://copilot/s1', title: '  `fix-input_flicker`  ' }, [session]).title,
			peerChat: getRenameChatArgs({ chat: 'agent-host-session://copilot/s1?chat=peer', title: 'Don&#39;t   panic' }, [session]).title,
		}, {
			defaultChat: 'fix input flicker',
			peerChat: 'Don\'t panic',
		});
	});

	test('rename titles accept 200 Unicode code points and reject 201', () => {
		const session = sessionMeta('s1', SessionStatus.Idle, workspace);
		const accepted = '😀'.repeat(200);
		const rejected = '😀'.repeat(201);
		assert.strictEqual(getRenameChatArgs({ chat: 'agent-host-session://copilot/s1?chat=peer', title: accepted }, [session]).title, accepted);
		assert.throws(() => getRenameChatArgs({ chat: 'agent-host-session://copilot/s1?chat=peer', title: rejected }, [session]), /must not exceed 200 characters/);
	});

	test('getRenameChatArgs resolves default and peer chats from links or the current channel', () => {
		const sessions = [sessionMeta('s1', SessionStatus.Idle, workspace), sessionMeta('s2', SessionStatus.Idle, workspace)];
		const peer = buildChatUri('copilot:/s1', 'peer');
		const explicitPeer = getRenameChatArgs({ chat: 'agent-host-session://copilot/s2?chat=c9', title: 'Side Work' }, sessions);
		const explicitDefault = getRenameChatArgs({ chat: 'agent-host-session://copilot/s2', title: 'Default Work' }, sessions);
		const currentPeer = getRenameChatArgs({ title: 'Current Peer' }, sessions, peer);
		const currentDefault = getRenameChatArgs({ title: 'Current Default' }, sessions, buildDefaultChatUri('copilot:/s1'));
		assert.deepStrictEqual({
			explicitPeer: { session: explicitPeer.session.toString(), chat: explicitPeer.chat.toString(), title: explicitPeer.title },
			explicitDefault: { session: explicitDefault.session.toString(), chat: explicitDefault.chat.toString(), title: explicitDefault.title },
			currentPeer: { session: currentPeer.session.toString(), chat: currentPeer.chat.toString(), title: currentPeer.title },
			currentDefault: { session: currentDefault.session.toString(), chat: currentDefault.chat.toString(), title: currentDefault.title },
		}, {
			explicitPeer: { session: 'copilot:/s2', chat: buildChatUri('copilot:/s2', 'c9'), title: 'Side Work' },
			explicitDefault: { session: 'copilot:/s2', chat: buildDefaultChatUri('copilot:/s2'), title: 'Default Work' },
			currentPeer: { session: 'copilot:/s1', chat: peer, title: 'Current Peer' },
			currentDefault: { session: 'copilot:/s1', chat: buildDefaultChatUri('copilot:/s1'), title: 'Current Default' },
		});
		assert.throws(() => getRenameChatArgs({ session: 'copilot:/s2', title: 'Only session' }, sessions), /known chat/);
		assert.throws(() => getRenameChatArgs({ chat: 'agent-host-session://copilot/s2?chat=c9', session: 'copilot:/s1', title: 'Mismatch' }, sessions), /must match/);
	});

	test('rename_chat returns before resolving the target session', async () => {
		const getSessionStarted = new DeferredPromise<URI>();
		const releaseGetSession = new DeferredPromise<void>();
		const renameCompleted = new DeferredPromise<void>();
		const accessor = createAccessor({
			getSession: async session => {
				await getSessionStarted.complete(session);
				await releaseGetSession.p;
				return sessionMeta('s1', SessionStatus.Idle, workspace);
			},
			renameChat: async (_session, _chat, _title) => {
				await renameCompleted.complete();
				return { title: 'Peer Focus' };
			},
		});
		const peer = buildChatUri('copilot:/s1', 'peer');
		const result = await applyRenameChatTool(accessor, { title: 'Peer Focus', automatic: true }, peer);
		const targetSession = await getSessionStarted.p;
		assert.deepStrictEqual({
			result,
			targetSession: targetSession.toString(),
			renameCompletedBeforeRelease: renameCompleted.isSettled,
		}, {
			result: 'Renaming chat.',
			targetSession: 'copilot:/s1',
			renameCompletedBeforeRelease: false,
		});
		await releaseGetSession.complete();
		await renameCompleted.p;
	});

	test('rename_chat gets only target sessions and forwards addressed default or peer chats', async () => {
		let listSessionsCalls = 0;
		const renames: { session: string; chat: string; title: string }[] = [];
		const allRenamesCompleted = new DeferredPromise<void>();
		const accessor = createAccessor({
			listSessions: async () => {
				listSessionsCalls++;
				return [];
			},
			getSession: async session => session.toString() === 'copilot:/s1' ? sessionMeta('s1', SessionStatus.Idle, workspace) : undefined,
			renameChat: async (session, chat, title) => {
				renames.push({ session: session.toString(), chat: chat.toString(), title });
				if (renames.length === 3) {
					await allRenamesCompleted.complete();
				}
				return { title };
			},
		});

		const peer = buildChatUri('copilot:/s1', 'peer');
		const defaultChat = buildDefaultChatUri('copilot:/s1');
		const results = await Promise.all([
			applyRenameChatTool(accessor, { title: 'Default Focus' }, defaultChat),
			applyRenameChatTool(accessor, { title: 'Peer Focus' }, peer),
			applyRenameChatTool(accessor, { chat: 'agent-host-session://copilot/s1?chat=peer', title: 'Updated Focus' }),
		]);
		await allRenamesCompleted.p;
		assert.deepStrictEqual({ results, renames, listSessionsCalls }, {
			results: ['Renamed chat to "Default Focus".', 'Renamed chat to "Peer Focus".', 'Renamed chat to "Updated Focus".'],
			renames: [
				{ session: 'copilot:/s1', chat: defaultChat, title: 'Default Focus' },
				{ session: 'copilot:/s1', chat: peer, title: 'Peer Focus' },
				{ session: 'copilot:/s1', chat: peer, title: 'Updated Focus' },
			],
			listSessionsCalls: 0,
		});
	});

	test('rename_chat reports background failures', async () => {
		const reportedError = new DeferredPromise<{ toolName: SessionServerToolName; error: unknown }>();
		const result = await applyRenameChatTool(createAccessor({
			getSession: async () => sessionMeta('s1', SessionStatus.Idle, workspace),
			renameChat: async () => { throw new Error('Invalid rename_chat input: chat must match a known non-default chat.'); },
			reportToolError: (toolName, error) => { void reportedError.complete({ toolName, error }); },
		}), { title: 'Ignored', automatic: true }, buildDefaultChatUri('copilot:/s1'));
		const failure = await reportedError.p;
		assert.deepStrictEqual({
			result,
			toolName: failure.toolName,
			error: failure.error instanceof Error ? failure.error.message : failure.error,
		}, {
			result: 'Renaming chat.',
			toolName: SessionServerToolName.RenameChat,
			error: 'Invalid rename_chat input: chat must match a known non-default chat.',
		});
	});

	test('rename_chat uses the invoking chat while server-tool state remains session-scoped', async () => {
		const stateManager = new AgentHostStateManager(new NullLogService());
		const session = 'copilot:/s1';
		const peer = buildChatUri(session, 'peer');
		stateManager.createSession({
			resource: session,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		const renamedChat = new DeferredPromise<string>();
		const host = new AgentServerToolHost(stateManager, [
			createSessionServerToolGroup(createAccessor({
				onRenameChat: (_session, chat) => { void renamedChat.complete(chat.toString()); },
			})),
		]);
		host.advertise(session);

		const result = await host.executeTool(peer, SessionServerToolName.RenameChat, { title: 'Peer Focus' });

		assert.deepStrictEqual({ result, renamedChat: await renamedChat.p }, {
			result: 'Renamed chat to "Peer Focus".',
			renamedChat: peer,
		});
		stateManager.dispose();
	});

	test('repeated rename tool calls each apply their requested title', async () => {
		const bothRenamesStarted = new DeferredPromise<void>();
		const releaseFirstRename = new DeferredPromise<void>();
		const titles: string[] = [];
		const accessor = createAccessor({
			renameChat: async (_session, _chat, title) => {
				titles.push(title);
				if (titles.length === 1) {
					await releaseFirstRename.p;
				} else {
					await bothRenamesStarted.complete();
				}
				return { title };
			},
		});
		const defaultChat = buildDefaultChatUri('copilot:/s1');
		const first = await applyRenameChatTool(accessor, { title: 'Named Once', automatic: true }, defaultChat);
		const second = applyRenameChatTool(accessor, { title: 'Renamed Again' }, defaultChat);
		await bothRenamesStarted.p;
		await releaseFirstRename.complete();
		const secondResult = await second;
		assert.deepStrictEqual({ first, second: secondResult, titles }, {
			first: 'Renaming chat.',
			second: 'Renamed chat to "Renamed Again".',
			titles: ['Named Once', 'Renamed Again'],
		});
	});

	test('create_chat inherits the calling chat model when no override is provided', async () => {
		const source = URI.parse(buildChatUri('copilot:/s1', 'source'));
		let creationSource: URI | undefined;
		let createdModel: ModelSelection | undefined;
		const accessor = createAccessor({
			getCreationDefaults: uri => {
				creationSource = uri;
				return { provider: 'copilot', model: { id: 'gpt-inherited' } };
			},
			onCreateChat: (_session, _chat, options) => { createdModel = options?.model; },
		});

		await applyCreateChatTool(accessor, { prompt: 'do it' }, source);

		assert.deepStrictEqual({
			creationSource: creationSource?.toString(),
			createdModel,
		}, {
			creationSource: source.toString(),
			createdModel: { id: 'gpt-inherited' },
		});
	});

	test('create_chat does not inherit a model across providers', async () => {
		let createdModel: ModelSelection | undefined;
		const accessor = createAccessor({
			listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace), { ...sessionMeta('s2', SessionStatus.Idle, workspace), session: URI.parse('claude:/s2') }],
			getCreationDefaults: () => ({ provider: 'copilot', model: { id: 'gpt-inherited' } }),
			onCreateChat: (_session, _chat, options) => { createdModel = options?.model; },
		});

		await applyCreateChatTool(accessor, { session: 'claude:/s2', prompt: 'do it' }, URI.parse(buildDefaultChatUri('copilot:/s1')));
		assert.strictEqual(createdModel, undefined);
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
		const privateChild = {
			...sessionMeta('child', SessionStatus.Idle, workspace),
			_meta: withSessionOrchestration(undefined, {
				parentSession: 'copilot:/s2',
				creatorSession: 'copilot:/s2',
				coordinateWithCreator: false,
			}),
		};
		const privateAccessor = createAccessor({
			listSessions: async () => [privateChild, sessionMeta('s2', SessionStatus.Idle, workspace)],
		});
		await assert.rejects(
			() => applySendMessageTool(privateAccessor, { session: 'copilot:/s2', message: 'blocked' }, buildDefaultChatUri('copilot:/child')),
			/not allowed to coordinate with its creator/,
		);
		await assert.rejects(
			() => applyCreateChatTool(privateAccessor, { session: 'copilot:/s2', prompt: 'blocked' }, URI.parse(buildDefaultChatUri('copilot:/child'))),
			/not allowed to coordinate with its creator/,
		);
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
			const withCtx = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions, getChatContext: async () => snapshot }));
			const live = JSON.parse(await withCtx.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.GetSessionContext, { session: 'copilot:/s1' }));
			assert.strictEqual(live.transcript.length, 2);

			const cold = createSessionServerToolGroup(createAccessor({ listSessions: async () => sessions, getChatContext: async () => undefined }));
			assert.deepStrictEqual(JSON.parse(await cold.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.GetSessionContext, { session: 'copilot:/s1' })), {
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
		const text = await group.execute(stateManager, { sessionUri: 'copilot:/s1', chatUri: chatChannel }, SessionServerToolName.GetCurrentSession, {});
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
