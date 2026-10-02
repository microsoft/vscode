/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentWorkingDirectoryChangedError, type IAgent } from '../../common/agent.js';
import type { IAgentHostChatContributionContext } from '../../common/agentHostChatContributionsService.js';
import type { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey, platformSessionSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { AgentSystemNotificationKind, AgentSystemNotificationWorkspaceKind, readAgentSystemNotificationMeta, serializeAgentWorkspaceTransition } from '../../common/meta/agentSystemNotificationMeta.js';
import { isAgentWorkspaceContinuationMessage } from '../../common/meta/agentWorkspaceContinuationMeta.js';
import { readAgentHostChatIsolationStates } from '../../common/meta/agentHostChatIsolationMeta.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { sessionReducer } from '../../common/state/protocol/channels-session/reducer.js';
import { AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY, AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, buildChatUri, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, createErrorResponsePart, customizationId, CustomizationLoadStatus, CustomizationType, isHostNoticeTurn, isMessageHiddenFromTranscript, isMessageRequestHiddenFromTranscript, MessageKind, readMessageSystemInitiatedLabel, readSessionGitState, readSessionHasWorkspaceTransitions, readSessionWorkspaceless, ResponsePartKind, ROOT_STATE_URI, SessionStatus, TurnState, withSessionGitState, withSessionWorkspaceless, type ErrorInfo, type Message, type SessionState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import type { IAgentHostTurnService, IDeferredAgentHostTurn } from '../../node/agentHostTurnService.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { SessionWorkspaceConversionContribution } from '../../node/chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionContribution.js';
import { SessionWorkspaceConversionService, type IChatIsolationHost, type ISessionWorkspaceConversionService } from '../../node/chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionService.js';
import { AgentServerToolHost, type IAgentHostServerToolService } from '../../node/shared/agentServerToolHost.js';
import { createSessionIsolationToolGroup } from '../../node/shared/sessionIsolationTools.js';
import { SessionServerToolName } from '../../common/serverToolNames.js';
import { NullAgentHostWorktreeIsolation, WORKTREE_META_REPOSITORY_ROOT, type IIsolationConfigContribution, type IResolveIsolationConfigRequest, type IResolveWorkingDirectoryRequest, type ISessionWorktree } from '../../node/shared/worktreeIsolation.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';

class TestWorktreeIsolation extends NullAgentHostWorktreeIsolation {
	override readonly supported = true;
	readonly requests: IResolveWorkingDirectoryRequest[] = [];
	readonly createdWorktrees: URI[] = [];
	readonly removedWorktrees: ISessionWorktree[] = [];
	readonly externalProjectRequests: URI[] = [];
	readonly retainedSessions: string[] = [];

	override async retainSessionWorktree(session: URI): Promise<void> {
		this.retainedSessions.push(session.toString());
	}

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
			worktreeSymlinkFoldersProperty: undefined,
			worktreeBranchTrackProperty: undefined,
			worktreeCreateNewBranchProperty: undefined,
			isolationValue: 'worktree',
			branchDefault: 'main',
			branchValue: 'main',
		};
	}

	override async resolveForWorkspaceConversion(request: IResolveWorkingDirectoryRequest): Promise<URI> {
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

	override sessionWorktreeInfo(_sessionId: string) {
		return { project: { uri: this.repository, displayName: 'project' }, workingDirectory: this.worktree, branchName: 'feature' };
	}

	override async resolveExternalWorktreeProject(workingDirectory: URI) {
		this.externalProjectRequests.push(workingDirectory);
		return workingDirectory.toString() === this.worktree.toString()
			? {
				project: { uri: this.repository, displayName: 'project' },
				metadata: {
					[WORKTREE_META_REPOSITORY_ROOT]: this.repository.toString(),
					[META_DIFF_BASE_BRANCH]: 'main',
				},
			}
			: undefined;
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
	readonly conversionMetadata: Readonly<Record<string, string>>[] = [];

	override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
		this.conversionMetadata.push(values);
		await this._waitForRelease();
		await super.setMetadataValues(values);
	}

	override async setWorkspaceConversion(turnId: string, transition: string, metadata: Readonly<Record<string, string>>): Promise<void> {
		this.conversionMetadata.push(metadata);
		await this._waitForRelease();
		await super.setWorkspaceConversion(turnId, transition, metadata);
	}

	private async _waitForRelease(): Promise<void> {
		this.writeStarted.complete();
		await this.releaseWrite.p;
	}
}

suite('SessionWorkspaceConversionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(
		worktreeIsolation = new NullAgentHostWorktreeIsolation(),
		requestWorkspaceTrust: IAgentHostClientConnectionService['requestWorkspaceTrust'] = async () => true,
		database: ISessionDatabase = new TestSessionDatabase(),
		providerId = 'copilot',
		chatIsolationHost?: IChatIsolationHost,
	) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const sessionDataService = createSessionDataService(database);
		const agent = new MockAgent(providerId, { multipleChats: { fork: true }, multipleWorkingDirectories: { immutablePrimary: true } }, { workspaceConversion: true });
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
		const outcomeKindsAtContinuation: Array<Array<AgentSystemNotificationKind | undefined>> = [];
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
				const activeTurn = stateManager.getChatState(targetChat.toString())?.activeTurn;
				outcomeKindsAtContinuation.push(activeTurn?.responseParts.flatMap(part =>
					part.kind === ResponsePartKind.SystemNotification ? [readAgentSystemNotificationMeta(part).kind] : []
				) ?? []);
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
		const gitRefreshes: string[] = [];
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override getMaterializedWorktreeMeta(session: string, branchName: string) {
				return withSessionGitState(stateManager.getSessionState(session)?._meta, { branchName });
			}
			override async refreshSessionGitState(_session: string, directory?: URI): Promise<void> {
				gitRefreshes.push(directory!.toString());
			}
		}();
		const service = disposables.add(new SessionWorkspaceConversionService(chatIsolationHost ?? {
			runWithChatCatalogLock: (_session, operation) => operation(),
			prepareChatWorkingDirectory: async () => { throw new Error('Single-chat isolation must not require multi-root preparation'); },
			setChatWorkingDirectory: async (session, chat, directory, replaceSessionWorkspace) => {
				assert.strictEqual(replaceSessionWorkspace, true);
				stateManager.dispatchServerAction(session.toString(), {
					type: ActionType.SessionWorkingDirectoryReplaced,
					directory: stateManager.getSessionSummary(session.toString())!.workingDirectories![0],
					replacement: directory.toString(),
				});
				stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatWorkingDirectorySet, directory: directory.toString() });
				stateManager.dispatchServerAction(session.toString(), {
					type: ActionType.SessionChatUpdated, chat: chat.toString(), changes: { workingDirectories: [directory.toString()] },
				});
			},
		}, stateManager, providerService, sessionDataService, worktreeIsolation, configurationService, clientConnections, turnService, serverToolHost, logService, gitStateService));
		const session = URI.from({ scheme: providerId, path: '/workspace-less' });
		const chat = URI.parse(buildDefaultChatUri(session));
		const scratch = URI.file('/tmp/copilot-scratch/workspace-less');
		stateManager.createSession({
			resource: session.toString(),
			provider: providerId,
			title: 'Workspace-less Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [scratch.toString()],
			_meta: withSessionWorkspaceless(undefined, true),
		});
		return { service, stateManager, configurationService, sessionDataService, database, agent, session, chat, scratch, continuations, outcomeKindsAtContinuation, deferredContinuations, failedContinuations, trustRequests, refreshedServerTools, serverToolHost, gitRefreshes };
	}

	function setSessionConfig(harness: ReturnType<typeof createHarness>, values: Record<string, unknown>): void {
		harness.stateManager.setSessionConfig(harness.session.toString(), {
			schema: platformSessionSchema.toProtocol(),
			values,
		});
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

	function completePriorTurn(stateManager: AgentHostStateManager, chat: URI): void {
		startTurn(stateManager, chat, 'turn-0');
		completeTurn(stateManager, chat, 'turn-0');
	}

	function updateSessionWorkspace(harness: ReturnType<typeof createHarness>): Promise<void> {
		return harness.service.updateSessionWorkspace(harness.chat.toString(), 'turn-1');
	}

	/**
	 * Drives a workspace change the way the tools do: the chat requests it from
	 * an active turn (`set_workspace`, or `isolate_session` when no folder is
	 * given) and the host applies it, then continues, once that turn ends.
	 * Returns whether the request scheduled a change.
	 */
	async function changeWorkspaceViaTool(harness: ReturnType<typeof createHarness>, chat: URI, workspace: URI | undefined, isolation = false, turnId = 'turn-1'): Promise<boolean> {
		startTurn(harness.stateManager, chat, turnId);
		let scheduled = true;
		if (workspace) {
			scheduled = harness.service.requestSessionWorkspaceUpdate(chat, turnId, workspace, isolation, 'client');
		} else {
			harness.service.requestChatIsolation(chat, turnId, 'client');
		}
		completeTurn(harness.stateManager, chat, turnId);
		await harness.service.updateSessionWorkspace(chat.toString(), turnId);
		return scheduled;
	}

	function makeFolderSession(harness: ReturnType<typeof createHarness>): void {
		harness.stateManager.dispatchServerAction(harness.session.toString(), { type: ActionType.SessionReady });
		harness.stateManager.setSessionMeta(harness.session.toString(), withSessionWorkspaceless(undefined, false));
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async () => { };
		setSessionConfig(harness, {
			[SessionConfigKey.Isolation]: 'folder',
			[SessionConfigKey.AutoApprove]: 'default',
			[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
		});
	}

	for (const isolation of [false, true]) {
		for (const phase of ['provider', 'metadata'] as const) {
			test(`preserves config edits during ${phase} for a workspace change (isolation: ${isolation})`, async () => {
				let edited = false;
				const editConfig = () => {
					if (!edited) {
						edited = true;
						harness.stateManager.dispatchServerAction(harness.session.toString(), {
							type: ActionType.SessionConfigChanged,
							config: { mode: 'autopilot', autoApprove: 'assisted' },
						});
					}
				};
				const database = new class extends TestSessionDatabase {
					override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
						await super.setMetadataValues(values);
						if (phase === 'metadata' && values.configValues) {
							editConfig();
						}
					}
					override async setWorkspaceConversion(turnId: string, transition: string, metadata: Readonly<Record<string, string>>): Promise<void> {
						await super.setWorkspaceConversion(turnId, transition, metadata);
						if (phase === 'metadata') {
							editConfig();
						}
					}
				};
				const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')), async () => true, database);
				makeFolderSession(harness);
				harness.stateManager.dispatchServerAction(harness.session.toString(), {
					type: ActionType.SessionConfigChanged,
					config: { mode: 'interactive', branch: 'old-branch' },
				});
				const provider: IAgent = harness.agent;
				provider.setChatWorkingDirectory = async () => {
					if (phase === 'provider') {
						editConfig();
					}
				};
				await changeWorkspaceViaTool(harness, harness.chat, URI.file('/workspace/destination'), isolation);
				const expected = {
					isolation: isolation ? 'worktree' : 'folder', mode: 'autopilot', autoApprove: 'assisted',
					worktreeIncludeFiles: ['.env'], ...(isolation ? { branch: 'main' } : {}),
				};
				assert.deepStrictEqual({
					host: harness.stateManager.getSessionState(harness.session.toString())?.config?.values,
					persisted: JSON.parse((await database.getMetadata('configValues'))!),
				}, { host: expected, persisted: expected });
			});
		}
	}

	for (const target of ['main', 'peer'] as const) {
		for (const sharedFolder of [false, true]) {
			test(`isolates only the ${target} chat with ${sharedFolder ? 'shared' : 'different'} folders while another chat is active`, async () => {
				const worktree = URI.file('/workspace/project.worktrees/chat');
				const isolation = new TestWorktreeIsolation(worktree);
				const host: IChatIsolationHost = {
					runWithChatCatalogLock: (_session, operation) => operation(),
					prepareChatWorkingDirectory: async (session, source, options) => {
						assert.deepStrictEqual({ source: source.toString(), forceNew: options.isolation === 'worktree' && options.forceNewWorktree }, {
							source: (target === 'main' || sharedFolder ? harness.scratch : otherFolder).toString(), forceNew: true,
						});
						for (const chat of harness.stateManager.getSessionState(session.toString())!.chats) {
							const roots = chat.workingDirectories ?? [harness.scratch.toString()];
							harness.stateManager.dispatchServerAction(session.toString(), {
								type: ActionType.SessionChatUpdated, chat: chat.resource, changes: { workingDirectories: [...roots] },
							});
						}
						harness.stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionWorkingDirectorySet, directory: worktree.toString() });
						return { directory: worktree, release: async () => { throw new Error('Successful isolation must retain its worktree'); } };
					},
					setChatWorkingDirectory: async (session, chat, directory) => {
						harness.stateManager.dispatchServerAction(session.toString(), {
							type: ActionType.SessionChatUpdated, chat: chat.toString(), changes: { workingDirectories: [directory.toString()] },
						});
					},
				};
				const harness = createHarness(isolation, async () => true, new TestSessionDatabase(), 'copilot', host);
				makeFolderSession(harness);
				const otherFolder = URI.file('/workspace/other');
				const peer = URI.parse(buildChatUri(harness.session, 'peer'));
				if (!sharedFolder) {
					harness.stateManager.dispatchServerAction(harness.session.toString(), { type: ActionType.SessionWorkingDirectorySet, directory: otherFolder.toString() });
				}
				harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [(sharedFolder ? harness.scratch : otherFolder).toString()] });
				harness.stateManager.dispatchServerAction(harness.session.toString(), {
					type: ActionType.SessionChatUpdated, chat: harness.chat.toString(), changes: { workingDirectories: [harness.scratch.toString()] },
				});
				const callingChat = target === 'main' ? harness.chat : peer;
				const otherChat = target === 'main' ? peer : harness.chat;
				const calls: { chat: string; directory: string }[] = [];
				const provider: IAgent = harness.agent;
				provider.setChatWorkingDirectory = async (chat, _context, directory) => { calls.push({ chat: chat.toString(), directory: directory.toString() }); };
				completePriorTurn(harness.stateManager, callingChat);
				startTurn(harness.stateManager, callingChat);
				startTurn(harness.stateManager, otherChat, 'other-turn');
				const previous = harness.stateManager.getSessionState(harness.session.toString())!;
				harness.service.requestChatIsolation(callingChat, 'turn-1', 'client-1');
				assert.deepStrictEqual([harness.service.isPending(callingChat.toString()), harness.service.isPending(otherChat.toString()), harness.service.isPending(callingChat.toString(), true)], [true, false, false]);
				completeTurn(harness.stateManager, callingChat);
				await harness.service.updateSessionWorkspace(callingChat.toString(), 'turn-1');
				assert.match(harness.continuations[0]?.message.text ?? '', /Only this chat now uses the worktree/);
				const state = harness.stateManager.getSessionState(harness.session.toString())!;
				assert.deepStrictEqual({
					calls, sessionRoots: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories, config: state.config,
					roots: state.chats.map(chat => [chat.resource, chat.workingDirectories]),
					otherTurn: harness.stateManager.getActiveTurnId(otherChat.toString()),
					continuations: harness.continuations.map(entry => entry.chat),
					available: harness.service.canIsolateChat(callingChat),
					persisted: await harness.database.getMetadata('agentHost.chatIsolationDirectory'),
				}, {
					calls: [{ chat: callingChat.toString(), directory: worktree.toString() }],
					sessionRoots: [harness.scratch.toString(), ...sharedFolder ? [] : [otherFolder.toString()], worktree.toString()], config: previous.config,
					roots: previous.chats.map(chat => [chat.resource, chat.resource === callingChat.toString() ? [worktree.toString()] : chat.workingDirectories]),
					otherTurn: 'other-turn', continuations: [callingChat.toString()], available: false, persisted: worktree.toString(),
				});
			});
		}
	}

	for (const restoredState of ['isolated', 'quarantined', 'cancelled'] as const) {
		test(`restores or cancels ${restoredState} chat isolation without blocking another chat`, async () => {
			const worktree = URI.file('/workspace/project.worktrees/chat');
			const host: IChatIsolationHost = {
				runWithChatCatalogLock: (_session, operation) => operation(),
				prepareChatWorkingDirectory: async () => { throw new Error('No worktree should be prepared'); },
				setChatWorkingDirectory: async () => { throw new Error('No workspace should change'); },
			};
			const harness = createHarness(new TestWorktreeIsolation(worktree), async () => true, new TestSessionDatabase(), 'copilot', host);
			makeFolderSession(harness);
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async () => { throw new Error('No provider directory should change'); };
			assert.deepStrictEqual([harness.service.canIsolateChat(peer), harness.service.canIsolateChat(harness.chat)], [true, true]);
			if (restoredState === 'cancelled') {
				startTurn(harness.stateManager, peer);
				harness.service.requestChatIsolation(peer, 'turn-1', 'client-1');
				harness.service.cancel(peer.toString(), 'turn-1');
				completeTurn(harness.stateManager, peer);
				await harness.service.updateSessionWorkspace(peer.toString(), 'turn-1');
			} else {
				await harness.database.setMetadata(
					restoredState === 'isolated' ? 'agentHost.chatIsolationDirectory' : 'agentHost.chatIsolationQuarantined',
					restoredState === 'isolated' ? worktree.toString() : 'true',
				);
				await harness.service.restoreChatIsolation(peer.toString());
			}
			assert.deepStrictEqual({
				peerAvailable: harness.service.canIsolateChat(peer),
				mainAvailable: harness.service.canIsolateChat(harness.chat),
				blocked: harness.service.isPending(peer.toString()),
				sessionBlocked: harness.service.isPending(peer.toString(), true),
				continuations: harness.continuations,
			}, {
				peerAvailable: restoredState === 'cancelled', mainAvailable: true,
				blocked: restoredState === 'quarantined', sessionBlocked: false, continuations: [],
			});
		});
	}

	for (const failure of ['trust', 'destinationTrust', 'provider', 'uncertain', 'commit'] as const) {
		test(`chat isolation ${failure} failure does not block unrelated chats and preserves restart safety`, async () => {
			const worktree = URI.file('/workspace/project.worktrees/chat');
			const isolation = new TestWorktreeIsolation(worktree);
			let releases = 0;
			let providerCalls = 0;
			const host: IChatIsolationHost = {
				runWithChatCatalogLock: (_session, operation) => operation(),
				prepareChatWorkingDirectory: async () => ({ directory: worktree, release: async () => { releases++; } }),
				setChatWorkingDirectory: async () => { throw new Error('commit failed'); },
			};
			const database = new TestSessionDatabase();
			const harness = createHarness(isolation, async (_client, request) =>
				failure !== 'trust' && (failure !== 'destinationTrust' || request.workspace !== worktree.toString()), database, 'copilot', host);
			makeFolderSession(harness);
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async () => {
				providerCalls++;
				if (failure === 'provider') {
					throw new Error('provider rejected before mutation');
				}
				if (failure === 'uncertain') {
					throw new AgentWorkingDirectoryChangedError(worktree, 'update could not be confirmed');
				}
			};
			startTurn(harness.stateManager, peer);
			harness.service.requestChatIsolation(peer, 'turn-1', 'client-1');
			completeTurn(harness.stateManager, peer);
			await harness.service.updateSessionWorkspace(peer.toString(), 'turn-1');
			const restored = createHarness(isolation, async () => true, database, 'copilot', host);
			await restored.service.restoreChatIsolation(peer.toString());
			const unsafe = failure === 'uncertain' || failure === 'commit';
			assert.deepStrictEqual({
				releases, providerCalls,
				blocked: harness.service.isPending(peer.toString()),
				otherBlocked: harness.service.isPending(harness.chat.toString()),
				restoredBlocked: restored.service.isPending(peer.toString()),
				progress: readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString())),
				sessionQuarantine: await database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
				failedTurns: harness.failedContinuations.length,
			}, {
				releases: failure === 'provider' || failure === 'destinationTrust' ? 1 : 0,
				providerCalls: failure === 'trust' || failure === 'destinationTrust' ? 0 : 1,
				blocked: unsafe, otherBlocked: false, restoredBlocked: unsafe,
				progress: unsafe ? { [peer.toString()]: 'blocked' } : {},
				sessionQuarantine: undefined, failedTurns: unsafe ? 1 : 0,
			});
		});
	}

	for (const target of ['single', 'main', 'peer'] as const) {
		test(`tool isolation of an idle ${target} chat publishes its progress, persists the transition and continues the chat`, async () => {
			const worktree = URI.file('/worktree');
			const host: IChatIsolationHost = {
				runWithChatCatalogLock: (_session, operation) => operation(),
				prepareChatWorkingDirectory: async () => ({ directory: worktree, release: async () => assert.fail('must retain worktree') }),
				setChatWorkingDirectory: async (session, chat, directory) => {
					harness.stateManager.dispatchServerAction(session.toString(), {
						type: ActionType.SessionChatUpdated, chat: chat.toString(), changes: { workingDirectories: [directory.toString()] },
					});
				},
			};
			const harness = createHarness(new TestWorktreeIsolation(worktree), async () => true, new TestSessionDatabase(), 'copilot', target === 'single' ? undefined : host);
			makeFolderSession(harness);
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			if (target === 'single') {
				harness.agent.getDescriptor = () => ({ provider: 'copilot', displayName: 'Copilot', description: '' });
			} else {
				harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
			}
			const chat = target === 'peer' ? peer : harness.chat;
			const other = target === 'main' ? peer : harness.chat;
			completePriorTurn(harness.stateManager, chat);
			if (target !== 'single') {
				startTurn(harness.stateManager, other, 'other-turn');
			}
			const calls: string[] = [];
			const progress: Readonly<Record<string, string>>[] = [];
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async resource => {
				calls.push(resource.toString());
				progress.push(readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString())));
				const running = harness.stateManager.getChatState(chat.toString())!;
				assert.deepStrictEqual({
					activeTurn: running.activeTurn?.id,
					inProgress: (running.status & SessionStatus.InProgress) !== 0,
					hiddenRequest: running.activeTurn && isMessageRequestHiddenFromTranscript(running.activeTurn.message),
					protectedTurn: harness.service.isConversionTurn(chat.toString(), 'continuation-1'),
				}, { activeTurn: 'continuation-1', inProgress: true, hiddenRequest: true, protectedTurn: true });
			};
			await changeWorkspaceViaTool(harness, chat, undefined);
			assert.deepStrictEqual({
				calls, turns: harness.stateManager.getChatState(chat.toString())!.turns.map(turn => turn.id), progress,
				finalProgress: readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString())),
				active: harness.stateManager.getActiveTurnId(chat.toString()),
				otherActive: target === 'single' ? undefined : harness.stateManager.getActiveTurnId(other.toString()),
				continue: harness.continuations.map(entry => entry.chat),
				persisted: await harness.database.getMetadata('agentHost.chatIsolationDirectory'),
				transition: (await harness.database.getTurnWorkspaceTransitions()).get('continuation-1'),
				transitions: readSessionHasWorkspaceTransitions(harness.stateManager.getSessionState(harness.session.toString())?._meta),
			}, {
				calls: [chat.toString()], turns: ['turn-0', 'turn-1'], progress: [{ [chat.toString()]: 'isolating' }], finalProgress: {},
				active: 'continuation-1', otherActive: target === 'single' ? undefined : 'other-turn',
				continue: [chat.toString()], persisted: worktree.toString(),
				transition: serializeAgentWorkspaceTransition({
					content: 'Workspace changed to workspace-less in a new worktree',
					workspaceKind: AgentSystemNotificationWorkspaceKind.Worktree,
					workspaceName: 'workspace-less',
				}),
				transitions: target !== 'peer',
			});
		});
	}

	for (const source of ['folder', 'worktree'] as const) {
		test(`workspace tool changes a ${source} chat to an existing folder without multi-root support`, async () => {
			const worktrees = new TestWorktreeIsolation(URI.file('/old-worktree'));
			const harness = createHarness(worktrees);
			makeFolderSession(harness);
			harness.agent.getDescriptor = () => ({ provider: 'copilot', displayName: 'Copilot', description: '' });
			if (source === 'worktree') {
				setSessionConfig(harness, { [SessionConfigKey.Isolation]: 'worktree' });
			}
			completePriorTurn(harness.stateManager, harness.chat);
			const workspace = URI.file('/workspace/destination');
			const calls: string[][] = [];
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async (chat, _context, directory, options) => {
				assert.deepStrictEqual(options, { replaceSessionWorkspace: true });
				calls.push([chat.toString(), directory.toString()]);
				assert.deepStrictEqual({
					state: readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString())),
					blocked: harness.service.isPending(chat.toString()),
				}, { state: { [chat.toString()]: 'changingWorkspace' }, blocked: true });
			};
			await changeWorkspaceViaTool(harness, harness.chat, workspace);
			const state = harness.stateManager.getSessionState(harness.session.toString())!;
			assert.deepStrictEqual({
				calls,
				transition: (await harness.database.getTurnWorkspaceTransitions()).get('continuation-1'),
				sessionDirectory: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories, chatDirectory: state.chats[0].workingDirectories,
				workspaceless: readSessionWorkspaceless(state._meta), project: harness.stateManager.getSessionSummary(harness.session.toString())?.project,
				isolation: state.config?.values[SessionConfigKey.Isolation],
				created: worktrees.createdWorktrees, removed: worktrees.removedWorktrees, retained: worktrees.retainedSessions,
				trust: harness.trustRequests, continued: harness.continuations.map(entry => entry.chat),
				blocked: harness.service.isPending(harness.chat.toString()),
				canIsolate: harness.service.canIsolateChat(harness.chat),
				persisted: await harness.database.getMetadata('agentHost.chatIsolationDirectory'),
			}, {
				calls: [[harness.chat.toString(), workspace.toString()]],
				transition: serializeAgentWorkspaceTransition({
					content: 'Workspace changed to destination',
					workspaceKind: AgentSystemNotificationWorkspaceKind.Folder,
					workspaceName: 'destination',
				}),
				sessionDirectory: [workspace.toString()], chatDirectory: [workspace.toString()],
				workspaceless: false, project: { uri: workspace.toString(), displayName: 'destination' }, isolation: 'folder',
				created: [], removed: [], retained: [harness.session.toString()],
				trust: [{ clientId: 'client', workspace: workspace.toString() }], continued: [harness.chat.toString()], blocked: false, canIsolate: true, persisted: '',
			});
			await harness.service.restoreChatIsolation(harness.chat.toString());
			assert.strictEqual(harness.service.canIsolateChat(harness.chat), true);
		});
	}

	test('synchronizes removed branch configuration with clients during a folder switch', async () => {
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
		makeFolderSession(harness);
		setSessionConfig(harness, {
			[SessionConfigKey.Isolation]: 'worktree',
			[SessionConfigKey.Branch]: 'release-A',
			[SessionConfigKey.AutoApprove]: 'assisted',
			[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
		});
		let client: SessionState = structuredClone(harness.stateManager.getSessionState(harness.session.toString())!);
		disposables.add(harness.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === harness.session.toString() && envelope.action.type === ActionType.SessionConfigChanged) {
				client = sessionReducer(client, envelope.action);
			}
		}));
		await changeWorkspaceViaTool(harness, harness.chat, URI.file('/workspace/destination'));
		const expected = {
			[SessionConfigKey.Isolation]: 'folder',
			[SessionConfigKey.AutoApprove]: 'assisted',
			[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
		};
		assert.deepStrictEqual({
			host: harness.stateManager.getSessionState(harness.session.toString())?.config?.values,
			client: client.config?.values,
			persisted: JSON.parse((await harness.database.getMetadata('configValues'))!),
		}, { host: expected, client: expected, persisted: expected });
	});

	for (const target of ['main', 'peer'] as const) {
		test(`workspace tool changes only the ${target} chat's workspace while its sibling is running`, async () => {
			const workspace = URI.file('/workspace/destination');
			const prepared: string[] = [];
			const host: IChatIsolationHost = {
				runWithChatCatalogLock: (_session, operation) => operation(),
				prepareChatWorkingDirectory: async (_session, directory, options) => {
					prepared.push(options.isolation);
					return { directory, release: async () => assert.fail('Selected folder must not be deleted') };
				},
				setChatWorkingDirectory: async (session, chat, directory, replace) => {
					assert.strictEqual(replace, false);
					harness.stateManager.dispatchServerAction(session.toString(), {
						type: ActionType.SessionChatUpdated, chat: chat.toString(), changes: { workingDirectories: [directory.toString()] },
					});
				},
			};
			const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, new TestSessionDatabase(), 'copilot', host);
			makeFolderSession(harness);
			harness.agent.setWorkingDirectory = async () => assert.fail('Must not reanchor shared configuration');
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async (_chat, _context, _directory, options) => assert.strictEqual(options, undefined);
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
			const chat = target === 'main' ? harness.chat : peer;
			const sibling = target === 'main' ? peer : harness.chat;
			startTurn(harness.stateManager, sibling, 'sibling-turn');
			await changeWorkspaceViaTool(harness, chat, workspace);
			assert.deepStrictEqual({
				prepared, session: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
				target: harness.stateManager.getSessionState(harness.session.toString())?.chats.find(candidate => candidate.resource === chat.toString())?.workingDirectories,
				sibling: harness.stateManager.getActiveTurnId(sibling.toString()), continued: harness.continuations.map(entry => entry.chat),
			}, { prepared: ['folder'], session: [harness.scratch.toString()], target: [workspace.toString()], sibling: 'sibling-turn', continued: [chat.toString()] });
		});
	}

	for (const siblingRestore of ['restores', 'fails'] as const) {
		test(`workspace tool ${siblingRestore === 'restores' ? 'restores lazily registered siblings before the provider moves' : 'fails cleanly without quarantine when a sibling cannot be restored'}`, async () => {
			const workspace = URI.file('/workspace/selected');
			const events: string[] = [];
			const host: IChatIsolationHost = {
				runWithChatCatalogLock: (_session, operation) => operation(),
				prepareChatWorkingDirectory: async (_session, directory) => ({ directory, release: async () => { } }),
				setChatWorkingDirectory: async (session, chat, directory) => {
					harness.stateManager.dispatchServerAction(session.toString(), {
						type: ActionType.SessionChatUpdated, chat: chat.toString(), changes: { workingDirectories: [directory.toString()] },
					});
				},
			};
			const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, new TestSessionDatabase(), 'copilot', host);
			makeFolderSession(harness);
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async chat => { events.push(`move:${chat.toString()}`); };
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			harness.stateManager.registerRestoredChatSummary(harness.session.toString(), peer.toString(), {
				resolver: async () => {
					events.push(`restore:${peer.toString()}`);
					if (siblingRestore === 'fails') {
						throw new Error('peer backing is unavailable');
					}
					return { turns: [] };
				},
			});
			const subagentChat = URI.parse(buildChatUri(harness.session, 'subagent'));
			harness.stateManager.registerRestoredChatSummary(harness.session.toString(), subagentChat.toString(), {
				origin: { kind: ChatOriginKind.Tool, chat: harness.chat.toString(), toolCallId: 'tool' },
				resolver: async () => {
					events.push(`restore:${subagentChat.toString()}`);
					throw new Error('subagent transcript is unavailable');
				},
			});
			await changeWorkspaceViaTool(harness, harness.chat, workspace);
			assert.deepStrictEqual({
				events,
				directories: harness.stateManager.getSessionState(harness.session.toString())?.chats.find(candidate => candidate.resource === harness.chat.toString())?.workingDirectories,
				blocked: harness.service.isPending(harness.chat.toString()),
				failureReported: /peer backing is unavailable/.test(harness.continuations[0]?.message.text ?? ''),
				failedTurns: harness.failedContinuations.length,
			}, siblingRestore === 'restores'
				? { events: [`restore:${peer.toString()}`, `move:${harness.chat.toString()}`], directories: [workspace.toString()], blocked: false, failureReported: false, failedTurns: 0 }
				: { events: [`restore:${peer.toString()}`], directories: undefined, blocked: false, failureReported: true, failedTurns: 0 });
		});
	}

	for (const failure of ['trust', 'provider', 'uncertain'] as const) {
		test(`workspace tool preserves the source on ${failure} failure and quarantines only uncertain changes after a restart`, async () => {
			const worktrees = new TestWorktreeIsolation(URI.file('/old-worktree'));
			const harness = createHarness(worktrees, async () => failure !== 'trust');
			makeFolderSession(harness);
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async () => {
				throw failure === 'uncertain' ? new AgentWorkingDirectoryChangedError(URI.file('/destination'), 'uncertain') : new Error('provider rejected');
			};
			await changeWorkspaceViaTool(harness, harness.chat, URI.file('/destination'));
			await harness.service.restoreChatIsolation(harness.chat.toString());
			assert.deepStrictEqual({
				directories: harness.stateManager.getSessionState(harness.session.toString())?.workingDirectories,
				blocked: harness.service.isPending(harness.chat.toString()), retained: worktrees.retainedSessions,
				removed: worktrees.removedWorktrees, continued: harness.continuations.map(entry => entry.chat),
				failed: harness.failedContinuations.map(entry => entry.chat),
			}, {
				directories: [harness.scratch.toString()], blocked: failure === 'uncertain', retained: [], removed: [],
				continued: failure === 'uncertain' ? [] : [harness.chat.toString()],
				failed: failure === 'uncertain' ? [harness.chat.toString()] : [],
			});
		});
	}

	test('a spawned subagent chat does not make a single-chat workspace change preserve the old folder', async () => {
		const harness = createHarness();
		makeFolderSession(harness);
		harness.stateManager.addChat(harness.session.toString(), buildChatUri(harness.session, 'subagent'), {
			origin: { kind: ChatOriginKind.Tool, chat: harness.chat.toString(), toolCallId: 'tool' },
			interactivity: ChatInteractivity.ReadOnly,
		});
		const destination = URI.file('/workspace/destination');
		const provider: IAgent = harness.agent;
		const replaceFlags: (boolean | undefined)[] = [];
		provider.setChatWorkingDirectory = async (_chat, _context, _directory, options) => { replaceFlags.push(options?.replaceSessionWorkspace); };
		await changeWorkspaceViaTool(harness, harness.chat, destination);
		assert.deepStrictEqual({
			replaceFlags,
			sessionRoots: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
		}, { replaceFlags: [true], sessionRoots: [destination.toString()] });
	});

	for (const restriction of ['readOnly', 'worker', 'archived', 'chatArchived', 'quarantined'] as const) {
		test(`rejects requesting isolation of ${restriction} chat`, async () => {
			const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
			const harness = createHarness(isolation);
			makeFolderSession(harness);
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			harness.stateManager.addChat(harness.session.toString(), peer.toString(), {
				workingDirectories: [harness.scratch.toString()],
				interactivity: restriction === 'readOnly' ? ChatInteractivity.ReadOnly : undefined,
				origin: restriction === 'worker' ? { kind: ChatOriginKind.Tool, chat: harness.chat.toString(), toolCallId: 'tool' } : undefined,
			});
			if (restriction === 'archived') {
				harness.stateManager.dispatchServerAction(harness.session.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });
			} else if (restriction === 'chatArchived') {
				harness.stateManager.dispatchServerAction(peer.toString(), { type: ActionType.ChatIsArchivedChanged, isArchived: true });
			} else if (restriction === 'quarantined') {
				await harness.database.setMetadata('agentHost.chatIsolationQuarantined', 'true');
				await harness.service.restoreChatIsolation(peer.toString());
			}
			startTurn(harness.stateManager, peer);
			assert.throws(() => harness.service.requestChatIsolation(peer, 'turn-1', 'client'), /cannot be changed to a new worktree/);
			assert.deepStrictEqual({ created: isolation.createdWorktrees, begin: harness.deferredContinuations, continue: harness.continuations }, {
				created: [], begin: [], continue: [],
			});
		});
	}

	test('does not publish empty workspace operation metadata for an ineligible session', () => {
		const harness = createHarness();
		makeFolderSession(harness);
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = undefined;
		harness.stateManager.setSessionMeta(harness.session.toString(), undefined);
		let metadataUpdates = 0;
		disposables.add(harness.stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionMetaChanged) {
				metadataUpdates++;
			}
		}));
		harness.stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootAgentsChanged, agents: [] });
		harness.stateManager.dispatchServerAction(harness.session.toString(), { type: ActionType.SessionConfigChanged, config: { isolation: 'folder' } });
		harness.stateManager.addChat(harness.session.toString(), buildChatUri(harness.session, 'peer'));
		assert.deepStrictEqual({
			metadata: harness.stateManager.getSessionState(harness.session.toString())?._meta,
			metadataUpdates,
		}, { metadata: withSessionWorkspaceless(undefined, false), metadataUpdates: 0 });
	});

	for (const quarantined of [false, true]) {
		test(`restoring chat isolation publishes a block only for a durable failure (quarantined: ${quarantined})`, async () => {
			const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
			makeFolderSession(harness);
			if (quarantined) {
				await harness.database.setMetadata('agentHost.chatIsolationQuarantined', 'true');
			}
			const observed: string[] = [];
			disposables.add(harness.stateManager.onDidEmitEnvelope(envelope => {
				if (envelope.action.type === ActionType.SessionMetaChanged) {
					const state = readAgentHostChatIsolationStates(envelope.action)[harness.chat.toString()];
					if (state) {
						observed.push(state);
					}
				}
			}));
			await harness.service.restoreChatIsolation(harness.chat.toString());
			assert.deepStrictEqual({
				observed,
				pending: harness.service.isPending(harness.chat.toString()),
				states: readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString())),
			}, {
				observed: quarantined ? ['blocked'] : [], pending: quarantined,
				states: quarantined ? { [harness.chat.toString()]: 'blocked' } : {},
			});
		});
	}

	test('clears restored isolation and quarantine when a peer is removed and recreated', async () => {
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
		makeFolderSession(harness);
		const peer = URI.parse(buildChatUri(harness.session, 'peer'));
		harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
		await harness.database.setMetadata('agentHost.chatIsolationDirectory', URI.file('/worktree').toString());
		await harness.database.setMetadata('agentHost.chatIsolationQuarantined', 'true');
		await harness.service.restoreChatIsolation(peer.toString());
		harness.stateManager.removeChat(harness.session.toString(), peer.toString());
		const pendingAfterRemoval = harness.service.isPending(peer.toString());
		await harness.database.deleteMetadata(['agentHost.chatIsolationDirectory', 'agentHost.chatIsolationQuarantined']);
		harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
		const isolatableBeforeRestore = harness.service.canIsolateChat(peer);
		await harness.service.restoreChatIsolation(peer.toString());
		assert.deepStrictEqual({
			pendingAfterRemoval,
			isolatableBeforeRestore,
			pending: harness.service.isPending(peer.toString()),
			isolatable: harness.service.canIsolateChat(peer),
			states: readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString())),
		}, { pendingAfterRemoval: false, isolatableBeforeRestore: true, pending: false, isolatable: true, states: {} });
	});

	test('ignores a stale isolation restore after peer deletion and recreation', async () => {
		const readStarted = new DeferredPromise<void>();
		const releaseRead = new DeferredPromise<void>();
		let gate = true;
		const database = new class extends TestSessionDatabase {
			override async getMetadata(key: string): Promise<string | undefined> {
				if (gate && key === 'agentHost.chatIsolationDirectory') {
					gate = false;
					readStarted.complete();
					await releaseRead.p;
					return URI.file('/old-worktree').toString();
				}
				return super.getMetadata(key);
			}
		};
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')), async () => true, database);
		makeFolderSession(harness);
		const peer = URI.parse(buildChatUri(harness.session, 'peer'));
		harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
		const restore = harness.service.restoreChatIsolation(peer.toString());
		await readStarted.p;
		harness.stateManager.removeChat(harness.session.toString(), peer.toString());
		harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
		await harness.service.restoreChatIsolation(peer.toString());
		releaseRead.complete();
		await restore;
		assert.deepStrictEqual({
			pending: harness.service.isPending(peer.toString()),
			isolatable: harness.service.canIsolateChat(peer),
			states: readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString())),
		}, { pending: false, isolatable: true, states: {} });
	});

	test('does not quarantine a recreated peer when its deleted workspace conversion finishes', async () => {
		const providerStarted = new DeferredPromise<void>();
		const releaseProvider = new DeferredPromise<void>();
		const host: IChatIsolationHost = {
			runWithChatCatalogLock: (_session, operation) => operation(),
			prepareChatWorkingDirectory: async () => ({ directory: URI.file('/worktree'), release: async () => { } }),
			setChatWorkingDirectory: async () => assert.fail('Must not update a deleted chat'),
		};
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')), async () => true, new TestSessionDatabase(), 'copilot', host);
		makeFolderSession(harness);
		const peer = URI.parse(buildChatUri(harness.session, 'peer'));
		harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async () => {
			providerStarted.complete();
			await releaseProvider.p;
		};
		const conversion = changeWorkspaceViaTool(harness, peer, undefined);
		await providerStarted.p;
		harness.stateManager.removeChat(harness.session.toString(), peer.toString());
		await harness.database.deleteMetadata(['agentHost.chatIsolationQuarantined']);
		harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
		await harness.service.restoreChatIsolation(peer.toString());
		harness.stateManager.dispatchServerAction(peer.toString(), { type: ActionType.ChatActivityChanged, activity: 'Replacement chat activity' });
		releaseProvider.complete();
		await conversion;
		assert.deepStrictEqual({
			pending: harness.service.isPending(peer.toString()),
			isolatable: harness.service.canIsolateChat(peer),
			activity: harness.stateManager.getChatState(peer.toString())?.activity,
			quarantine: await harness.database.getMetadata('agentHost.chatIsolationQuarantined'),
		}, { pending: false, isolatable: true, activity: 'Replacement chat activity', quarantine: undefined });
	});

	test('isolates a single-chat session without multi-root, preserving its project and history', async () => {
		const worktree = URI.file('/workspace/project.worktrees/feature');
		const isolation = new TestWorktreeIsolation(worktree);
		const harness = createHarness(isolation);
		makeFolderSession(harness);
		completePriorTurn(harness.stateManager, harness.chat);
		harness.agent.getDescriptor = () => ({ provider: 'copilot', displayName: 'Copilot', description: '' });
		startTurn(harness.stateManager, harness.chat);
		const providerCalls: string[] = [];
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async (_chat, _context, directory) => { providerCalls.push(directory.toString()); };
		assert.strictEqual(harness.service.canIsolateChat(harness.chat), true);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		assert.strictEqual(harness.service.isPending(harness.chat.toString(), true), true);
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		const state = harness.stateManager.getSessionState(harness.session.toString())!;
		assert.deepStrictEqual({
			directories: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
			chatDirectories: state.workingDirectories,
			project: harness.stateManager.getSessionSummary(harness.session.toString())?.project?.uri,
			trustRequests: harness.trustRequests,
			isolation: state.config?.values[SessionConfigKey.Isolation],
			approval: state.config?.values[SessionConfigKey.AutoApprove],
			persistedConfig: JSON.parse((await harness.database.getMetadata('configValues'))!),
			mainTurnIds: harness.stateManager.getChatState(harness.chat.toString())!.turns.map(turn => turn.id),
			continuations: harness.continuations.map(entry => entry.chat),
			transition: harness.stateManager.getChatState(harness.chat.toString())?.activeTurn?.responseParts
				.filter(part => part.kind === ResponsePartKind.SystemNotification).map(part => part.content),
			providerCalls,
			gitRefreshes: harness.gitRefreshes,
			worktreeConfig: isolation.requests[0]?.config,
			pending: harness.service.isPending(harness.chat.toString()),
		}, {
			directories: [worktree.toString()],
			chatDirectories: [worktree.toString()],
			project: isolation.repository.toString(),
			trustRequests: [
				{ clientId: 'client-1', workspace: harness.scratch.toString() },
				{ clientId: 'client-1', workspace: isolation.repository.toString() },
				{ clientId: 'client-1', workspace: worktree.toString(), trustedParent: isolation.repository.toString() },
			],
			isolation: 'worktree',
			approval: 'default',
			persistedConfig: {
				isolation: 'worktree', autoApprove: 'default', worktreeIncludeFiles: ['.env'], branch: 'main',
			},
			mainTurnIds: ['turn-0', 'turn-1'],
			continuations: [harness.chat.toString()],
			transition: ['Workspace changed to workspace-less in a new worktree'],
			providerCalls: [worktree.toString()],
			gitRefreshes: [],
			worktreeConfig: {
				isolation: 'worktree', autoApprove: 'default', worktreeIncludeFiles: ['.env'], branch: 'main',
			},
			pending: false,
		});
	});

	for (const target of ['single', 'main', 'peer'] as const) {
		test(`registers isolation for the ${target} chat before readiness but rejects premature execution`, async () => {
			const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
			const { stateManager, service, session, agent } = harness;
			const peer = URI.parse(buildChatUri(session, 'peer'));
			if (target === 'single') {
				agent.getDescriptor = () => ({ provider: agent.id, displayName: 'Agent', description: '' });
			} else {
				stateManager.addChat(session.toString(), peer.toString(), { title: 'Peer' });
			}
			stateManager.setSessionMeta(session.toString(), withSessionWorkspaceless(undefined, false));
			const provider: IAgent = agent;
			provider.setChatWorkingDirectory = async () => { };
			setSessionConfig(harness, { [SessionConfigKey.Isolation]: 'folder' });
			const host = new AgentServerToolHost(stateManager, [createSessionIsolationToolGroup({
				supportsChatIsolation: resource => service.supportsChatIsolation(resource),
				requestChatIsolation: (chat, turnId) => service.requestChatIsolation(chat, turnId, 'client-1'),
			})]);
			const chat = target === 'peer' ? peer : harness.chat;
			const toolsAtInitialization = host.getDefinitionsForSession(session.toString(), chat.toString()).map(tool => tool.name);
			host.advertise(chat.toString());
			startTurn(stateManager, chat);
			assert.throws(() => host.executeTool(chat.toString(), SessionServerToolName.IsolateSession, {}), /workspace cannot be changed to a new worktree/);
			const before = {
				canIsolate: service.canIsolateChat(chat),
				pending: service.isPending(chat.toString()),
			};
			stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
			host.executeTool(chat.toString(), SessionServerToolName.IsolateSession, {});
			assert.deepStrictEqual({
				toolsAtInitialization, before,
				pendingAfterReady: service.isPending(chat.toString()),
			}, {
				toolsAtInitialization: [SessionServerToolName.IsolateSession],
				before: { canIsolate: false, pending: false },
				pendingAfterReady: true,
			});
		});
	}

	for (const target of ['main', 'peer'] as const) {
		test(`refreshes isolation tools when a restored multi-chat session becomes ready for its ${target} chat`, () => {
			const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
			const { stateManager, session, service } = harness;
			const peer = URI.parse(buildChatUri(session, 'peer'));
			stateManager.addChat(session.toString(), peer.toString(), { title: 'Peer' });
			stateManager.setSessionMeta(session.toString(), withSessionWorkspaceless(undefined, false));
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async () => { };
			setSessionConfig(harness, { [SessionConfigKey.Isolation]: 'folder' });
			const host = new AgentServerToolHost(stateManager, [createSessionIsolationToolGroup({
				supportsChatIsolation: resource => service.supportsChatIsolation(resource),
				requestChatIsolation: (chat, turnId) => service.requestChatIsolation(chat, turnId, 'client-1'),
			})]);
			harness.serverToolHost.advertise = resource => host.advertise(resource);
			stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionServerToolsChanged, tools: [] });
			const before = stateManager.getSessionState(session.toString())?.serverTools?.map(tool => tool.name);
			stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
			const after = stateManager.getSessionState(session.toString())?.serverTools?.map(tool => tool.name);
			const chat = target === 'main' ? harness.chat : peer;
			startTurn(stateManager, chat);
			host.executeTool(chat.toString(), SessionServerToolName.IsolateSession, {});
			assert.deepStrictEqual({
				before, after, requested: service.isPending(chat.toString()),
				otherPending: service.isPending((target === 'main' ? peer : harness.chat).toString()),
			}, { before: [], after: [SessionServerToolName.IsolateSession], requested: true, otherPending: false });
		});
	}

	test('peer tool advertisement updates the owning session before isolation execution', () => {
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
		makeFolderSession(harness);
		const { stateManager, service, session } = harness;
		const peer = URI.parse(buildChatUri(session, 'peer'));
		stateManager.addChat(session.toString(), peer.toString(), { title: 'Peer' });
		stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionServerToolsChanged, tools: [] });
		const host = new AgentServerToolHost(stateManager, [createSessionIsolationToolGroup({
			supportsChatIsolation: resource => service.supportsChatIsolation(resource),
			requestChatIsolation: (chat, turnId) => service.requestChatIsolation(chat, turnId, 'client-1'),
		})]);
		const advertisedChannels: string[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionServerToolsChanged) {
				advertisedChannels.push(envelope.channel);
			}
		}));
		host.advertise(peer.toString());
		startTurn(stateManager, peer);
		host.executeTool(peer.toString(), SessionServerToolName.IsolateSession, {});
		assert.deepStrictEqual({
			advertisedChannels,
			tools: stateManager.getSessionState(session.toString())?.serverTools?.map(tool => tool.name),
			pending: service.isPending(peer.toString()),
		}, { advertisedChannels: [session.toString()], tools: [SessionServerToolName.IsolateSession], pending: true });
	});

	test('Codex isolation tool is available without multi-root and continues the same single chat', async () => {
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation, async () => true, new TestSessionDatabase(), 'codex');
		makeFolderSession(harness);
		const host = new AgentServerToolHost(harness.stateManager, [createSessionIsolationToolGroup({
			supportsChatIsolation: resource => harness.service.supportsChatIsolation(resource),
			requestChatIsolation: (chat, turnId) => harness.service.requestChatIsolation(chat, turnId, 'client-1'),
		})]);
		const session = harness.session.toString();
		const main = harness.chat.toString();
		harness.agent.getDescriptor = () => ({ provider: 'codex', displayName: 'Codex', description: '' });
		host.advertise(session);
		assert.deepStrictEqual({
			mainTools: host.getDefinitionsForSession(session, main).map(tool => tool.name),
		}, { mainTools: [SessionServerToolName.IsolateSession] });
		const calls: string[] = [];
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async resource => { calls.push(resource.toString()); };
		startTurn(harness.stateManager, harness.chat);
		host.executeTool(main, SessionServerToolName.IsolateSession, {});
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.deepStrictEqual({
			calls,
			directories: harness.stateManager.getSessionState(session)?.workingDirectories,
			continuations: harness.continuations.map(entry => entry.chat),
			toolsAfter: host.getDefinitionsForSession(session, main).map(tool => tool.name),
		}, { calls: [main], directories: ['file:///worktree'], continuations: [main], toolsAfter: [SessionServerToolName.IsolateSession] });
		assert.throws(() => host.executeTool(main, SessionServerToolName.IsolateSession, {}), /workspace cannot be changed to a new worktree/);
	});

	test('tool-driven conversion publishes its blocking state and protects its continuation turn only while converting', async () => {
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/workspace/project.worktrees/feature')));
		makeFolderSession(harness);
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async () => {
			entered.complete();
			await release.p;
		};
		const chat = harness.chat.toString();
		const snapshot = () => ({
			state: readAgentHostChatIsolationStates(harness.stateManager.getSessionState(harness.session.toString()))[chat],
			protectedTurn: harness.service.isConversionTurn(chat, 'continuation-1'),
		});
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		const requested = snapshot();
		completeTurn(harness.stateManager, harness.chat);
		const converting = updateSessionWorkspace(harness);
		await entered.p;
		const during = snapshot();
		release.complete();
		await converting;
		assert.deepStrictEqual({ requested, during, after: snapshot() }, {
			requested: { state: undefined, protectedTurn: false },
			during: { state: 'isolating', protectedTurn: true },
			after: { state: undefined, protectedTurn: false },
		});
	});

	test('publishes the generated worktree branch before exposing its working directory', async () => {
		const worktree = URI.file('/workspace/project.worktrees/feature');
		const harness = createHarness(new TestWorktreeIsolation(worktree));
		makeFolderSession(harness);
		harness.stateManager.setSessionMeta(harness.session.toString(), withSessionGitState(
			harness.stateManager.getSessionState(harness.session.toString())?._meta,
			{ branchName: 'main', baseBranchName: 'main' },
		));
		const observed: { directory: string | undefined; branch: string | undefined }[] = [];
		disposables.add(harness.stateManager.onDidChangeSessionWorkingDirectories(({ session }) => {
			if (session !== harness.session.toString()) {
				return;
			}
			const state = harness.stateManager.getSessionState(session);
			observed.push({ directory: state?.workingDirectories?.[0], branch: readSessionGitState(state?._meta)?.branchName });
		}));
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.deepStrictEqual({
			observed,
			baseBranch: harness.stateManager.getSessionState(harness.session.toString())?.config?.values[SessionConfigKey.Branch],
		}, {
			observed: [{ directory: worktree.toString(), branch: 'feature' }],
			baseBranch: 'main',
		});
	});

	test('only a catalogued chat with its active client turn may request isolation', () => {
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
		makeFolderSession(harness);
		startTurn(harness.stateManager, harness.chat);
		const peer = URI.parse(buildChatUri(harness.session, 'peer'));
		assert.throws(() => harness.service.requestChatIsolation(peer, 'peer-turn', 'client-1'), /active turn/);
		assert.throws(() => harness.service.requestChatIsolation(harness.chat, 'wrong-turn', 'client-1'), /active turn/);
		assert.throws(() => harness.service.requestChatIsolation(harness.chat, 'turn-1', ''), /connected client/);
	});

	test('a peer turn finishing before the requesting turn does not start isolation', async () => {
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation);
		makeFolderSession(harness);
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		await harness.service.updateSessionWorkspace(buildChatUri(harness.session, 'peer'), 'peer-turn');
		assert.strictEqual(isolation.createdWorktrees.length, 0);
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.deepStrictEqual(isolation.createdWorktrees.map(uri => uri.toString()), ['file:///worktree']);
	});

	test('does not create a worktree if the folder session is archived while awaiting trust', async () => {
		const trust = new DeferredPromise<boolean>();
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation, () => trust.p);
		makeFolderSession(harness);
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		const conversion = updateSessionWorkspace(harness);
		harness.stateManager.dispatchServerAction(harness.session.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		trust.complete(true);
		await conversion;
		assert.deepStrictEqual(isolation.createdWorktrees, []);
		assert.match(harness.continuations[0].message.text, /chat changed/);
	});

	for (const target of ['single', 'main', 'peer'] as const) {
		for (const isolation of [false, true]) {
			test(`workspace tool changes existing ${target} chat to ${isolation ? 'new worktree' : 'folder'} after its turn`, async () => {
				const destination = URI.file('/workspace/destination');
				const worktree = URI.file('/workspace/destination.worktrees/task');
				const expectedDirectory = isolation ? worktree : destination;
				const host: IChatIsolationHost = {
					runWithChatCatalogLock: (_session, operation) => operation(),
					prepareChatWorkingDirectory: async (_session, directory, options) => {
						assert.deepStrictEqual([directory.toString(), options.isolation], [destination.toString(), isolation ? 'worktree' : 'folder']);
						return { directory: expectedDirectory, release: async () => assert.fail('Must retain successful destination') };
					},
					setChatWorkingDirectory: async (session, chat, directory) => {
						harness.stateManager.dispatchServerAction(session.toString(), {
							type: ActionType.SessionChatUpdated, chat: chat.toString(), changes: { workingDirectories: [directory.toString()] },
						});
					},
				};
				const harness = createHarness(new TestWorktreeIsolation(worktree), async () => true, new TestSessionDatabase(), 'copilot', target === 'single' ? undefined : host);
				makeFolderSession(harness);
				const peer = URI.parse(buildChatUri(harness.session, 'peer'));
				if (target === 'single') {
					harness.agent.getDescriptor = () => ({ provider: 'copilot', displayName: 'Copilot', description: '' });
				} else {
					harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [harness.scratch.toString()] });
				}
				const chat = target === 'peer' ? peer : harness.chat;
				const sibling = target === 'main' ? peer : harness.chat;
				if (target !== 'single') {
					startTurn(harness.stateManager, sibling, 'sibling-turn');
				}
				const calls: { chat: string; directory: string; replaceSessionWorkspace: boolean | undefined }[] = [];
				let customizationRefreshes = 0;
				const provider: IAgent = harness.agent;
				provider.setChatWorkingDirectory = async (resource, _context, directory, options) => {
					calls.push({ chat: resource.toString(), directory: directory.toString(), replaceSessionWorkspace: options?.replaceSessionWorkspace });
				};
				provider.getChatCustomizations = async () => {
					customizationRefreshes++;
					return [];
				};
				startTurn(harness.stateManager, chat);
				harness.service.requestSessionWorkspaceUpdate(chat, 'turn-1', destination, isolation, 'client-1');
				assert.deepStrictEqual({ calls, pending: harness.service.isPending(chat.toString()) }, { calls: [], pending: true });
				completeTurn(harness.stateManager, chat);
				await harness.service.updateSessionWorkspace(chat.toString(), 'turn-1');
				const state = harness.stateManager.getSessionState(harness.session.toString())!;
				assert.deepStrictEqual({
					calls,
					customizationRefreshes,
					directory: state.chats.find(candidate => candidate.resource === chat.toString())?.workingDirectories,
					sessionDirectory: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
					siblingDirectory: target === 'single' ? undefined : state.chats.find(candidate => candidate.resource === sibling.toString())?.workingDirectories ?? harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
					siblingTurn: target === 'single' ? undefined : harness.stateManager.getActiveTurnId(sibling.toString()),
					continuations: harness.continuations.map(entry => entry.chat),
					transition: (await harness.database.getTurnWorkspaceTransitions()).get('continuation-1'),
					pending: harness.service.isPending(chat.toString()),
				}, {
					calls: [{ chat: chat.toString(), directory: expectedDirectory.toString(), replaceSessionWorkspace: target === 'single' ? true : undefined }],
					customizationRefreshes: target === 'single' ? 1 : 0,
					directory: [expectedDirectory.toString()],
					sessionDirectory: [target === 'single' ? expectedDirectory.toString() : harness.scratch.toString()],
					siblingDirectory: target === 'single' ? undefined : [harness.scratch.toString()],
					siblingTurn: target === 'single' ? undefined : 'sibling-turn',
					continuations: [chat.toString()],
					transition: serializeAgentWorkspaceTransition({
						content: isolation ? 'Workspace changed to destination in a new worktree' : 'Workspace changed to destination',
						workspaceKind: isolation ? AgentSystemNotificationWorkspaceKind.Worktree : AgentSystemNotificationWorkspaceKind.Folder,
						workspaceName: 'destination',
					}),
					pending: false,
				});
				assert.match(harness.continuations[0].message.text, isolation ? /Only this chat now uses the worktree/ : /Only this chat now uses the workspace/);
			});
		}
	}

	for (const target of ['single', 'main', 'peer', 'worktree'] as const) {
		test(`workspace tool uses host path casing for the ${target} chat's no-op detection`, () => {
			const harness = createHarness();
			makeFolderSession(harness);
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			const peerFolder = URI.file('/workspace/peer');
			if (target === 'main' || target === 'peer') {
				harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [peerFolder.toString()] });
			}
			if (target === 'worktree') {
				setSessionConfig(harness, { [SessionConfigKey.Isolation]: 'worktree' });
			}
			const chat = target === 'peer' ? peer : harness.chat;
			const directory = target === 'peer' ? peerFolder : harness.scratch;
			startTurn(harness.stateManager, chat);
			const scheduled = harness.service.requestSessionWorkspaceUpdate(chat, 'turn-1', directory.with({ path: directory.path.toUpperCase() }), false, 'client-1');
			assert.deepStrictEqual({
				scheduled,
				pending: harness.service.isPending(chat.toString()),
				trust: harness.trustRequests,
				deferred: harness.deferredContinuations,
			}, { scheduled: isLinux, pending: isLinux, trust: [], deferred: [] });
			harness.service.cancel(chat.toString(), 'turn-1');
		});

		test(`workspace tool skips the current ${target} chat directory without scheduling a transition`, async () => {
			const harness = createHarness();
			makeFolderSession(harness);
			const peer = URI.parse(buildChatUri(harness.session, 'peer'));
			const peerFolder = URI.file('/workspace/peer');
			if (target === 'main' || target === 'peer') {
				harness.stateManager.addChat(harness.session.toString(), peer.toString(), { workingDirectories: [peerFolder.toString()] });
			}
			if (target === 'worktree') {
				setSessionConfig(harness, { [SessionConfigKey.Isolation]: 'worktree' });
			}
			const chat = target === 'peer' ? peer : harness.chat;
			const directory = target === 'peer' ? peerFolder : harness.scratch;
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async () => assert.fail('Unchanged workspace must not reach the provider');
			startTurn(harness.stateManager, chat);
			const before = harness.stateManager.getSessionState(harness.session.toString());
			const scheduled = harness.service.requestSessionWorkspaceUpdate(chat, 'turn-1', directory, false, 'client-1');
			const unchanged = harness.stateManager.getSessionState(harness.session.toString());
			completeTurn(harness.stateManager, chat);
			await harness.service.updateSessionWorkspace(chat.toString(), 'turn-1');
			assert.deepStrictEqual({
				scheduled, unchanged,
				pending: harness.service.isPending(chat.toString()),
				trust: harness.trustRequests,
				deferred: harness.deferredContinuations,
				continued: harness.continuations,
				transitions: [...await harness.database.getTurnWorkspaceTransitions()],
				notices: harness.stateManager.getChatState(chat.toString())?.turns.flatMap(turn => turn.responseParts),
			}, {
				scheduled: false, unchanged: before, pending: false,
				trust: [], deferred: [], continued: [], transitions: [], notices: [],
			});
		});
	}

	test('workspace tool still creates a worktree from the current folder', async () => {
		const worktree = URI.file('/workspace/project.worktrees/task');
		const harness = createHarness(new TestWorktreeIsolation(worktree));
		makeFolderSession(harness);
		startTurn(harness.stateManager, harness.chat);
		const scheduled = harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', harness.scratch, true, 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.deepStrictEqual({
			scheduled,
			directories: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
			continuations: harness.continuations.length,
		}, { scheduled: true, directories: [worktree.toString()], continuations: 1 });
	});

	test('workspace tool still attaches a quick chat when the requested folder matches its scratch directory', () => {
		const harness = createHarness();
		startTurn(harness.stateManager, harness.chat);
		assert.deepStrictEqual({
			scheduled: harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', harness.scratch, false, 'client-1'),
			pending: harness.service.isPending(harness.chat.toString()),
		}, { scheduled: true, pending: true });
	});

	test('workspace tool can leave an existing worktree and retains its ownership', async () => {
		const worktrees = new TestWorktreeIsolation(URI.file('/old-worktree'));
		const harness = createHarness(worktrees);
		makeFolderSession(harness);
		setSessionConfig(harness, { [SessionConfigKey.Isolation]: 'worktree' });
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async () => { };
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/destination'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.deepStrictEqual({
			retained: worktrees.retainedSessions, removed: worktrees.removedWorktrees,
			directory: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
		}, { retained: [harness.session.toString()], removed: [], directory: [URI.file('/destination').toString()] });
	});

	test('workspace tool revalidates existing chats and cancels without changing workspace', async () => {
		const harness = createHarness();
		makeFolderSession(harness);
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async () => assert.fail('Cancelled changes must not reach the provider');
		const destination = URI.file('/destination');
		startTurn(harness.stateManager, harness.chat);
		assert.throws(() => harness.service.requestSessionWorkspaceUpdate(harness.chat, 'wrong-turn', destination, false, 'client-1'), /active turn/);
		assert.throws(() => harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.parse('https://example.com/project'), false, 'client-1'), /existing folder/);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', destination, false, 'client-1');
		assert.throws(() => harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', destination, false, 'client-1'), /cannot be changed/);
		harness.service.cancel(harness.chat.toString(), 'turn-1');
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		harness.stateManager.dispatchServerAction(harness.session.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		assert.throws(() => harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', destination, false, 'client-1'), /cannot be changed/);
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			directory: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
			continuations: harness.continuations,
		}, { pending: false, directory: [harness.scratch.toString()], continuations: [] });
	});

	for (const failure of ['trust', 'provider', 'uncertain'] as const) {
		test(`workspace tool handles ${failure} failure when changing an existing folder`, async () => {
			const harness = createHarness(undefined, async () => failure !== 'trust');
			makeFolderSession(harness);
			const provider: IAgent = harness.agent;
			provider.setChatWorkingDirectory = async () => {
				throw failure === 'uncertain' ? new AgentWorkingDirectoryChangedError(URI.file('/destination'), 'uncertain') : new Error('provider rejected');
			};
			startTurn(harness.stateManager, harness.chat);
			harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/destination'), false, 'client-1');
			completeTurn(harness.stateManager, harness.chat);
			await updateSessionWorkspace(harness);
			assert.deepStrictEqual({
				directory: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
				blocked: harness.service.isPending(harness.chat.toString()),
				failedContinuations: harness.failedContinuations.length,
				failureReported: harness.continuations[0]?.message.text.includes('workspace setup did not complete successfully'),
			}, {
				directory: [harness.scratch.toString()], blocked: failure === 'uncertain',
				failedContinuations: failure === 'uncertain' ? 1 : 0, failureReported: failure === 'uncertain' ? undefined : true,
			});
		});
	}

	test('does not offer session isolation for quick chats or already isolated sessions', () => {
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
		assert.strictEqual(harness.service.canIsolateChat(harness.chat), false);
		makeFolderSession(harness);
		setSessionConfig(harness, { isolation: 'worktree' });
		assert.strictEqual(harness.service.canIsolateChat(harness.chat), false);
	});

	test('keeps the folder session unchanged when workspace trust is denied', async () => {
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation, async () => false);
		makeFolderSession(harness);
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.match(harness.continuations[0].message.text, /Workspace trust/);
		assert.deepStrictEqual({
			directories: harness.stateManager.getSessionState(harness.session.toString())?.workingDirectories,
			isolation: harness.stateManager.getSessionState(harness.session.toString())?.config?.values.isolation,
			created: isolation.createdWorktrees,
			pending: harness.service.isPending(harness.chat.toString()),
		}, {
			directories: [harness.scratch.toString()], isolation: 'folder', created: [], pending: false,
		});
	});

	test('cleans up a new worktree when folder conversion fails and allows retry', async () => {
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation);
		makeFolderSession(harness);
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async () => { throw new Error('provider mutation failed'); };
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.match(harness.continuations[0].message.text, /provider mutation failed/);
		assert.deepStrictEqual({
			removed: isolation.removedWorktrees.map(entry => entry.worktree.toString()),
			isolation: harness.stateManager.getSessionState(harness.session.toString())?.config?.values.isolation,
			pending: harness.service.isPending(harness.chat.toString()),
		}, { removed: ['file:///worktree'], isolation: 'folder', pending: false });
	});

	test('canceling single-chat isolation releases the workspace replacement guard without converting', async () => {
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation);
		makeFolderSession(harness);
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		assert.throws(() => harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1'), /workspace cannot be changed to a new worktree/);
		harness.service.cancel(harness.chat.toString(), 'turn-1');
		await updateSessionWorkspace(harness);
		assert.deepStrictEqual({
			pending: harness.service.isPending(buildChatUri(harness.session, 'peer')), created: isolation.createdWorktrees,
		}, { pending: false, created: [] });
	});

	test('multi-chat isolation remains gated when the provider does not support multiple directories', () => {
		const harness = createHarness(new TestWorktreeIsolation(URI.file('/worktree')));
		makeFolderSession(harness);
		harness.agent.getDescriptor = () => ({ provider: 'copilot', displayName: 'Copilot', description: '' });
		const peer = buildChatUri(harness.session, 'peer');
		harness.stateManager.addChat(harness.session.toString(), peer);
		startTurn(harness.stateManager, URI.parse(peer), 'peer-turn');
		startTurn(harness.stateManager, harness.chat);
		assert.deepStrictEqual([harness.service.canIsolateChat(harness.chat), harness.service.canIsolateChat(URI.parse(peer))], [false, false]);
		assert.throws(() => harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1'), /workspace cannot be changed to a new worktree/);
		assert.throws(() => harness.service.requestChatIsolation(URI.parse(peer), 'peer-turn', 'client-1'), /workspace cannot be changed to a new worktree/);
	});

	test('an uncertain single-chat conversion quarantines the caller and retains the worktree', async () => {
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation);
		makeFolderSession(harness);
		const provider: IAgent = harness.agent;
		provider.setChatWorkingDirectory = async () => {
			throw new AgentWorkingDirectoryChangedError(URI.file('/worktree'), 'Provider update was not confirmed');
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		await updateSessionWorkspace(harness);
		assert.deepStrictEqual({
			quarantined: await harness.database.getMetadata('agentHost.chatIsolationQuarantined'),
			mainBlocked: harness.service.isPending(harness.chat.toString()),
			peerBlocked: harness.service.isPending(buildChatUri(harness.session, 'peer')),
			removed: isolation.removedWorktrees,
			continued: harness.continuations,
			failed: harness.failedContinuations.length,
		}, { quarantined: 'true', mainBlocked: true, peerBlocked: false, removed: [], continued: [], failed: 1 });
	});

	test('aborts single-chat isolation if an in-flight chat creation changes the catalog during trust', async () => {
		const trust = new DeferredPromise<boolean>();
		const isolation = new TestWorktreeIsolation(URI.file('/worktree'));
		const harness = createHarness(isolation, () => trust.p);
		makeFolderSession(harness);
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestChatIsolation(harness.chat, 'turn-1', 'client-1');
		completeTurn(harness.stateManager, harness.chat);
		const conversion = updateSessionWorkspace(harness);
		const newChat = buildChatUri(harness.session, 'new-peer');
		harness.stateManager.addChat(harness.session.toString(), newChat);
		trust.complete(true);
		await conversion;
		assert.match(harness.continuations[0].message.text, /chat changed/);
		assert.deepStrictEqual({
			created: isolation.createdWorktrees,
			sessionDirectories: harness.stateManager.getSessionSummary(harness.session.toString())?.workingDirectories,
			newPeerDirectories: harness.configurationService.getEffectiveWorkingDirectories(newChat),
			pending: harness.service.isPending(harness.chat.toString()),
		}, { created: [], sessionDirectories: [harness.scratch.toString()], newPeerDirectories: [harness.scratch.toString()], pending: false });
	});

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
		completePriorTurn(harness.stateManager, harness.chat);
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
				requestHidden: isMessageRequestHiddenFromTranscript(entry.message),
				workspaceContinuation: isAgentWorkspaceContinuationMessage(entry.message),
				hostNotice: isHostNoticeTurn({ message: entry.message }),
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
				requestHidden: true,
				workspaceContinuation: true,
				hostNotice: false,
				label: 'Continue in Requested Workspace',
				origin: MessageKind.SystemNotification,
				text: '<!-- vscode-request-hidden-from-transcript -->\nContinue in the requested workspace.',
				turnId: 'continuation-1',
			}],
			continuations: [],
		});
		trustDecision.complete(true);
		await Promise.resolve();
		providerMutation.complete();
		await conversion;
		assert.deepStrictEqual(harness.gitRefreshes, []);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		const activeTurn = harness.stateManager.getChatState(harness.chat.toString())?.activeTurn;
		assert.deepStrictEqual({
			providerCalls,
			trustRequests: harness.trustRequests,
			pending: harness.service.isPending(harness.chat.toString()),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			hasWorkspaceTransitions: readSessionHasWorkspaceTransitions(state?._meta),
			persistedWorkspaceless: await harness.database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			persistedHasWorkspaceTransitions: await harness.database.getMetadata(AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY),
			refreshedServerTools: harness.refreshedServerTools,
			stateWhenCustomizationsRefreshed,
			customizations: state?.customizations,
			activity: harness.stateManager.getChatState(harness.chat.toString())?.activity,
			activeTurnId: harness.stateManager.getActiveTurnId(harness.chat.toString()),
			outcomeNotifications: activeTurn?.responseParts.flatMap(part => part.kind === ResponsePartKind.SystemNotification ? [{
				content: part.content,
				meta: readAgentSystemNotificationMeta(part),
			}] : []),
			outcomeKindsAtContinuation: harness.outcomeKindsAtContinuation,
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
			hasWorkspaceTransitions: true,
			persistedWorkspaceless: 'false',
			persistedHasWorkspaceTransitions: 'true',
			refreshedServerTools: [harness.session.toString()],
			stateWhenCustomizationsRefreshed: {
				workingDirectories: ['file:///workspace/project'],
				workspaceless: false,
			},
			customizations: [customization],
			activity: undefined,
			activeTurnId: 'continuation-1',
			outcomeNotifications: [{
				content: 'Workspace changed to project',
				meta: {
					kind: AgentSystemNotificationKind.WorkspaceTransition,
					severity: undefined,
					workspaceKind: AgentSystemNotificationWorkspaceKind.Folder,
					workspaceName: 'project',
					fusionStatus: undefined,
				},
			}],
			outcomeKindsAtContinuation: [[AgentSystemNotificationKind.WorkspaceTransition]],
			continuations: [{
				chat: harness.chat.toString(),
				hidden: false,
				label: 'Workspace Set',
				origin: MessageKind.SystemNotification,
				text: `The current session is now attached to ${workspaceFolder.fsPath}. Continue the user's original task in this workspace. Do not request another session or workspace conversion.`,
			}],
		});
	});

	test('does not show or persist a workspace transition during the first turn', async () => {
		const harness = createHarness();
		harness.agent.setWorkingDirectory = async () => { };
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		const activeTurn = harness.stateManager.getChatState(harness.chat.toString())?.activeTurn;
		assert.deepStrictEqual({
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			hasWorkspaceTransitions: readSessionHasWorkspaceTransitions(state?._meta),
			persistedWorkspaceless: await harness.database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			persistedHasWorkspaceTransitions: await harness.database.getMetadata(AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY),
			persistedTransitions: [...(await harness.database.getTurnWorkspaceTransitions()).entries()],
			outcomeNotifications: activeTurn?.responseParts.filter(part => part.kind === ResponsePartKind.SystemNotification),
			outcomeKindsAtContinuation: harness.outcomeKindsAtContinuation,
			continuations: harness.continuations.length,
		}, {
			workingDirectories: ['file:///workspace/project'],
			workspaceless: false,
			hasWorkspaceTransitions: false,
			persistedWorkspaceless: 'false',
			persistedHasWorkspaceTransitions: undefined,
			persistedTransitions: [],
			outcomeNotifications: [],
			outcomeKindsAtContinuation: [[]],
			continuations: 1,
		});
	});

	test('does not hydrate workspace transitions when none were loaded', () => {
		const session = URI.parse('copilot:/normal-session');
		const contribution = disposables.add(new SessionWorkspaceConversionContribution(
			new class extends mock<IAgentHostChatContributionContext>() { }(),
			new class extends mock<ISessionWorkspaceConversionService>() { }(),
		));
		const turns: Turn[] = [{
			id: 'turn-1',
			message: { text: 'Implement the feature', origin: { kind: MessageKind.User } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'response-1', content: 'Done' }],
			usage: undefined,
			state: TurnState.Complete,
		}];

		const hydrated = contribution.onHydrateTurns({
			session: session.toString(),
			chat: buildDefaultChatUri(session),
		}, turns);

		assert.strictEqual(hydrated, turns);
	});

	test('restores one durable transition before provider output after service restart', async () => {
		const temporaryDirectory = await fs.promises.mkdtemp(join(tmpdir(), `workspace-transition-${generateUuid()}-`));
		const databasePath = join(temporaryDirectory, 'session.db');
		let conversionDatabase: SessionDatabase | undefined;
		let restoredDatabase: SessionDatabase | undefined;
		try {
			conversionDatabase = await SessionDatabase.open(databasePath);
			const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, conversionDatabase);
			const workspaceFolder = URI.file('/workspace/project');
			harness.agent.setWorkingDirectory = async () => { };
			completePriorTurn(harness.stateManager, harness.chat);
			startTurn(harness.stateManager, harness.chat);
			await harness.database.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
			harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, false, 'client-1');
			completeTurn(harness.stateManager, harness.chat);

			await updateSessionWorkspace(harness);
			await harness.database.setTurnEventId('continuation-1', 'provider-continuation');
			harness.service.dispose();
			harness.stateManager.dispose();
			await conversionDatabase.close();
			conversionDatabase = undefined;

			restoredDatabase = await SessionDatabase.open(databasePath);
			const restoredContribution = disposables.add(new SessionWorkspaceConversionContribution(
				new class extends mock<IAgentHostChatContributionContext>() { }(),
				new class extends mock<ISessionWorkspaceConversionService>() { }(),
			));
			const providerTurns: Turn[] = [{
				id: 'provider-continuation',
				message: {
					text: 'Continue the original task in the converted workspace.',
					origin: { kind: MessageKind.SystemNotification },
				},
				responseParts: [{
					kind: ResponsePartKind.Markdown,
					id: 'provider-response',
					content: 'Provider continued work',
				}],
				usage: undefined,
				state: TurnState.Complete,
			}];
			const workspaceTransitions = await restoredDatabase.getTurnWorkspaceTransitions();
			const restoredOnce = await restoredContribution.onHydrateTurns({
				session: harness.session.toString(),
				chat: harness.chat.toString(),
				workspaceTransitions,
			}, providerTurns);
			const restoredTwice = await restoredContribution.onHydrateTurns({
				session: harness.session.toString(),
				chat: harness.chat.toString(),
				workspaceTransitions,
			}, restoredOnce);
			const restoredTurn = restoredTwice[0];

			assert.deepStrictEqual({
				requestHidden: isMessageRequestHiddenFromTranscript(restoredTurn.message),
				workspaceContinuation: isAgentWorkspaceContinuationMessage(restoredTurn.message),
				responseParts: restoredTurn.responseParts.map(part => part.kind === ResponsePartKind.SystemNotification ? {
					kind: part.kind,
					content: part.content,
					meta: readAgentSystemNotificationMeta(part),
				} : {
					kind: part.kind,
					content: part.kind === ResponsePartKind.Markdown ? part.content : undefined,
				}),
				persistedTransitions: [...workspaceTransitions.keys()],
			}, {
				requestHidden: true,
				workspaceContinuation: true,
				responseParts: [{
					kind: ResponsePartKind.SystemNotification,
					content: 'Workspace changed to project',
					meta: {
						kind: AgentSystemNotificationKind.WorkspaceTransition,
						severity: undefined,
						workspaceKind: AgentSystemNotificationWorkspaceKind.Folder,
						workspaceName: 'project',
						fusionStatus: undefined,
					},
				}, {
					kind: ResponsePartKind.Markdown,
					content: 'Provider continued work',
				}],
				persistedTransitions: ['continuation-1', 'provider-continuation'],
			});
		} finally {
			await Promise.all([conversionDatabase?.close(), restoredDatabase?.close()]);
			await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
		}
	});

	test('restores every persisted workspace conversion at its own turn boundary', async () => {
		const database = new TestSessionDatabase();
		await database.setTurnWorkspaceTransition('turn-1', serializeAgentWorkspaceTransition({
			content: 'Now working in first',
			workspaceKind: AgentSystemNotificationWorkspaceKind.Folder,
			workspaceName: 'first',
		}));
		await database.setTurnWorkspaceTransition('turn-2', serializeAgentWorkspaceTransition({
			content: 'Now working in second',
			workspaceKind: AgentSystemNotificationWorkspaceKind.Worktree,
			workspaceName: 'second',
		}));
		const contribution = disposables.add(new SessionWorkspaceConversionContribution(
			new class extends mock<IAgentHostChatContributionContext>() { }(),
			new class extends mock<ISessionWorkspaceConversionService>() { }(),
		));
		const turns = ['turn-1', 'turn-2'].map((id): Turn => ({
			id,
			message: { text: 'Continue work', origin: { kind: MessageKind.SystemNotification } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: `${id}-response`, content: `${id} output` }],
			usage: undefined,
			state: TurnState.Complete,
		}));

		const restored = await contribution.onHydrateTurns({
			session: 'copilot:/workspace-less',
			chat: buildDefaultChatUri('copilot:/workspace-less'),
			workspaceTransitions: await database.getTurnWorkspaceTransitions(),
		}, turns);

		assert.deepStrictEqual({
			responseParts: restored.map(turn => turn.responseParts.map(part =>
				part.kind === ResponsePartKind.SystemNotification ? part.content : part.kind
			)),
			transitionQueryCalls: database.getTurnWorkspaceTransitionsCalls,
		}, {
			responseParts: [
				['Now working in first', ResponsePartKind.Markdown],
				['Now working in second', ResponsePartKind.Markdown],
			],
			transitionQueryCalls: 1,
		});
	});

	test('hydrates a persisted workspace transition for a non-default chat', async () => {
		const session = URI.parse('copilot:/workspace-less');
		const database = new TestSessionDatabase();
		await database.setTurnWorkspaceTransition('turn-1', serializeAgentWorkspaceTransition({
			content: 'Now working in project',
			workspaceKind: AgentSystemNotificationWorkspaceKind.Folder,
			workspaceName: 'project',
		}));
		const contribution = disposables.add(new SessionWorkspaceConversionContribution(
			new class extends mock<IAgentHostChatContributionContext>() { }(),
			new class extends mock<ISessionWorkspaceConversionService>() { }(),
		));
		const turns: Turn[] = [{
			id: 'turn-1',
			message: { text: 'Continue work', origin: { kind: MessageKind.SystemNotification } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'response-1', content: 'Provider output' }],
			usage: undefined,
			state: TurnState.Complete,
		}];

		const restored = await contribution.onHydrateTurns({
			session: session.toString(),
			chat: buildChatUri(session, 'peer-chat'),
			workspaceTransitions: await database.getTurnWorkspaceTransitions(),
		}, turns);

		assert.deepStrictEqual(restored[0].responseParts.map(part =>
			part.kind === ResponsePartKind.SystemNotification ? part.content : part.kind
		), [
			'Now working in project',
			ResponsePartKind.Markdown,
		]);
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
		completePriorTurn(harness.stateManager, harness.chat);
		startTurn(harness.stateManager, harness.chat);
		await harness.database.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, true, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);
		await timeout(120);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		const summary = harness.stateManager.getSessionSummary(harness.session.toString());
		const activeTurn = harness.stateManager.getChatState(harness.chat.toString())?.activeTurn;
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
			outcomeNotifications: activeTurn?.responseParts.flatMap(part => part.kind === ResponsePartKind.SystemNotification ? [{
				content: part.content,
				meta: readAgentSystemNotificationMeta(part),
			}] : []),
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
			sessionStateProject: {
				uri: workspaceFolder.toString(),
				displayName: 'project',
			},
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
			outcomeNotifications: [{
				content: 'Workspace changed to project in a new worktree',
				meta: {
					kind: AgentSystemNotificationKind.WorkspaceTransition,
					severity: undefined,
					workspaceKind: AgentSystemNotificationWorkspaceKind.Worktree,
					workspaceName: 'project',
					fusionStatus: undefined,
				},
			}],
			continuationText: `The current session is now attached to ${worktreeIsolation.worktree.fsPath} in a worktree. Continue the user's original task in this workspace. Do not request another session or workspace conversion.`,
		});
	});

	test('sets the project when the selected workspace is an existing worktree', async () => {
		const repository = URI.file('/workspace/project');
		const worktree = URI.file('/workspace/project.worktrees/existing-feature');
		const worktreeIsolation = new TestWorktreeIsolation(worktree, repository);
		const harness = createHarness(worktreeIsolation);
		harness.agent.setWorkingDirectory = async () => { };
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', worktree, false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			externalProjectRequests: worktreeIsolation.externalProjectRequests.map(uri => uri.toString()),
			createdWorktrees: worktreeIsolation.createdWorktrees,
			project: harness.stateManager.getSessionSummary(harness.session.toString())?.project,
			workingDirectories: state?.workingDirectories,
		}, {
			externalProjectRequests: [worktree.toString()],
			createdWorktrees: [],
			project: {
				uri: repository.toString(),
				displayName: 'project',
			},
			workingDirectories: [worktree.toString()],
		});
	});

	for (const isolation of [false, true]) {
		test(`quick-chat attachment preserves live and persisted settings with isolation=${isolation}`, async () => {
			const harness = createHarness(new TestWorktreeIsolation(URI.file('/workspace/project.worktrees/task')));
			harness.agent.setWorkingDirectory = async () => { };
			const values = {
				[SessionConfigKey.AutoApprove]: 'assisted',
				[SessionConfigKey.Mode]: 'autopilot',
				[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
			};
			setSessionConfig(harness, values);
			startTurn(harness.stateManager, harness.chat);
			harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), isolation, 'client');
			completeTurn(harness.stateManager, harness.chat);
			await updateSessionWorkspace(harness);
			const expected = { ...values, isolation: isolation ? 'worktree' : 'folder', ...(isolation ? { branch: 'main' } : {}) };
			assert.deepStrictEqual({
				live: harness.stateManager.getSessionState(harness.session.toString())?.config?.values,
				persisted: JSON.parse((await harness.database.getMetadata('configValues'))!),
				continuations: harness.continuations.length,
			}, { live: expected, persisted: expected, continuations: 1 });
		});
	}

	test('does not request workspace trust in Allow All mode', async () => {
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => false);
		const workspaceFolder = URI.file('/workspace/project');
		harness.agent.setWorkingDirectory = async () => { };
		setSessionConfig(harness, { [SessionConfigKey.AutoApprove]: 'autoApprove' });
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		assert.deepStrictEqual({
			trustRequests: harness.trustRequests,
			workingDirectories: harness.stateManager.getSessionState(harness.session.toString())?.workingDirectories,
		}, {
			trustRequests: [],
			workingDirectories: [workspaceFolder.toString()],
		});
	});

	test('does not request workspace, repository, or worktree trust when global auto-approve is enabled', async () => {
		const workspaceFolder = URI.file('/workspace/project/packages/app');
		const repository = URI.file('/workspace/project');
		const worktreeIsolation = new TestWorktreeIsolation(URI.file('/workspace/project.worktrees/implement-feature'), repository);
		const harness = createHarness(worktreeIsolation, async () => false);
		harness.agent.setWorkingDirectory = async () => { };
		harness.configurationService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, true, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		assert.deepStrictEqual({
			trustRequests: harness.trustRequests,
			createdWorktrees: worktreeIsolation.createdWorktrees,
			workingDirectories: harness.stateManager.getSessionState(harness.session.toString())?.workingDirectories,
		}, {
			trustRequests: [],
			createdWorktrees: [worktreeIsolation.worktree],
			workingDirectories: [worktreeIsolation.worktree.toString()],
		});
	});

	test('still requests workspace trust outside Allow All mode', async () => {
		const trustRequests: ReturnType<typeof createHarness>['trustRequests'][] = [];
		for (const values of [
			{ [SessionConfigKey.AutoApprove]: 'default' },
			{ [SessionConfigKey.AutoApprove]: 'assisted' },
			{ [SessionConfigKey.AutoApprove]: 'default', [SessionConfigKey.Mode]: 'autopilot' },
		]) {
			const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => false);
			setSessionConfig(harness, values);
			startTurn(harness.stateManager, harness.chat);
			harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
			completeTurn(harness.stateManager, harness.chat);

			await updateSessionWorkspace(harness);
			trustRequests.push(harness.trustRequests);
		}

		assert.deepStrictEqual(trustRequests, [
			[{ clientId: 'client-1', workspace: 'file:///workspace/project' }],
			[{ clientId: 'client-1', workspace: 'file:///workspace/project' }],
			[{ clientId: 'client-1', workspace: 'file:///workspace/project' }],
		]);
	});

	test('keeps the session workspace-less when workspace trust is declined', async () => {
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => false);
		const workspaceFolder = URI.file('/workspace/project');
		const providerCalls: string[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async (_chat, _context, workingDirectory) => {
			providerCalls.push(workingDirectory.toString());
		};
		startTurn(harness.stateManager, harness.chat);
		await harness.database.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'true');
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', workspaceFolder, false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			trustRequests: harness.trustRequests,
			providerCalls,
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			persistedWorkspaceless: await harness.database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			persistedTransitions: [...(await harness.database.getTurnWorkspaceTransitions()).values()],
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
			persistedTransitions: [],
			continuation: [{
				label: 'Workspace Setup Failed',
				text: `The requested workspace setup did not complete successfully: Workspace trust was not granted for '${workspaceFolder.fsPath}'. Do not run the user's task. Tell the user that workspace setup failed and include this error.`,
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
			continuationRequestHidden: harness.continuations[0] ? isMessageRequestHiddenFromTranscript(harness.continuations[0].message) : undefined,
			continuationLabel: harness.continuations[0] ? readMessageSystemInitiatedLabel(harness.continuations[0].message) : undefined,
			continuationOrigin: harness.continuations[0]?.message.origin.kind,
			continuationText: harness.continuations[0]?.message.text,
			deferredRequestHidden: activeTurn ? isMessageRequestHiddenFromTranscript(activeTurn.message) : undefined,
			deferredRequestIsWorkspaceContinuation: activeTurn ? isAgentWorkspaceContinuationMessage(activeTurn.message) : undefined,
			resumedTurnIsHostNotice: activeTurn ? isHostNoticeTurn(activeTurn) : undefined,
			outcomeNotifications: activeTurn?.responseParts.flatMap(part => part.kind === ResponsePartKind.SystemNotification ? [{
				content: part.content,
				kind: readAgentSystemNotificationMeta(part).kind,
			}] : []),
		}, {
			pending: false,
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			continuationHidden: false,
			continuationRequestHidden: false,
			continuationLabel: 'Workspace Setup Failed',
			continuationOrigin: MessageKind.SystemNotification,
			continuationText: 'The requested workspace setup did not complete successfully: provider failed. Do not run the user\'s task. Tell the user that workspace setup failed and include this error.',
			deferredRequestHidden: true,
			deferredRequestIsWorkspaceContinuation: true,
			resumedTurnIsHostNotice: false,
			outcomeNotifications: [{
				content: 'Workspace Setup Failed',
				kind: undefined,
			}],
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
			failedContinuations: harness.failedContinuations,
		}, {
			workingDirectories: ['file:///workspace/authoritative'],
			workspaceless: false,
			persistedWorkspaceless: 'false',
			continuationText: `The requested workspace setup did not complete successfully: The workspace changed to '${authoritative.fsPath}', but conversion did not complete cleanly: SDK returned a different directory. Do not run the user's task. Tell the user that workspace setup failed and include this error.`,
			failedContinuations: [],
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
					message: `The provider changed to an untrusted working directory and was disposed: Workspace trust was not granted for '${authoritative.fsPath}'`,
				},
				turnId: 'continuation-1',
			}],
			activity: undefined,
			activeTurnId: undefined,
			outcomeNotifications: ['Workspace Setup Failed'],
		});
	});

	test('does not continue a setup turn that the user cancelled during conversion', async () => {
		const database = new GatedConversionDatabase();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, database);
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		completePriorTurn(harness.stateManager, harness.chat);
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		const conversion = updateSessionWorkspace(harness);
		await database.writeStarted.p;
		harness.stateManager.dispatchServerAction(harness.chat.toString(), {
			type: ActionType.ChatTurnCancelled,
			turnId: 'continuation-1',
			duration: 1,
		});
		database.releaseWrite.complete();
		await conversion;

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			hasWorkspaceTransitions: readSessionHasWorkspaceTransitions(state?._meta),
			persistedTransitions: [...(await harness.database.getTurnWorkspaceTransitions()).entries()],
			persistedHasWorkspaceTransitions: await harness.database.getMetadata(AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY),
			continuations: harness.continuations,
			failedContinuations: harness.failedContinuations,
			activity: harness.stateManager.getChatState(harness.chat.toString())?.activity,
			activeTurnId: harness.stateManager.getActiveTurnId(harness.chat.toString()),
		}, {
			workingDirectories: ['file:///workspace/project'],
			workspaceless: false,
			hasWorkspaceTransitions: false,
			persistedTransitions: [],
			persistedHasWorkspaceTransitions: undefined,
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
			override async setWorkspaceConversion(): Promise<void> {
				throw new Error('transition write failed');
			}
		}
		const database = new FailingConversionDatabase();
		const harness = createHarness(new NullAgentHostWorktreeIsolation(), async () => true, database);
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		completePriorTurn(harness.stateManager, harness.chat);
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', URI.file('/workspace/project'), false, 'client-1');
		completeTurn(harness.stateManager, harness.chat);

		await updateSessionWorkspace(harness);

		const state = harness.stateManager.getSessionState(harness.session.toString());
		assert.deepStrictEqual({
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			persistedWorkspaceless: await database.getMetadata(AH_META_WORKSPACELESS_DB_KEY),
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			persistedTransitions: [...(await database.getTurnWorkspaceTransitions()).entries()],
			persistedHasWorkspaceTransitions: await database.getMetadata(AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY),
			continuations: harness.continuations,
		}, {
			pending: true,
			persistedQuarantine: 'true',
			persistedWorkspaceless: undefined,
			workingDirectories: [harness.scratch.toString()],
			workspaceless: true,
			persistedTransitions: [],
			persistedHasWorkspaceTransitions: undefined,
			continuations: [],
		});
	});

	test('keeps the session quarantined in memory when durable quarantine persistence fails', async () => {
		class FailingQuarantineDatabase extends TestSessionDatabase {
			override async setWorkspaceConversion(): Promise<void> {
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
		completePriorTurn(harness.stateManager, harness.chat);
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
		const repository = URI.file('/workspace/project');
		const worktree = URI.file('/workspace/project.worktrees/existing-feature');
		const worktreeIsolation = new TestWorktreeIsolation(worktree, repository);
		const harness = createHarness(worktreeIsolation, async () => true, database);
		const disposedChats: { session: string; chat: string }[] = [];
		const provider: IAgent = harness.agent;
		provider.setWorkingDirectory = async () => { };
		harness.agent.disposeChat = async (session, chat) => {
			disposedChats.push({ session: session.toString(), chat: chat.toString() });
		};
		startTurn(harness.stateManager, harness.chat);
		harness.service.requestSessionWorkspaceUpdate(harness.chat, 'turn-1', worktree, false, 'client-1');
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
			conversionMetadata: database.conversionMetadata,
			pending: harness.service.isPending(harness.chat.toString()),
			persistedQuarantine: await database.getMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY),
			project: harness.stateManager.getSessionSummary(harness.session.toString())?.project,
			workingDirectories: state?.workingDirectories,
			workspaceless: readSessionWorkspaceless(state?._meta),
			disposedChats,
			continuations: harness.continuations,
		}, {
			conversionMetadata: [{
				[AH_META_WORKSPACELESS_DB_KEY]: 'false',
				[WORKTREE_META_REPOSITORY_ROOT]: repository.toString(),
				[META_DIFF_BASE_BRANCH]: 'main',
			}],
			pending: true,
			persistedQuarantine: 'true',
			project: undefined,
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
			deferredContinuations: harness.deferredContinuations,
		}, {
			pending: false,
			continuations: [],
			deferredContinuations: [],
		});
	});
});
