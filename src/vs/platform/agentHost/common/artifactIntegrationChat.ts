/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableSet, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue, transaction } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { ArtifactPromptReceipt } from '../../artifactIntegrations/common/artifactIntegration.js';
import { ArtifactPromptOutcome, ArtifactPromptRecovery, ArtifactPromptRequest, ArtifactPromptState, ArtifactPromptSubmission, ArtifactPromptTrackingError, IArtifactChatAccess, IArtifactChatObservation, IArtifactPromptHandle, isArtifactPromptOutcome } from '../../artifactIntegrations/common/artifactRuntime.js';
import { AgentHostArtifactRunMetaKey, readArtifactIntegrationRun } from './meta/agentHostArtifactIntegrationMeta.js';
import { ActionEnvelope, ActionType, ChatAction } from './state/sessionActions.js';
import { ChatInteractivity, ChatState, MessageKind, PendingMessageKind, TurnState, parseRequiredSessionUriFromChatUri } from './state/sessionState.js';

export type ArtifactChatAction = Extract<ChatAction, { type: ActionType.ChatTurnStarted | ActionType.ChatPendingMessageSet | ActionType.ChatPendingMessageRemoved | ActionType.ChatTurnCancelled }>;
export type ArtifactChatEvent = Pick<ActionEnvelope, 'channel' | 'action' | 'rejectionReason'>;

export interface IArtifactChatBackend {
	readonly admission: 'atomic' | 'bestEffort';
	readonly available: IObservable<boolean>;
	readonly onDidAction: Event<ArtifactChatEvent>;
	acquireChat(session: string, chat: string): Promise<IReference<IObservable<ChatState | Error | undefined>>>;
	/** Sends once, awaits confirmation, and never replays the action after an ambiguous disconnect. */
	dispatch(chat: string, action: ArtifactChatAction): Promise<void>;
}

export class ArtifactProtocolChatAccess extends Disposable implements IArtifactChatAccess {
	readonly admission: 'atomic' | 'bestEffort';
	private readonly turns = observableValue<ReadonlyMap<string, string>>(this, new Map());
	private readonly cancelled = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly requests = new Map<string, number>();
	private readonly queued = new Set<string>();
	private readonly handles = this._register(new DisposableSet<ArtifactPromptHandle>());
	private readonly recoveries = this._register(new DisposableSet<DisposableStore>());

	constructor(private readonly backend: IArtifactChatBackend) {
		super();
		this.admission = backend.admission;
		this._register(autorun(reader => {
			if (!backend.available.read(reader)) {
				this.queued.clear();
			}
		}));
		this._register(backend.onDidAction(envelope => {
			if (envelope.rejectionReason) {
				return;
			}
			if (envelope.action.type === ActionType.ChatPendingMessageSet && envelope.action.kind === PendingMessageKind.Queued) {
				const key = JSON.stringify([envelope.channel, envelope.action.id]);
				if (this.requests.has(key)) {
					this.queued.add(key);
				}
				return;
			}
			if (envelope.action.type === ActionType.ChatPendingMessageRemoved && envelope.action.kind === PendingMessageKind.Queued) {
				const key = JSON.stringify([envelope.channel, envelope.action.id]);
				if (this.requests.has(key) && this.queued.has(key) && !this.turns.get().has(key)) {
					this.cancelled.set(new Set([...this.cancelled.get(), key]), undefined);
				}
				return;
			}
			if (envelope.action.type !== ActionType.ChatTurnStarted) {
				return;
			}
			const requestId = readArtifactIntegrationRun(envelope.action.message) ?? envelope.action.queuedMessageId;
			if (requestId && this.requests.has(JSON.stringify([envelope.channel, requestId]))) {
				const turns = new Map(this.turns.get());
				turns.set(JSON.stringify([envelope.channel, requestId]), envelope.action.turnId);
				this.turns.set(turns, undefined);
			}
		}));
	}

	observeChat(session: string, chat: string): IArtifactChatObservation {
		const state = observableValue<{ available: boolean; busy: boolean; reason?: string }>(this, { available: false, busy: false, reason: localize('artifactChatLoading', "Loading the artifact's chat.") });
		const store = this.observe(session, chat, value => {
			state.set({
				available: !!value && (value.interactivity === undefined || value.interactivity === ChatInteractivity.Full),
				busy: !!value?.activeTurn || !!value?.steeringMessage || !!value?.queuedMessages?.length,
				reason: !value ? localize('artifactChatUnavailable', "The artifact's chat is unavailable.")
					: value.interactivity !== undefined && value.interactivity !== ChatInteractivity.Full ? localize('artifactChatReadOnly', "The artifact's chat is not writable.") : undefined,
			}, undefined);
		}, error => state.set({ available: false, busy: false, reason: toErrorMessage(error) }, undefined),
		reason => state.set({ available: false, busy: false, reason }, undefined));
		return { state, dispose: () => store.dispose() };
	}

