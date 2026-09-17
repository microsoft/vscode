/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun, observableValue, type IObservable } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import type { ILogService } from '../../../log/common/log.js';
import { AgentSession, resolveAgentChatContext, type AgentChatMigrationResult, type AgentChatOperationContext, type AgentPermissionResponseMetadata, type AgentProvider, type AgentSignal, type IActiveClient, type IAgent, type IAgentChatConfigCompletionsParams, type IAgentChatContext, type IAgentChatMetadata, type IAgentChatMetadataOptions, type IAgentChats, type IAgentCreateChatOptions, type IAgentCreateChatResult, type IAgentDescriptor, type IAgentModelInfo, type IAgentResolveChatConfigParams } from '../../common/agent.js';
import { AgentHostRemoteTargetUnavailableError, type IAgentHostRemoteTargetHandle } from '../../common/agentHostRemoteAgents.js';
import { remoteAgentHostSessionTypeId } from '../../common/agentHostSessionType.js';
import { agentHostAuthority } from '../../common/agentHostUri.js';
import type { IAgentConnection } from '../../common/agentService.js';
import type { IAgentSubscription } from '../../common/state/agentSubscription.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../common/state/protocol/errors.js';
import { chatReducer } from '../../common/state/sessionReducers.js';
import { ActionType, isChatAction, type ChatAction, type ChatInputCompletedAction, type ChatToolCallConfirmedAction, type ChatToolCallResultConfirmedAction } from '../../common/state/sessionActions.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildDefaultChatUri, ChatInputResponseKind, isDefaultChatUri, MessageKind, ResponsePartKind, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, TurnState, type ActiveTurn, type AgentSelection, type ChatInputAnswer, type ChatState, type ClientPluginCustomization, type Customization, type MessageAttachment, type ModelSelection, type ResponsePart, type ToolCallResult, type ToolDefinition, type Turn, type UsageInfo } from '../../common/state/sessionState.js';
import type { ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../../common/state/protocol/commands.js';
import type { AgentInfo, ProtectedResourceMetadata } from '../../common/state/protocol/state.js';

const REMOTE_AGENT_PROVIDER_DATA_VERSION = 1;

const enum RemoteAgentSubscriptionErrorKind {
	Recoverable,
	Terminal,
}

function classifyRemoteAgentSubscriptionError(error: Error): RemoteAgentSubscriptionErrorKind {
	if (error instanceof ProtocolError) {
		switch (error.code) {
			case JsonRpcErrorCodes.InvalidRequest:
			case JsonRpcErrorCodes.MethodNotFound:
			case JsonRpcErrorCodes.InvalidParams:
			case AhpErrorCodes.SessionNotFound:
			case AhpErrorCodes.ProviderNotFound:
			case AhpErrorCodes.UnsupportedProtocolVersion:
			case AhpErrorCodes.NotFound:
				return RemoteAgentSubscriptionErrorKind.Terminal;
		}
	}
	return RemoteAgentSubscriptionErrorKind.Recoverable;
}

interface IRemoteAgentProviderData {
	readonly version: typeof REMOTE_AGENT_PROVIDER_DATA_VERSION;
	readonly connectorId: string;
	readonly targetId: string;
	readonly provider: AgentProvider;
	readonly session: string;
	readonly chat: string;
}

interface IRemoteTurn {
	readonly localTurnId: string;
	readonly remoteTurnId: string;
	readonly startedAt: number;
	dispatched: boolean;
	cancelled: boolean;
	cancellation: CancellationTokenSource | undefined;
}

type RemoteInteractionResponse = ChatToolCallConfirmedAction | ChatToolCallResultConfirmedAction | ChatInputCompletedAction;

interface IRemotePendingInteractionResponse {
	readonly remoteTurnId: string;
	readonly action: RemoteInteractionResponse;
	dispatchedConnection: IAgentConnection | undefined;
}

interface IRemoteResidentInteractionResponse {
	readonly remoteTurnId: string;
	readonly action: RemoteInteractionResponse;
}

/** Resident adapter state transferred between registrations of the same remote provider. */
export interface IRemoteAgentResidentChat {
	readonly localChat: URI;
	readonly providerData: string;
	readonly model: ModelSelection | undefined;
	readonly activeTurn: {
		readonly localTurnId: string;
		readonly remoteTurnId: string;
		readonly startedAt: number;
		readonly dispatched: true;
	} | undefined;
	readonly knownState: ChatState | undefined;
	readonly localChatRegistered: boolean;
	readonly pendingProgress: readonly ChatAction[];
	readonly pendingInteractionResponses: readonly IRemoteResidentInteractionResponse[];
}

class RemoteActiveClient implements IActiveClient {
	tools: readonly ToolDefinition[] = [];
	customizations: readonly ClientPluginCustomization[] = [];

	constructor(
		readonly clientId: string,
		readonly displayName: string | undefined,
	) { }
}

class RemoteAgentChatBinding extends Disposable {
	private readonly _connectionLifetime = this._register(new MutableDisposable<DisposableStore>());
	private _connection: IAgentConnection | undefined;
	private _subscription: IAgentSubscription<ChatState> | undefined;
	private _connectionCancellation: CancellationTokenSource | undefined;
	private _activeTurn: IRemoteTurn | undefined;
	private _model: ModelSelection | undefined;
	private _knownState: ChatState | undefined;
	private _localChatRegistered = false;
	private _pendingProgress: ChatAction[] = [];
	private _pendingInteractionResponses: IRemotePendingInteractionResponse[] = [];
	private _subscriptionRecoveryPending = false;

	constructor(
		readonly localChat: URI,
		readonly remoteSession: URI,
		readonly remoteChat: URI,
		readonly providerData: string,
		model: ModelSelection | undefined,
		private readonly _acceptAction: (binding: RemoteAgentChatBinding, action: ChatAction, isOwnAction: boolean) => void,
		private readonly _acceptSnapshot: (binding: RemoteAgentChatBinding, state: ChatState) => void,
		private readonly _emitProgress: (binding: RemoteAgentChatBinding, action: ChatAction) => void,
		private readonly _logService: ILogService,
		resident?: IRemoteAgentResidentChat,
	) {
		super();
		this._model = model;
		this._knownState = resident?.knownState;
		this._localChatRegistered = resident?.localChatRegistered ?? false;
		this._pendingProgress = resident ? [...resident.pendingProgress] : [];
		this._pendingInteractionResponses = resident?.pendingInteractionResponses.map(response => ({
			...response,
			dispatchedConnection: undefined,
		})) ?? [];
		if (resident?.activeTurn) {
			this._activeTurn = {
				...resident.activeTurn,
				cancelled: false,
				cancellation: undefined,
			};
		}
	}

	get model(): ModelSelection | undefined {
		return this._model;
	}

	set model(model: ModelSelection | undefined) {
		this._model = model;
	}

	get activeTurn(): IRemoteTurn | undefined {
		return this._activeTurn;
	}

	get knownState(): ChatState | undefined {
		return this._knownState;
	}

	get interactionState(): ChatState | undefined {
		if (!this._subscription) {
			return this._knownState;
		}
		const state = this._subscription.value;
		return state instanceof Error ? undefined : state;
	}

	hasPendingPermissionResponse(remoteTurnId: string, remoteToolCallId: string): boolean {
		return this._pendingInteractionResponses.some(response => response.dispatchedConnection !== undefined
			&& response.remoteTurnId === remoteTurnId
			&& response.action.type === ActionType.ChatToolCallConfirmed
			&& response.action.toolCallId === remoteToolCallId);
	}

	hasPendingResultConfirmationResponse(remoteTurnId: string, remoteToolCallId: string): boolean {
		return this._pendingInteractionResponses.some(response => response.dispatchedConnection !== undefined
			&& response.remoteTurnId === remoteTurnId
			&& response.action.type === ActionType.ChatToolCallResultConfirmed
			&& response.action.toolCallId === remoteToolCallId);
	}

	hasPendingInputResponse(remoteTurnId: string, remoteRequestId: string): boolean {
		return this._pendingInteractionResponses.some(response => response.dispatchedConnection !== undefined
			&& response.remoteTurnId === remoteTurnId
			&& response.action.type === ActionType.ChatInputCompleted
			&& response.action.requestId === remoteRequestId);
	}

	queueInteractionResponse(remoteTurnId: string, action: RemoteInteractionResponse): void {
		const duplicate = action.type === ActionType.ChatToolCallConfirmed
			? this._pendingInteractionResponses.some(response => response.remoteTurnId === remoteTurnId
				&& response.action.type === ActionType.ChatToolCallConfirmed
				&& response.action.toolCallId === action.toolCallId)
			: action.type === ActionType.ChatToolCallResultConfirmed
				? this._pendingInteractionResponses.some(response => response.remoteTurnId === remoteTurnId
					&& response.action.type === ActionType.ChatToolCallResultConfirmed
					&& response.action.toolCallId === action.toolCallId)
				: this._pendingInteractionResponses.some(response => response.remoteTurnId === remoteTurnId
					&& response.action.type === ActionType.ChatInputCompleted
					&& response.action.requestId === action.requestId);
		if (duplicate) {
			this.flushPendingInteractionResponses();
			return;
		}
		this._pendingInteractionResponses.push({ remoteTurnId, action, dispatchedConnection: undefined });
		this.flushPendingInteractionResponses();
	}

	rejectInteractionResponse(action: ChatAction, connection: IAgentConnection): IRemotePendingInteractionResponse | undefined {
		const index = this._pendingInteractionResponses.findIndex(response => response.dispatchedConnection === connection
			&& (action.type === ActionType.ChatToolCallConfirmed
				? response.action.type === ActionType.ChatToolCallConfirmed
				&& response.action.turnId === action.turnId
				&& response.action.toolCallId === action.toolCallId
				: action.type === ActionType.ChatToolCallResultConfirmed
					? response.action.type === ActionType.ChatToolCallResultConfirmed
					&& response.action.turnId === action.turnId
					&& response.action.toolCallId === action.toolCallId
					: action.type === ActionType.ChatInputCompleted
					&& response.action.type === ActionType.ChatInputCompleted
					&& response.action.requestId === action.requestId));
		if (index !== -1) {
			return this._pendingInteractionResponses.splice(index, 1)[0];
		}
		return undefined;
	}

	reconcilePendingInteractionResponses(state: ChatState): void {
		this._pendingInteractionResponses = this._pendingInteractionResponses.filter(response => {
			const activeTurn = state.activeTurn;
			if (!activeTurn) {
				return false;
			}
			const action = response.action;
			if (activeTurn.id !== response.remoteTurnId) {
				return false;
			}
			if (action.type === ActionType.ChatToolCallConfirmed) {
				return activeTurn.responseParts.some(part => part.kind === ResponsePartKind.ToolCall
					&& part.toolCall.toolCallId === action.toolCallId
					&& part.toolCall.status === ToolCallStatus.PendingConfirmation);
			}
			if (action.type === ActionType.ChatToolCallResultConfirmed) {
				return activeTurn.responseParts.some(part => part.kind === ResponsePartKind.ToolCall
					&& part.toolCall.toolCallId === action.toolCallId
					&& part.toolCall.status === ToolCallStatus.PendingResultConfirmation);
			}
			return activeTurn.responseParts.some(part => part.kind === ResponsePartKind.InputRequest
				&& part.request.id === action.requestId
				&& part.response === undefined);
		});
	}

	flushPendingInteractionResponses(): void {
		const connection = this._connection;
		const subscriptionState = this._subscription?.value;
		if (!connection || !subscriptionState || subscriptionState instanceof Error) {
			return;
		}
		for (const response of this._pendingInteractionResponses) {
			if (response.dispatchedConnection) {
				continue;
			}
			response.dispatchedConnection = connection;
			try {
				connection.dispatch(this.remoteChat.toString(), response.action);
			} catch (error) {
				response.dispatchedConnection = undefined;
				this._logService.error(`[RemoteAgent] Failed to relay an interaction response for ${this.remoteChat.toString()}.`, error);
				break;
			}
		}
	}

	setActiveTurn(turn: IRemoteTurn): void {
		if (this._activeTurn && this._activeTurn !== turn) {
			this._activeTurn.cancellation?.dispose();
			this._activeTurn.cancellation = undefined;
		}
		this._activeTurn = turn;
		this._subscriptionRecoveryPending = false;
	}

	markActiveTurnDispatched(turn: IRemoteTurn): boolean {
		if (this._activeTurn !== turn) {
			return false;
		}
		turn.cancellation?.dispose();
		turn.cancellation = undefined;
		turn.dispatched = true;
		return true;
	}

	clearActiveTurn(turn: IRemoteTurn | undefined = this._activeTurn, cancelPending = false): boolean {
		if (!turn || this._activeTurn !== turn) {
			return false;
		}
		this._activeTurn = undefined;
		this._subscriptionRecoveryPending = false;
		turn.cancelled ||= cancelPending;
		turn.cancellation?.dispose(cancelPending);
		turn.cancellation = undefined;
		return true;
	}

	markSubscriptionReady(): void {
		this._subscriptionRecoveryPending = false;
	}

	private beginSubscriptionRecovery(): boolean {
		if (!this._activeTurn?.dispatched || this._subscriptionRecoveryPending) {
			return false;
		}
		this._subscriptionRecoveryPending = true;
		return true;
	}

	private failActiveTurn(error: Error, errorType = 'remoteAgentSubscriptionError'): void {
		const activeTurn = this._activeTurn;
		if (!activeTurn?.dispatched) {
			return;
		}
		const remoteAction: ChatAction = {
			type: ActionType.ChatError,
			turnId: activeTurn.remoteTurnId,
			duration: Math.max(0, Date.now() - activeTurn.startedAt),
			part: {
				kind: ResponsePartKind.Error,
				error: {
					errorType,
					message: error.message,
				},
			},
		};
		this.applyKnownAction(remoteAction);
		this.clearActiveTurn(activeTurn);
		this.emitProgress({ ...remoteAction, turnId: activeTurn.localTurnId });
	}

	ensureSubscription(connection: IAgentConnection): IAgentSubscription<ChatState> {
		if (this._connection !== connection || !this._subscription) {
			this.releaseConnection();
			const lifetime = new DisposableStore();
			const cancellation = new CancellationTokenSource();
			lifetime.add(toDisposable(() => cancellation.dispose(true)));
			try {
				const reference: IReference<IAgentSubscription<ChatState>> = connection.getSubscription(StateComponents.Chat, this.remoteChat, 'RemoteAgent');
				lifetime.add(reference);
				lifetime.add(reference.object.onWillApplyAction(envelope => {
					if (envelope.rejectionReason) {
						if (isChatAction(envelope.action) && envelope.origin?.clientId === connection.clientId) {
							const rejectedResponse = this.rejectInteractionResponse(envelope.action, connection);
							if (envelope.action.type === ActionType.ChatTurnStarted
								&& this._activeTurn?.remoteTurnId === envelope.action.turnId) {
								this.failActiveTurn(new Error(envelope.rejectionReason), 'remoteAgentActionRejected');
							} else if (rejectedResponse) {
								this.failActiveTurn(new Error(envelope.rejectionReason), 'remoteAgentActionRejected');
								try {
									connection.dispatch(this.remoteChat.toString(), {
										type: ActionType.ChatTurnCancelled,
										turnId: rejectedResponse.remoteTurnId,
										duration: 0,
									});
								} catch (error) {
									this._logService.error(`[RemoteAgent] Failed to cancel ${this.remoteChat.toString()} after an interaction response was rejected.`, error);
								}
							}
						}
						this._logService.warn(`[RemoteAgent] Downstream rejected '${envelope.action.type}' for ${this.remoteChat.toString()}: ${envelope.rejectionReason}`);
					} else if (isChatAction(envelope.action)) {
						this._acceptAction(this, envelope.action, envelope.origin?.clientId === connection.clientId);
					}
				}));
				if (reference.object.onDidError) {
					lifetime.add(reference.object.onDidError(error => {
						this._logService.warn(`[RemoteAgent] Chat subscription failed for ${this.remoteChat.toString()}: ${error.message}`);
						const errorKind = classifyRemoteAgentSubscriptionError(error);
						if (errorKind === RemoteAgentSubscriptionErrorKind.Terminal) {
							this.failActiveTurn(error);
						}
						queueMicrotask(() => {
							if (this._connection === connection && this._subscription === reference.object) {
								this.releaseConnection(connection);
								if (errorKind === RemoteAgentSubscriptionErrorKind.Recoverable) {
									if (this.beginSubscriptionRecovery()) {
										this.ensureSubscription(connection);
									} else {
										this.failActiveTurn(error);
									}
								}
							}
						});
					}));
				}
				this._connection = connection;
				this._subscription = reference.object;
				this._connectionCancellation = cancellation;
				this._connectionLifetime.value = lifetime;
				const state = reference.object.value;
				if (state && !(state instanceof Error)) {
					this._acceptSnapshot(this, state);
				} else {
					lifetime.add(Event.once(reference.object.onDidChange)(state => this._acceptSnapshot(this, state)));
				}
				return reference.object;
			} catch (error) {
				lifetime.dispose();
				throw error;
			}
		}
		return this._subscription;
	}

	waitForSubscription(connection: IAgentConnection): Promise<ChatState>;
	waitForSubscription(connection: IAgentConnection, turnToken: CancellationToken): Promise<ChatState | undefined>;
	waitForSubscription(connection: IAgentConnection, turnToken?: CancellationToken): Promise<ChatState | undefined> {
		const subscription = this.ensureSubscription(connection);
		const cancellation = this._connectionCancellation;
		if (!cancellation) {
			return Promise.reject(new Error(localize('remoteAgent.subscriptionReleased', "Remote Agent chat subscription was released.")));
		}
		return waitForSubscription(subscription, cancellation.token, turnToken);
	}

	releaseConnection(connection?: IAgentConnection): void {
		if (connection && this._connection !== connection) {
			return;
		}
		const releasedConnection = this._connection;
		for (const response of this._pendingInteractionResponses) {
			if (response.dispatchedConnection === releasedConnection) {
				response.dispatchedConnection = undefined;
			}
		}
		this._connection = undefined;
		this._subscription = undefined;
		this._connectionCancellation = undefined;
		this._connectionLifetime.clear();
	}

	isConnectedTo(connection: IAgentConnection): boolean {
		return !this._store.isDisposed && this._connection === connection;
	}

	get isDisposed(): boolean {
		return this._store.isDisposed;
	}

	replaceKnownState(state: ChatState): ChatState | undefined {
		const previous = this._knownState;
		this._knownState = state;
		return previous;
	}

	applyKnownAction(action: ChatAction): void {
		if (this._knownState) {
			this._knownState = chatReducer(this._knownState, action);
		}
	}

	emitProgress(action: ChatAction): void {
		if (this._localChatRegistered) {
			this._emitProgress(this, action);
		} else {
			this._pendingProgress.push(action);
		}
	}

	markLocalChatRegistered(): void {
		this._localChatRegistered = true;
		this.flushPendingProgress();
	}

	activateResidentState(): void {
		if (this._localChatRegistered) {
			this.flushPendingProgress();
		}
	}

	private flushPendingProgress(): void {
		const pending = this._pendingProgress;
		this._pendingProgress = [];
		for (const action of pending) {
			this._emitProgress(this, action);
		}
	}

	toResidentChat(): IRemoteAgentResidentChat {
		const activeTurn = this._activeTurn?.dispatched ? {
			localTurnId: this._activeTurn.localTurnId,
			remoteTurnId: this._activeTurn.remoteTurnId,
			startedAt: this._activeTurn.startedAt,
			dispatched: true as const,
		} : undefined;
		return {
			localChat: this.localChat,
			providerData: this.providerData,
			model: this._model,
			activeTurn,
			knownState: this._knownState,
			localChatRegistered: this._localChatRegistered,
			pendingProgress: [...this._pendingProgress],
			pendingInteractionResponses: this._pendingInteractionResponses.map(response => ({
				remoteTurnId: response.remoteTurnId,
				action: response.action,
			})),
		};
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this.releaseConnection();
		this.clearActiveTurn(undefined, true);
		super.dispose();
	}

}

type RemotePermissionRequest = {
	readonly binding: RemoteAgentChatBinding;
	readonly remoteTurnId: string;
	readonly remoteToolCallId: string;
};

type RemoteInputRequest = {
	readonly binding: RemoteAgentChatBinding;
	readonly remoteTurnId: string;
	readonly remoteRequestId: string;
};

function parseProviderData(providerData: string): IRemoteAgentProviderData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(providerData);
	} catch (error) {
		throw new Error(localize('remoteAgent.invalidProviderDataJson', "Remote Agent provider data is not valid JSON: {0}", error instanceof Error ? error.message : String(error)));
	}
	if (!isObject(parsed)) {
		throw new Error(localize('remoteAgent.invalidProviderData', "Remote Agent provider data is invalid."));
	}
	const value = parsed as Record<string, unknown>;
	if (value.version !== REMOTE_AGENT_PROVIDER_DATA_VERSION
		|| typeof value.connectorId !== 'string'
		|| typeof value.targetId !== 'string'
		|| typeof value.provider !== 'string'
		|| typeof value.session !== 'string'
		|| typeof value.chat !== 'string') {
		throw new Error(localize('remoteAgent.invalidProviderDataShape', "Remote Agent provider data has an unsupported shape."));
	}
	return {
		version: REMOTE_AGENT_PROVIDER_DATA_VERSION,
		connectorId: value.connectorId,
		targetId: value.targetId,
		provider: value.provider,
		session: value.session,
		chat: value.chat,
	};
}

