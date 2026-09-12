/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, raceCancellationError, SequencerByKey } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, type Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, type IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession, type IAgent } from '../common/agent.js';
import { InitializeCanvasChatExtensionMethod, type InitializeCanvasChatParams } from '../common/agentHostExtensionProtocol.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { isEqual } from '../../../base/common/resources.js';
import type { IAgentCanvasApprovalClient, IAgentCanvasConnection, IAgentCanvasInstance, IAgentCanvasOperation, IAgentCanvasSnapshot, IAgentCanvases } from '../common/agentHostCanvases.js';
import { AHP_CANVAS_SCHEME, canvasEntry, canvasIdentityKey, canvasSourceKey, invalidCanvasParams, isBoundedCanvasJson, isCanvasIcon, isCanvasIdentity, isCanvasRecord, isCanvasResource, validateCanvasActions, validateCanvasRequest, validateCanvasType } from '../common/agentHostCanvasValidation.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import type { CloseCanvasParams, InvokeCanvasActionParams, InvokeCanvasActionResult, ListCanvasTypesParams, ListCanvasTypesResult, OpenCanvasParams, OpenCanvasResult, ResolveCanvasSourceParams, ResolveCanvasSourceResult, RestartCanvasProviderParams } from '../common/state/protocol/channels-canvas/commands.js';
import { CANVAS_RESULT_MAX_LENGTH, CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasActionDeclaration, type CanvasAvailabilityState, type CanvasIdentityKey, type CanvasSourcePresentation, type CanvasState } from '../common/state/protocol/channels-canvas/state.js';
import { ActionType } from '../common/state/sessionActions.js';
import { AhpErrorCodes, ProtocolError, type IStateSnapshot } from '../common/state/sessionProtocol.js';
import { isChatReadOnly, MessageKind, parseChatUri, SessionStatus, type MessageAttachment, type SessionState } from '../common/state/sessionState.js';
import { AgentHostCanvasOperationLedger, CanvasOperationIndeterminateError } from './agentHostCanvasOperationLedger.js';
import { AgentHostCanvasApproval } from './agentHostCanvasApproval.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { isCanvasSessionRetained, withCanvasSessionRetained } from '../common/meta/agentCanvasSessionMeta.js';
import { IAgentHostClientConnectionService } from './agentHostClientConnectionService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostWorktreeIsolation } from './shared/worktreeIsolation.js';

export const IAgentHostCanvasesService = createDecorator<IAgentHostCanvasesService>('agentHostCanvasesService');
const retainedSessionStorageKey = 'agentHost.canvasSessionRetained';

export interface IAgentHostCanvasConnection extends IAgentCanvasConnection, IDisposable {
	readonly initiator: IAgentCanvasApprovalClient | undefined;
	snapshot(resource: string): IStateSnapshot;
	cancelCanvasChatInitialization(params: InitializeCanvasChatParams): void;
	beginChatCreation(chat: string): IAgentHostCanvasInitializationLease;
}
export interface IAgentHostCanvasInitializationLease extends IAgentCanvasOperation, IDisposable {
	assertValid(): void;
	commit(): void;
}

export interface IAgentHostCanvasTurnPreparation extends IDisposable {
	run(prompt: string): Promise<void>;
	commit(): void;
}

export interface IAgentHostCanvasesService {
	readonly _serviceBrand: undefined;
	readonly available: boolean;
	readonly readiness: Promise<void> | undefined;
	readonly onDidReleaseHold: Event<string>;
	holdsSession(session: string): boolean;
	connect(clientId: string, requestApproval?: IAgentCanvasApprovalClient['requestApproval']): IAgentHostCanvasConnection;
	loadChat(chat: string): Promise<readonly CanvasState[]>;
	persistChat(chat: string): Promise<void>;
	requestApproval(chat: string, message: string, token: CancellationToken, initiatingClientId?: string, initiator?: IAgentCanvasApprovalClient): Promise<boolean>;
	appendAttachments(chat: string, attachments: readonly MessageAttachment[]): void;
	discardPendingAttachments(chat: string): void;
	getChatInitialization(chat: string): IAgentCanvasOperation | undefined;
	beginChatCreation(chat: string): IAgentHostCanvasInitializationLease;
	isChatInitializing(chat: string): boolean;
	cancelChatInitialization(chat: string): void;
	cancelSessionInitialization(session: string): void;
	assertChatInitialization(chat: string): void;
	retainChat(chat: string, token: CancellationToken): Promise<void>;
	needsTurnInitialization(chat: string): boolean;
	prepareForTurn(chat: string, turnId: string, prompt: string, clientId?: string): Promise<void>;
	beginTurnPreparation(chat: string, turnId: string, clientId?: string, initiator?: IAgentCanvasApprovalClient): IAgentHostCanvasTurnPreparation;
	cancelTurnPreparation(chat: string, turnId: string): boolean;
}

type CanvasOperationResult = { kind: 'open'; value: OpenCanvasResult } | { kind: 'action'; value: InvokeCanvasActionResult } | { kind: 'void' };
interface ICanvasCursor {
	readonly chat: string;
	readonly signature: string;
	readonly offset: number;
}

/** Authoritative membership and live projection. Provider facets own execution and source authorization. */
export class AgentHostCanvasesService extends Disposable implements IAgentHostCanvasesService {
	declare readonly _serviceBrand: undefined;
	private readonly _queue = new SequencerByKey<string>();
	private readonly _writes = new SequencerByKey<string>();
	private readonly _generations = new Map<string, string>();
	private readonly _instanceGenerations = new Map<string, string>();
	private readonly _pending = this._register(new DisposableMap<string, IDisposable & { provider: IAgent; snapshot: IAgentCanvasSnapshot; length: number }>());
	private readonly _pendingAttachments = this._register(new DisposableMap<string, IDisposable & { attachments: readonly MessageAttachment[]; length: number }>());
	private readonly _closed = new Map<string, { chat: string; generation: string; instanceGeneration: string }>();
	private readonly _approval: AgentHostCanvasApproval;
	private readonly _holds = new Map<string, number>();
	private readonly _retained = this._register(new DisposableMap<string>());
	private readonly _connections = this._register(new DisposableMap<symbol, DisposableStore>());
	private readonly _onDidReleaseHold = this._register(new Emitter<string>());
	private readonly _initializing = this._register(new DisposableMap<string, IAgentHostCanvasInitializationLease & { cancel(): void }>());
	private readonly _turnPreparations = this._register(new DisposableMap<string, { turnId: string; admitted: boolean; clientId?: string; cancellation: CancellationTokenSource; dispose(): void }>());
	readonly onDidReleaseHold = this._onDidReleaseHold.event;