	async submit(request: ArtifactPromptRequest, token: CancellationToken, isCurrent: () => boolean = () => true): Promise<ArtifactPromptSubmission> {
		this.validateDestination(request.session, request.chat);
		let reference: IReference<IObservable<ChatState | Error | undefined>>;
		try {
			reference = await this.backend.acquireChat(request.session, request.chat);
		} catch (error) {
			return { kind: 'notSent', reason: toErrorMessage(error) };
		}
		const retention = this.retainRequest(request);
		try {
			let state: ChatState | undefined;
			try {
				state = this.readChat(reference.object);
			} catch (error) {
				return { kind: 'notSent', reason: toErrorMessage(error) };
			}
			if (this._store.isDisposed || token.isCancellationRequested || !isCurrent() || !this.backend.available.get() || !state || (state.interactivity !== undefined && state.interactivity !== ChatInteractivity.Full)) {
				return { kind: 'notSent', reason: localize('artifactChatNotWritable', "The artifact action is no longer authorized or its chat is not writable.") };
			}
			const existing = this.findReceipt(request, state);
			if (existing) {
				return { kind: 'accepted', handle: this.createHandle(request, existing) };
			}
			if (state.activeTurn || state.steeringMessage || state.queuedMessages?.length) {
				return { kind: 'busy' };
			}
			const message = { text: request.prompt.text, origin: { kind: MessageKind.User }, _meta: { [AgentHostArtifactRunMetaKey]: request.requestId } };
			if (this.admission === 'atomic') {
				await this.backend.dispatch(request.chat, { type: ActionType.ChatTurnStarted, turnId: request.requestId, startedAt: new Date().toISOString(), message });
				return { kind: 'accepted', handle: this.createHandle(request, { kind: 'turn', turnId: request.requestId }) };
			}
			await this.backend.dispatch(request.chat, { type: ActionType.ChatPendingMessageSet, id: request.requestId, kind: PendingMessageKind.Queued, message });
			const receipt: ArtifactPromptReceipt = this.findReceipt(request, this.readChat(reference.object)) ?? { kind: 'queued', queuedMessageId: request.requestId };
			return { kind: 'accepted', handle: this.createHandle(request, receipt) };
		} finally {
			reference.dispose();
			retention.dispose();
		}
	}