function waitForSubscription(subscription: IAgentSubscription<ChatState>, connectionToken: CancellationToken, turnToken?: CancellationToken): Promise<ChatState | undefined> {
	if (connectionToken.isCancellationRequested) {
		return Promise.reject(new Error(localize('remoteAgent.subscriptionReleased', "Remote Agent chat subscription was released.")));
	}
	if (turnToken?.isCancellationRequested) {
		return Promise.resolve(undefined);
	}
	if (subscription.value instanceof Error) {
		return Promise.reject(subscription.value);
	}
	if (subscription.value) {
		return Promise.resolve(subscription.value);
	}
	return new Promise((resolve, reject) => {
		const store = new DisposableStore();
		let settled = false;
		const complete = (value: ChatState) => {
			if (settled) {
				return;
			}
			settled = true;
			store.dispose();
			resolve(value);
		};
		const error = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			store.dispose();
			reject(error);
		};
		const cancelTurn = () => {
			if (settled) {
				return;
			}
			settled = true;
			store.dispose();
			resolve(undefined);
		};
		store.add(subscription.onDidChange(complete));
		if (subscription.onDidError) {
			store.add(subscription.onDidError(error));
		}
		store.add(connectionToken.onCancellationRequested(() => error(new Error(localize('remoteAgent.subscriptionReleased', "Remote Agent chat subscription was released.")))));
		if (turnToken) {
			store.add(turnToken.onCancellationRequested(cancelTurn));
		}
	});
}