	constructor(
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostStateManager private readonly _state: AgentHostStateManager,
		@ISessionDataService private readonly _sessionData: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostClientConnectionService clientConnections: IAgentHostClientConnectionService,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
		@IAgentHostAuthenticationService private readonly _authentication: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpoint: IAgentHostGitHubEndpointService,
	) {
		super();
		this._approval = this._register(new AgentHostCanvasApproval(this._state, clientConnections, chat => this.getChatInitialization(chat)));
		this._register(this._providers.registerProviderInitializer(provider => {
			if (!provider.canvases) {
				return Disposable.None;
			}
			const store = new DisposableStore();
			store.add(provider.canvases.onDidChange(snapshot => this._observe(provider, snapshot)));
			store.add(toDisposable(() => {
				for (const [chat, pending] of this._pending) {
					if (pending.provider === provider) {
						this._pending.deleteAndDispose(chat);
					}
				}
				if (!this._store.isDisposed) {
					for (const resource of this._generations.keys()) {
						const canvas = this._state.getCanvasState(resource);
						if (canvas && this._chatOwner(canvas.identity.chat, false).provider === provider.id) {
							this._instanceGenerations.set(resource, generateUuid());
							this._availability(resource, { status: CanvasAvailabilityStatus.NotLoaded });
						}
					}
				}
			}));
			return store;
		}));
		this._register(this._state.onDidRegisterChat(chat => {
			const session = parseChatUri(chat)?.session;
			if (session && this._retained.has(session)) {
				this._state.markSessionUsed(session);
				queueMicrotask(() => this._projectRetention(session));
			}
			const pending = this._pending.get(chat);
			if (pending) {
				this._pending.deleteAndDispose(chat);
				this._observe(pending.provider, pending.snapshot);
			}
		}));
		this._register(this._state.onDidRemoveSession(session => {
			this._retained.deleteAndDispose(session);
			for (const [chat, initialization] of this._initializing) {
				if (parseChatUri(chat)?.session === session) {
					initialization.cancel();
				}
			}
			for (const [chat, preparation] of this._turnPreparations) {
				if (parseChatUri(chat)?.session === session) {
					preparation.cancellation.cancel();
				}
			}
			for (const [key, closed] of this._closed) {
				if (parseChatUri(closed.chat)?.session === session) {
					this._closed.delete(key);
				}
			}
			for (const chat of this._pendingAttachments.keys()) {
				if (parseChatUri(chat)?.session === session) {
					this._pendingAttachments.deleteAndDispose(chat);
				}
			}
			for (const chat of this._pending.keys()) {
				if (parseChatUri(chat)?.session === session) {
					this._pending.deleteAndDispose(chat);
				}
			}
			for (const resource of this._generations.keys()) {
				if (!this._state.getCanvasState(resource)) {
					this._generations.delete(resource);
					this._instanceGenerations.delete(resource);
				}
			}
		}));
		this._register(toDisposable(() => {
			this._generations.clear();
			this._instanceGenerations.clear();
			this._closed.clear();
		}));
		this._register(this._state.onDidMaterializeChat(chat => {
			const pending = this._pendingAttachments.get(chat);
			if (pending) {
				this._pendingAttachments.deleteAndDispose(chat);
				this.appendAttachments(chat, pending.attachments);
			}
		}));
	}

	get available(): boolean {
		return this._providers.getProviders().some(provider => provider.canvases?.available === true);
	}

	get readiness(): Promise<void> | undefined {
		const pending = this._providers.getProviders().flatMap(provider => provider.canvases?.readiness ? [provider.canvases.readiness] : []);
		return pending.length ? Promise.allSettled(pending).then(() => undefined) : undefined;
	}

	holdsSession(session: string): boolean {
		return this._holds.has(session);
	}

	getChatInitialization(chat: string): IAgentCanvasOperation | undefined {
		return this._initializing.get(chat);
	}

	beginChatCreation(chat: string): IAgentHostCanvasInitializationLease {
		return this._beginInitialization(chat, { token: CancellationToken.None, willExecute: () => { } });
	}

	isChatInitializing(chat: string): boolean {
		return this._initializing.has(chat) || this._turnPreparations.get(chat)?.admitted === false;
	}

	cancelChatInitialization(chat: string): void {
		this._initializing.get(chat)?.cancel();
		this._turnPreparations.get(chat)?.cancellation.cancel();
		this._pending.deleteAndDispose(chat);
		this.discardPendingAttachments(chat);
	}

	cancelSessionInitialization(session: string): void {
		for (const chat of new Set([...this._initializing.keys(), ...this._turnPreparations.keys()])) {
			if (parseChatUri(chat)?.session === session) {
				this.cancelChatInitialization(chat);
			}
		}
	}

	assertChatInitialization(chat: string): void {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		this._initializing.get(chat)?.assertValid();
	}

