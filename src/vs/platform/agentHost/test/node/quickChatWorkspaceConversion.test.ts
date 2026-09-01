/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentWorkingDirectoryChangedError, type IAgent } from '../../common/agent.js';
import { schemaProperty } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AH_META_WORKSPACELESS_DB_KEY, buildDefaultChatUri, isMessageHiddenFromTranscript, MessageKind, readMessageSystemInitiatedLabel, readSessionWorkspaceless, SessionStatus, withSessionWorkspaceless, type Message } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { QuickChatWorkspaceConversionService } from '../../node/chatContributions/quickChatWorkspaceConversion/quickChatWorkspaceConversionService.js';
import { NullAgentHostWorktreeIsolation, type IIsolationConfigContribution, type IResolveIsolationConfigRequest, type IResolveWorkingDirectoryRequest, type ISessionWorktree } from '../../node/shared/worktreeIsolation.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';

class TestWorktreeIsolation extends NullAgentHostWorktreeIsolation {
	override readonly supported = true;
	readonly requests: IResolveWorkingDirectoryRequest[] = [];
	readonly removedWorktrees: ISessionWorktree[] = [];

	constructor(readonly worktree: URI, readonly repository = URI.file('/workspace/project')) {
		super();
	}

	override async resolveIsolationConfig(_request: IResolveIsolationConfigRequest): Promise<IIsolationConfigContribution> {
		return {
			isolationProperty: schemaProperty<'folder' | 'worktree'>({
				type: 'string',
				title: 'Isolation',
				description: 'Isolation',
				enum: ['folder', 'worktree'],
				default: 'worktree',
			}),
			branchProperty: schemaProperty<string>({
				type: 'string',
				title: 'Branch',
				description: 'Branch',
				default: 'main',
			}),
			worktreeBranchPrefixProperty: undefined,
			worktreeIncludeFilesProperty: undefined,
			worktreeBranchTrackProperty: undefined,
			worktreeCreateNewBranchProperty: undefined,
			isolationValue: 'worktree',
			branchDefault: 'main',
			branchValue: 'main',
		};
	}

	override async resolveOnFirstSend(request: IResolveWorkingDirectoryRequest): Promise<URI> {
		this.requests.push(request);
		request.onProgress?.('Creating isolated worktree');
		return this.worktree;
	}

	override sessionWorktreeProject(_sessionId: string): { uri: URI; displayName: string } {
		return { uri: this.repository, displayName: 'project' };
	}

	override async prepareSessionDeletion(_sessionUri: URI, _sessionId: string): Promise<ISessionWorktree> {
		return { repositoryRoot: this.repository, worktree: this.worktree };
	}

	override async removeSessionWorktree(_sessionId: string, worktree: ISessionWorktree | undefined): Promise<void> {
		if (worktree) {
			this.removedWorktrees.push(worktree);
		}
	}
}

suite('QuickChatWorkspaceConversionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(worktreeIsolation = new NullAgentHostWorktreeIsolation()) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const database = new TestSessionDatabase();
		const sessionDataService = createSessionDataService(database);
		const agent = new MockAgent('copilot');
		disposables.add({ dispose: () => agent.dispose() });
		const providerService = createTestAgentHostProviderService(() => agent);
		const service = disposables.add(new QuickChatWorkspaceConversionService(stateManager, providerService, sessionDataService, worktreeIsolation, logService));
		const session = URI.parse('copilot:/quick-chat');
		const chat = URI.parse(buildDefaultChatUri(session));
		const scratch = URI.file('/tmp/copilot-scratch/quick-chat');
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Quick Chat',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [scratch.toString()],
			_meta: withSessionWorkspaceless(undefined, true),
		});
		const continuations: { chat: string; message: Message }[] = [];
		disposables.add(service.registerHost({
			startContinuation: async (targetChat, message) => {
				continuations.push({ chat: targetChat.toString(), message });
			},
		}));
		return { service, stateManager, database, agent, session, chat, scratch, continuations };
	}

	function startTurn(stateManager: AgentHostStateManager, chat: URI, turnId = 'turn-1'): void {
		stateManager.dispatchServerAction(chat.toString(), {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date(1).toISOString(),
			message: { text: 'Implement the feature', origin: { kind: MessageKind.User } },
		});
	}

	function completeTurn(stateManager: AgentHostStateManager, chat: URI, turnId = 'turn-1'): void {
		stateManager.dispatchServerAction(chat.toString(), {
			type: ActionType.ChatTurnComplete,
			turnId,
			duration: 1,
		});
	}

	test('converts after the invoking turn and starts a visible system continuation', async () => {
		const harness = createHarness();
		const workspaceFolder = URI.file('/workspace/project');
		const providerMutation = new DeferredPromise<void>();
		const providerCalls: { chat: string; session: string; workspaceFolder: string }[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async (chat, context, workingDirectory) => {
			providerCalls.push({
				chat: chat.toString(),
				session: URI.isUri(context) ? context.toString() : context.resource.toString(),
				workspaceFolder: workingDirectory.toString(),
			});
			await providerMutation.p;
		};
		startTurn(harness.stateManager, harness.chat);
		await harness.database.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
		harness.service.schedule(harness.chat, 'turn-1', workspaceFolder, false);
		completeTurn(harness.stateManager, harness.chat);

		const conversion = harness.service.handleTurnEnd({
			session: harness.session.toString(),
			channel: harness.chat.toString(),
			turnId: 'turn-1',
			reason: { kind: 'success' },
		});
		await Promise.resolve();
		assert.strictEqual(harness.service.isPending(harness.chat.toString()), true);
		providerMutation.complete();
		await conversion;

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			providerCalls,
			pending: harness.service.isPending(harness.chat.toString()),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			persistedWorkspaceless: await harness.database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			continuations: harness.continuations.map(entry => ({
				chat: entry.chat,
				hidden: isMessageHiddenFromTranscript(entry.message),
				label: readMessageSystemInitiatedLabel(entry.message),
				origin: entry.message.origin.kind,
				text: entry.message.text,
			})),
		}, {
			providerCalls: [{
				chat: harness.chat.toString(),
				session: harness.session.toString(),
				workspaceFolder: 'file:///workspace/project',
			}],
			pending: false,
			workingDirectories: ['file:///workspace/project'],
			workspaceless: false,
			persistedWorkspaceless: 'false',
			continuations: [{
				chat: harness.chat.toString(),
				hidden: false,
				label: 'Workspace Set',
				origin: MessageKind.SystemNotification,
				text: 'The current session is now attached to /workspace/project. Continue the user\'s original task in this workspace. Do not request another session or workspace conversion.',
			}],
		});
	});

	test('creates an isolated worktree and sets it as the workspace', async () => {
		const worktreeIsolation = new TestWorktreeIsolation(URI.file('/workspace/project.worktrees/implement-feature'));
		const harness = createHarness(worktreeIsolation);
		const workspaceFolder = URI.file('/workspace/project');
		const providerCalls: string[] = [];
		const projectNotifications: Array<{ uri: string; displayName: string } | undefined> = [];
		disposables.add(harness.stateManager.onDidChangeSessionSummary(event => {
			if (event.session === harness.session.toString()) {
				projectNotifications.push(event.changes.project);
			}
		}));
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async (_chat, _context, workingDirectory) => {
			providerCalls.push(workingDirectory.toString());
		};
		startTurn(harness.stateManager, harness.chat);
		await harness.database.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
		harness.service.schedule(harness.chat, 'turn-1', workspaceFolder, true);
		completeTurn(harness.stateManager, harness.chat);

		await harness.service.handleTurnEnd({
			session: harness.session.toString(),
			channel: harness.chat.toString(),
			turnId: 'turn-1',
			reason: { kind: 'success' },
		});
		await timeout(120);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			worktreeRequests: worktreeIsolation.requests.map(request => ({
				session: request.sessionUri.toString(),
				workspaceFolder: request.workingDirectory?.toString(),
				prompt: request.prompt,
				isolation: request.config?.[SessionConfigKey.Isolation],
				branch: request.config?.[SessionConfigKey.Branch],
			})),
			providerCalls,
			project: state?.project,
			workingDirectories: state?.workingDirectories,
			projectNotifications,
			isolation: state?.config?.values[SessionConfigKey.Isolation],
			branch: state?.config?.values[SessionConfigKey.Branch],
			persistedConfig: JSON.parse((await harness.database.getMetadata('configValues')) ?? '{}'),
			chatActivity: harness.stateManager.getChatState(harness.chat.toString())?.activity,
			continuationText: harness.continuations[0]?.message.text,
		}, {
			worktreeRequests: [{
				session: harness.session.toString(),
				workspaceFolder: workspaceFolder.toString(),
				prompt: 'Implement the feature',
				isolation: 'worktree',
				branch: 'main',
			}],
			providerCalls: [worktreeIsolation.worktree.toString()],
			project: {
				uri: workspaceFolder.toString(),
				displayName: 'project',
			},
			workingDirectories: [worktreeIsolation.worktree.toString()],
			projectNotifications: [{
				uri: workspaceFolder.toString(),
				displayName: 'project',
			}],
			isolation: 'worktree',
			branch: 'main',
			persistedConfig: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'main',
			},
			chatActivity: undefined,
			continuationText: 'The current session is now attached to /workspace/project.worktrees/implement-feature in an isolated worktree. Continue the user\'s original task in this workspace. Do not request another session or workspace conversion.',
		});
	});

	test('removes a newly created worktree when provider mutation fails', async () => {
		const worktreeIsolation = new TestWorktreeIsolation(URI.file('/workspace/project.worktrees/implement-feature'));
		const harness = createHarness(worktreeIsolation);
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => {
			throw new Error('provider failed');
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.schedule(harness.chat, 'turn-1', URI.file('/workspace/project'), true);
		completeTurn(harness.stateManager, harness.chat);

		await harness.service.handleTurnEnd({
			session: harness.session.toString(),
			channel: harness.chat.toString(),
			turnId: 'turn-1',
			reason: { kind: 'success' },
		});

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			removedWorktrees: worktreeIsolation.removedWorktrees.map(entry => ({
				repositoryRoot: entry.repositoryRoot.toString(),
				worktree: entry.worktree.toString(),
			})),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuationText: harness.continuations[0]?.message.text,
		}, {
			removedWorktrees: [{
				repositoryRoot: 'file:///workspace/project',
				worktree: worktreeIsolation.worktree.toString(),
			}],
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuationText: 'The requested workspace setup did not complete successfully: provider failed. Do not run the user\'s task. Tell the user that workspace setup failed and include this error.',
		});
	});

	test('keeps the session workspace-less and continues with a visible failure explanation request', async () => {
		const harness = createHarness();
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => {
			throw new Error('provider failed');
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.schedule(harness.chat, 'turn-1', URI.file('/workspace/project'), false);
		completeTurn(harness.stateManager, harness.chat);

		await harness.service.handleTurnEnd({
			session: harness.session.toString(),
			channel: harness.chat.toString(),
			turnId: 'turn-1',
			reason: { kind: 'success' },
		});

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuationHidden: harness.continuations[0] ? isMessageHiddenFromTranscript(harness.continuations[0].message) : undefined,
			continuationLabel: harness.continuations[0] ? readMessageSystemInitiatedLabel(harness.continuations[0].message) : undefined,
			continuationOrigin: harness.continuations[0]?.message.origin.kind,
			continuationText: harness.continuations[0]?.message.text,
		}, {
			pending: false,
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuationHidden: false,
			continuationLabel: 'Workspace Setup Failed',
			continuationOrigin: MessageKind.SystemNotification,
			continuationText: 'The requested workspace setup did not complete successfully: provider failed. Do not run the user\'s task. Tell the user that workspace setup failed and include this error.',
		});
	});

	test('adopts an irreversible provider directory before reporting an alignment failure', async () => {
		const harness = createHarness();
		const authoritative = URI.file('/workspace/authoritative');
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => {
			throw new AgentWorkingDirectoryChangedError(authoritative, 'SDK returned a different directory');
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.schedule(harness.chat, 'turn-1', URI.file('/workspace/requested'), false);
		completeTurn(harness.stateManager, harness.chat);

		await harness.service.handleTurnEnd({
			session: harness.session.toString(),
			channel: harness.chat.toString(),
			turnId: 'turn-1',
			reason: { kind: 'success' },
		});

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			persistedWorkspaceless: await harness.database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			continuationText: harness.continuations[0]?.message.text,
		}, {
			workingDirectories: ['file:///workspace/authoritative'],
			workspaceless: false,
			persistedWorkspaceless: 'false',
			continuationText: 'The requested workspace setup did not complete successfully: The workspace changed to \'/workspace/authoritative\', but conversion did not complete cleanly: SDK returned a different directory. Do not run the user\'s task. Tell the user that workspace setup failed and include this error.',
		});
	});

	test('rejects invalid scheduling and clears cancelled conversions', async () => {
		const harness = createHarness();
		startTurn(harness.stateManager, harness.chat);

		assert.throws(() => harness.service.schedule(harness.chat, 'other-turn', URI.file('/workspace/project'), false), /active turn/);
		assert.throws(() => harness.service.schedule(harness.chat, 'turn-1', URI.parse('vscode-remote://host/workspace/project'), false), /absolute local path or file URI/);
		harness.service.schedule(harness.chat, 'turn-1', URI.file('/workspace/project'), false);
		assert.throws(() => harness.service.schedule(harness.chat, 'turn-1', URI.file('/workspace/other'), false), /already pending/);
		completeTurn(harness.stateManager, harness.chat);

		await harness.service.handleTurnEnd({
			session: harness.session.toString(),
			channel: harness.chat.toString(),
			turnId: 'turn-1',
			reason: { kind: 'cancelled' },
		});

		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			continuations: harness.continuations,
		}, {
			pending: false,
			continuations: [],
		});
	});
});