/**
 * Adapts one provider catalogued by one downstream Agent Host to an ordinary local agent.
 */
export class RemoteAgent extends Disposable implements IAgent {
	readonly id: AgentProvider;
	readonly agentHostCapabilities = { workspaceConversion: false };

	private readonly _models = observableValue<readonly IAgentModelInfo[]>(this, []);
	readonly models: IObservable<readonly IAgentModelInfo[]> = this._models;
	private readonly _onDidChatProgress = this._register(new Emitter<AgentSignal>());
	readonly onDidChatProgress = this._onDidChatProgress.event;
	readonly onDidMaterializeChat = Event.None;
	readonly onDidChangeChatData = Event.None;
	readonly onDidSpawnChat = Event.None;
	readonly onDidDiscoverChats = Event.None;

	private readonly _bindings = this._register(new DisposableMap<string, RemoteAgentChatBinding>());
	private readonly _activeClients = new Map<string, RemoteActiveClient>();
	private readonly _downstreamProvider: AgentProvider;
	private _agentInfo: AgentInfo;
	private _descriptor: IAgentDescriptor;
	private _protectedResources: ProtectedResourceMetadata[] = [];
	private readonly _downstreamProtectedResources = new Map<string, string>();

	readonly chats: IAgentChats = {
		createChat: (chat, context, options) => this._createChat(chat, context, options),
		disposeChat: (chat, context) => this._disposeChat(chat, context),
		canReleaseChat: async (chat, context) => {
			resolveAgentChatContext(context, chat);
			return true;
		},
		releaseChat: (chat, context) => this._releaseChat(chat, context),
		sendMessage: (chat, prompt, workingDirectoriesOrDirectory, attachments, turnId, _senderClientId, clientTypeOrContext, context) => {
			const operationContext = context ?? (typeof clientTypeOrContext === 'string' ? undefined : clientTypeOrContext);
			return this._sendMessage(chat, prompt, workingDirectoriesOrDirectory, attachments, turnId, operationContext);
		},
		abort: (chat, context) => this._abort(chat, context),
		getModel: (chat, context) => {
			resolveAgentChatContext(context, chat);
			return this._bindings.get(chat.toString())?.model;
		},
		changeModel: (chat, model, context) => this._changeModel(chat, model, context),
		changeAgent: (chat, agent, context) => this._changeAgent(chat, agent, context),
		getMessages: (chat, context) => this._getMessages(chat, context),
	};