	async retainChat(chat: string, token: CancellationToken): Promise<void> {
		const parsed = parseChatUri(chat);
		if (!parsed || token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		const initialization = this.getChatInitialization(chat);
		const generation = this._state.getChatGeneration(chat);
		if (!initialization && !this._hasChat(chat) || initialization?.token.isCancellationRequested) {
			throw new CancellationError();
		}
		const reference = this._sessionData.openDatabase(URI.parse(parsed.session));
		try {
			await reference.object.setMetadata(retainedSessionStorageKey, 'true');
			if (token.isCancellationRequested || generation !== this._state.getChatGeneration(chat) || initialization && this.getChatInitialization(chat) !== initialization) {
				throw new CancellationError();
			}
			this._rememberRetention(parsed.session);
		} finally {
			reference.dispose();
		}
		if (token.isCancellationRequested || initialization && this.getChatInitialization(chat) !== initialization) {
			throw new CancellationError();
		}
	}

	private _rememberRetention(session: string): void {
		if (this._store.isDisposed) {
			return;
		}
		this._retained.set(session, disposableTimeout(() => this._retained.deleteAndDispose(session), 120_000));
		this._state.markSessionUsed(session);
		if (this._state.getSessionState(session)) {
			this._projectRetention(session);
		}
	}

	private _projectRetention(session: string): void {
		const state = this._state.getSessionState(session);
		if (!state || !this._retained.has(session) || this._store.isDisposed) {
			return;
		}
		this._retained.deleteAndDispose(session);
		this._state.markSessionUsed(session);
		if (!isCanvasSessionRetained(state)) {
			this._state.dispatchServerAction(session, { type: ActionType.SessionMetaChanged, _meta: withCanvasSessionRetained(state._meta) });
		}
	}

	needsTurnInitialization(chat: string): boolean {
		if (!this._hasChat(chat) || this._state.isEphemeralSession(parseChatUri(chat)!.session)) {
			return false;
		}
		const owner = this._chatOwner(chat, false);
		if (isChatReadOnly(this._state.getChatState(chat)?.interactivity, (owner.status & SessionStatus.IsArchived) !== 0)) {
			return false;
		}
		const provider = this._providers.getProvider(owner.provider)?.canvases;
		return !!provider?.available && (provider.defersHostTurnStart === true || !provider.getSnapshot(chat) || this.isChatInitializing(chat) || !!this._state.getActiveTurnId(chat));
	}

	async prepareForTurn(chat: string, turnId: string, prompt: string, clientId?: string): Promise<void> {
		const preparation = this.beginTurnPreparation(chat, turnId, clientId);
		try {
			await preparation.run(prompt);
		} finally {
			preparation.dispose();
		}
	}

	cancelTurnPreparation(chat: string, turnId: string): boolean {
		const preparation = this._turnPreparations.get(chat);
		if (preparation?.turnId !== turnId) {
			return false;
		}
		preparation.cancellation.cancel();
		return true;
	}

	beginTurnPreparation(chat: string, turnId: string, clientId?: string, initiator?: IAgentCanvasApprovalClient): IAgentHostCanvasTurnPreparation {
		if (!this._hasChat(chat) || this._turnPreparations.has(chat) || this._turnPreparations.size >= 128 || this._store.isDisposed || initiator?.token.isCancellationRequested) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'Another host turn is preparing this chat.');
		}
		const store = new DisposableStore();
		const cancellation = new CancellationTokenSource(initiator?.token);
		store.add(toDisposable(() => cancellation.dispose(true)));
		store.add(disposableTimeout(() => cancellation.cancel(), 120_000));
		store.add(this._hold(parseChatUri(chat)!.session));
		const entry = { turnId, admitted: false, clientId, cancellation, dispose: () => store.dispose() };
		const generation = this._state.getChatGeneration(chat);
		this._turnPreparations.set(chat, entry);
		let result: Promise<void> | undefined;
		return {
			run: prompt => result ??= raceCancellationError(this._prepareTurn(chat, prompt, {
				clientId, initiator,
				token: cancellation.token,
				willExecute: () => {
					if (cancellation.token.isCancellationRequested) {
						throw new CancellationError();
					}
				},
			}), cancellation.token),
			commit: () => {
				if (cancellation.token.isCancellationRequested || generation !== this._state.getChatGeneration(chat) || this._state.getActiveTurnId(chat)) {
					throw new CancellationError();
				}
				this._chatOwner(chat, true);
				entry.admitted = true;
			},
			dispose: () => {
				if (this._turnPreparations.get(chat) === entry) {
					this._turnPreparations.deleteAndDispose(chat);
				}
			},
		};
	}

	private async _prepareTurn(chat: string, prompt: string, operation: IAgentCanvasOperation): Promise<void> {
		const store = new DisposableStore();
		try {
			await this._runOperation(chat, operation, () => this._initializeChat(chat, operation, prompt));
			if (this._state.getActiveTurnId(chat)) {
				const idle = new DeferredPromise<void>();
				store.add(this._state.onDidEmitEnvelope(event => {
					if (event.channel === chat && !this._state.getActiveTurnId(chat)) {
						void idle.complete();
					}
				}));
				store.add(disposableTimeout(() => { void idle.error(new ProtocolError(AhpErrorCodes.Conflict, 'The native initialization turn did not finish before host turn admission.')); }, 120_000));
				await raceCancellationError(idle.p, operation.token);
			}
			operation.willExecute();
		} finally {
			store.dispose();
		}
	}

	private _hold(session: string): IDisposable {
		this._holds.set(session, (this._holds.get(session) ?? 0) + 1);
		return toDisposable(() => {
			const remaining = (this._holds.get(session) ?? 1) - 1;
			if (remaining) {
				this._holds.set(session, remaining);
			} else {
				this._holds.delete(session);
				this._onDidReleaseHold.fire(session);
			}
		});
	}

	private _beginInitialization(chat: string, operation: IAgentCanvasOperation): IAgentHostCanvasInitializationLease {
		const parsed = parseChatUri(chat);
		if (!parsed || this._initializing.has(chat) || this._initializing.size >= 128 || operation.token.isCancellationRequested || this._store.isDisposed) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The exact chat cannot acquire an initialization lease.');
		}
		const store = new DisposableStore();
		const cancellation = new CancellationTokenSource(operation.token);
		let committed = false;
		let disposed = false;
		store.add(toDisposable(() => cancellation.dispose(!committed)));
		store.add(this._hold(parsed.session));
		store.add(disposableTimeout(() => cancellation.cancel(), 120_000));
		if (!this._state.getChatState(chat)) {
			store.add(this._state.beginPendingChat(chat));
		}
		const generation = this._state.getChatGeneration(chat);
		const lease: IAgentHostCanvasInitializationLease & { cancel(): void } = {
			...operation,
			token: cancellation.token,
			cancel: () => cancellation.cancel(),
			assertValid: () => {
				if (cancellation.token.isCancellationRequested || generation !== this._state.getChatGeneration(chat)) {
					throw new CancellationError();
				}
			},
			willExecute: () => {
				lease.assertValid();
				operation.willExecute();
			},
			commit: () => {
				if (cancellation.token.isCancellationRequested || generation !== this._state.getChatGeneration(chat) || !this._hasChat(chat)) {
					throw new CancellationError();
				}
				committed = true;
			},
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				if (this._initializing.get(chat) === lease) {
					this._initializing.deleteAndLeak(chat);
				}
				if (!committed) {
					this._pending.deleteAndDispose(chat);
					this.discardPendingAttachments(chat);
				}
				store.dispose();
			},
		};
		this._initializing.set(chat, lease);
		return lease;
	}

	private async _runOperation<T>(chat: string, operation: IAgentCanvasOperation, run: () => Promise<T>): Promise<T> {
		const session = parseChatUri(chat)?.session;
		if (!session) {
			throw invalidCanvasParams('The canvas operation has no owning chat.');
		}
		const hold = this._hold(session);
		return this._queue.queue(chat, async () => {
			try {
				if (operation.token.isCancellationRequested || this._store.isDisposed) {
					throw new CancellationError();
				}
				return await run();
			} finally {
				hold.dispose();
			}
		});
	}

	requestApproval(chat: string, message: string, token: CancellationToken, initiatingClientId?: string, initiator?: IAgentCanvasApprovalClient): Promise<boolean> {
		return this._approval.request(chat, message, token, initiatingClientId, initiator);
	}

	appendAttachments(chat: string, attachments: readonly MessageAttachment[]): void {
		if (!parseChatUri(chat) || attachments.length === 0 || this._store.isDisposed) {
			return;
		}
		const state = this._state.getChatState(chat);
		const combined = [...(state?.draft?.attachments ?? this._pendingAttachments.get(chat)?.attachments ?? []), ...attachments];
		const length = JSON.stringify(combined).length;
		if (combined.length > 64 || length > 16 * 1024 * 1024) {
			return;
		}
		if (!state) {
			if (!this._pendingAttachments.has(chat) && this._pendingAttachments.size >= 64
				|| length + [...this._pendingAttachments].reduce((sum, [key, entry]) => sum + (key === chat ? 0 : entry.length), 0) > 16 * 1024 * 1024) {
				return;
			}
			const store = new DisposableStore();
			this._pendingAttachments.set(chat, { attachments: structuredClone(combined), length, dispose: () => store.dispose() });
			store.add(disposableTimeout(() => this._pendingAttachments.deleteAndDispose(chat), 120_000));
			return;
		}
		const initialization = this.getChatInitialization(chat);
		if (initialization?.token.isCancellationRequested) {
			return;
		}
		if (!initialization) {
			this._provider(chat, true);
		}
		this._state.dispatchServerAction(chat, {
			type: ActionType.ChatDraftChanged,
			draft: {
				...(state.draft ?? { text: '', origin: { kind: MessageKind.User } }),
				attachments: combined,
			},
		});
	}

	discardPendingAttachments(chat: string): void {
		this._pendingAttachments.deleteAndDispose(chat);
	}

	connect(clientId: string, requestApproval?: IAgentCanvasApprovalClient['requestApproval']): IAgentHostCanvasConnection {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const key = Symbol('Canvas connection');
		const store = new DisposableStore();
		this._connections.set(key, store);
		const ledger = store.add(new AgentHostCanvasOperationLedger<CanvasOperationResult>());
		const initiator: IAgentCanvasApprovalClient | undefined = requestApproval ? { clientId, token: ledger.token, requestApproval } : undefined;
		const cursors = new Map<string, ICanvasCursor>();
		store.add(toDisposable(() => cursors.clear()));
		return {
			initiator,
			dispose: () => {
				this._connections.deleteAndDispose(key);
			},
			beginChatCreation: chat => {
				const lease = this._beginInitialization(chat, { clientId, initiator, token: ledger.token, willExecute: () => { } });
				return lease;
			},
			cancelCanvasChatInitialization: params => ledger.cancel(params.requestId, { method: InitializeCanvasChatExtensionMethod, params }),
			initializeCanvasChat: async (params, token) => {
				if (!parseChatUri(params.channel)) {
					throw invalidCanvasParams('Canvas initialization requires an exact chat URI.');
				}
				await ledger.execute(params.requestId, { method: InitializeCanvasChatExtensionMethod, params }, operation => this._runOperation(params.channel, operation, async () => {
					await this._initializeChat(params.channel, { ...operation, clientId: clientId || undefined, initiator });
					return { kind: 'void' };
				}), token);
			},
			snapshot: resource => {
				const state = this._require(resource);
				this._chatOwner(state.identity.chat, false);
				return { resource, state, fromSeq: this._state.serverSeq };
			},
			listCanvasTypes: async params => {
				validateCanvasRequest('listCanvasTypes', params);
				if (ledger.token.isCancellationRequested) {
					throw new CancellationError();
				}
				return this._list(params, cursors);
			},
			resolveCanvasSource: async params => {
				validateCanvasRequest('resolveCanvasSource', params);
				return this._resolve(params, clientId, ledger.token);
			},
			openCanvas: async params => {
				validateCanvasRequest('openCanvas', params);
				const result = await ledger.execute(params.requestId, { method: 'openCanvas', params }, operation => this._runOperation(params.identity.chat, operation, async () => ({ kind: 'open', value: await this._open(params, { ...operation, clientId, initiator }) })));
				if (result.kind !== 'open') {
					throw new Error('Unexpected canvas open result.');
				}
				return result.value;
			},
			invokeCanvasAction: async params => {
				validateCanvasRequest('invokeCanvasAction', params);
				const result = await ledger.execute(params.requestId, { method: 'invokeCanvasAction', params }, operation => {
					const chat = this._require(params.channel).identity.chat;
					return this._runOperation(chat, operation, async () => ({ kind: 'action', value: await this._invoke(params, { ...operation, clientId, initiator }) }));
				});
				if (result.kind !== 'action') {
					throw new Error('Unexpected canvas action result.');
				}
				return result.value;
			},
			closeCanvas: async params => {
				validateCanvasRequest('closeCanvas', params);
				await ledger.execute(params.requestId, { method: 'closeCanvas', params }, async operation => {
					const state = this._state.getCanvasState(params.channel);
					if (state) {
						await this._runOperation(state.identity.chat, operation, () => this._close(params, { ...operation, clientId, initiator }));
					}
					return { kind: 'void' };
				});
			},
			restartCanvasProvider: async params => {
				validateCanvasRequest('restartCanvasProvider', params);
				await ledger.execute(params.requestId, { method: 'restartCanvasProvider', params }, operation => {
					const chat = this._require(params.channel).identity.chat;
					return this._runOperation(chat, operation, async () => { await this._restart(params, { ...operation, clientId, initiator }); return { kind: 'void' }; });
				});
			},
		};
	}

	private async _initializeChat(chat: string, operation: IAgentCanvasOperation, prompt?: string): Promise<void> {
		const provider = this._provider(chat, true);
		if (this._state.isEphemeralSession(parseChatUri(chat)!.session)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'Ephemeral chats do not initialize extension runtimes.');
		}
		if (!provider.available || this._state.getActiveTurnId(chat) && !provider.getSnapshot(chat)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'Canvas initialization requires an idle, eligible chat.');
		}
		const lease = this._beginInitialization(chat, operation);
		try {
			const owner = this._chatOwner(chat, true);
			const session = URI.parse(parseChatUri(chat)!.session);
			const sessionId = AgentSession.id(session);
			let workingDirectories = owner.workingDirectories?.map(directory => URI.parse(directory));
			if (owner.config?.values[SessionConfigKey.Isolation] === 'worktree' && !provider.getSnapshot(chat)) {
				lease.willExecute();
				const resource = prompt === undefined ? undefined : this._gitHubEndpoint.getCopilotResource();
				const githubToken = resource ? this._authentication.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported }) : undefined;
				const resolved = await this._worktree.resolveForInitialization({ sessionUri: session, sessionId, workingDirectory: workingDirectories?.[0], config: owner.config.values, prompt, githubToken });
				this.assertChatInitialization(chat);
				this._chatOwner(chat, true);
				if (!workingDirectories?.[0] || !isEqual(resolved, workingDirectories[0])) {
					workingDirectories = [resolved, ...(workingDirectories?.slice(1) ?? [])];
				}
			}
			await provider.initializeChat(chat, { ...lease, workingDirectories });
			this.assertChatInitialization(chat);
			lease.assertValid();
			if (!this._state.getSnapshot(chat) && !await this._state.resolveChatState(chat)) {
				throw new CancellationError();
			}
			lease.assertValid();
			if (this._provider(chat, true) !== provider) {
				throw new CancellationError();
			}
			const snapshot = provider.getSnapshot(chat);
			if (!snapshot) {
				throw new ProtocolError(AhpErrorCodes.Conflict, 'The exact canvas registry is not ready.');
			}
			await this._applySnapshot(provider, snapshot);
			lease.commit();
		} finally {
			lease.dispose();
		}
	}

	private _list(params: ListCanvasTypesParams, cursors: Map<string, ICanvasCursor>): ListCanvasTypesResult {
		const owner = this._chatOwner(params.channel, false);
		const snapshot = this._providers.getProvider(owner.provider)?.canvases?.getSnapshot(params.channel);
		const types = snapshot?.types ?? [];
		for (const type of types) {
			validateCanvasType(type);
		}
		const signature = JSON.stringify([snapshot?.generation, types]);
		const cursor = params.cursor ? cursors.get(params.cursor) : undefined;
		const offset = params.cursor === undefined ? 0 : cursor?.chat === params.channel && cursor.signature === signature ? cursor.offset : NaN;
		if (!Number.isSafeInteger(offset) || offset < 0 || offset > types.length) {
			throw invalidCanvasParams('The canvas catalogue cursor is no longer valid.');
		}
		const end = Math.min(types.length, offset + (params.limit ?? 64));
		let nextCursor: string | undefined;
		if (end < types.length) {
			nextCursor = generateUuid();
			if (cursors.size >= 128) {
				cursors.delete(cursors.keys().next().value!);
			}
			cursors.set(nextCursor, { chat: params.channel, signature, offset: end });
		}
		return { types: structuredClone(types.slice(offset, end)), ...(nextCursor ? { nextCursor } : {}) };
	}

	private async _open(params: OpenCanvasParams, operation: IAgentCanvasOperation): Promise<OpenCanvasResult> {
		const provider = this._provider(params.identity.chat, true);
		this._assertInstanceNamespace(provider, params.identity);
		if (!provider.getSnapshot(params.identity.chat)) {
			await this._initializeChat(params.identity.chat, operation);
		}
		if (provider.prepare) {
			await raceCancellationError(provider.prepare(params.identity, {
				...operation,
				willExecute: () => {
					if (this._store.isDisposed || operation.token.isCancellationRequested || this._provider(params.identity.chat, true) !== provider) {
						throw new CancellationError();
					}
					operation.willExecute();
				},
			}), operation.token);
		}
		this._assertTrusted(provider, params.identity);
		const snapshot = provider.getSnapshot(params.identity.chat);
		const declaration = snapshot?.types.find(type => type.canvasType === params.identity.canvasType && canvasSourceKey(type.source) === canvasSourceKey(params.identity.source));
		if (!snapshot || !declaration) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'The canvas type is not in this chat\'s live catalogue. Initialize its eligible runtime explicitly first.');
		}
		validateCanvasType(declaration);
		await this._validateInput(provider, params.identity, declaration.openInputSchema, declaration.openInputSchemaRef, params.input);
		const current = this._find(params.identity);
		this._assertInstanceNamespace(provider, params.identity);
		if (!current && this._state.getCanvasState(params.canvas)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The requested canvas resource belongs to another identity.');
		}
		if (!current && this._state.getChatCanvasStates(params.identity.chat).length >= 64) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'This chat has reached its canvas membership limit.');
		}
		this._assertCurrent(provider, params.identity, snapshot.generation, operation);
		this._closed.delete(canvasIdentityKey(params.identity));
		const resource = current?.resource ?? params.canvas;
		if (!current) {
			this._state.registerCanvas({
				resource, identity: { ...this._identity({ ...params.identity, source: declaration.source }), incarnation: generateUuid() }, title: params.title,
				...(params.icon === undefined ? {} : { icon: params.icon }),
				trust: provider.getTrust(params.identity.chat, declaration.source), availability: { status: CanvasAvailabilityStatus.Loading }, revision: 1,
			});
		}
		let started = false;
		try {
			await this.persistChat(params.identity.chat);
			const instance = await raceCancellationError(provider.open(params, {
				...operation,
				willExecute: () => {
					this._assertCurrent(provider, params.identity, snapshot.generation, operation);
					operation.willExecute();
					started = true;
				},
			}), operation.token);
			this._assertCurrent(provider, params.identity, snapshot.generation, operation);
			if (canvasIdentityKey(instance.identity) !== canvasIdentityKey(params.identity)) {
				throw new CanvasOperationIndeterminateError();
			}
			this._record(provider, snapshot.generation, instance, resource);
			await this.persistChat(params.identity.chat);
			return { canvas: canvasEntry(this._require(resource)) };
		} catch (error) {
			if (!started && !current) {
				this._state.removeCanvas(resource);
			} else if (started && this._state.getCanvasState(resource)) {
				this._availability(resource, { status: CanvasAvailabilityStatus.Failed, error: { errorType: 'canvasOpenIndeterminate', message: 'Canvas open did not settle. Reconcile the provider before trying again.' } });
			}
			await this.persistChat(params.identity.chat);
			throw error;
		}
	}

	private async _invoke(params: InvokeCanvasActionParams, operation: IAgentCanvasOperation): Promise<InvokeCanvasActionResult> {
		const state = this._require(params.channel);
		const provider = this._provider(state.identity.chat, true);
		this._assertIncarnation(state, params.incarnation);
		this._assertTrusted(provider, state.identity);
		const action = state.availability.status === CanvasAvailabilityStatus.Ready ? state.availability.actions.find(action => action.id === params.actionId) : undefined;
		if (!action) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'The canvas does not currently declare this action.');
		}
		validateCanvasActions([action]);
		await this._validateInput(provider, state.identity, action.inputSchema, action.inputSchemaRef, params.input);
		const generation = this._generations.get(state.resource);
		const result = await raceCancellationError(provider.invoke(state, params, {
			...operation,
			willExecute: () => {
				this._assertIncarnation(this._require(state.resource), params.incarnation);
				this._assertCurrent(provider, state.identity, generation, operation);
				const live = provider.getSnapshot(state.identity.chat)?.instances.find(instance => canvasIdentityKey(instance.identity) === canvasIdentityKey(state.identity));
				const liveAction = live?.availability.status === CanvasAvailabilityStatus.Ready ? live.availability.actions.find(candidate => candidate.id === params.actionId) : undefined;
				if (!equals(liveAction, action)) {
					throw new ProtocolError(AhpErrorCodes.Conflict, 'The live canvas action declaration changed.');
				}
				operation.willExecute();
			},
		}), operation.token);
		this._assertIncarnation(this._require(state.resource), params.incarnation);
		this._assertCurrent(provider, state.identity, generation, operation);
		if (!isBoundedCanvasJson(result, CANVAS_RESULT_MAX_LENGTH)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The action ran but its result exceeds the inline canvas contract. The provider must return an out-of-band reference.', { outcome: 'indeterminate' });
		}
		return { result };
	}

	private async _resolve(params: ResolveCanvasSourceParams, clientId: string, token: CancellationToken): Promise<ResolveCanvasSourceResult> {
		const state = this._require(params.channel);
		const owner = this._chatOwner(state.identity.chat, false);
		const provider = this._providers.getProvider(owner.provider)?.canvases;
		const generation = this._generations.get(state.resource);
		let source: CanvasSourcePresentation | undefined;
		if (provider && (state.availability.status === CanvasAvailabilityStatus.Ready || state.availability.status === CanvasAvailabilityStatus.Empty)) {
			this._assertTrusted(provider, state.identity);
			source = await provider.resolve(state, clientId, token);
		}
		if (token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		const current = this._require(params.channel);
		if (source && provider) {
			this._assertTrusted(provider, current.identity);
			if (this._provider(current.identity.chat) !== provider || generation !== provider.getSnapshot(current.identity.chat)?.generation || current.revision !== state.revision || current.identity.incarnation !== state.identity.incarnation) {
				source = undefined;
			} else {
				if (typeof source.url !== 'string' || source.url.length > 64 * 1024 || !URL.canParse(source.url)
					|| source.expiresAt !== undefined && (typeof source.expiresAt !== 'string' || source.expiresAt.length > 64 || !Number.isFinite(Date.parse(source.expiresAt)))) {
					throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'The provider returned an invalid canvas presentation.');
				}
				const url = new URL(source.url);
				if (!['http:', 'https:', 'file:'].includes(url.protocol) || url.username || url.password) {
					throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'The provider returned an unsupported canvas presentation.');
				}
				source = source.expiresAt !== undefined && Date.parse(source.expiresAt) <= Date.now() ? undefined : {
					url: source.url, ...(source.expiresAt === undefined ? {} : { expiresAt: source.expiresAt }),
				};
			}
		}
		return { availability: current.availability.status, incarnation: current.identity.incarnation, revision: current.revision, ...(source ? { source } : {}) };
	}

	private async _close(params: CloseCanvasParams, operation: IAgentCanvasOperation): Promise<void> {
		const state = this._state.getCanvasState(params.channel);
		if (!state) {
			return;
		}
		if (state.revision !== params.revision) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas membership changed before close.');
		}
		const owner = this._chatOwner(state.identity.chat, true);
		const provider = this._providers.getProvider(owner.provider)?.canvases;
		const snapshot = provider?.getSnapshot(state.identity.chat);
		const instance = snapshot?.instances.find(instance => canvasIdentityKey(instance.identity) === canvasIdentityKey(state.identity));
		if (snapshot && instance && this._closed.size >= 4096) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'Canvas close bookkeeping is full. Explicit backing recovery is required.');
		}
		if (provider?.available && snapshot && instance && provider.getTrust(state.identity.chat, state.identity.source).status === CanvasTrustStatus.Trusted) {
			await raceCancellationError(provider.close(state, {
				...operation,
				willExecute: () => {
					if (this._require(params.channel).revision !== params.revision) {
						throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas membership changed before close.');
					}
					this._assertCurrent(provider, state.identity, snapshot.generation, operation);
					operation.willExecute();
				},
			}), operation.token);
			const latest = provider.getSnapshot(state.identity.chat);
			const replacement = latest?.instances.find(candidate => canvasIdentityKey(candidate.identity) === canvasIdentityKey(state.identity));
			if (latest && (latest.generation !== snapshot.generation || replacement && (replacement.generation ?? latest.generation) !== (instance.generation ?? snapshot.generation))) {
				throw new CanvasOperationIndeterminateError();
			}
		}
		if (snapshot && instance) {
			this._closed.set(canvasIdentityKey(state.identity), {
				chat: state.identity.chat, generation: snapshot.generation, instanceGeneration: instance.generation ?? snapshot.generation,
			});
		}
		if (operation.token.isCancellationRequested) {
			throw new CanvasOperationIndeterminateError();
		}
		operation.willExecute();
		this._availability(state.resource, { status: CanvasAvailabilityStatus.NotLoaded });
		await this._persistChat(state.identity.chat, state.resource);
		this._state.removeCanvas(state.resource);
		this._generations.delete(state.resource);
		this._instanceGenerations.delete(state.resource);
	}

	private async _restart(params: RestartCanvasProviderParams, operation: IAgentCanvasOperation): Promise<void> {
		const state = this._require(params.channel);
		this._assertIncarnation(state, params.incarnation);
		const provider = this._provider(state.identity.chat, true);
		const generation = provider.getSnapshot(state.identity.chat)?.generation;
		await raceCancellationError(provider.restart(state, {
			...operation,
			willExecute: () => {
				this._assertIncarnation(this._require(state.resource), params.incarnation);
				if (operation.token.isCancellationRequested || this._provider(state.identity.chat, true) !== provider) {
					throw new CancellationError();
				}
				operation.willExecute();
				for (const canvas of this._state.getChatCanvasStates(state.identity.chat)) {
					this._availability(canvas.resource, { status: CanvasAvailabilityStatus.Loading });
				}
			},
		}), operation.token);
		const snapshot = provider.getSnapshot(state.identity.chat);
		if (!snapshot || snapshot.generation === generation || operation.token.isCancellationRequested) {
			throw new CanvasOperationIndeterminateError();
		}
		await this._applySnapshot(provider, snapshot);
	}

	private _observe(provider: IAgent, snapshot: IAgentCanvasSnapshot): void {
		if (!parseChatUri(snapshot.chat) || snapshot.instances.length > 64 || snapshot.types.length > 1024) {
			this._logService.warn('[Canvases] Rejected an invalid provider observation.');
			this._rejectObservation(provider, snapshot.chat);
			return;
		}
		if (!this._hasChat(snapshot.chat)) {
			const initialization = this._initializing.get(snapshot.chat);
			const owner = parseChatUri(snapshot.chat)?.session;
			if (!initialization || initialization.token.isCancellationRequested || !owner || this._providers.getProviderForSession(owner) !== provider) {
				return;
			}
			try {
				const length = JSON.stringify(snapshot).length;
				if (length <= 8 * 1024 * 1024 && (this._pending.has(snapshot.chat) || this._pending.size < 128)
					&& length + [...this._pending].reduce((sum, [chat, entry]) => sum + (chat === snapshot.chat ? 0 : entry.length), 0) <= 16 * 1024 * 1024) {
					const store = new DisposableStore();
					this._pending.set(snapshot.chat, { provider, snapshot, length, dispose: () => store.dispose() });
					store.add(disposableTimeout(() => this._pending.deleteAndDispose(snapshot.chat), 120_000));
				}
			} catch {
				this._logService.warn('[Canvases] Rejected an invalid early provider observation.');
			}
			return;
		}
		void this._queue.queue(snapshot.chat, async () => {
			const live = provider.canvases?.getSnapshot(snapshot.chat);
			if (!provider.canvases || this._provider(snapshot.chat) !== provider.canvases || (live ? live !== snapshot : snapshot.instances.length > 0 || snapshot.types.length > 0)) {
				return;
			}
			await this._applySnapshot(provider.canvases, snapshot);
		}).catch(() => {
			this._logService.warn('[Canvases] A provider observation could not be projected.');
			this._rejectObservation(provider, snapshot.chat);
		});
	}

	private _rejectObservation(provider: IAgent, chat: string): void {
		if (this._store.isDisposed || !this._hasChat(chat) || this._providers.getProvider(this._chatOwner(chat, false).provider) !== provider) {
			return;
		}
		for (const state of this._state.getChatCanvasStates(chat)) {
			this._instanceGenerations.set(state.resource, generateUuid());
			this._availability(state.resource, { status: CanvasAvailabilityStatus.Failed, error: { errorType: 'canvasObservationRejected', message: localize('canvas.observationRejected', "The canvas state could not be reconciled. Explicit backing recovery is required.") } });
		}
	}

	private async _applySnapshot(provider: IAgentCanvases, snapshot: IAgentCanvasSnapshot): Promise<void> {
		if (this._store.isDisposed || !this._hasChat(snapshot.chat)) {
			return;
		}
		const identities = new Set<string>();
		const instanceIds = new Set<string>();
		const declaredTypes = new Set<string>();
		const closedKeys = new Set<string>();
		if (typeof snapshot.generation !== 'string' || !snapshot.generation.length || snapshot.generation.length > 256
			|| snapshot.instances.length > 64 || snapshot.types.length > 1024 || (snapshot.closed?.length ?? 0) > 1024) {
			throw invalidCanvasParams('The provider snapshot exceeds the canvas bound.');
		}
		for (const type of snapshot.types) {
			validateCanvasType(type);
			const key = JSON.stringify([canvasSourceKey(type.source), type.canvasType]);
			if (declaredTypes.has(key)) {
				throw invalidCanvasParams('The provider snapshot repeats a canvas type.');
			}
			declaredTypes.add(key);
		}
		for (const closed of snapshot.closed ?? []) {
			if (!isCanvasIdentity(closed) || closed.chat !== snapshot.chat || closedKeys.has(canvasIdentityKey(closed))) {
				throw invalidCanvasParams('The provider snapshot contains an invalid native close.');
			}
			closedKeys.add(canvasIdentityKey(closed));
		}
		const memberships = new Set(this._state.getChatCanvasStates(snapshot.chat).map(state => canvasIdentityKey(state.identity)).filter(key => !closedKeys.has(key)));
		for (const instance of snapshot.instances) {
			this._validateInstance(instance, snapshot.chat);
			this._assertInstanceNamespace(provider, instance.identity, closedKeys);
			const key = canvasIdentityKey(instance.identity);
			if (identities.has(key) || closedKeys.has(key) || provider.instanceIdScope === 'chat' && instanceIds.has(instance.identity.instanceId)) {
				throw invalidCanvasParams('The provider snapshot repeats a native canvas identity.');
			}
			identities.add(key);
			instanceIds.add(instance.identity.instanceId);
			const closed = this._closed.get(key);
			if (declaredTypes.has(JSON.stringify([canvasSourceKey(instance.identity.source), instance.identity.canvasType]))
				&& provider.getTrust(snapshot.chat, instance.identity.source).status === CanvasTrustStatus.Trusted
				&& !(closed && closed.generation === snapshot.generation && closed.instanceGeneration === (instance.generation ?? snapshot.generation))) {
				memberships.add(key);
			}
		}
		if (memberships.size > 64) {
			throw invalidCanvasParams('The provider observation exceeds the canvas membership bound.');
		}
		const observed = new Set<string>();
		for (const closed of snapshot.closed ?? []) {
			this._closed.delete(canvasIdentityKey(closed));
			const current = this._find(closed);
			if (current) {
				this._availability(current.resource, { status: CanvasAvailabilityStatus.NotLoaded });
				this._state.removeCanvas(current.resource);
				this._generations.delete(current.resource);
				this._instanceGenerations.delete(current.resource);
			}
		}
		for (const instance of snapshot.instances) {
			const key = canvasIdentityKey(instance.identity);
			observed.add(key);
			const closed = this._closed.get(key);
			if (closed) {
				if (closed.generation === snapshot.generation && closed.instanceGeneration === (instance.generation ?? snapshot.generation)) {
					continue;
				}
				this._closed.delete(key);
			}
			if (provider.getTrust(snapshot.chat, instance.identity.source).status !== CanvasTrustStatus.Trusted && !this._find(instance.identity)) {
				continue;
			}
			const declaration = snapshot.types.find(type => type.canvasType === instance.identity.canvasType && canvasSourceKey(type.source) === canvasSourceKey(instance.identity.source));
			if (!declaration) {
				const current = this._find(instance.identity);
				if (current) {
					this._availability(current.resource, { status: CanvasAvailabilityStatus.NotLoaded });
				}
				continue;
			}
			validateCanvasType(declaration);
			this._record(provider, snapshot.generation, instance);
		}
		for (const state of this._state.getChatCanvasStates(snapshot.chat)) {
			const trust = provider.getTrust(snapshot.chat, state.identity.source);
			if (!equals(state.trust, trust)) {
				this._state.dispatchServerAction(state.resource, { type: ActionType.CanvasTrustChanged, trust, revision: state.revision + 1 });
			}
			if (!observed.has(canvasIdentityKey(state.identity))) {
				this._availability(state.resource, { status: CanvasAvailabilityStatus.NotLoaded });
			}
		}
		await this.persistChat(snapshot.chat);
	}

	private _record(provider: IAgentCanvases, generation: string, instance: IAgentCanvasInstance, preferredResource?: string): void {
		this._validateInstance(instance, instance.identity.chat);
		this._assertInstanceNamespace(provider, instance.identity);
		let current = this._find(instance.identity);
		if (typeof instance.title !== 'string' || instance.title.length > 4096 || instance.icon !== undefined && !isCanvasIcon(instance.icon)
			|| !current && this._state.getChatCanvasStates(instance.identity.chat).length >= 64) {
			throw invalidCanvasParams('The native canvas metadata exceeds its bound.');
		}
		const resource = current?.resource ?? preferredResource ?? `${AHP_CANVAS_SCHEME}:/${generateUuid()}`;
		if (!current) {
			this._state.registerCanvas({
				resource, identity: { ...this._identity(instance.identity), incarnation: generateUuid() }, title: instance.title,
				...(instance.icon === undefined ? {} : { icon: instance.icon }),
				trust: provider.getTrust(instance.identity.chat, instance.identity.source), availability: structuredClone(instance.availability), revision: 1,
			});
		} else {
			const previousGeneration = this._instanceGenerations.get(resource);
			if (previousGeneration !== undefined && previousGeneration !== (instance.generation ?? generation)) {
				this._availability(resource, { status: CanvasAvailabilityStatus.Loading });
				current = this._require(resource);
				this._state.dispatchServerAction(resource, { type: ActionType.CanvasIncarnationChanged, incarnation: generateUuid(), revision: current.revision + 1 });
			}
			current = this._require(resource);
			if (current.title !== instance.title) {
				this._state.dispatchServerAction(resource, { type: ActionType.CanvasTitleChanged, title: instance.title, revision: current.revision + 1 });
			}
			this._availability(resource, instance.availability);
			current = this._require(resource);
			const trust = provider.getTrust(instance.identity.chat, instance.identity.source);
			if (!equals(trust, current.trust)) {
				this._state.dispatchServerAction(resource, { type: ActionType.CanvasTrustChanged, trust, revision: current.revision + 1 });
			}
		}
		this._generations.set(resource, generation);
		this._instanceGenerations.set(resource, instance.generation ?? generation);
		const session = parseChatUri(instance.identity.chat)?.session;
		if (session) {
			this._state.markSessionUsed(session);
		}
	}

	private _availability(resource: string, availability: CanvasAvailabilityState): void {
		const current = this._require(resource);
		if (!equals(current.availability, availability)) {
			this._state.dispatchServerAction(resource, { type: ActionType.CanvasAvailabilityChanged, availability: structuredClone(availability), revision: current.revision + 1 });
		}
	}

	private _hasChat(chat: string): boolean {
		const session = parseChatUri(chat)?.session;
		return !!session && this._state.getSessionState(session)?.chats.some(candidate => candidate.resource === chat) === true;
	}

	private _provider(chat: string, writable = false): IAgentCanvases {
		const state = this._chatOwner(chat, writable);
		const provider = this._providers.getProvider(state.provider)?.canvases;
		if (!provider) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'The owning provider does not support canvases.');
		}
		return provider;
	}

	private _chatOwner(chat: string, writable: boolean): SessionState {
		const parsed = parseChatUri(chat);
		const state = parsed ? this._state.getSessionState(parsed.session) : undefined;
		const summary = state?.chats.find(candidate => candidate.resource === chat);
		if (!state || !summary) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'The canvas backing chat is not registered.');
		}
		if (writable && isChatReadOnly(summary.interactivity, (state.status & SessionStatus.IsArchived) !== 0)) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'The canvas backing chat is read-only or archived.');
		}
		return state;
	}

	private _assertInstanceNamespace(provider: IAgentCanvases, identity: CanvasIdentityKey, closed?: ReadonlySet<string>): void {
		if (provider.instanceIdScope === 'chat' && this._state.getChatCanvasStates(identity.chat).some(state => !closed?.has(canvasIdentityKey(state.identity)) && state.identity.instanceId === identity.instanceId && canvasIdentityKey(state.identity) !== canvasIdentityKey(identity))) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The native instance ID is already owned by another source or canvas type in this chat.');
		}
	}

	private _validateInstance(instance: IAgentCanvasInstance, chat: string): void {
		if (!isCanvasIdentity(instance.identity) || instance.identity.chat !== chat
			|| typeof instance.title !== 'string' || instance.title.length > 4096 || instance.icon !== undefined && !isCanvasIcon(instance.icon)
			|| instance.generation !== undefined && (typeof instance.generation !== 'string' || !instance.generation.length || instance.generation.length > 512)
			|| !isCanvasRecord(instance.availability) || !['unsupported', 'notLoaded', 'loading', 'empty', 'ready', 'failed'].includes(instance.availability.status)) {
			throw invalidCanvasParams('The provider snapshot contains invalid canvas metadata.');
		}
		if (instance.availability.status === CanvasAvailabilityStatus.Ready) {
			validateCanvasActions(instance.availability.actions);
		} else if (instance.availability.status === CanvasAvailabilityStatus.Failed
			&& (!isCanvasRecord(instance.availability.error) || typeof instance.availability.error.message !== 'string'
				|| instance.availability.error.message.length > 8192 || !isBoundedCanvasJson(instance.availability.error, 16384))) {
			throw invalidCanvasParams('The provider snapshot contains an invalid canvas failure.');
		}
	}

	private _find(identity: CanvasIdentityKey): CanvasState | undefined {
		const key = canvasIdentityKey(identity);
		return this._state.getChatCanvasStates(identity.chat).find(state => canvasIdentityKey(state.identity) === key);
	}

	private _require(resource: string): CanvasState {
		const state = this._state.getCanvasState(resource);
		if (!state) {
			throw new ProtocolError(AhpErrorCodes.NotFound, 'Canvas membership was not found.');
		}
		return state;
	}

	private _assertTrusted(provider: IAgentCanvases, identity: CanvasIdentityKey): void {
		if (provider.getTrust(identity.chat, identity.source).status !== CanvasTrustStatus.Trusted) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Canvas source execution has not been admitted.');
		}
	}

	private _assertIncarnation(state: CanvasState, incarnation: string): void {
		if (state.identity.incarnation !== incarnation) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas endpoint incarnation changed.');
		}
	}

	private _assertCurrent(provider: IAgentCanvases, identity: CanvasIdentityKey, generation: string | undefined, operation: IAgentCanvasOperation): void {
		if (this._store.isDisposed || operation.token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this._provider(identity.chat, true) !== provider || provider.getSnapshot(identity.chat)?.generation !== generation) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'The canvas backing changed.');
		}
		this._assertTrusted(provider, identity);
	}

	private async _validateInput(provider: IAgentCanvases, identity: CanvasIdentityKey, schema: CanvasActionDeclaration['inputSchema'], reference: string | undefined, input: unknown): Promise<void> {
		const resolved = reference === undefined ? schema : await provider.resolveSchema?.(identity.chat, identity.source, reference);
		if (reference !== undefined && resolved === undefined) {
			throw invalidCanvasParams('The canvas schema reference is not available from its owning provider.');
		}
		if (resolved !== undefined) {
			if (!isCanvasRecord(resolved) || !isBoundedCanvasJson(resolved, 1024 * 1024)) {
				throw invalidCanvasParams('The resolved canvas schema is invalid or exceeds the supported reference bound.');
			}
			await provider.validateInput(identity.chat, identity.source, resolved, input);
		}
	}

	async loadChat(chat: string): Promise<readonly CanvasState[]> {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			return [];
		}
		const reference = await this._sessionData.tryOpenDatabase(URI.parse(parsed.session));
		if (!reference) {
			return [];
		}
		try {
			if (await reference.object.getMetadata(retainedSessionStorageKey) === 'true') {
				this._rememberRetention(parsed.session);
			}
			const serialized = await reference.object.getMetadata(this._storageKey(chat));
			const entries: unknown = serialized && serialized.length <= 1024 * 1024 ? JSON.parse(serialized) : [];
			if (!Array.isArray(entries) || entries.length > 64) {
				throw invalidCanvasParams('Invalid persisted canvas membership.');
			}
			const identities = new Set<string>();
			const resources = new Set<string>();
			return entries.map((entry): CanvasState => {
				if (!isCanvasRecord(entry) || !isCanvasResource(entry.resource) || !isCanvasIdentity(entry.identity) || entry.identity.chat !== chat
					|| typeof entry.title !== 'string' || entry.title.length > 4096 || typeof entry.revision !== 'number' || !Number.isSafeInteger(entry.revision) || entry.revision < 0 || entry.revision >= Number.MAX_SAFE_INTEGER
					|| entry.icon !== undefined && !isCanvasIcon(entry.icon)) {
					throw invalidCanvasParams('Invalid persisted canvas identity.');
				}
				const key = canvasIdentityKey(entry.identity);
				if (identities.has(key) || resources.has(entry.resource)) {
					throw invalidCanvasParams('Duplicate persisted canvas identity.');
				}
				identities.add(key);
				resources.add(entry.resource);
				return {
					resource: entry.resource, identity: { ...this._identity(entry.identity), incarnation: generateUuid() }, title: entry.title,
					...(isCanvasIcon(entry.icon) ? { icon: entry.icon } : {}),
					trust: { status: CanvasTrustStatus.Pending }, availability: { status: CanvasAvailabilityStatus.NotLoaded }, revision: entry.revision + 1,
				};
			});
		} catch {
			this._logService.warn('[Canvases] Could not restore invalid canvas membership.');
			return [];
		} finally {
			reference.dispose();
		}
	}

	persistChat(chat: string): Promise<void> {
		if (!this._hasChat(chat)) {
			this._pending.deleteAndDispose(chat);
			this.discardPendingAttachments(chat);
			for (const [key, closed] of this._closed) {
				if (closed.chat === chat) {
					this._closed.delete(key);
				}
			}
			for (const resource of this._generations.keys()) {
				if (!this._state.getCanvasState(resource)) {
					this._generations.delete(resource);
					this._instanceGenerations.delete(resource);
				}
			}
		}
		return this._persistChat(chat);
	}

	private _persistChat(chat: string, omittedResource?: string): Promise<void> {
		const parsed = parseChatUri(chat);
		if (!parsed) {
			return Promise.resolve();
		}
		const membership = this._state.getChatCanvasStates(chat).filter(state => state.resource !== omittedResource).map(state => ({
			resource: state.resource, identity: this._identity(state.identity), title: state.title, revision: state.revision,
			...(state.icon ? { icon: state.icon } : {}),
		}));
		return this._writes.queue(chat, async () => {
			if (!this._state.getSessionState(parsed.session)) {
				return;
			}
			const reference = this._hasChat(chat) ? this._sessionData.openDatabase(URI.parse(parsed.session)) : await this._sessionData.tryOpenDatabase(URI.parse(parsed.session));
			if (!reference) {
				return;
			}
			try {
				await reference.object.setMetadata(this._storageKey(chat), JSON.stringify(membership));
			} finally {
				reference.dispose();
			}
		});
	}

	private _storageKey(chat: string): string {
		return `canvases.v1.${chat}`;
	}

	private _identity(identity: CanvasIdentityKey): CanvasIdentityKey {
		const source = identity.source.kind === CanvasSourceKind.Extension
			? { kind: CanvasSourceKind.Extension, extensionId: identity.source.extensionId } as const
			: { kind: CanvasSourceKind.Package, sourceId: identity.source.sourceId, packageName: identity.source.packageName } as const;
		return { chat: identity.chat, source, canvasType: identity.canvasType, instanceId: identity.instanceId };
	}
}
