/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IAgentAttachment, AgentProvider, AgentSession } from '../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionClientState } from '../../../../platform/agentHost/common/state/sessionClientState.js';
import { ToolCallStatus, TurnState, type IMessageAttachment } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISessionsManagementService } from '../../../contrib/sessions/browser/sessionsManagementService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IChatProgress, IChatToolInvocation, ToolConfirmKind } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getAgentHostIcon } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { turnsToHistory, toolCallStateToInvocation, permissionToConfirmation, finalizeToolInvocation } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';

// =============================================================================
// RemoteAgentHostChatSession - chat session backed by a remote agent host
// =============================================================================

class RemoteAgentHostChatSession extends Disposable implements IChatSession {
	readonly progressObs = observableValue<IChatProgress[]>('remoteAgentHostProgress', []);
	readonly isCompleteObs = observableValue<boolean>('remoteAgentHostComplete', true);

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	readonly requestHandler: IChatSession['requestHandler'];
	readonly interruptActiveResponseCallback: IChatSession['interruptActiveResponseCallback'];

	constructor(
		readonly sessionResource: URI,
		readonly history: readonly IChatSessionHistoryItem[],
		private readonly _sendRequest: (request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, token: CancellationToken) => Promise<void>,
		onDispose: () => void,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(toDisposable(() => this._onWillDispose.fire()));
		this._register(toDisposable(onDispose));

		this.requestHandler = async (request, progress, _history, cancellationToken) => {
			this._logService.info('[RemoteAgentHost] requestHandler called');
			this.isCompleteObs.set(false, undefined);
			await this._sendRequest(request, progress, cancellationToken);
			this.isCompleteObs.set(true, undefined);
		};

		this.interruptActiveResponseCallback = history.length > 0 ? undefined : async () => {
			return true;
		};
	}
}

// =============================================================================
// RemoteAgentHostSessionHandler - bridges remote protocol state with chat UI
// =============================================================================

export interface IRemoteAgentHostSessionHandlerConfig {
	readonly provider: AgentProvider;
	readonly agentId: string;
	readonly sessionType: string;
	readonly fullName: string;
	readonly description: string;
	readonly address: string;
}

export class RemoteAgentHostSessionHandler extends Disposable implements IChatSessionContentProvider {

	private readonly _activeSessions = new Map<string, RemoteAgentHostChatSession>();
	private readonly _sessionToBackend = new Map<string, URI>();
	private readonly _config: IRemoteAgentHostSessionHandlerConfig;
	private readonly _clientState: SessionClientState;

	constructor(
		config: IRemoteAgentHostSessionHandlerConfig,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._config = config;

		const clientId = this._remoteAgentHostService.getClientId(config.address);
		if (!clientId) {
			throw new Error(`No connection to remote agent host at ${config.address}`);
		}
		this._clientState = this._register(new SessionClientState(clientId));

		// Forward session actions from this remote to client state
		this._register(this._remoteAgentHostService.onDidAction(envelope => {
			if (envelope.remoteAddress !== this._config.address) {
				return;
			}
			if (isSessionAction(envelope.action)) {
				this._clientState.receiveEnvelope(envelope);
			}
		}));

		this._registerAgent();
	}

	async provideChatSessionContent(sessionResource: URI, _token: CancellationToken): Promise<IChatSession> {
		this._logService.info(`[RemoteAgentHost] provideChatSessionContent called: ${sessionResource.toString()}`);
		const resourceKey = sessionResource.path.substring(1);
		const isUntitled = resourceKey.startsWith('untitled-');

		let resolvedSession: URI | undefined;
		const history: IChatSessionHistoryItem[] = [];
		if (!isUntitled) {
			resolvedSession = this._resolveSessionUri(sessionResource);
			this._sessionToBackend.set(resourceKey, resolvedSession);
			try {
				this._logService.info(`[RemoteAgentHost] Subscribing to session: ${resolvedSession.toString()}`);
				const snapshot = await this._remoteAgentHostService.subscribe(this._config.address, resolvedSession);
				this._logService.info(`[RemoteAgentHost] Subscribe returned, state=${snapshot?.state ? 'present' : 'null'}`);
				if (snapshot?.state) {
					this._clientState.handleSnapshot(resolvedSession, snapshot.state, snapshot.fromSeq);
					const sessionState = this._clientState.getSessionState(resolvedSession);
					if (sessionState) {
						history.push(...turnsToHistory(sessionState.turns, this._config.agentId));
					}
				}
			} catch (err) {
				this._logService.warn(`[RemoteAgentHost] Failed to subscribe to existing session: ${resolvedSession.toString()}`, err);
			}
		}

		const session = this._instantiationService.createInstance(
			RemoteAgentHostChatSession,
			sessionResource,
			history,
			async (request: IChatAgentRequest, progress: (parts: IChatProgress[]) => void, token: CancellationToken) => {
				const backendSession = resolvedSession ?? await this._createAndSubscribe(sessionResource, request.userSelectedModelId);
				resolvedSession = backendSession;
				this._sessionToBackend.set(resourceKey, backendSession);
				return this._handleTurn(backendSession, request, progress, token);
			},
			() => {
				this._activeSessions.delete(resourceKey);
				this._sessionToBackend.delete(resourceKey);
				if (resolvedSession) {
					this._clientState.unsubscribe(resolvedSession);
					this._remoteAgentHostService.unsubscribe(this._config.address, resolvedSession);
					this._remoteAgentHostService.disposeSession(this._config.address, resolvedSession);
				}
			},
		);
		this._activeSessions.set(resourceKey, session);
		this._logService.info(`[RemoteAgentHost] provideChatSessionContent returning session with ${history.length} history items`);
		return session;
	}