	constructor(
		readonly target: IAgentHostRemoteTargetHandle,
		agentInfo: AgentInfo,
		label: string,
		private readonly _logService: ILogService,
		residentChats: readonly IRemoteAgentResidentChat[] = [],
	) {
		super();
		this._downstreamProvider = agentInfo.provider;
		this._agentInfo = agentInfo;
		this.id = remoteAgentHostSessionTypeId(agentHostAuthority(JSON.stringify([target.connectorId, target.targetId])), agentInfo.provider);
		this._descriptor = {
			provider: this.id,
			displayName: agentInfo.displayName,
			description: agentInfo.description,
		};
		this.update(agentInfo, label);
		for (const resident of residentChats) {
			this._restoreResidentChat(resident);
		}
		this._register(autorun(reader => {
			const connection = this.target.connection.read(reader);
			if (connection) {
				for (const binding of this._bindings.values()) {
					binding.ensureSubscription(connection);
				}
			} else {
				for (const binding of this._bindings.values()) {
					binding.releaseConnection();
				}
			}
		}));
	}

	update(agentInfo: AgentInfo, label: string): void {
		if (agentInfo.provider !== this._downstreamProvider) {
			throw new Error(`Remote Agent provider identity changed from '${this._downstreamProvider}' to '${agentInfo.provider}'.`);
		}
		this._agentInfo = agentInfo;
		this._descriptor = {
			provider: this.id,
			displayName: localize('remoteAgent.displayName', "{0} ({1})", agentInfo.displayName, label),
			description: localize('remoteAgent.description', "{0} on {1}", agentInfo.description, label),
		};
		this._downstreamProtectedResources.clear();
		this._protectedResources = agentInfo.protectedResources?.map(resource => {
			const namespacedResource = this._toProtectedResourceId(resource.resource);
			this._downstreamProtectedResources.set(namespacedResource, resource.resource);
			return { ...resource, resource: namespacedResource };
		}) ?? [];
		this._models.set(agentInfo.models.map(model => ({
			id: model.id,
			provider: this.id,
			name: model.name,
			maxContextWindow: model.maxContextWindow,
			maxOutputTokens: model.maxOutputTokens,
			maxPromptTokens: model.maxPromptTokens,
			supportsVision: false,
			configSchema: model.configSchema,
			policyState: model.policyState,
			_meta: model._meta,
		})), undefined);
	}

	activateResidentChats(): void {
		for (const binding of this._bindings.values()) {
			binding.activateResidentState();
		}
	}

	captureResidentChats(): readonly IRemoteAgentResidentChat[] {
		return [...this._bindings.values()].map(binding => binding.toResidentChat());
	}

	updateLabel(label: string): void {
		this.update(this._agentInfo, label);
	}

	getDescriptor(): IAgentDescriptor {
		return this._descriptor;
	}

	async materializeChat(chat: URI, context: AgentChatOperationContext, providerData: string | undefined): Promise<IAgentCreateChatResult | void> {
		resolveAgentChatContext(context, chat);
		if (providerData === undefined) {
			return;
		}
		const binding = this._materializeBinding(chat, providerData);
		binding.ensureSubscription(this.target.requireConnection());
		return { providerData };
	}

	async setWorkingDirectory(): Promise<void> {
		throw new Error(localize('remoteAgent.workspaceUnsupported', "Remote Agent currently supports workspace-less chats only."));
	}

	getOrCreateActiveClient(chat: URI, context: URI | IAgentChatContext, client: { readonly clientId: string; readonly displayName?: string }): IActiveClient {
		resolveAgentChatContext(context, chat);
		this._bindings.get(chat.toString())?.markLocalChatRegistered();
		const key = JSON.stringify([chat.toString(), client.clientId]);
		let activeClient = this._activeClients.get(key);
		if (!activeClient) {
			activeClient = new RemoteActiveClient(client.clientId, client.displayName);
			this._activeClients.set(key, activeClient);
		}
		return activeClient;
	}

	removeActiveClient(chat: URI, context: URI | IAgentChatContext, clientId: string): void {
		resolveAgentChatContext(context, chat);
		this._activeClients.delete(JSON.stringify([chat.toString(), clientId]));
	}

	onClientToolCallComplete(chat: URI, toolCallId: string, result: ToolCallResult, context?: IAgentChatContext): void {
		if (context) {
			resolveAgentChatContext(context, chat);
		}
		const binding = this._bindings.get(chat.toString());
		const states = [binding?.interactionState, binding?.knownState].filter((state): state is ChatState => state !== undefined);
		const turns = states.flatMap(state => [...(state.activeTurn ? [state.activeTurn] : []), ...state.turns]);
		const completedToolCall = turns.flatMap(turn => turn.responseParts.flatMap(part =>
			part.kind === ResponsePartKind.ToolCall
				&& binding
				&& this._toLocalToolCallId(binding, turn.id, part.toolCall.toolCallId) === toolCallId
				&& (part.toolCall.status === ToolCallStatus.Completed || part.toolCall.status === ToolCallStatus.PendingResultConfirmation)
				? [part]
				: []))[0];
		if (completedToolCall?.kind === ResponsePartKind.ToolCall
			&& (completedToolCall.toolCall.status === ToolCallStatus.Completed || completedToolCall.toolCall.status === ToolCallStatus.PendingResultConfirmation)) {
			const completedResult: ToolCallResult = {
				success: completedToolCall.toolCall.success,
				pastTenseMessage: completedToolCall.toolCall.pastTenseMessage,
				...(completedToolCall.toolCall.content !== undefined ? { content: completedToolCall.toolCall.content } : {}),
				...(completedToolCall.toolCall.structuredContent !== undefined ? { structuredContent: completedToolCall.toolCall.structuredContent } : {}),
				...(completedToolCall.toolCall.error !== undefined ? { error: completedToolCall.toolCall.error } : {}),
			};
			if (equals(completedResult, result)) {
				return;
			}
		}
		throw new Error(localize('remoteAgent.clientToolsUnsupported', "Remote Agent client tools are not supported."));
	}