	async recover(request: ArtifactPromptRequest, receipt: ArtifactPromptReceipt | undefined, token: CancellationToken): Promise<ArtifactPromptRecovery> {
		this.validateDestination(request.session, request.chat);
		if (token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		if (receipt) {
			return { kind: 'attached', handle: this.createHandle(request, receipt) };
		}
		if (!this.backend.available.get()) {
			return { kind: 'indeterminate', reason: localize('artifactRecoveryDisconnected', "Reconnect to determine whether this artifact prompt was delivered.") };
		}
		const recovery = new DeferredPromise<ArtifactPromptRecovery>();
		const store = new DisposableStore();
		this.recoveries.add(store);
		try {
			store.add(toDisposable(() => { void recovery.cancel(); }));
			store.add(token.onCancellationRequested(() => { void recovery.cancel(); }));
			store.add(this.retainRequest(request));
			store.add(this.observe(request.session, request.chat, state => {
				if (!state || recovery.isSettled) {
					return;
				}
				const receipt = this.findReceipt(request, state);
				void recovery.complete(receipt ? { kind: 'attached', handle: this.createHandle(request, receipt) }
					: { kind: 'indeterminate', reason: localize('artifactPromptUncertain', "The backend cannot determine whether this artifact prompt was delivered. It will not be resent automatically.") });
			}, error => { void recovery.complete({ kind: 'indeterminate', reason: toErrorMessage(error) }); },
			reason => { void recovery.complete({ kind: 'indeterminate', reason }); }));
			return await recovery.p;
		} finally {
			this.recoveries.deleteAndDispose(store);
		}
	}

	private createHandle(request: ArtifactPromptRequest, receipt: ArtifactPromptReceipt): IArtifactPromptHandle {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const handle = new ArtifactPromptHandle(request.requestId, receipt, accept => {
			const store = new DisposableStore();
			store.add(this.retainRequest(request));
			store.add(this.observe(request.session, request.chat, state => {
				if (!state) {
					accept({ kind: 'unavailable', reason: localize('artifactPromptChatLoading', "Waiting for the artifact's chat state.") });
					return;
				}
				const found = this.findReceipt(request, state, receipt);
				const turnId = found?.kind === 'turn' ? found.turnId : receipt.kind === 'turn' ? receipt.turnId : undefined;
				const turn = state.turns.find(turn => turn.id === turnId);
				if (turn) {
					accept({
						kind: turn.state === TurnState.Complete ? 'completed' : turn.state === TurnState.Cancelled ? 'cancelled' : 'failed',
						turnId: turn.id,
						reason: turn.state === TurnState.Complete ? localize('artifactPromptCompleted', "The artifact prompt's turn completed.")
							: turn.state === TurnState.Cancelled ? localize('artifactPromptCancelled', "The artifact prompt was cancelled.")
								: localize('artifactPromptFailed', "The artifact prompt's turn failed."),
					});
				} else if (turnId && state.activeTurn?.id === turnId) {
					accept({ kind: 'running', turnId });
				} else if (this.cancelled.get().has(JSON.stringify([request.chat, request.requestId]))) {
					accept({ kind: 'cancelled', reason: localize('artifactQueuedPromptCancelled', "The queued artifact prompt was cancelled.") });
				} else if (found?.kind === 'queued') {
					accept({ kind: 'submitted' });
				} else {
					accept({ kind: 'indeterminate', reason: localize('artifactPromptMissing', "This artifact prompt is no longer pending, but its turn could not be found.") });
				}
			}, error => accept({ kind: 'indeterminate', reason: toErrorMessage(error) }),
			reason => accept({ kind: 'unavailable', reason })));
			return store;
		}, (receipt, token) => this.cancelSubmission(request, receipt, token), () => this.handles.deleteAndLeak(handle));
		this.handles.add(handle);
		return handle;
	}

	private async cancelSubmission(request: ArtifactPromptRequest, receipt: ArtifactPromptReceipt, token: CancellationToken): Promise<void> {
		this.validateDestination(request.session, request.chat);
		const store = new DisposableStore();
		store.add(this.retainRequest(request));
		try {
			const reference = store.add(await this.backend.acquireChat(request.session, request.chat));
			if (token.isCancellationRequested || this._store.isDisposed) {
				throw new Error('Artifact prompt cancellation was interrupted');
			}
			if (!this.backend.available.get()) {
				throw new Error(localize('artifactCancelDisconnected', "Reconnect before cancelling this artifact prompt."));
			}
			let state = this.readChat(reference.object);
			if (!state) {
				throw new Error(localize('artifactCancelUnavailable', "The artifact's chat is unavailable; cancellation could not be confirmed."));
			}
			const queued = state.queuedMessages?.find(message => message.id === request.requestId);
			if (queued) {
				await this.backend.dispatch(request.chat, { type: ActionType.ChatPendingMessageRemoved, kind: PendingMessageKind.Queued, id: queued.id });
				state = this.readChat(reference.object);
			}
			const found = this.findReceipt(request, state, receipt);
			const turnId = found?.kind === 'turn' ? found.turnId : receipt.kind === 'turn' ? receipt.turnId : undefined;
			if (turnId && state?.activeTurn?.id === turnId) {
				await this.backend.dispatch(request.chat, { type: ActionType.ChatTurnCancelled, turnId, duration: 0 });
			} else if (turnId && state?.turns.some(turn => turn.id === turnId)) {
				return;
			} else if (queued && !found && state) {
				this.cancelled.set(new Set([...this.cancelled.get(), JSON.stringify([request.chat, request.requestId])]), undefined);
			} else {
				throw new Error(localize('artifactCancelUncertain', "The artifact prompt could not be located. Cancellation is not confirmed."));
			}
		} finally {
			store.dispose();
		}
	}

	private findReceipt(request: ArtifactPromptRequest, state: ChatState | undefined, receipt?: ArtifactPromptReceipt): ArtifactPromptReceipt | undefined {
		const turn = [state?.activeTurn, ...state?.turns ?? []].find(turn => turn && (turn.id === request.requestId || readArtifactIntegrationRun(turn.message) === request.requestId || (receipt?.kind === 'turn' && turn.id === receipt.turnId)));
		const turnId = turn?.id ?? this.turns.get().get(JSON.stringify([request.chat, request.requestId]));
		if (turnId) {
			return { kind: 'turn', turnId };
		}
		if (state?.queuedMessages?.some(message => message.id === request.requestId)) {
			const key = JSON.stringify([request.chat, request.requestId]);
			if (this.requests.has(key)) {
				this.queued.add(key);
			}
			return { kind: 'queued', queuedMessageId: request.requestId };
		}
		return undefined;
	}

	private retainRequest(request: ArtifactPromptRequest): IDisposable {
		const key = JSON.stringify([request.chat, request.requestId]);
		this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
		return toDisposable(() => {
			const remaining = this.requests.get(key)! - 1;
			if (remaining > 0) {
				this.requests.set(key, remaining);
				return;
			}
			this.requests.delete(key);
			this.queued.delete(key);
			transaction(tx => {
				const turns = new Map(this.turns.get());
				if (turns.delete(key)) {
					this.turns.set(turns, tx);
				}
				const cancelled = new Set(this.cancelled.get());
				if (cancelled.delete(key)) {
					this.cancelled.set(cancelled, tx);
				}
			});
		});
	}

	private observe(session: string, chat: string, accept: (state: ChatState | undefined) => void, fail: (error: unknown) => void, unavailable: (reason: string) => void): DisposableStore {
		const store = new DisposableStore();
		store.add(autorun(reader => {
			if (!this.backend.available.read(reader)) {
				unavailable(localize('artifactPromptReconnecting', "Waiting to reconnect to the artifact's agent host."));
				return;
			}
			const lifetime = reader.store.add(new DisposableStore());
			void (async () => {
				this.validateDestination(session, chat);
				const reference = lifetime.add(await this.backend.acquireChat(session, chat));
				if (lifetime.isDisposed) {
					return;
				}
				let scheduled = false;
				lifetime.add(autorun(reader => {
					try {
						this.turns.read(reader);
						this.cancelled.read(reader);
						reference.object.read(reader);
						if (!scheduled) {
							scheduled = true;
							// State and queued-message correlation arrive through separate listeners to the same envelope.
							queueMicrotask(() => {
								scheduled = false;
								if (!lifetime.isDisposed) {
									try {
										accept(this.readChat(reference.object));
									} catch (error) {
										fail(error);
									}
								}
							});
						}
					} catch (error) {
						fail(error);
					}
				}));
			})().catch(error => {
				if (!lifetime.isDisposed) {
					fail(error);
				}
			});
		}));
		return store;
	}

	private readChat(state: IObservable<ChatState | Error | undefined>): ChatState | undefined {
		const value = state.get();
		if (value instanceof Error) {
			throw value;
		}
		return value;
	}

	private validateDestination(session: string, chat: string): void {
		if (parseRequiredSessionUriFromChatUri(chat) !== session) {
			throw new Error('Artifact prompt destination belongs to another session');
		}
	}
}

class ArtifactPromptHandle extends Disposable implements IArtifactPromptHandle {
	private readonly tracking = this._register(new MutableDisposable<IDisposable>());
	private readonly stateValue = observableValue<ArtifactPromptState>(this, { kind: 'submitted' });
	readonly state = this.stateValue;
	private completionResult: DeferredPromise<ArtifactPromptOutcome> | undefined;
	private cancellation: Promise<void> | undefined;