	private _registerAgent(): void {
		const agentData: IChatAgentData = {
			id: this._config.agentId,
			name: this._config.agentId,
			fullName: this._config.fullName,
			description: this._config.description,
			extensionId: new ExtensionIdentifier('vscode.remote-agent-host'),
			extensionVersion: undefined,
			extensionPublisherId: 'vscode',
			extensionDisplayName: 'Remote Agent Host',
			isDefault: false,
			isDynamic: true,
			isCore: true,
			metadata: { themeIcon: getAgentHostIcon(this._productService) },
			slashCommands: [],
			locations: [ChatAgentLocation.Chat],
			modes: [ChatModeKind.Agent],
			disambiguation: [],
		};

		const agentImpl: IChatAgentImplementation = {
			invoke: async (request, progress, _history, cancellationToken) => {
				return this._invokeAgent(request, progress, cancellationToken);
			},
		};

		this._register(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));
	}

	private async _invokeAgent(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		cancellationToken: CancellationToken,
	): Promise<IChatAgentResult> {
		const resourceKey = request.sessionResource.path.substring(1);
		let resolvedSession = this._sessionToBackend.get(resourceKey);
		if (!resolvedSession) {
			resolvedSession = await this._createAndSubscribe(request.sessionResource, request.userSelectedModelId);
			this._sessionToBackend.set(resourceKey, resolvedSession);
		}

		await this._handleTurn(resolvedSession, request, progress, cancellationToken);

		const activeSession = this._activeSessions.get(resourceKey);
		if (activeSession) {
			activeSession.isCompleteObs.set(true, undefined);
		}

		return {};
	}

	private async _handleTurn(
		session: URI,
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		cancellationToken: CancellationToken,
	): Promise<void> {
		if (cancellationToken.isCancellationRequested) {
			return;
		}

		const turnId = generateUuid();
		const attachments = this._convertVariablesToAttachments(request);
		const messageAttachments: IMessageAttachment[] = attachments.map(a => ({
			type: a.type,
			path: a.path,
			displayName: a.displayName,
		}));

		const turnAction = {
			type: 'session/turnStarted' as const,
			session,
			turnId,
			userMessage: {
				text: request.message,
				attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
			},
		};
		const clientSeq = this._clientState.applyOptimistic(turnAction);
		this._remoteAgentHostService.dispatchAction(this._config.address, turnAction, this._clientState.clientId, clientSeq);

		const activeToolInvocations = new Map<string, ChatToolInvocation>();
		const activePermissions = new Map<string, ChatToolInvocation>();

		let lastStreamedTextLen = 0;
		let lastReasoningLen = 0;

		const turnDisposables = new DisposableStore();

		let resolveDone: () => void;
		const done = new Promise<void>(resolve => { resolveDone = resolve; });

		let finished = false;
		const finish = () => {
			if (finished) {
				return;
			}
			finished = true;
			for (const [, invocation] of activeToolInvocations) {
				invocation.didExecuteTool(undefined);
			}
			activeToolInvocations.clear();
			turnDisposables.dispose();
			resolveDone();
		};

		turnDisposables.add(this._clientState.onDidChangeSessionState(e => {
			if (e.session.toString() !== session.toString() || cancellationToken.isCancellationRequested) {
				return;
			}

			const activeTurn = e.state.activeTurn;

			if (!activeTurn || activeTurn.id !== turnId) {
				const lastTurn = e.state.turns[e.state.turns.length - 1];
				if (lastTurn?.id === turnId && lastTurn.state === TurnState.Error && lastTurn.error) {
					progress([{ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`) }]);
				}
				if (!finished) {
					finish();
				}
				return;
			}

			if (activeTurn.streamingText.length > lastStreamedTextLen) {
				const delta = activeTurn.streamingText.substring(lastStreamedTextLen);
				lastStreamedTextLen = activeTurn.streamingText.length;
				progress([{ kind: 'markdownContent', content: new MarkdownString(delta) }]);
			}

			if (activeTurn.reasoning.length > lastReasoningLen) {
				const delta = activeTurn.reasoning.substring(lastReasoningLen);
				lastReasoningLen = activeTurn.reasoning.length;
				progress([{ kind: 'thinking', value: delta }]);
			}

			for (const [toolCallId, tc] of activeTurn.toolCalls) {
				const existing = activeToolInvocations.get(toolCallId);
				if (!existing) {
					if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.PendingPermission) {
						const invocation = toolCallStateToInvocation(tc);
						activeToolInvocations.set(toolCallId, invocation);
						progress([invocation]);
					}
				} else if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Failed) {
					activeToolInvocations.delete(toolCallId);
					finalizeToolInvocation(existing, tc);
				}
			}

			for (const [requestId, perm] of activeTurn.pendingPermissions) {
				if (activePermissions.has(requestId)) {
					continue;
				}
				const confirmInvocation = permissionToConfirmation(perm);
				activePermissions.set(requestId, confirmInvocation);
				progress([confirmInvocation]);

				IChatToolInvocation.awaitConfirmation(confirmInvocation, cancellationToken).then(reason => {
					const approved = reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;
					const resolveAction = {
						type: 'session/permissionResolved' as const,
						session,
						turnId,
						requestId,
						approved,
					};
					const seq = this._clientState.applyOptimistic(resolveAction);
					this._remoteAgentHostService.dispatchAction(this._config.address, resolveAction, this._clientState.clientId, seq);
					if (approved) {
						confirmInvocation.didExecuteTool(undefined);
					} else {
						confirmInvocation.didExecuteTool({ content: [], toolResultError: 'User denied' });
					}
				}).catch(err => {
					this._logService.warn(`[RemoteAgentHost] Permission confirmation failed for requestId=${requestId}`, err);
				});
			}
		}));

		turnDisposables.add(cancellationToken.onCancellationRequested(() => {
			const cancelAction = {
				type: 'session/turnCancelled' as const,
				session,
				turnId,
			};
			const seq = this._clientState.applyOptimistic(cancelAction);
			this._remoteAgentHostService.dispatchAction(this._config.address, cancelAction, this._clientState.clientId, seq);
			finish();
		}));

		await done;
	}

	private _resolveSessionUri(sessionResource: URI): URI {
		const rawId = sessionResource.path.substring(1);
		return AgentSession.uri(this._config.provider, rawId);
	}

	private async _createAndSubscribe(sessionResource: URI, modelId?: string): Promise<URI> {
		const rawModelId = this._extractRawModelId(modelId);
		const activeSession = this._sessionsManagementService.getActiveSession();
		const workingDirectory = activeSession?.repository?.fsPath
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;

		this._logService.trace(`[RemoteAgentHost] Creating new session on ${this._config.address}, model=${rawModelId ?? '(default)'}, provider=${this._config.provider}, workingDirectory=${workingDirectory ?? '(none)'}`);
		const session = await this._remoteAgentHostService.createSession(this._config.address, {
			model: rawModelId,
			provider: this._config.provider,
			workingDirectory,
		});
		this._logService.trace(`[RemoteAgentHost] Created session: ${session.toString()}`);

		try {
			const snapshot = await this._remoteAgentHostService.subscribe(this._config.address, session);
			this._clientState.handleSnapshot(session, snapshot.state, snapshot.fromSeq);
		} catch (err) {
			this._logService.error(`[RemoteAgentHost] Failed to subscribe to new session: ${session.toString()}`, err);
		}

		return session;
	}

	private _extractRawModelId(languageModelIdentifier: string | undefined): string | undefined {
		if (!languageModelIdentifier) {
			return undefined;
		}
		const prefix = this._config.sessionType + ':';
		if (languageModelIdentifier.startsWith(prefix)) {
			return languageModelIdentifier.substring(prefix.length);
		}
		return languageModelIdentifier;
	}

	private _convertVariablesToAttachments(request: IChatAgentRequest): IAgentAttachment[] {
		const attachments: IAgentAttachment[] = [];
		for (const v of request.variables.variables) {
			if (v.kind === 'file') {
				const uri = v.value instanceof URI ? v.value : undefined;
				if (uri?.scheme === 'file') {
					attachments.push({ type: 'file', path: uri.fsPath, displayName: v.name });
				}
			} else if (v.kind === 'directory') {
				const uri = v.value instanceof URI ? v.value : undefined;
				if (uri?.scheme === 'file') {
					attachments.push({ type: 'directory', path: uri.fsPath, displayName: v.name });
				}
			} else if (v.kind === 'implicit' && v.isSelection) {
				const uri = v.uri;
				if (uri?.scheme === 'file') {
					attachments.push({ type: 'selection', path: uri.fsPath, displayName: v.name });
				}
			}
		}
		return attachments;
	}

	override dispose(): void {
		for (const [, session] of this._activeSessions) {
			session.dispose();
		}
		this._activeSessions.clear();
		this._sessionToBackend.clear();
		super.dispose();
	}
}