	respondToPermissionRequest(requestId: string, approved: boolean, metadata?: AgentPermissionResponseMetadata): void {
		const request = this._findPendingPermissionRequest(requestId);
		if (!request) {
			this._logService.warn(`[RemoteAgent] Ignoring stale or unknown permission response '${requestId}'.`);
			return;
		}
		const action: ChatToolCallConfirmedAction = approved
			? {
				...(metadata && 'confirmed' in metadata ? metadata : {}),
				type: ActionType.ChatToolCallConfirmed,
				turnId: request.remoteTurnId,
				toolCallId: request.remoteToolCallId,
				approved: true,
				confirmed: metadata && 'confirmed' in metadata ? metadata.confirmed : ToolCallConfirmationReason.UserAction,
			}
			: {
				...(metadata && 'reason' in metadata ? metadata : {}),
				type: ActionType.ChatToolCallConfirmed,
				turnId: request.remoteTurnId,
				toolCallId: request.remoteToolCallId,
				approved: false,
				reason: metadata && 'reason' in metadata ? metadata.reason : ToolCallCancellationReason.Denied,
			};
		request.binding.queueInteractionResponse(request.remoteTurnId, action);
	}

	respondToToolResultConfirmation(requestId: string, approved: boolean): void {
		const request = this._findPendingToolResultConfirmation(requestId);
		if (!request) {
			this._logService.warn(`[RemoteAgent] Ignoring stale or unknown tool-result response '${requestId}'.`);
			return;
		}
		request.binding.queueInteractionResponse(request.remoteTurnId, {
			type: ActionType.ChatToolCallResultConfirmed,
			turnId: request.remoteTurnId,
			toolCallId: request.remoteToolCallId,
			approved,
		});
	}

	respondToUserInputRequest(requestId: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): void {
		const request = this._findPendingInputRequest(requestId);
		if (!request) {
			this._logService.warn(`[RemoteAgent] Ignoring stale or unknown user input response '${requestId}'.`);
			return;
		}
		const action: ChatInputCompletedAction = {
			type: ActionType.ChatInputCompleted,
			requestId: request.remoteRequestId,
			response,
			answers,
		};
		request.binding.queueInteractionResponse(request.remoteTurnId, action);
	}

	async resolveChatConfig(params: IAgentResolveChatConfigParams): Promise<ResolveSessionConfigResult> {
		if (params.workingDirectory) {
			throw new Error(localize('remoteAgent.workspaceUnsupported', "Remote Agent currently supports workspace-less chats only."));
		}
		return this.target.requireConnection().resolveSessionConfig({
			provider: this._downstreamProvider,
			config: params.config,
		});
	}

	getInheritedChatConfig(config: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
		return Object.keys(config).length > 0 ? { ...config } : undefined;
	}

	async chatConfigCompletions(params: IAgentChatConfigCompletionsParams): Promise<SessionConfigCompletionsResult> {
		if (params.workingDirectory) {
			throw new Error(localize('remoteAgent.workspaceUnsupported', "Remote Agent currently supports workspace-less chats only."));
		}
		return this.target.requireConnection().sessionConfigCompletions({
			provider: this._downstreamProvider,
			config: params.config,
			property: params.property,
			query: params.query,
		});
	}

	async getChatCustomizations(chat: URI, context: URI | IAgentChatContext): Promise<readonly Customization[]> {
		resolveAgentChatContext(context, chat);
		return [];
	}

	async listChatsToMigrate(): Promise<AgentChatMigrationResult> {
		return [];
	}

	async getChatMetadata(chat: URI, context: URI | IAgentChatContext, providerData?: string, options?: IAgentChatMetadataOptions): Promise<IAgentChatMetadata | undefined> {
		resolveAgentChatContext(context, chat);
		if (providerData !== undefined && !this._bindings.has(chat.toString())) {
			this._materializeBinding(chat, providerData);
		}
		const binding = this._bindings.get(chat.toString());
		if (!binding) {
			return undefined;
		}
		const turns = await this._getMessages(chat, context);
		const timestamps = turns
			.map(turn => turn.startedAt ? Date.parse(turn.startedAt) : undefined)
			.filter((value): value is number => value !== undefined && Number.isFinite(value));
		const now = Date.now();
		return {
			chat,
			startTime: timestamps[0] ?? options?.registryFallback?.startTime ?? now,
			modifiedTime: timestamps[timestamps.length - 1] ?? options?.registryFallback?.modifiedTime ?? now,
		};
	}

	getProtectedResources(): ProtectedResourceMetadata[] {
		return [...this._protectedResources];
	}

	async authenticate(resource: string, token: string, expiresIn?: number): Promise<boolean> {
		const downstreamResource = this._downstreamProtectedResources.get(resource);
		if (!downstreamResource) {
			return false;
		}
		return (await this.target.requireConnection().authenticate({ resource: downstreamResource, token, expiresIn })).authenticated;
	}

	async shutdown(): Promise<void> {
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._activeClients.clear();
		super.dispose();
	}

	private async _createChat(chat: URI, context: AgentChatOperationContext, options?: IAgentCreateChatOptions): Promise<IAgentCreateChatResult> {
		resolveAgentChatContext(context, chat);
		if (!isDefaultChatUri(chat)) {
			throw new Error(localize('remoteAgent.multipleChatsUnsupported', "Remote Agent currently supports one chat per session."));
		}
		if (this._bindings.has(chat.toString())) {
			throw new Error(localize('remoteAgent.chatAlreadyCreated', "Remote Agent chat is already created."));
		}
		if (options?.workingDirectories?.length || options?.project) {
			throw new Error(localize('remoteAgent.workspaceUnsupported', "Remote Agent currently supports workspace-less chats only."));
		}
		if (options?.agent || options?.fork || options?.importConversation) {
			throw new Error(localize('remoteAgent.advancedChatUnsupported', "Remote Agent does not support custom agents, forks, or imported conversations."));
		}

		const connection = this.target.requireConnection();
		const remoteSessionIdentity = AgentSession.uri(this._downstreamProvider, `remote-${this.target.clientId}-${generateUuid()}`);
		const remoteSession = await connection.createSession({
			provider: this._downstreamProvider,
			...(options?.model ? { model: options.model } : {}),
			session: remoteSessionIdentity,
			workingDirectories: [],
			...(options?.config ? { config: options.config } : {}),
		});
		if (this._store.isDisposed) {
			throw new Error(localize('remoteAgent.providerWithdrawn', "Remote Agent provider was withdrawn while creating the downstream chat."));
		}
		const currentConnection = this.target.requireConnection();
		const remoteChat = URI.parse(buildDefaultChatUri(remoteSession));
		const providerData = JSON.stringify({
			version: REMOTE_AGENT_PROVIDER_DATA_VERSION,
			connectorId: this.target.connectorId,
			targetId: this.target.targetId,
			provider: this._downstreamProvider,
			session: remoteSession.toString(),
			chat: remoteChat.toString(),
		} satisfies IRemoteAgentProviderData);
		const binding = this._addBinding(chat, remoteSession, remoteChat, providerData, options?.model);
		binding.ensureSubscription(currentConnection);
		return { providerData };
	}

	private async _disposeChat(chat: URI, context: AgentChatOperationContext): Promise<void> {
		resolveAgentChatContext(context, chat);
		const binding = this._requireBinding(chat);
		await this.target.requireConnection().disposeSession(binding.remoteSession);
		this._bindings.deleteAndDispose(chat.toString());
		this._deleteActiveClients(chat);
	}

	private async _releaseChat(chat: URI, context: AgentChatOperationContext): Promise<void> {
		resolveAgentChatContext(context, chat);
		const binding = this._bindings.get(chat.toString());
		if (binding) {
			this._bindings.deleteAndDispose(chat.toString());
		}
		this._deleteActiveClients(chat);
	}

