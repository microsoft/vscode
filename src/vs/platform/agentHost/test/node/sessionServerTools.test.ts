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
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, readSessionCreationReference, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, TurnState, withSessionGitState, withSessionGitHubState, type ModelSelection, type ResponsePart, type ToolCallState, type Turn } from '../../common/state/sessionState.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { withEphemeralSessionMeta } from '../../common/meta/agentEphemeralSessionMeta.js';
import { AgentServerToolHost, type IServerToolGroup } from '../../node/shared/agentServerToolHost.js';
import {
	applyCreateChatTool,
	applyCreateSessionTool,
	applyDeleteSessionTool,
	applyRenameChatTool,
	applySendMessageTool,
	createSessionServerToolGroup,
	formatCreateChatResult,
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
		return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), turnId: 'turn-1' };
	}

	function createAccessor(overrides?: Partial<ISessionServerToolAccessor> & { onCreate?: (config: IAgentCreateSessionConfig) => void; onPrompt?: (...args: Parameters<ISessionServerToolAccessor['startPrompt']>) => void; onCreateChat?: (session: URI, chat: URI, options?: { title?: string; model?: ModelSelection }) => void; onRenameChat?: (session: URI, chat: URI, title: string) => void; onDelete?: (session: URI) => void; depths?: Map<string, number> }): ISessionServerToolAccessor {
		const depths = overrides?.depths ?? new Map<string, number>();
		return {
			isActiveAgentTitleGenerationEnabled: overrides?.isActiveAgentTitleGenerationEnabled ?? (() => true),
			listSessions: overrides?.listSessions ?? (async () => [sessionMeta('s1', SessionStatus.InProgress, workspace)]),
			getSession: overrides?.getSession ?? (async session => session.toString() === 'copilot:/s1' ? sessionMeta('s1', SessionStatus.InProgress, workspace) : undefined),
			createSession: overrides?.createSession ?? (async config => { overrides?.onCreate?.(config); return URI.parse('copilot:/new'); }),
			getModels: overrides?.getModels ?? (() => [model]),
			getCreationDefaults: overrides?.getCreationDefaults ?? (() => undefined),
			startPrompt: overrides?.startPrompt ?? (async (session, chat, prompt, delegation) => { overrides?.onPrompt?.(session, chat, prompt, delegation); }),
			createChat: overrides?.createChat ?? (async (session, chat, options) => { overrides?.onCreateChat?.(session, chat, options); }),
			renameChat: overrides?.renameChat ?? (async (session, chat, title) => { overrides?.onRenameChat?.(session, chat, title); return { title }; }),
			reportToolError: overrides?.reportToolError ?? (() => { }),
			deleteSession: overrides?.deleteSession ?? (async session => { overrides?.onDelete?.(session); }),
			getChatContext: overrides?.getChatContext ?? (async () => undefined),
			getSessionSpawnDepth: overrides?.getSessionSpawnDepth ?? (session => depths.get(session.toString()) ?? 0),
			setSessionSpawnDepth: overrides?.setSessionSpawnDepth ?? ((session, depth) => { depths.set(session.toString(), depth); }),
		};
	}

	function createConfigSnapshot(config: IAgentCreateSessionConfig | undefined) {
		if (!config) {
			return undefined;
		}
		const { _meta, workingDirectories, ...rest } = config;
		return {
			...rest,
			...(workingDirectories !== undefined ? { workingDirectories: workingDirectories.map(directory => directory.toString()) } : {}),
			createdBySession: readSessionCreationReference(_meta),
		};
	}

	test('definitions and confirmation', () => {
		assert.deepStrictEqual(sessionServerToolDefinitions.map(d => d.name), [SessionServerToolName.ListSessions, SessionServerToolName.GetCurrentSession, SessionServerToolName.CreateSession, SessionServerToolName.RenameChat, SessionServerToolName.SendMessage, SessionServerToolName.GetSessionContext, SessionServerToolName.DeleteSession]);
		assert.match(sessionServerToolDefinitions.find(definition => definition.name === SessionServerToolName.ListSessions)?.description ?? '', /`openLink` for clickable Markdown links/);
		assert.deepStrictEqual(sessionServerToolDefinitions.filter(definition => definition.enabledForEphemeralSessions).map(definition => definition.name), []);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.CreateSession), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.CreateChat), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.SendMessage), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.DeleteSession), true);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.RenameChat), false);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.ListSessions), false);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.GetCurrentSession), false);
		assert.strictEqual(sessionToolRequiresConfirmation(SessionServerToolName.GetSessionContext), false);
		assert.deepStrictEqual(sessionServerToolDefinitions.find(def => def.name === SessionServerToolName.CreateSession)?.inputSchema, {
			type: 'object',
			properties: {
				relationship: {
					type: 'string',
					enum: ['currentSession', 'independent'],
					description: 'Whether this work belongs to the current session or is independently managed. Use `currentSession` for tasks from the current plan or deliverable, including parallel or delegated tasks. Use `independent` only for a separate deliverable that needs its own workspace and top-level lifecycle.',
				},
				prompt: { type: 'string', description: 'Initial prompt to send to the new session.' },
				workspace: { type: 'string', description: 'For `independent` work: unique project name, project/workspace URI, absolute folder path, or working directory from an existing session. Required for `independent` and invalid for `currentSession`.' },
				title: { type: 'string', maxLength: 200, description: 'Short title for the new chat or independent session.' },
				model: { type: 'string', description: 'Optional model ID or display name. Defaults to the current chat\'s model. For `currentSession`, the model must belong to the current session\'s provider; for `independent`, the model selects the new session\'s provider.' },
			},
			required: ['relationship', 'prompt', 'title'],
		});
		assert.strictEqual(sessionServerToolDefinitions.find(def => def.name === SessionServerToolName.ListSessions)?.inputSchema?.properties?.label, undefined);
		const renameDefinition = sessionServerToolDefinitions.find(def => def.name === SessionServerToolName.RenameChat);
		assert.deepStrictEqual([{ name: renameDefinition?.name, required: renameDefinition?.inputSchema?.required }], [
			{ name: SessionServerToolName.RenameChat, required: ['title'] },
		]);
		assert.deepStrictEqual([renameDefinition?.inputSchema?.properties?.title], [
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
		assert.ok(host.getDefinitionsForSession(session).some(tool => tool.name === SessionServerToolName.RenameChat));
		stateManager.dispose();
	});

	test('re-advertise updates dynamic groups while materialized session tools stay fixed', () => {
		let sessionToolsEnabled = false;
		let dynamicToolsEnabled = false;
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
		const dynamicGroup: IServerToolGroup = {
			definitions: [{ name: 'dynamic_tool', description: 'Dynamic tool.', inputSchema: { type: 'object', properties: {} } }],
			isEnabled: () => dynamicToolsEnabled,
			execute: () => '',
		};
		const host = new AgentServerToolHost(stateManager, [
			createSessionServerToolGroup(createAccessor({ isActiveAgentTitleGenerationEnabled: () => sessionToolsEnabled })),
			dynamicGroup,
		]);

		host.advertise(session);
		sessionToolsEnabled = true;
		dynamicToolsEnabled = true;
		host.advertise(session);
		const enabledTools = stateManager.getSessionState(session)?.serverTools?.map(tool => tool.name);
		dynamicToolsEnabled = false;
		host.advertise(session);

		assert.deepStrictEqual({
			enabledTools,
			disabledTools: stateManager.getSessionState(session)?.serverTools?.map(tool => tool.name),
		}, {
			enabledTools: [
				SessionServerToolName.ListSessions,
				SessionServerToolName.GetCurrentSession,
				SessionServerToolName.CreateSession,
				SessionServerToolName.SendMessage,
				SessionServerToolName.GetSessionContext,
				SessionServerToolName.DeleteSession,
				'dynamic_tool',
			],
			disabledTools: [
				SessionServerToolName.ListSessions,
				SessionServerToolName.GetCurrentSession,
				SessionServerToolName.CreateSession,
				SessionServerToolName.SendMessage,
				SessionServerToolName.GetSessionContext,
				SessionServerToolName.DeleteSession,
			],
		});
		stateManager.dispose();
	});

	test('materialized create_chat remains executable without being advertised to new sessions', async () => {
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
		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionServerToolsChanged,
			tools: [{
				name: SessionServerToolName.CreateChat,
				description: 'Legacy chat creation tool.',
				inputSchema: { type: 'object', properties: {}, required: [] },
			}],
		});
		let createdChat: URI | undefined;
		const host = new AgentServerToolHost(stateManager, [
			createSessionServerToolGroup(createAccessor({ onCreateChat: (_session, chat) => { createdChat = chat; } })),
		]);

		const result = await host.executeTool(buildDefaultChatUri(session), SessionServerToolName.CreateChat, { prompt: 'Legacy task' });

		assert.deepStrictEqual({
			advertisedToNewSessions: sessionServerToolDefinitions.some(tool => tool.name === SessionServerToolName.CreateChat),
			materializedDefinitions: host.getDefinitionsForSession(session).map(tool => tool.name),
			routableByProviders: host.toolNames.includes(SessionServerToolName.CreateChat),
			createdChat: createdChat !== undefined,
			resultHasOpenLink: result.includes('agent-host-session://copilot/s1?chat='),
		}, {
			advertisedToNewSessions: false,
			materializedDefinitions: [SessionServerToolName.CreateChat],
			routableByProviders: true,
			createdChat: true,
			resultHasOpenLink: true,
		});
		stateManager.dispose();
	});

	test('legacy create_chat remains executable when it is no longer advertised', async () => {
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
		let createdChat = false;
		const host = new AgentServerToolHost(stateManager, [
			createSessionServerToolGroup(createAccessor({ onCreateChat: () => { createdChat = true; } })),
		]);
		host.advertise(session);

		const result = await host.executeTool(buildDefaultChatUri(session), SessionServerToolName.CreateChat, { prompt: 'Stale task' });

		assert.deepStrictEqual({
			advertised: stateManager.getSessionState(session)?.serverTools?.some(tool => tool.name === SessionServerToolName.CreateChat),
			createdChat,
			resultHasOpenLink: result.includes('agent-host-session://copilot/s1?chat='),
		}, {
			advertised: false,
			createdChat: true,
			resultHasOpenLink: true,
		});
		stateManager.dispose();
	});

	test('restored sessions refresh materialized tool metadata while preserving membership and legacy create_chat (issue #330138)', () => {
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
		// A session materialized on an older build: create_session pinned to the old
		// reply-and-stop description, plus the retired create_chat entry.
		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionServerToolsChanged,
			tools: [
				{ name: SessionServerToolName.CreateSession, description: 'Create delegated work. The UI shows the created chat or session as a link, so reply with a single short sentence and do NOT print the session URL.', inputSchema: { type: 'object', properties: {}, required: [] } },
				{ name: SessionServerToolName.CreateChat, description: 'Legacy chat creation tool.', inputSchema: { type: 'object', properties: {}, required: [] } },
			],
		});
		const host = new AgentServerToolHost(stateManager, [createSessionServerToolGroup(createAccessor())]);

		const definitions = host.getDefinitionsForSession(session);
		const descriptionByName = new Map(definitions.map(definition => [definition.name, definition.description]));
		const currentCreateSession = sessionServerToolDefinitions.find(definition => definition.name === SessionServerToolName.CreateSession)?.description;

		assert.deepStrictEqual({
			names: definitions.map(definition => definition.name),
			createSessionRefreshedToCurrent: descriptionByName.get(SessionServerToolName.CreateSession) === currentCreateSession,
			createSessionKeepsOldWording: /reply with a single short sentence/i.test(descriptionByName.get(SessionServerToolName.CreateSession) ?? ''),
			legacyCreateChatDescription: descriptionByName.get(SessionServerToolName.CreateChat),
		}, {
			names: [SessionServerToolName.CreateSession, SessionServerToolName.CreateChat],
			createSessionRefreshedToCurrent: true,
			createSessionKeepsOldWording: false,
			legacyCreateChatDescription: 'Legacy chat creation tool.',
		});
		stateManager.dispose();
	});

	test('serializeSessions produces compact metadata', () => {
		const text = serializeSessions([sessionMeta('s1', SessionStatus.InputNeeded, workspace)]);
		assert.deepStrictEqual(JSON.parse(text), {
			sessions: [{
				session: 'copilot:/s1',
				openLink: 'agent-host-session://copilot/s1',
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
				openLink: 'agent-host-session://copilot/rich',
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
			openLink: 'agent-host-session://copilot/remote',
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
		const byId = getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), prompt: 'hi', title: 'Task', model: 'gpt-4o' }, sessions, [model]);
		const byName = getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), prompt: 'hi', title: 'Task', model: 'GPT-4o' }, sessions, [model]);
		assert.deepStrictEqual({
			byId: {
				relationship: byId.relationship,
				workspace: byId.relationship === 'independent' ? byId.workspace.toString() : undefined,
				title: byId.title,
				model: byId.model?.id,
			},
			byName: {
				relationship: byName.relationship,
				title: byName.title,
				model: byName.model?.name,
			},
		}, {
			byId: { relationship: 'independent', workspace: workspace.toString(), title: 'Task', model: 'gpt-4o' },
			byName: { relationship: 'independent', title: 'Task', model: 'GPT-4o' },
		});
	});

	test('getCreateSessionArgs scopes current-session models and rejects ambiguous independent names', () => {
		const copilotModel: IAgentModelInfo = { provider: 'copilot', id: 'copilot-shared', name: 'Shared Model', supportsVision: false };
		const claudeModel: IAgentModelInfo = { provider: 'claude', id: 'claude-shared', name: 'Shared Model', supportsVision: false };
		const models = [copilotModel, claudeModel];

		assert.deepStrictEqual(
			getCreateSessionArgs({ relationship: 'currentSession', prompt: 'hi', title: 'Task', model: 'Shared Model' }, [], models, 'claude').model,
			claudeModel,
		);
		assert.throws(
			() => getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), prompt: 'hi', title: 'Task', model: 'Shared Model' }, [], models),
			/model "Shared Model" is ambiguous; use one of these model ids: copilot-shared, claude-shared/,
		);
	});

	test('getCreateSessionArgs resolves a unique project name to its configured root', () => {
		const project = URI.parse('file:///workspace/vscode');
		const worktree = URI.parse('file:///worktrees/pr-331525');
		const sessions = [{
			...sessionMeta('worktree', SessionStatus.Idle, worktree),
			project: { uri: project, displayName: 'Visual Studio Code' },
		}];

		assert.deepStrictEqual({
			byName: getCreateSessionArgs({ relationship: 'independent', workspace: 'visual studio code', prompt: 'hi', title: 'Task' }, sessions, []),
			byProjectUri: getCreateSessionArgs({ relationship: 'independent', workspace: project.toString(), prompt: 'hi', title: 'Task' }, sessions, []),
		}, {
			byName: { relationship: 'independent', workspace: project, prompt: 'hi', title: 'Task' },
			byProjectUri: { relationship: 'independent', workspace: project, prompt: 'hi', title: 'Task' },
		});
	});

	test('getCreateSessionArgs reports ambiguous project names', () => {
		const sessions = [
			{ ...sessionMeta('one', SessionStatus.Idle, URI.parse('file:///worktrees/one')), project: { uri: URI.parse('file:///projects/one'), displayName: 'App' } },
			{ ...sessionMeta('two', SessionStatus.Idle, URI.parse('file:///worktrees/two')), project: { uri: URI.parse('file:///projects/two'), displayName: 'App' } },
		];

		assert.throws(
			() => getCreateSessionArgs({ relationship: 'independent', workspace: 'app', prompt: 'hi', title: 'Task' }, sessions, []),
			/ambiguous; use one of these project URIs: file:\/\/\/projects\/one, file:\/\/\/projects\/two/i,
		);
	});

	test('getCreateSessionArgs accepts an absolute filesystem path as workspace', () => {
		const resolved = getCreateSessionArgs({ relationship: 'independent', workspace: '/Users/me/work/repo', prompt: 'hi', title: 'Task' }, [], []);
		assert.strictEqual(resolved.relationship === 'independent' ? resolved.workspace.scheme : undefined, 'file');
		// Compare `path` (always forward-slash) rather than `fsPath`, which is
		// platform-specific (backslashes on Windows).
		assert.strictEqual(resolved.relationship === 'independent' ? resolved.workspace.path : undefined, '/Users/me/work/repo');
	});

	test('getCreateSessionArgs throws on invalid input', () => {
		assert.throws(() => getCreateSessionArgs({ relationship: 'independent', workspace: 'not a uri', prompt: 'hi', title: 'Task' }, [], []), /workspace/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), prompt: 'hi', title: 'Task', model: 'nope' }, [], [model]), /model/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), title: 'Task' }, [], []), /prompt/);
		assert.throws(() => getCreateSessionArgs({ workspace: workspace.toString(), prompt: 'hi', title: 'Task' }, [], []), /relationship/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'other', prompt: 'hi', title: 'Task' }, [], []), /relationship/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'independent', prompt: 'hi', title: 'Task' }, [], []), /workspace/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'currentSession', workspace: workspace.toString(), prompt: 'hi', title: 'Task' }, [], []), /workspace/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), prompt: 'hi' }, [], []), /title/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), prompt: 'hi', title: ' ' }, [], []), /non-whitespace/);
		assert.throws(() => getCreateSessionArgs({ relationship: 'independent', workspace: workspace.toString(), prompt: 'hi', title: 'x'.repeat(201) }, [], []), /must not exceed 200/);
	});

	test('create_session builds config, starts the default chat, and returns an open link', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		let created: IAgentCreateSessionConfig | undefined;
		let renamed: { session: URI; chat: URI; title: string } | undefined;
		let prompted: { chat: URI; prompt: string; delegation: Parameters<ISessionServerToolAccessor['startPrompt']>[3] } | undefined;
		const accessor = createAccessor({
			onCreate: c => { created = c; },
			onRenameChat: (session, chat, title) => { renamed = { session, chat, title }; },
			onPrompt: (_s, chat, prompt, delegation) => { prompted = { chat, prompt, delegation }; },
		});
		const group = createSessionServerToolGroup(accessor);

		const text = await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, { relationship: 'independent', workspace: workspace.toString(), prompt: 'do it', title: 'New Task', model: 'gpt-4o' });

		assert.deepStrictEqual(createConfigSnapshot(created), {
			workingDirectories: [workspace.toString()],
			provider: 'copilot',
			model: { id: 'gpt-4o' },
			createdBySession: {
				session: 'copilot:/caller',
				chat: buildDefaultChatUri('copilot:/caller'),
				turnId: 'turn-1',
			},
			config: { [SessionConfigKey.Isolation]: 'worktree' },
		});
		assert.strictEqual(prompted?.prompt, 'do it');
		assert.strictEqual(prompted?.chat.toString(), buildDefaultChatUri(URI.parse('copilot:/new')));
		assert.deepStrictEqual({
			session: renamed?.session.toString(),
			chat: renamed?.chat.toString(),
			title: renamed?.title,
		}, {
			session: 'copilot:/new',
			chat: buildDefaultChatUri('copilot:/new'),
			title: 'New Task',
		});
		assert.deepStrictEqual(prompted?.delegation, {
			sourceSession: 'copilot:/caller',
			sourceChat: buildDefaultChatUri('copilot:/caller'),
			sourceTurnId: 'turn-1',
		});
		assert.ok(text.includes('agent-host-session://copilot/new'), 'result carries the open-session link for the pill');
		assert.ok(text.startsWith('New session created'), 'result describes independent work as a new session');
		assert.ok(!text.includes('copilot:/new'), 'result does not echo the raw backend session URI');
		store.dispose();
	});

	test('create_session falls back to an explicit workspace when listing sessions fails', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		let created: IAgentCreateSessionConfig | undefined;
		let catalogRequests = 0;
		const accessor = createAccessor({
			listSessions: async () => {
				catalogRequests++;
				throw new Error('Provider codex cannot enumerate its native session catalog yet');
			},
			onCreate: config => { created = config; },
		});
		const group = createSessionServerToolGroup(accessor);

		const text = await group.execute(stateManager, executionContext('codex:/caller'), SessionServerToolName.CreateSession, {
			relationship: 'independent',
			workspace: workspace.toString(),
			prompt: 'do it',
			title: 'New Task',
		});

		assert.deepStrictEqual({
			catalogRequests,
			workingDirectories: created?.workingDirectories?.map(directory => directory.toString()),
			result: text.startsWith('New session created'),
		}, {
			catalogRequests: 1,
			workingDirectories: [workspace.toString()],
			result: true,
		});
		store.dispose();
	});

	test('create_session prefers a URI-shaped project display name from the catalog', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const project = URI.parse('file:///projects/repo-main');
		let created: IAgentCreateSessionConfig | undefined;
		const accessor = createAccessor({
			listSessions: async () => [{
				...sessionMeta('project', SessionStatus.Idle, URI.parse('file:///worktrees/repo-main')),
				project: { uri: project, displayName: 'repo:main' },
			}],
			onCreate: config => { created = config; },
		});
		const group = createSessionServerToolGroup(accessor);

		await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, {
			relationship: 'independent',
			workspace: 'repo:main',
			prompt: 'do it',
			title: 'New Task',
		});

		assert.deepStrictEqual(created?.workingDirectories?.map(directory => directory.toString()), [project.toString()]);
		store.dispose();
	});

	test('create_session and send_message results are neutral, non-terminal statements (issue #330138)', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const accessor = createAccessor({
			listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace), sessionMeta('s2', SessionStatus.Idle, workspace)],
		});
		const group = createSessionServerToolGroup(accessor);

		const independent = await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, { relationship: 'independent', workspace: workspace.toString(), prompt: 'do it', title: 'New Task' });
		const peer = await group.execute(stateManager, { sessionUri: 'copilot:/s1', chatUri: buildDefaultChatUri('copilot:/s1'), turnId: 'turn-1' }, SessionServerToolName.CreateSession, { relationship: 'currentSession', prompt: 'do it', title: 'Task A' });
		const message = await applySendMessageTool(accessor, { session: 'copilot:/s2', message: 'hi' }, buildDefaultChatUri('copilot:/s1'), 'turn-1');
		// Retired but still routable: the compatibility contract must not regain the wording either.
		const legacyChat = formatCreateChatResult(await applyCreateChatTool(accessor, { session: 'copilot:/s1', prompt: 'do it', title: 'T' }, URI.parse(buildDefaultChatUri('copilot:/s1')), 'turn-1'));

		// Results must read as neutral statements of fact, not as "reply once and stop" (issue #330138).
		for (const result of [independent, peer, message, legacyChat]) {
			assert.doesNotMatch(result, /Reply with one short sentence/, 'result no longer instructs the agent to stop and just confirm');
			assert.doesNotMatch(result, /confirm/i, 'result carries no confirm-and-stop imperative');
			assert.match(result, /^[^.]+\(agent-host-session:\/\/[^)]+\)\.$/, 'result is a single factual statement carrying the open link');
		}

		// The persistent tool contract stays purely functional (issue #330138): no reply-and-stop signal, no UI-presentation policy.
		for (const name of [SessionServerToolName.CreateSession, SessionServerToolName.SendMessage]) {
			const description = sessionServerToolDefinitions.find(definition => definition.name === name)?.description ?? '';
			assert.doesNotMatch(description, /reply with a single short sentence/i, `${name} description no longer tells the agent to reply-and-stop`);
			assert.doesNotMatch(description, /\bthe UI\b|print the (session )?URL|click (a|the) (link|button)/i, `${name} description does not leak UI-presentation policy`);
		}
		store.dispose();
	});

	test('create_session inherits the calling chat model, permission config, and isolation for the same project', async () => {
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
					isolation: 'folder',
					project: workspace,
				};
			},
			onCreate: config => { created = config; },
		});

		const group = createSessionServerToolGroup(accessor);
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		await group.execute(stateManager, { sessionUri: 'copilot:/caller', chatUri: source.toString() }, SessionServerToolName.CreateSession, { relationship: 'independent', workspace: workspace.toString(), prompt: 'do it', title: 'Inherited Task' });

		assert.deepStrictEqual({
			creationSource: creationSource?.toString(),
			created: createConfigSnapshot(created),
		}, {
			creationSource: source.toString(),
			created: {
				workingDirectories: [workspace.toString()],
				provider: 'copilot',
				model: { id: 'gpt-inherited' },
				createdBySession: {
					session: 'copilot:/caller',
					chat: source.toString(),
				},
				config: {
					autoApprove: 'autoApprove',
					permissions: { allow: ['shell'], deny: ['write'] },
					[SessionConfigKey.Isolation]: 'folder',
				},
			},
		});
		store.dispose();
	});

	test('create_session uses worktree isolation when the source project differs or is workspace-less', async () => {
		const created: (IAgentCreateSessionConfig | undefined)[] = [];
		const sourceProject = URI.file('/workspace/source');
		let project: URI | undefined = sourceProject;
		const accessor = createAccessor({
			getCreationDefaults: () => ({ provider: 'copilot', isolation: 'folder', project }),
			onCreate: config => { created.push(config); },
		});

		await applyCreateSessionTool(accessor, { relationship: 'independent', workspace: workspace.toString(), prompt: 'different project', title: 'Different Project' }, URI.parse('copilot:/source'));
		project = undefined;
		await applyCreateSessionTool(accessor, { relationship: 'independent', workspace: workspace.toString(), prompt: 'quick chat', title: 'Quick Chat Task' }, URI.parse('copilot:/quick-chat'));

		assert.deepStrictEqual(created.map(createConfigSnapshot), [
			{
				workingDirectories: [workspace.toString()],
				provider: 'copilot',
				createdBySession: {
					session: 'copilot:/source',
					chat: 'copilot:/source',
				},
				config: { [SessionConfigKey.Isolation]: 'worktree' },
			},
			{
				workingDirectories: [workspace.toString()],
				provider: 'copilot',
				createdBySession: {
					session: 'copilot:/quick-chat',
					chat: 'copilot:/quick-chat',
				},
				config: { [SessionConfigKey.Isolation]: 'worktree' },
			},
		]);
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

		await applyCreateSessionTool(accessor, { relationship: 'independent', workspace: workspace.toString(), prompt: 'do it', title: 'Provider Task' }, URI.parse('claude:/source'));

		assert.deepStrictEqual(createConfigSnapshot(created), {
			workingDirectories: [workspace.toString()],
			provider: 'claude',
			createdBySession: {
				session: 'claude:/source',
				chat: 'claude:/source',
			},
			config: {
				permissionMode: 'acceptEdits',
				[SessionConfigKey.Isolation]: 'worktree',
			},
		});
	});

	test('create_session inherits worktree isolation for the same project', async () => {
		const gitWorkspace = URI.file('/workspace/git-repository');
		let created: IAgentCreateSessionConfig | undefined;
		const accessor = createAccessor({
			getCreationDefaults: () => ({ provider: 'copilot', isolation: 'worktree', project: gitWorkspace }),
			onCreate: config => { created = config; },
		});

		await applyCreateSessionTool(accessor, {
			relationship: 'independent',
			workspace: gitWorkspace.toString(),
			prompt: 'do it',
			title: 'Isolated Task',
		}, URI.parse('copilot:/source'));

		assert.deepStrictEqual(createConfigSnapshot(created), {
			workingDirectories: [gitWorkspace.toString()],
			provider: 'copilot',
			createdBySession: {
				session: 'copilot:/source',
				chat: 'copilot:/source',
			},
			config: { [SessionConfigKey.Isolation]: 'worktree' },
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
			getCreationDefaults: () => ({ provider: 'copilot', model: { id: 'gpt-4o' }, config: { autoApprove: 'autoApprove' }, isolation: 'folder', project: remoteProject }),
			onCreate: config => { created = config; },
		});

		await applyCreateSessionTool(accessor, {
			relationship: 'independent',
			workspace: 'Remote App',
			prompt: 'do it',
			title: 'Remote Task',
			model: 'claude-sonnet',
		}, URI.parse('copilot:/source'));

		assert.deepStrictEqual(createConfigSnapshot(created), {
			workingDirectories: [remoteProject.toString()],
			provider: 'claude',
			model: { id: 'claude-sonnet' },
			config: { [SessionConfigKey.Isolation]: 'folder' },
			createdBySession: {
				session: 'copilot:/source',
				chat: 'copilot:/source',
			},
		});
	});

	test('list_sessions execute returns serialized sessions', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const group = createSessionServerToolGroup(createAccessor());
		const text = await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.ListSessions, {});
		assert.deepStrictEqual(JSON.parse(text).sessions.map((session: { session: string; openLink: string }) => ({
			session: session.session,
			openLink: session.openLink,
		})), [{
			session: 'copilot:/s1',
			openLink: 'agent-host-session://copilot/s1',
		}]);
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
		const args = { relationship: 'independent', workspace: workspace.toString(), prompt: 'go', title: 'Spawned Task' };

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
		const args = { relationship: 'independent', workspace: workspace.toString(), prompt: 'go', title: 'Spawned Task' };
		for (let i = 0; i < 25; i++) {
			await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, args);
		}
		await assert.rejects(async () => { await group.execute(stateManager, executionContext('copilot:/caller'), SessionServerToolName.CreateSession, args); }, /more than 25 sessions/);
		store.dispose();
	});

	test('create_session with currentSession adds a peer chat to the invoking session', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		let createdChat: { session: URI; chat: URI; options?: { title?: string; model?: ModelSelection } } | undefined;
		let renamedChat: { session: URI; chat: URI; title: string } | undefined;
		let createdSession = false;
		let prompted: { session: URI; chat: URI; prompt: string; delegation: Parameters<ISessionServerToolAccessor['startPrompt']>[3] } | undefined;
		const operations: string[] = [];
		const accessor = createAccessor({
			onCreate: () => { createdSession = true; },
			onCreateChat: (session, chat, options) => { createdChat = { session, chat, options }; operations.push('create'); },
			onRenameChat: (session, chat, title) => { renamedChat = { session, chat, title }; operations.push('rename'); },
			onPrompt: (session, chat, prompt, delegation) => { prompted = { session, chat, prompt, delegation }; operations.push('prompt'); },
		});
		const source = URI.parse(buildDefaultChatUri('copilot:/s1'));
		const group = createSessionServerToolGroup(accessor);

		const text = await group.execute(stateManager, { sessionUri: 'copilot:/s1', chatUri: source.toString(), turnId: 'turn-1' }, SessionServerToolName.CreateSession, {
			relationship: 'currentSession',
			prompt: 'do it',
			title: 'Task A',
			model: 'gpt-4o',
		});

		assert.deepStrictEqual({
			createdSession,
			createdSessionUri: createdChat?.session.toString(),
			createdChatTitle: createdChat?.options?.title,
			createdChatModel: createdChat?.options?.model?.id,
			persistedChat: renamedChat && { session: renamedChat.session.toString(), chat: renamedChat.chat.toString(), title: renamedChat.title },
			promptedChat: prompted?.chat.toString(),
			promptedPrompt: prompted?.prompt,
			operations,
			delegation: prompted?.delegation,
			resultMessage: text.split(' (', 1)[0],
			hasChatLink: text.includes('agent-host-session://copilot/s1?chat='),
		}, {
			createdSession: false,
			createdSessionUri: 'copilot:/s1',
			createdChatTitle: 'Task A',
			createdChatModel: 'gpt-4o',
			persistedChat: { session: 'copilot:/s1', chat: createdChat?.chat.toString(), title: 'Task A' },
			promptedChat: createdChat?.chat.toString(),
			promptedPrompt: 'do it',
			operations: ['create', 'rename', 'prompt'],
			delegation: {
				sourceSession: 'copilot:/s1',
				sourceChat: source.toString(),
				sourceTurnId: 'turn-1',
			},
			resultMessage: 'Chat created in the current session',
			hasChatLink: true,
		});
		store.dispose();
	});

	test('create_session with currentSession rejects a model from another provider', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const claudeModel: IAgentModelInfo = { provider: 'claude', id: 'claude-opus', name: 'Claude Opus', supportsVision: false };
		const group = createSessionServerToolGroup(createAccessor({ getModels: () => [model, claudeModel] }));

		await assert.rejects(
			async () => group.execute(stateManager, executionContext('copilot:/s1'), SessionServerToolName.CreateSession, {
				relationship: 'currentSession',
				prompt: 'do it',
				title: 'Cross-provider Task',
				model: claudeModel.id,
			}),
			/model must match an available model id or name for provider "copilot"/,
		);
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
		assert.throws(() => getCreateChatArgs({ prompt: 'hi', title: ' ' }, sessions, [model], URI.parse('copilot:/s1')), /non-whitespace/);
		assert.throws(() => getCreateChatArgs({ prompt: 'hi', title: 'x'.repeat(201) }, sessions, [model], URI.parse('copilot:/s1')), /must not exceed 200/);
	});

	test('legacy create_chat validates titles before creating a chat', async () => {
		let createCount = 0;
		const accessor = createAccessor({ onCreateChat: () => { createCount++; } });

		await assert.rejects(
			applyCreateChatTool(accessor, { prompt: 'do it', title: 'x'.repeat(201) }, URI.parse(buildDefaultChatUri('copilot:/s1'))),
			/must not exceed 200/,
		);

		assert.strictEqual(createCount, 0);
	});

	test('legacy create_chat adds a chat to the session, starts the prompt, and returns an open link', async () => {
		let createdChat: { session: URI; chat: URI; options?: { title?: string; model?: ModelSelection } } | undefined;
		let prompted: { session: URI; chat: URI; prompt: string; delegation: Parameters<ISessionServerToolAccessor['startPrompt']>[3] } | undefined;
		const accessor = createAccessor({
			listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace)],
			onCreateChat: (session, chat, options) => { createdChat = { session, chat, options }; },
			onPrompt: (session, chat, prompt, delegation) => { prompted = { session, chat, prompt, delegation }; },
		});
		const source = URI.parse(buildDefaultChatUri('copilot:/s1'));
		const result = await applyCreateChatTool(accessor, { session: 'copilot:/s1', prompt: 'do it', title: 'T', model: 'gpt-4o' }, source, 'turn-1');
		assert.strictEqual(result.session, 'copilot:/s1');
		const chatId = URI.parse(result.chat).authority;
		assert.strictEqual(result.openLink, `agent-host-session://copilot/s1?chat=${chatId}`);
		assert.strictEqual(createdChat?.session.toString(), 'copilot:/s1');
		assert.strictEqual(createdChat?.options?.title, 'T');
		assert.strictEqual(createdChat?.options?.model?.id, 'gpt-4o');
		assert.strictEqual(createdChat?.chat.toString(), result.chat);
		assert.strictEqual(prompted?.chat.toString(), result.chat);
		assert.strictEqual(prompted?.prompt, 'do it');
		assert.deepStrictEqual(prompted?.delegation, {
			sourceSession: 'copilot:/s1',
			sourceChat: source.toString(),
			sourceTurnId: 'turn-1',
		});
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
		const prompts: { session: URI; chat: URI; prompt: string; delegation: Parameters<ISessionServerToolAccessor['startPrompt']>[3] }[] = [];
		const accessor = createAccessor({
			listSessions: async () => [sessionMeta('s1', SessionStatus.Idle, workspace), sessionMeta('s2', SessionStatus.Idle, workspace)],
			onPrompt: (session, chat, prompt, delegation) => { prompts.push({ session, chat, prompt, delegation }); },
		});
		const currentChannel = buildDefaultChatUri('copilot:/s1');

		// Explicit session -> owning session's default chat.
		const toSession = await applySendMessageTool(accessor, { session: 'copilot:/s2', message: 'hi' }, currentChannel, 'turn-1');
		assert.strictEqual(prompts.at(-1)?.session.toString(), 'copilot:/s2');
		assert.strictEqual(prompts.at(-1)?.chat.toString(), buildDefaultChatUri('copilot:/s2'));
		assert.strictEqual(prompts.at(-1)?.prompt, 'hi');
		assert.deepStrictEqual(prompts.at(-1)?.delegation, {
			sourceSession: 'copilot:/s1',
			sourceChat: currentChannel,
			sourceTurnId: 'turn-1',
		});
		assert.ok(toSession.includes('agent-host-session://copilot/s2'));

		// A create_chat open link -> that specific chat channel.
		await applySendMessageTool(accessor, { session: 'agent-host-session://copilot/s2?chat=c9', message: 'yo' }, currentChannel);
		assert.strictEqual(prompts.at(-1)?.chat.toString(), buildChatUri('copilot:/s2', 'c9'));

		await applySendMessageTool(accessor, { session: 'agent-host-session://copilot/s1?chat=c9', message: 'same session' }, currentChannel, 'turn-2');
		assert.deepStrictEqual(prompts.at(-1)?.delegation, {
			sourceSession: 'copilot:/s1',
			sourceChat: currentChannel,
			sourceTurnId: 'turn-2',
		});

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

	test('get_current_session does not depend on listing sessions', async () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const metadata = { ...sessionMeta('s1', SessionStatus.Idle, workspace), session: URI.parse('codex:/s1') };
		const group = createSessionServerToolGroup(createAccessor({
			listSessions: async () => { throw new Error('Provider codex cannot enumerate its native session catalog yet'); },
			getSession: async session => session.toString() === metadata.session.toString() ? metadata : undefined,
		}));

		const text = await group.execute(stateManager, executionContext('codex:/s1'), SessionServerToolName.GetCurrentSession, {});

		assert.deepStrictEqual(JSON.parse(text), {
			session: 'codex:/s1',
			openLink: 'agent-host-session://codex/s1',
			title: 'title-s1',
			status: 'idle',
			workingDirectory: 'file:///workspace/app',
		});
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