	constructor(
		readonly requestId: string,
		private currentReceipt: ArtifactPromptReceipt,
		observe: (accept: (state: ArtifactPromptState) => void) => IDisposable,
		private readonly cancelRequest: (receipt: ArtifactPromptReceipt, token: CancellationToken) => Promise<void>,
		onDispose: () => void,
	) {
		super();
		this._register(toDisposable(onDispose));
		this.tracking.value = observe(state => {
			if (this._store.isDisposed || this.isSettled()) {
				return;
			}
			const turnId = state.kind === 'running' || isArtifactPromptOutcome(state) ? state.turnId : undefined;
			if (turnId) {
				this.currentReceipt = { kind: 'turn', turnId };
			}
			this.settleCompletion(state);
			this.stateValue.set(state, undefined);
			if (this.isSettled()) {
				this.tracking.clear();
			}
		});
		if (this.isSettled()) {
			this.tracking.clear();
		}
	}

	get receipt(): ArtifactPromptReceipt {
		return this.currentReceipt;
	}

	get completion(): Promise<ArtifactPromptOutcome> {
		if (!this.completionResult) {
			this.completionResult = new DeferredPromise<ArtifactPromptOutcome>();
			this.settleCompletion(this.stateValue.get());
			if (this._store.isDisposed && !this.completionResult.isSettled) {
				void this.completionResult.error(new CancellationError());
			}
		}
		return this.completionResult.p;
	}

	private settleCompletion(state: ArtifactPromptState): void {
		if (!this.completionResult || this.completionResult.isSettled) {
			return;
		}
		if (isArtifactPromptOutcome(state)) {
			void this.completionResult.complete(state);
		} else if (state.kind === 'indeterminate') {
			void this.completionResult.error(new ArtifactPromptTrackingError(state.reason));
		}
	}

	async cancel(token: CancellationToken): Promise<void> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		const state = this.stateValue.get();
		if (isArtifactPromptOutcome(state)) {
			return;
		}
		if (state.kind === 'indeterminate') {
			throw new ArtifactPromptTrackingError(state.reason);
		}
		return this.cancellation ??= this.cancelRequest(this.currentReceipt, token).finally(() => this.cancellation = undefined);
	}

	private isSettled(): boolean {
		const state = this.stateValue.get();
		return isArtifactPromptOutcome(state) || state.kind === 'indeterminate';
	}

	override dispose(): void {
		if (this.completionResult && !this.completionResult.isSettled) {
			void this.completionResult.error(new CancellationError());
		}
		super.dispose();
	}
}