	private async _sendMessage(
		chat: URI,
		prompt: string,
		workingDirectoriesOrDirectory: readonly URI[] | URI | undefined,
		attachments: readonly MessageAttachment[] | undefined,
		turnId: string | undefined,
		context: URI | IAgentChatContext | undefined,
	): Promise<void> {
		if (context) {
			resolveAgentChatContext(context, chat);
		}
		if (URI.isUri(workingDirectoriesOrDirectory) || (workingDirectoriesOrDirectory?.length ?? 0) > 0) {
			throw new Error(localize('remoteAgent.workspaceUnsupported', "Remote Agent currently supports workspace-less chats only."));
		}
		if (attachments?.length) {
			throw new Error(localize('remoteAgent.attachmentsUnsupported', "Remote Agent attachments are not supported."));
		}
		if (!turnId) {
			throw new Error(localize('remoteAgent.turnIdRequired', "Remote Agent requires a turn identifier."));
		}
		const binding = this._requireBinding(chat);
		binding.markLocalChatRegistered();
		const connection = this.target.requireConnection();
		const remoteTurnId = this._toRemoteTurnId(turnId);
		const existingActiveTurn = binding.activeTurn;
		if (existingActiveTurn) {
			if (existingActiveTurn.remoteTurnId !== remoteTurnId) {
				throw new Error(localize('remoteAgent.turnAlreadyActive', "Remote Agent chat already has an active turn."));
			}
			if (existingActiveTurn.dispatched) {
				return;
			}
			throw new Error(localize('remoteAgent.turnAlreadyActive', "Remote Agent chat already has an active turn."));
		}
		const turnCancellation = new CancellationTokenSource();
		const activeTurn: IRemoteTurn = {
			localTurnId: turnId,
			remoteTurnId,
			startedAt: Date.now(),
			dispatched: false,
			cancelled: false,
			cancellation: turnCancellation,
		};
		binding.setActiveTurn(activeTurn);
		try {
			const readiness = await binding.waitForSubscription(connection, turnCancellation.token);
			if (!readiness || activeTurn.cancelled) {
				return;
			}
			if (binding.isDisposed
				|| this._bindings.get(chat.toString()) !== binding
				|| !binding.isConnectedTo(connection)
				|| this.target.connection.get() !== connection) {
				throw new AgentHostRemoteTargetUnavailableError(this.target.connectorId, this.target.targetId, this.target.status.get());
			}
			if (readiness.activeTurn) {
				if (readiness.activeTurn.id !== remoteTurnId) {
					throw new Error(localize('remoteAgent.conflictingActiveTurn', "Remote Agent chat has a conflicting active turn."));
				}
				binding.markActiveTurnDispatched(activeTurn);
				return;
			}
			const completedTurn = readiness.turns.find(turn => turn.id === remoteTurnId);
			if (completedTurn) {
				if (binding.activeTurn === activeTurn) {
					this._emitSnapshotTurnProgress(binding, completedTurn, undefined, turnId);
					binding.clearActiveTurn(activeTurn);
				}
				return;
			}
			if (binding.activeTurn !== activeTurn) {
				throw new Error(localize('remoteAgent.conflictingActiveTurn', "Remote Agent chat has a conflicting active turn."));
			}
			binding.markActiveTurnDispatched(activeTurn);
			connection.dispatch(binding.remoteChat.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: remoteTurnId,
				startedAt: new Date().toISOString(),
				message: {
					text: prompt,
					origin: { kind: MessageKind.User },
					...(binding.model ? { model: binding.model } : {}),
				},
			});
		} catch (error) {
			binding.clearActiveTurn(activeTurn, true);
			throw error;
		}
	}

	private async _abort(chat: URI, context: AgentChatOperationContext): Promise<void> {
		resolveAgentChatContext(context, chat);
		const binding = this._requireBinding(chat);
		binding.markLocalChatRegistered();
		const activeTurn = binding.activeTurn;
		if (!activeTurn) {
			return;
		}
		if (!activeTurn.dispatched) {
			binding.clearActiveTurn(activeTurn, true);
			return;
		}
		const connection = this.target.requireConnection();
		if (!binding.isConnectedTo(connection)) {
			throw new AgentHostRemoteTargetUnavailableError(this.target.connectorId, this.target.targetId, this.target.status.get());
		}
		connection.dispatch(binding.remoteChat.toString(), {
			type: ActionType.ChatTurnCancelled,
			turnId: activeTurn.remoteTurnId,
			duration: Math.max(0, Date.now() - activeTurn.startedAt),
		});
		binding.clearActiveTurn(activeTurn);
	}

	private async _changeModel(chat: URI, model: ModelSelection, context: AgentChatOperationContext): Promise<void> {
		resolveAgentChatContext(context, chat);
		if (!this._models.get().some(candidate => candidate.id === model.id)) {
			throw new Error(localize('remoteAgent.unknownModel', "Remote Agent model is not available: {0}", model.id));
		}
		const binding = this._requireBinding(chat);
		binding.markLocalChatRegistered();
		binding.model = model;
	}

	private async _changeAgent(chat: URI, agent: AgentSelection | undefined, context: AgentChatOperationContext): Promise<void> {
		resolveAgentChatContext(context, chat);
		this._requireBinding(chat).markLocalChatRegistered();
		if (agent) {
			throw new Error(localize('remoteAgent.customAgentUnsupported', "Remote Agent custom agents are not supported."));
		}
	}

	private async _getMessages(chat: URI, context: AgentChatOperationContext): Promise<readonly Turn[]> {
		resolveAgentChatContext(context, chat);
		const binding = this._requireBinding(chat);
		const state = await binding.waitForSubscription(this.target.requireConnection());
		return state.turns.flatMap(turn => {
			const localTurnId = this._toLocalTurnId(turn.id);
			return localTurnId ? [{
				...turn,
				id: localTurnId,
				responseParts: turn.responseParts.map(part => this._translateResponsePart(binding, turn.id, part)),
			}] : [];
		});
	}

	private _acceptAction(binding: RemoteAgentChatBinding, action: ChatAction, isOwnAction: boolean): void {
		binding.applyKnownAction(action);
		if (binding.knownState) {
			binding.reconcilePendingInteractionResponses(binding.knownState);
		}
		const translated = this._translateAction(binding, action, isOwnAction);
		if (!translated) {
			return;
		}
		if ((translated.type === ActionType.ChatTurnComplete || translated.type === ActionType.ChatTurnCancelled || translated.type === ActionType.ChatError)
			&& binding.activeTurn?.localTurnId === translated.turnId) {
			binding.clearActiveTurn();
		}
		binding.emitProgress(translated);
	}

	private _acceptSnapshot(binding: RemoteAgentChatBinding, state: ChatState): void {
		binding.markSubscriptionReady();
		const previousState = binding.replaceKnownState(state);
		binding.reconcilePendingInteractionResponses(state);
		binding.flushPendingInteractionResponses();
		const activeTurn = state.activeTurn;
		const previousActiveTurn = binding.activeTurn;
		const completedPendingTurn = previousActiveTurn
			? state.turns.find(turn => turn.id === previousActiveTurn.remoteTurnId)
			: undefined;
		if (previousActiveTurn && !previousActiveTurn.dispatched && activeTurn?.id !== previousActiveTurn.remoteTurnId && !completedPendingTurn) {
			return;
		}
		if (!activeTurn) {
			if (previousActiveTurn) {
				if (completedPendingTurn) {
					this._emitSnapshotTurnProgress(binding, completedPendingTurn, previousState, previousActiveTurn.localTurnId);
				} else if (previousActiveTurn.dispatched) {
					binding.emitProgress({
						type: ActionType.ChatTurnCancelled,
						turnId: previousActiveTurn.localTurnId,
						duration: 0,
					});
				}
				binding.clearActiveTurn(previousActiveTurn);
			}
			return;
		}
		const localTurnId = this._toLocalTurnId(activeTurn.id);
		if (!localTurnId) {
			if (binding.activeTurn?.dispatched) {
				binding.clearActiveTurn();
			}
			return;
		}
		if (binding.activeTurn?.remoteTurnId === activeTurn.id) {
			binding.markActiveTurnDispatched(binding.activeTurn);
			this._emitSnapshotActiveProgress(binding, activeTurn, previousState);
			return;
		}
		const startedAt = Date.parse(activeTurn.startedAt);
		binding.setActiveTurn({
			localTurnId,
			remoteTurnId: activeTurn.id,
			startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
			dispatched: true,
			cancelled: false,
			cancellation: undefined,
		});
		binding.emitProgress({
			type: ActionType.ChatTurnStarted,
			turnId: localTurnId,
			startedAt: activeTurn.startedAt,
			message: activeTurn.message,
		});
		this._emitSnapshotActiveProgress(binding, activeTurn, previousState);
	}

	private _emitSnapshotActiveProgress(binding: RemoteAgentChatBinding, turn: ActiveTurn, previousState: ChatState | undefined): void {
		const previousTurn = previousState?.activeTurn?.id === turn.id ? previousState.activeTurn : undefined;
		for (const action of this._snapshotContentActions(turn.id, turn.responseParts, turn.usage, previousTurn)) {
			const translated = this._translateAction(binding, action, false);
			if (translated) {
				binding.emitProgress(translated);
			}
		}
	}

	private _emitSnapshotTurnProgress(binding: RemoteAgentChatBinding, turn: Turn, previousState: ChatState | undefined, localTurnId: string): void {
		const previousTurn = previousState?.activeTurn?.id === turn.id
			? previousState.activeTurn
			: previousState?.turns.find(candidate => candidate.id === turn.id);
		for (const action of this._snapshotContentActions(turn.id, turn.responseParts, turn.usage, previousTurn)) {
			const translated = this._translateAction(binding, action, false);
			if (translated) {
				binding.emitProgress(translated);
			}
		}
		let action: ChatAction | undefined;
		switch (turn.state) {
			case TurnState.Complete:
				action = { type: ActionType.ChatTurnComplete, turnId: localTurnId, duration: turn.duration ?? 0 };
				break;
			case TurnState.Cancelled:
				action = { type: ActionType.ChatTurnCancelled, turnId: localTurnId, duration: turn.duration ?? 0 };
				break;
			case TurnState.Error: {
				const part = turn.responseParts[turn.responseParts.length - 1];
				if (part?.kind === ResponsePartKind.Error) {
					action = { type: ActionType.ChatError, turnId: localTurnId, duration: turn.duration ?? 0, part };
				} else {
					this._logService.warn(`[RemoteAgent] Completed error turn '${turn.id}' has no terminal error part.`);
				}
				break;
			}
		}
		if (action) {
			binding.emitProgress(action);
		}
	}

	private _snapshotContentActions(
		turnId: string,
		responseParts: readonly ResponsePart[],
		usage: UsageInfo | undefined,
		previous: Pick<ActiveTurn, 'responseParts' | 'usage'> | Pick<Turn, 'responseParts' | 'usage'> | undefined,
	): ChatAction[] {
		const actions: ChatAction[] = [];
		for (let index = 0; index < responseParts.length; index++) {
			const part = responseParts[index];
			const previousPart = previous?.responseParts[index];
			if (equals(previousPart, part)) {
				continue;
			}
			if (part.kind === ResponsePartKind.Markdown
				&& previousPart?.kind === ResponsePartKind.Markdown
				&& previousPart.id === part.id
				&& part.content.startsWith(previousPart.content)) {
				const content = part.content.substring(previousPart.content.length);
				if (content) {
					actions.push({ type: ActionType.ChatDelta, turnId, partId: part.id, content });
				}
				continue;
			}
			if (part.kind === ResponsePartKind.Reasoning
				&& previousPart?.kind === ResponsePartKind.Reasoning
				&& previousPart.id === part.id
				&& part.content.startsWith(previousPart.content)) {
				const content = part.content.substring(previousPart.content.length);
				if (content) {
					actions.push({ type: ActionType.ChatReasoning, turnId, partId: part.id, content });
				}
				continue;
			}
			if (part.kind !== ResponsePartKind.Error) {
				actions.push({ type: ActionType.ChatResponsePart, turnId, part });
			}
		}
		if (usage && !equals(previous?.usage, usage)) {
			actions.push({ type: ActionType.ChatUsage, turnId, usage });
		}
		return actions;
	}

	private _emitProgress(binding: RemoteAgentChatBinding, action: ChatAction): void {
		this._onDidChatProgress.fire({ kind: 'action', resource: binding.localChat, action });
	}

	private _translateAction(binding: RemoteAgentChatBinding, action: ChatAction, isOwnAction: boolean): ChatAction | undefined {
		switch (action.type) {
			case ActionType.ChatDelta: {
				const turnId = this._toLocalTurnId(action.turnId);
				return turnId ? { ...action, turnId, partId: this._toLocalPartId(action.partId) } : undefined;
			}
			case ActionType.ChatResponsePart: {
				const turnId = this._toLocalTurnId(action.turnId);
				return turnId ? { ...action, turnId, part: this._translateResponsePart(binding, action.turnId, action.part) } : undefined;
			}
			case ActionType.ChatToolCallDelta:
			case ActionType.ChatToolCallComplete:
			case ActionType.ChatToolCallContentChanged: {
				const turnId = this._toLocalTurnId(action.turnId);
				return turnId ? {
					...action,
					turnId,
					toolCallId: this._toLocalToolCallId(binding, action.turnId, action.toolCallId),
				} : undefined;
			}
			case ActionType.ChatToolCallStart:
			case ActionType.ChatToolCallReady: {
				const turnId = this._toLocalTurnId(action.turnId);
				return turnId ? {
					...action,
					turnId,
					toolCallId: this._toLocalToolCallId(binding, action.turnId, action.toolCallId),
					contributor: action.contributor?.kind === ToolCallContributorKind.Client ? undefined : action.contributor,
				} : undefined;
			}
			case ActionType.ChatTurnComplete:
			case ActionType.ChatError:
			case ActionType.ChatUsage: {
				const turnId = this._toLocalTurnId(action.turnId);
				return turnId ? { ...action, turnId } : undefined;
			}
			case ActionType.ChatTurnCancelled: {
				const turnId = this._toLocalTurnId(action.turnId);
				return !isOwnAction && turnId ? { ...action, turnId } : undefined;
			}
			case ActionType.ChatReasoning: {
				const turnId = this._toLocalTurnId(action.turnId);
				return turnId ? { ...action, turnId, partId: this._toLocalPartId(action.partId) } : undefined;
			}
			case ActionType.ChatActivityChanged:
				return action;
			case ActionType.ChatInputRequested: {
				const remoteTurnId = binding.knownState?.activeTurn?.id;
				if (!remoteTurnId || !this._isPendingInputRequest(binding, action.request.id)) {
					return undefined;
				}
				return {
					...action,
					request: {
						...action.request,
						id: this._toLocalInputRequestId(binding, remoteTurnId, action.request.id),
					},
				};
			}
			case ActionType.ChatToolCallConfirmed:
			case ActionType.ChatToolCallResultConfirmed:
			case ActionType.ChatInputAnswerChanged:
			case ActionType.ChatInputCompleted:
				return undefined;
			case ActionType.ChatTurnStarted:
			case ActionType.ChatTurnsLoaded:
				return undefined;
			default:
				this._logService.warn(`[RemoteAgent] Ignoring unsupported downstream chat action '${action.type}'.`);
				return undefined;
		}
	}

	private _translateResponsePart(binding: RemoteAgentChatBinding, remoteTurnId: string, part: ResponsePart): ResponsePart {
		switch (part.kind) {
			case ResponsePartKind.Markdown:
			case ResponsePartKind.Reasoning:
				return { ...part, id: this._toLocalPartId(part.id) };
			case ResponsePartKind.ToolCall: {
				const toolCallId = this._toLocalToolCallId(binding, remoteTurnId, part.toolCall.toolCallId);
				if (part.toolCall.status === ToolCallStatus.AuthRequired) {
					return { ...part, toolCall: { ...part.toolCall, toolCallId } };
				}
				return {
					...part,
					toolCall: {
						...part.toolCall,
						toolCallId,
						contributor: part.toolCall.contributor?.kind === ToolCallContributorKind.Client ? undefined : part.toolCall.contributor,
					},
				};
			}
			case ResponsePartKind.InputRequest:
				return { ...part, request: { ...part.request, id: this._toLocalInputRequestId(binding, remoteTurnId, part.request.id) } };
			case ResponsePartKind.ContentRef:
			case ResponsePartKind.Error:
			case ResponsePartKind.SystemNotification:
				return part;
		}
	}

	private _materializeBinding(chat: URI, providerData: string): RemoteAgentChatBinding {
		const data = parseProviderData(providerData);
		if (data.connectorId !== this.target.connectorId || data.targetId !== this.target.targetId || data.provider !== this._downstreamProvider) {
			throw new Error(localize('remoteAgent.providerDataOwnership', "Remote Agent provider data does not belong to this target and provider."));
		}
		const remoteSession = URI.parse(data.session);
		const remoteChat = URI.parse(data.chat);
		if (AgentSession.provider(remoteSession) !== this._downstreamProvider || remoteChat.toString() !== buildDefaultChatUri(remoteSession)) {
			throw new Error(localize('remoteAgent.providerDataBacking', "Remote Agent provider data does not identify a valid downstream default chat."));
		}
		const existing = this._bindings.get(chat.toString());
		if (existing) {
			if (existing.providerData !== providerData) {
				throw new Error(localize('remoteAgent.providerDataConflict', "Remote Agent chat is already bound to a different downstream chat."));
			}
			return existing;
		}
		return this._addBinding(chat, remoteSession, remoteChat, providerData, undefined);
	}

	private _restoreResidentChat(resident: IRemoteAgentResidentChat): void {
		const data = parseProviderData(resident.providerData);
		if (data.connectorId !== this.target.connectorId || data.targetId !== this.target.targetId || data.provider !== this._downstreamProvider) {
			throw new Error(localize('remoteAgent.providerDataOwnership', "Remote Agent provider data does not belong to this target and provider."));
		}
		this._addBinding(
			resident.localChat,
			URI.parse(data.session),
			URI.parse(data.chat),
			resident.providerData,
			resident.model,
			resident,
		);
	}

	private _addBinding(
		chat: URI,
		remoteSession: URI,
		remoteChat: URI,
		providerData: string,
		model: ModelSelection | undefined,
		resident?: IRemoteAgentResidentChat,
	): RemoteAgentChatBinding {
		const binding = new RemoteAgentChatBinding(
			chat,
			remoteSession,
			remoteChat,
			providerData,
			model,
			(candidate, action, isOwnAction) => this._acceptAction(candidate, action, isOwnAction),
			(candidate, state) => this._acceptSnapshot(candidate, state),
			(candidate, action) => this._emitProgress(candidate, action),
			this._logService,
			resident,
		);
		this._bindings.set(chat.toString(), binding);
		return binding;
	}

	private _requireBinding(chat: URI): RemoteAgentChatBinding {
		const binding = this._bindings.get(chat.toString());
		if (!binding) {
			throw new Error(localize('remoteAgent.chatNotMaterialized', "Remote Agent chat is not materialized."));
		}
		return binding;
	}

	private _deleteActiveClients(chat: URI): void {
		const prefix = `[${JSON.stringify(chat.toString())},`;
		for (const key of this._activeClients.keys()) {
			if (key.startsWith(prefix)) {
				this._activeClients.delete(key);
			}
		}
	}

	private _findPendingPermissionRequest(requestId: string): RemotePermissionRequest | undefined {
		for (const binding of this._bindings.values()) {
			const activeTurn = (binding.interactionState ?? binding.knownState)?.activeTurn;
			if (!activeTurn || !this._toLocalTurnId(activeTurn.id)) {
				continue;
			}
			const part = activeTurn.responseParts.find(part => part.kind === ResponsePartKind.ToolCall
				&& part.toolCall.status === ToolCallStatus.PendingConfirmation
				&& !binding.hasPendingPermissionResponse(activeTurn.id, part.toolCall.toolCallId)
				&& this._toLocalToolCallId(binding, activeTurn.id, part.toolCall.toolCallId) === requestId);
			if (part?.kind === ResponsePartKind.ToolCall) {
				return {
					binding,
					remoteTurnId: activeTurn.id,
					remoteToolCallId: part.toolCall.toolCallId,
				};
			}
		}
		return undefined;
	}

	private _findPendingToolResultConfirmation(requestId: string): RemotePermissionRequest | undefined {
		for (const binding of this._bindings.values()) {
			const activeTurn = (binding.interactionState ?? binding.knownState)?.activeTurn;
			if (!activeTurn || !this._toLocalTurnId(activeTurn.id)) {
				continue;
			}
			const part = activeTurn.responseParts.find(part => part.kind === ResponsePartKind.ToolCall
				&& part.toolCall.status === ToolCallStatus.PendingResultConfirmation
				&& !binding.hasPendingResultConfirmationResponse(activeTurn.id, part.toolCall.toolCallId)
				&& this._toLocalToolCallId(binding, activeTurn.id, part.toolCall.toolCallId) === requestId);
			if (part?.kind === ResponsePartKind.ToolCall) {
				return {
					binding,
					remoteTurnId: activeTurn.id,
					remoteToolCallId: part.toolCall.toolCallId,
				};
			}
		}
		return undefined;
	}

	private _findPendingInputRequest(requestId: string): RemoteInputRequest | undefined {
		for (const binding of this._bindings.values()) {
			const activeTurn = (binding.interactionState ?? binding.knownState)?.activeTurn;
			if (!activeTurn || !this._toLocalTurnId(activeTurn.id)) {
				continue;
			}
			const part = activeTurn.responseParts.find(part => part.kind === ResponsePartKind.InputRequest
				&& part.response === undefined
				&& !binding.hasPendingInputResponse(activeTurn.id, part.request.id)
				&& this._toLocalInputRequestId(binding, activeTurn.id, part.request.id) === requestId);
			if (part?.kind === ResponsePartKind.InputRequest) {
				return {
					binding,
					remoteTurnId: activeTurn.id,
					remoteRequestId: part.request.id,
				};
			}
		}
		return undefined;
	}

	private _isPendingInputRequest(binding: RemoteAgentChatBinding, remoteRequestId: string): boolean {
		const activeTurn = binding.knownState?.activeTurn;
		if (!activeTurn || !this._toLocalTurnId(activeTurn.id)) {
			return false;
		}
		return activeTurn.responseParts.some(part => part.kind === ResponsePartKind.InputRequest
			&& part.request.id === remoteRequestId
			&& part.response === undefined);
	}

	private _toRemoteTurnId(localTurnId: string): string {
		return `${this._idPrefix('turn')}${localTurnId}`;
	}

	private _toLocalTurnId(remoteTurnId: string): string | undefined {
		const prefix = this._idPrefix('turn');
		return remoteTurnId.startsWith(prefix) ? remoteTurnId.substring(prefix.length) : undefined;
	}

	private _toLocalPartId(remotePartId: string): string {
		return `${this._idPrefix('part')}${remotePartId}`;
	}

	private _toLocalToolCallId(binding: RemoteAgentChatBinding, remoteTurnId: string, remoteToolCallId: string): string {
		return `${this._idPrefix('tool')}${JSON.stringify([binding.remoteChat.toString(), remoteTurnId, remoteToolCallId])}`;
	}

	private _toLocalInputRequestId(binding: RemoteAgentChatBinding, remoteTurnId: string, remoteRequestId: string): string {
		return `${this._idPrefix('input')}${JSON.stringify([binding.remoteChat.toString(), remoteTurnId, remoteRequestId])}`;
	}

	private _toProtectedResourceId(downstreamResource: string): string {
		return URI.from({
			scheme: Schemas.https,
			authority: 'vscode.dev',
			path: `/agent-host/remote/${this.id}/protected-resource`,
			query: JSON.stringify({ resource: downstreamResource }),
		}).toString();
	}

	private _idPrefix(kind: 'turn' | 'part' | 'tool' | 'input'): string {
		return `remote:${this.target.clientId}:${kind}:`;
	}
}
