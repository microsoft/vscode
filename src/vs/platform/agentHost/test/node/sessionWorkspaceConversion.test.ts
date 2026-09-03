/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentWorkingDirectoryChangedError, type IAgent } from '../../common/agent.js';
import { schemaProperty } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, buildDefaultChatUri, createErrorResponsePart, customizationId, CustomizationLoadStatus, CustomizationType, isMessageHiddenFromTranscript, MessageKind, readMessageSystemInitiatedLabel, readSessionWorkspaceless, ResponsePartKind, SessionStatus, withSessionWorkspaceless, type ErrorInfo, type Message } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import type { IAgentHostTurnService, IDeferredAgentHostTurn } from '../../node/agentHostTurnService.js';
import { SessionWorkspaceConversionService } from '../../node/chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionService.js';
import type { IAgentHostServerToolService } from '../../node/shared/agentServerToolHost.js';
import { NullAgentHostWorktreeIsolation, type IIsolationConfigContribution, type IResolveIsolationConfigRequest, type IResolveWorkingDirectoryRequest, type ISessionWorktree } from '../../node/shared/worktreeIsolation.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';

class TestWorktreeIsolation extends NullAgentHostWorktreeIsolation {
	override readonly supported = true;
	readonly requests: IResolveWorkingDirectoryRequest[] = [];
	readonly createdWorktrees: URI[] = [];
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
		await request.onWillCreate?.({
			repositoryRoot: this.repository,
			worktreePath: this.worktree,
			baseBranch: 'main',
			branchName: 'feature',
		});
		this.createdWorktrees.push(this.worktree);
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

	override async discardSessionWorktree(_sessionUri: URI, sessionId: string, worktree: ISessionWorktree | undefined): Promise<void> {
		await this.removeSessionWorktree(sessionId, worktree);
	}
}

class GatedConversionDatabase extends TestSessionDatabase {
	readonly writeStarted = new DeferredPromise<void>();
	readonly releaseWrite = new DeferredPromise<void>();

	override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
		this.writeStarted.complete();
		await this.releaseWrite.p;
		await super.setMetadataValues(values);
	}
}

suite('SessionWorkspaceConversionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(
		worktreeIsolation = new NullAgentHostWorktreeIsolation(),
		requestWorkspaceTrust: IAgentHostClientConnectionService['requestWorkspaceTrust'] = async () => true,
		database = new TestSessionDatabase(),
	) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const sessionDataService = createSessionDataService(database);
		const agent = new MockAgent('copilot', { multipleChats: { fork: true } }, { workspaceConversion: true });
		disposables.add({ dispose: () => agent.dispose() });
		const providerService = createTestAgentHostProviderService(() => agent);
		const trustRequests: { clientId: string; workspace: string; trustedParent?: string }[] = [];
		const clientConnections = new class extends mock<IAgentHostClientConnectionService>() {
			override async requestWorkspaceTrust(clientId: string, request: { readonly workspace: string; readonly trustedParent?: string }): Promise<boolean> {
				trustRequests.push({ clientId, ...request });
				return requestWorkspaceTrust(clientId, request);
			}
		}();
		const continuations: { chat: string; message: Message }[] = [];
		const deferredContinuations: { chat: string; message: Message; turnId: string }[] = [];
		const failedContinuations: { chat: string; error: ErrorInfo; turnId: string }[] = [];
		let deferredTurnCounter = 0;
		const turnService = new class extends mock<IAgentHostTurnService>() {
			override beginDeferredTurnMessage(targetChat: URI, message: Message): IDeferredAgentHostTurn {
				const turnId = `continuation-${++deferredTurnCounter}`;
				stateManager.dispatchServerAction(targetChat.toString(), {
					type: ActionType.ChatTurnStarted,
					turnId,
					startedAt: new Date(2).toISOString(),
					message,
				});
				deferredContinuations.push({ chat: targetChat.toString(), message, turnId });
				return { turnId };
			}

			override continueDeferredTurnMessage(targetChat: URI, turn: IDeferredAgentHostTurn, message: Message): boolean {
				if (stateManager.getActiveTurnId(targetChat.toString()) !== turn.turnId) {
					return false;
				}
				continuations.push({ chat: targetChat.toString(), message });
				return true;
			}

			override failDeferredTurnMessage(targetChat: URI, turn: IDeferredAgentHostTurn, error: ErrorInfo): boolean {
				if (stateManager.getActiveTurnId(targetChat.toString()) !== turn.turnId) {
					return false;
				}
				failedContinuations.push({ chat: targetChat.toString(), error, turnId: turn.turnId });
				stateManager.dispatchServerAction(targetChat.toString(), {
					type: ActionType.ChatError,
					turnId: turn.turnId,
					duration: 1,
					part: createErrorResponsePart(error),
				});
				return true;
			}
		}();
		const refreshedServerTools: string[] = [];
		const serverToolHost = new class extends mock<IAgentHostServerToolService>() {
			override advertise(targetSession: string): void {
				refreshedServerTools.push(targetSession);
			}
		}();
		const service = disposables.add(new SessionWorkspaceConversionService(stateManager, providerService, sessionDataService, worktreeIsolation, clientConnections, turnService, serverToolHost, logService));
		const session = URI.parse('copilot:/workspace-less');
		const chat = URI.parse(buildDefaultChatUri(session));
		const scratch = URI.file('/tmp/copilot-scratch/workspace-less');
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Workspace-less Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [scratch.toString()],
			_meta: withSessionWorkspaceless(undefined, true),
		});
		return { service, stateManager, database, agent, session, chat, scratch, continuations, deferredContinuations, failedContinuations, trustRequests, refreshedServerTools };
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

	function updateSessionWorkspace(harness: ReturnType<typeof createHarness>): Promise<void> {
		return harness.service.updateSessionWorkspace(harness.chat.toString(), 'turn-1');
	}

	test('keeps a visible continuation in progress while converting after the invoking turn', async () => {
		const trustDecision = new DeferredPromise<boolean>();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), () => trustDecision.p);
		const workspaceFolder = URI.file('/workspace/project');
		const providerMutation = new DeferredPromise<void>();
		const providerCalls: { chat: string; session: string; workspaceFolder: string }[] = [];
		const customization = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///workspace/project/plugin'),
			uri: 'file:///workspace/project/plugin',
			name: 'Workspace Plugin',
			load: { kind: CustomizationLoadStatus.Loaded },
		} as const;
		let stateWhenCustomizationsRefreshed: { workingDirectories: readonly string[] | undefined; workspaceless: boolean } | undefined;
		harness.agent.getSessionCustomizations = async () => {
			const state = harness.stateManager.getSessionState(harness.session.toString());
			stateWhenCustomizationsRefreshed = {
				workingDirectories: state?.workingDirectories,
				workspaceless: readSessionWorkspaceless(state?._meta),
			};
			return [customization];
		};
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
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		const conversion = updateSessionWorkspace(harness);
		await Promise.resolve();
		const stateDuringSetup = harness.stateManager.getSessionState(harness.session.toString());
		const chatDuringSetup = harness.stateManager.getChatState(harness.chat.toString());
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			providerCalls,
			sessionStatus: stateDuringSetup?.status,
			chatStatus: chatDuringSetup?.status,
			activity: chatDuringSetup?.activity,
			activeTurnId: chatDuringSetup?.activeTurn?.id,
			responseParts: chatDuringSetup?.activeTurn?.responseParts,
			deferredContinuations: harness.deferredContinuations.map(entry => ({
				chat: entry.chat,
				hidden: isMessageHiddenFromTranscript(entry.message),
				label: readMessageSystemInitiatedLabel(entry.message),
				origin: entry.message.origin.kind,
				text: entry.message.text,
				turnId: entry.turnId,
			})),
			continuations: harness.continuations,
		}, {
			pending: true,
			providerCalls: [],
			sessionStatus: SessionStatus.InProgress,
			chatStatus: SessionStatus.InProgress,
			activity: undefined,
			activeTurnId: 'continuation-1',
			responseParts: [],
			deferredContinuations: [{
				chat: harness.chat.toString(),
				hidden: false,
				label: 'Continue in Requested Workspace',
				origin: MessageKind.SystemNotification,
				text: 'Continue in the requested workspace.',
				turnId: 'continuation-1',
			}],
			continuations: [],
		});
		trustDecision.complete(true);
		await Promise.resolve();
		providerMutation.complete();
		await conversion;

		const state = harness.stateManager.getSessionState(harness.session.toString());
		const activeTurn = harness.stateManager.getChatState(harness.chat.toString())?.activeTurn;
		assert.deepStrictEqual({
			providerCalls,
			trustRequests: harness.trustRequests,
			pending: harness.service.isPending(harness.chat.toString()),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			persistedWorkspaceless: await harness.database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			refreshedServerTools: harness.refreshedServerTools,
			stateWhenCustomizationsRefreshed,
			customizations: state?.customizations,
			activity: harness.stateManager.getChatState(harness.chat.toString())?.activity,
			activeTurnId: harness.stateManager.getActiveTurnId(harness.chat.toString()),
			outcomeNotifications: activeTurn?.responseParts.flatMap(part => part.kind === ResponsePartKind.SystemNotification ? [part.content] : []),
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
			trustRequests: [{
				clientId: 'client-1',
				workspace: 'file:///workspace/project',
			}],
			pending: false,
			workingDirectories: ['file:///workspace/project'],
			workspaceless: false,
			persistedWorkspaceless: 'false',
			refreshedServerTools: [harness.session.toString()],
			stateWhenCustomizationsRefreshed: {
				workingDirectories: ['file:///workspace/project'],
				workspaceless: false,
			},
			customizations: [customization],
			activity: undefined,
			activeTurnId: 'continuation-1',
			outcomeNotifications: ['Workspace Set'],
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
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, true, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);
		await timeout(120);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		const summary = harness.stateManager.getSessionSummary(harness.session.toString());
		assert.deepStrictEqual({
			worktreeRequests: worktreeIsolation.requests.map(request => ({
				session: request.sessionUri.toString(),
				workspaceFolder: request.workingDirectory?.toString(),
				prompt: request.prompt,
				isolation: request.config?.[SessionConfigKey.Isolation],
				branch: request.config?.[SessionConfigKey.Branch],
			})),
			trustRequests: harness.trustRequests,
			providerCalls,
			sessionStateProject: state?.project,
			summaryProject: summary?.project,
			workingDirectories: state?.workingDirectories,
			projectNotifications,
			isolation: state?.config?.values[SessionConfigKey.Isolation],
			branch: state?.config?.values[SessionConfigKey.Branch],
			persistedConfig: JSON.parse((await harness.database.getMetadata('configValues')) ?? '{}'),
			continuationText: harness.continuations[0]?.message.text,
		}, {
			worktreeRequests: [{
				session: harness.session.toString(),
				workspaceFolder: workspaceFolder.toString(),
				prompt: 'Implement the feature',
				isolation: 'worktree',
				branch: 'main',
			}],
			trustRequests: [{
				clientId: 'client-1',
				workspace: workspaceFolder.toString(),
			}, {
				clientId: 'client-1',
				workspace: worktreeIsolation.worktree.toString(),
				trustedParent: workspaceFolder.toString(),
			}],
			providerCalls: [worktreeIsolation.worktree.toString()],
			sessionStateProject: undefined,
			summaryProject: {
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
			continuationText: 'The current session is now attached to /workspace/project.worktrees/implement-feature in an isolated worktree. Continue the user\'s original task in this workspace. Do not request another session or workspace conversion.',
		});
	});

	test('keeps the session workspace-less when workspace trust is declined', async () => {
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => false);
		const providerCalls: string[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async (_chat, _context, workingDirectory) => {
			providerCalls.push(workingDirectory.toString());
		};
		startTurn(harness.stateManager, harness.chat);
		await harness.database.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			trustRequests: harness.trustRequests,
			providerCalls,
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			persistedWorkspaceless: await harness.database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			continuation: harness.continuations.map(entry => ({
				label: readMessageSystemInitiatedLabel(entry.message),
				text: entry.message.text,
			})),
		}, {
			trustRequests: [{
				clientId: 'client-1',
				workspace: 'file:///workspace/project',
			}],
			providerCalls: [],
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			persistedWorkspaceless: 'true',
			continuation: [{
				label: 'Workspace Setup Failed',
				text: 'The requested workspace setup did not complete successfully: Workspace trust was not granted for \'/workspace/project\'. Do not run the user\'s task. Tell the user that workspace setup failed and include this error.',
			}],
		});
	});

	test('does not create a worktree when trust for it is declined', async () => {
		const worktreeIsolation = new TestWorktreeIsolation(URI.file('/workspace/project.worktrees/implement-feature'));
		let trustRequestCount = 0;
		const harness = createHarness(worktreeIsolation, async () => ++trustRequestCount === 1);
		const providerCalls: string[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async (_chat, _context, workingDirectory) => {
			providerCalls.push(workingDirectory.toString());
		};
		startTurn(harness.stateManager, harness.chat);
		await harness.database.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), true, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			trustRequests: harness.trustRequests,
			providerCalls,
			createdWorktrees: worktreeIsolation.createdWorktrees,
			removedWorktrees: worktreeIsolation.removedWorktrees,
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
		}, {
			trustRequests: [{
				clientId: 'client-1',
				workspace: 'file:///workspace/project',
			}, {
				clientId: 'client-1',
				workspace: worktreeIsolation.worktree.toString(),
				trustedParent: 'file:///workspace/project',
			}],
			providerCalls: [],
			createdWorktrees: [],
			removedWorktrees: [],
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
		});
	});

	test('trusts the repository root before creating an isolated worktree', async () => {
		const repository = URI.file('/workspace/project');
		const worktreeIsolation = new TestWorktreeIsolation(URI.file('/workspace/project.worktrees/implement-feature'), repository);
		const harness = createHarness(worktreeIsolation);
		const workspaceFolder = URI.file('/workspace/project/packages/app');
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, true, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		assert.deepStrictEqual({
			trustRequests: harness.trustRequests,
			createdWorktrees: worktreeIsolation.createdWorktrees,
		}, {
			trustRequests: [{
				clientId: 'client-1',
				workspace: workspaceFolder.toString(),
			}, {
				clientId: 'client-1',
				workspace: repository.toString(),
			}, {
				clientId: 'client-1',
				workspace: worktreeIsolation.worktree.toString(),
				trustedParent: repository.toString(),
			}],
			createdWorktrees: [worktreeIsolation.worktree],
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
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), true, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

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
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		const activeTurn = harness.stateManager.getChatState(harness.chat.toString())?.activeTurn;
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuationHidden: harness.continuations[0] ? isMessageHiddenFromTranscript(harness.continuations[0].message) : undefined,
			continuationLabel: harness.continuations[0] ? readMessageSystemInitiatedLabel(harness.continuations[0].message) : undefined,
			continuationOrigin: harness.continuations[0]?.message.origin.kind,
			continuationText: harness.continuations[0]?.message.text,
			outcomeNotifications: activeTurn?.responseParts.flatMap(part => part.kind === ResponsePartKind.SystemNotification ? [part.content] : []),
		}, {
			pending: false,
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuationHidden: false,
			continuationLabel: 'Workspace Setup Failed',
			continuationOrigin: MessageKind.SystemNotification,
			continuationText: 'The requested workspace setup did not complete successfully: provider failed. Do not run the user\'s task. Tell the user that workspace setup failed and include this error.',
			outcomeNotifications: ['Workspace Setup Failed'],
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
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/requested'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

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

	test('disposes the provider without continuing when its authoritative directory is not trusted', async () => {
		let trustRequestCount = 0;
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => ++trustRequestCount === 1);
		const authoritative = URI.file('/workspace/authoritative');
		const disposedChats: { session: string; chat: string }[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => {
			throw new AgentWorkingDirectoryChangedError(authoritative, 'SDK returned a different directory');
		};
		harness.agent.disposeChat = async (session, chat) => {
			disposedChats.push({ session: session.toString(), chat: chat.toString() });
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/requested'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		const endedTurn = harness.stateManager.getChatState(harness.chat.toString())?.turns.at(-1);
		assert.deepStrictEqual({
			trustRequests: harness.trustRequests,
			disposedChats,
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await harness.database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuations: harness.continuations,
			failedContinuations: harness.failedContinuations,
			activity: harness.stateManager.getChatState(harness.chat.toString())?.activity,
			activeTurnId: harness.stateManager.getActiveTurnId(harness.chat.toString()),
			outcomeNotifications: endedTurn?.responseParts.flatMap(part => part.kind === ResponsePartKind.SystemNotification ? [part.content] : []),
		}, {
			trustRequests: [{
				clientId: 'client-1',
				workspace: 'file:///workspace/requested',
			}, {
				clientId: 'client-1',
				workspace: authoritative.toString(),
			}],
			disposedChats: [{
				session: harness.session.toString(),
				chat: harness.chat.toString(),
			}],
			pending: true,
			persistedQuarantine: 'true',
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuations: [],
			failedContinuations: [{
				chat: harness.chat.toString(),
				error: {
					errorType: 'workspaceConversionFailed',
					message: 'The provider changed to an untrusted working directory and was disposed: Workspace trust was not granted for \'/workspace/authoritative\'',
				},
				turnId: 'continuation-1',
			}],
			activity: undefined,
			activeTurnId: undefined,
			outcomeNotifications: ['Workspace Setup Failed'],
		});
	});

	test('does not continue a setup turn that the user cancelled during conversion', async () => {
		const trustDecision = new DeferredPromise<boolean>();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), () => trustDecision.p);
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		const conversion = updateSessionWorkspace(harness);
		await Promise.resolve();
		harness.stateManager.dispatchServerAction(harness.chat.toString(), {
			type: ActionType.ChatTurnCancelled,
			turnId: 'continuation-1',
			duration: 1,
		});
		trustDecision.complete(true);
		await conversion;

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuations: harness.continuations,
			failedContinuations: harness.failedContinuations,
			activity: harness.stateManager.getChatState(harness.chat.toString())?.activity,
			activeTurnId: harness.stateManager.getActiveTurnId(harness.chat.toString()),
		}, {
			workingDirectories: ['file:///workspace/project'],
			workspaceless: false,
			continuations: [],
			failedContinuations: [],
			activity: undefined,
			activeTurnId: undefined,
		});
	});

	test('durably quarantines the session when an untrusted provider cannot be disposed', async () => {
		let trustRequestCount = 0;
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => ++trustRequestCount === 1);
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => {
			throw new AgentWorkingDirectoryChangedError(URI.file('/workspace/authoritative'), 'SDK returned a different directory');
		};
		harness.agent.disposeChat = async () => {
			throw new Error('dispose failed');
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/requested'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await harness.database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			continuations: harness.continuations,
		}, {
			pending: true,
			persistedQuarantine: 'true',
			continuations: [],
		});
	});

	test('atomically persists conversion metadata or quarantines before publishing state', async () => {
		class FailingConversionDatabase extends TestSessionDatabase {
			override async setMetadataValues(): Promise<void> {
				throw new Error('atomic commit failed');
			}
		}
		const database = new FailingConversionDatabase();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, database);
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuations: harness.continuations,
		}, {
			pending: true,
			persistedQuarantine: 'true',
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuations: [],
		});
	});

	test('keeps the session quarantined in memory when durable quarantine persistence fails', async () => {
		class FailingQuarantineDatabase extends TestSessionDatabase {
			override async setMetadataValues(): Promise<void> {
				throw new Error('atomic commit failed');
			}

			override async setMetadata(key: string, value: string): Promise<void> {
				if (key === AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY) {
					throw new Error('quarantine persistence failed');
				}
				await super.setMetadata(key, value);
			}
		}
		const database = new FailingQuarantineDatabase();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, database);
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuations: harness.continuations,
		}, {
			pending: true,
			persistedQuarantine: undefined,
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuations: [],
		});
	});

	test('does not mutate the provider when the session is archived before conversion starts', async () => {
		const harness = createHarness();
		const providerCalls: string[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async (_chat, _session, workingDirectory) => {
			providerCalls.push(workingDirectory.toString());
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		harness.stateManager.dispatchServerAction(harness.session.toString(), {
			type: ActionType.SessionIsArchivedChanged,
			isArchived: true,
		});
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			archived: state ? (state.status & SessionStatus.IsArchived) === SessionStatus.IsArchived : undefined,
			pending: harness.service.isPending(harness.chat.toString()),
			providerCalls,
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			continuationText: harness.continuations[0]?.message.text,
		}, {
			archived: true,
			pending: false,
			providerCalls: [],
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuationText: 'The requested workspace setup did not complete successfully: An archived session cannot be converted to a workspace session. Do not run the user\'s task. Tell the user that workspace setup failed and include this error.',
		});
	});

	test('quarantines without publishing when session state changes during conversion metadata persistence', async () => {
		const database = new GatedConversionDatabase();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, database);
		const disposedChats: { session: string; chat: string }[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		harness.agent.disposeChat = async (session, chat) => {
			disposedChats.push({ session: session.toString(), chat: chat.toString() });
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		const conversion = updateSessionWorkspace(harness);
		await database.writeStarted.p;
		const replacement = URI.file('/workspace/other');
		harness.stateManager.dispatchServerAction(harness.session.toString(), {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: harness.scratch.toString(),
			replacement: replacement.toString(),
		});
		database.releaseWrite.complete();
		await conversion;

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			disposedChats,
			continuations: harness.continuations,
		}, {
			pending: true,
			persistedQuarantine: 'true',
			workingDirectories: [replacement.toString()],
			workspaceless: true,
			disposedChats: [{
				session: harness.session.toString(),
				chat: harness.chat.toString(),
			}],
			continuations: [],
		});
	});

	test('quarantines without publishing when the session is archived during conversion metadata persistence', async () => {
		const database = new GatedConversionDatabase();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, database);
		const disposedChats: { session: string; chat: string }[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		harness.agent.disposeChat = async (session, chat) => {
			disposedChats.push({ session: session.toString(), chat: chat.toString() });
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		const conversion = updateSessionWorkspace(harness);
		await database.writeStarted.p;
		harness.stateManager.dispatchServerAction(harness.session.toString(), {
			type: ActionType.SessionIsArchivedChanged,
			isArchived: true,
		});
		database.releaseWrite.complete();
		await conversion;

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			archived: state ? (state.status & SessionStatus.IsArchived) === SessionStatus.IsArchived : undefined,
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			disposedChats,
			continuations: harness.continuations,
		}, {
			archived: true,
			pending: true,
			persistedQuarantine: 'true',
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			disposedChats: [{
				session: harness.session.toString(),
				chat: harness.chat.toString(),
			}],
			continuations: [],
		});
	});

	test('rejects invalid requests and clears cancelled conversions', async () => {
		const harness = createHarness();
		startTurn(harness.stateManager, harness.chat);

		assert.throws(() => harness.service.requestSessionWorkspaceUpdate(harness.chat, 'other-turn', URI.file('/workspace/project'), false, 'client-1'), /active turn/);
		assert.throws(() => harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.parse('vscode-remote://host/workspace/project'), false, 'client-1'), /absolute local path or file URI/);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		assert.throws(() => harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/other'), false, 'client-1'), /already pending/);
		completeTurn(harness.stateManager, harness.chat);

		harness.service.cancel(harness.chat.toString(), 'turn-1');

		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			continuations: harness.continuations,
		}, {
			pending: false,
			continuations: [],
		});
	});
});
