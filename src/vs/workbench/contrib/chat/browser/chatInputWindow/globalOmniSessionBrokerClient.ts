/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable, Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { parse, stringify } from '../../../../../base/common/marshalling.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatSendRequestOptions } from '../../common/chatService/chatService.js';
import { UserSelectedTools } from '../../common/participants/chatAgents.js';
import { ChatSessionRoutingDispatchReasonCode, IAdditionalRoutableSession, IChatSessionRoutingDispatchResult } from '../../common/sessionRouter.js';
import { decodeGlobalOmniSessionCandidateId, GlobalOmniSessionBrokerModel, IGlobalOmniSessionSnapshot, IGlobalOmniSessionSnapshotEntry } from './globalOmniSessionBrokerModel.js';

const DEFAULT_HEARTBEAT_INTERVAL = 5_000;
const DEFAULT_SOURCE_EXPIRY = 15_000;
const DEFAULT_DISPATCH_TIMEOUT = 15_000;

interface IGlobalOmniSessionHelloMessage {
	readonly type: 'hello';
	readonly profileId: string;
	readonly sourceId: string;
	readonly sentAt: number;
}

interface IGlobalOmniSessionSnapshotMessage extends IGlobalOmniSessionSnapshot {
	readonly type: 'snapshot';
}

interface IGlobalOmniSessionHeartbeatMessage {
	readonly type: 'heartbeat';
	readonly profileId: string;
	readonly sourceId: string;
	readonly sentAt: number;
}

interface IGlobalOmniSessionGoodbyeMessage {
	readonly type: 'goodbye';
	readonly profileId: string;
	readonly sourceId: string;
	readonly sentAt: number;
}

interface IGlobalOmniSessionDispatchRequestMessage {
	readonly type: 'dispatchRequest';
	readonly profileId: string;
	readonly sourceId: string;
	readonly targetSourceId: string;
	readonly requestId: string;
	readonly candidateId: string;
	readonly resource: string;
	readonly message: string;
	readonly serializedOptions: string;
}

interface IGlobalOmniSessionDispatchCancelMessage {
	readonly type: 'dispatchCancel';
	readonly profileId: string;
	readonly sourceId: string;
	readonly targetSourceId: string;
	readonly requestId: string;
}

interface IGlobalOmniSessionWireDispatchResult {
	readonly status: 'sent' | 'queued' | 'rejected';
	readonly resource?: string;
	readonly requestId?: string;
	readonly reason?: string;
	readonly reasonCode?: ChatSessionRoutingDispatchReasonCode;
}

interface IGlobalOmniSessionDispatchResultMessage {
	readonly type: 'dispatchResult' | 'dispatchCompletion';
	readonly profileId: string;
	readonly sourceId: string;
	readonly targetSourceId: string;
	readonly requestId: string;
	readonly result: IGlobalOmniSessionWireDispatchResult;
}

export type GlobalOmniSessionBrokerMessage =
	| IGlobalOmniSessionHelloMessage
	| IGlobalOmniSessionSnapshotMessage
	| IGlobalOmniSessionHeartbeatMessage
	| IGlobalOmniSessionGoodbyeMessage
	| IGlobalOmniSessionDispatchRequestMessage
	| IGlobalOmniSessionDispatchCancelMessage
	| IGlobalOmniSessionDispatchResultMessage;

export interface IGlobalOmniSessionBrokerChannel extends IDisposable {
	readonly onDidReceiveData: Event<GlobalOmniSessionBrokerMessage>;
	postData(message: GlobalOmniSessionBrokerMessage): void;
}

export interface IGlobalOmniSessionBrokerClientTimings {
	readonly heartbeatInterval?: number;
	readonly sourceExpiry?: number;
	readonly dispatchTimeout?: number;
}

interface IGlobalOmniSessionBrokerTimers {
	setInterval(callback: () => void, delay: number): ReturnType<typeof globalThis.setInterval>;
	clearInterval(handle: ReturnType<typeof globalThis.setInterval>): void;
	setTimeout(callback: () => void, delay: number): ReturnType<typeof globalThis.setTimeout>;
	clearTimeout(handle: ReturnType<typeof globalThis.setTimeout>): void;
}

const defaultTimers: IGlobalOmniSessionBrokerTimers = {
	setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
	clearInterval: handle => globalThis.clearInterval(handle),
	setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
	clearTimeout: handle => globalThis.clearTimeout(handle),
};

interface ISerializedChatSendRequestOptions extends Omit<IChatSendRequestOptions, 'attachedContext' | 'resolvedVariables' | 'userSelectedTools'> {
	readonly attachedContext?: IChatRequestVariableEntry[];
	readonly resolvedVariables?: IChatRequestVariableEntry[];
	readonly userSelectedTools?: UserSelectedTools;
}

interface IPendingDispatch {
	readonly targetSourceId: string;
	readonly resource: URI;
	readonly deferred: DeferredPromise<IChatSessionRoutingDispatchResult>;
	readonly disposables: DisposableStore;
}

interface IPendingCompletion {
	readonly targetSourceId: string;
	readonly resource: URI;
	readonly deferred: DeferredPromise<IChatSessionRoutingDispatchResult>;
}

export function serializeGlobalOmniSessionRequestOptions(options: IChatSendRequestOptions): string {
	const { attachedContext, resolvedVariables, userSelectedTools, ...rest } = options;
	const serialized: ISerializedChatSendRequestOptions = {
		...rest,
		attachedContext: attachedContext?.map(IChatRequestVariableEntry.toExport),
		resolvedVariables: resolvedVariables?.map(IChatRequestVariableEntry.toExport),
		userSelectedTools: userSelectedTools?.get(),
	};
	return stringify(serialized);
}

export function deserializeGlobalOmniSessionRequestOptions(serialized: string): IChatSendRequestOptions {
	const parsed: ISerializedChatSendRequestOptions = parse(serialized);
	return {
		...parsed,
		attachedContext: parsed.attachedContext?.map(IChatRequestVariableEntry.fromExport),
		resolvedVariables: parsed.resolvedVariables?.map(IChatRequestVariableEntry.fromExport),
		userSelectedTools: parsed.userSelectedTools ? constObservable(parsed.userSelectedTools) : undefined,
	};
}

export class GlobalOmniSessionBrokerClient extends Disposable {

	private readonly _model: GlobalOmniSessionBrokerModel;
	private readonly _heartbeatInterval: number;
	private readonly _sourceExpiry: number;
	private readonly _dispatchTimeout: number;
	private readonly _pendingDispatches = new Map<string, IPendingDispatch>();
	private readonly _pendingCompletions = new Map<string, IPendingCompletion>();
	private readonly _incomingDispatches = new Map<string, CancellationTokenSource>();
	private readonly _localSessions = new Map<string, IGlobalOmniSessionSnapshotEntry>();
	private _isDisposed = false;

	constructor(
		readonly profileId: string,
		readonly sourceId: string,
		private readonly channel: IGlobalOmniSessionBrokerChannel,
		private readonly sendRequest: (resource: URI, message: string, options: IChatSendRequestOptions, token: CancellationToken) => Promise<IChatSessionRoutingDispatchResult>,
		private readonly onError: (error: unknown) => void,
		timings: IGlobalOmniSessionBrokerClientTimings = {},
		private readonly now: () => number = Date.now,
		private readonly timers: IGlobalOmniSessionBrokerTimers = defaultTimers,
	) {
		super();
		this._model = new GlobalOmniSessionBrokerModel(profileId, sourceId);
		this._heartbeatInterval = timings.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
		this._sourceExpiry = timings.sourceExpiry ?? DEFAULT_SOURCE_EXPIRY;
		this._dispatchTimeout = timings.dispatchTimeout ?? DEFAULT_DISPATCH_TIMEOUT;
		this._register(channel);
		this._register(channel.onDidReceiveData(message => this._handleMessage(message)));
		const heartbeatHandle = this.timers.setInterval(() => this._heartbeat(), this._heartbeatInterval);
		this._register(toDisposable(() => this.timers.clearInterval(heartbeatHandle)));
		this._post({ type: 'hello', profileId, sourceId, sentAt: this.now() });
	}

	updateLocalSnapshot(sessions: readonly IGlobalOmniSessionSnapshotEntry[]): void {
		this._localSessions.clear();
		for (const session of sessions) {
			this._localSessions.set(session.resource, session);
		}
		this._publishSnapshot();
	}

	getAdditionalCandidates(localSessionResources: readonly string[]): readonly IAdditionalRoutableSession[] {
		return this._model.getCandidates(localSessionResources);
	}

	async dispatch(
		candidateId: string,
		message: string,
		options: IChatSendRequestOptions,
		token: CancellationToken,
	): Promise<IChatSessionRoutingDispatchResult | undefined> {
		const identity = decodeGlobalOmniSessionCandidateId(candidateId);
		if (!identity) {
			return undefined;
		}
		const candidate = this._model.getCandidate(candidateId);
		if (!candidate || !this._model.hasSource(identity.sourceId)) {
			return this._sourceUnavailable(candidate?.rawSessionResource);
		}
		if (token.isCancellationRequested) {
			return this._cancelled(candidate.rawSessionResource);
		}
		let serializedOptions: string;
		try {
			serializedOptions = serializeGlobalOmniSessionRequestOptions(options);
		} catch (error) {
			this.onError(error);
			return {
				status: 'rejected',
				resource: candidate.rawSessionResource,
				reason: 'The routed request options could not be encoded.',
			};
		}

		const requestId = generateUuid();
		const deferred = new DeferredPromise<IChatSessionRoutingDispatchResult>();
		const disposables = new DisposableStore();
		const pending: IPendingDispatch = {
			targetSourceId: identity.sourceId,
			resource: candidate.rawSessionResource,
			deferred,
			disposables,
		};
		this._pendingDispatches.set(requestId, pending);
		disposables.add(token.onCancellationRequested(() => {
			this._post({
				type: 'dispatchCancel',
				profileId: this.profileId,
				sourceId: this.sourceId,
				targetSourceId: identity.sourceId,
				requestId,
			});
			this._completePendingDispatch(requestId, this._cancelled(candidate.rawSessionResource));
		}));
		const timeoutHandle = this.timers.setTimeout(() => {
			this._post({
				type: 'dispatchCancel',
				profileId: this.profileId,
				sourceId: this.sourceId,
				targetSourceId: identity.sourceId,
				requestId,
			});
			this._completePendingDispatch(requestId, {
				status: 'rejected',
				resource: candidate.rawSessionResource,
				reason: 'Timed out waiting for the source window.',
				reasonCode: 'cancelled',
			});
		}, this._dispatchTimeout);
		disposables.add(toDisposable(() => this.timers.clearTimeout(timeoutHandle)));

		const posted = this._post({
			type: 'dispatchRequest',
			profileId: this.profileId,
			sourceId: this.sourceId,
			targetSourceId: identity.sourceId,
			requestId,
			candidateId,
			resource: identity.resource,
			message,
			serializedOptions,
		});
		if (!posted) {
			this._completePendingDispatch(requestId, this._sourceUnavailable(candidate.rawSessionResource));
		}
		return deferred.p;
	}

	private _handleMessage(message: GlobalOmniSessionBrokerMessage): void {
		if (message.profileId !== this.profileId || message.sourceId === this.sourceId) {
			return;
		}
		switch (message.type) {
			case 'hello':
				this._model.touchSource(message.profileId, message.sourceId, this.now());
				this._publishSnapshot();
				break;
			case 'snapshot':
				this._model.acceptSnapshot(message, this.now());
				break;
			case 'heartbeat':
				this._model.touchSource(message.profileId, message.sourceId, this.now());
				break;
			case 'goodbye':
				if (this._model.removeSource(message.profileId, message.sourceId)) {
					this._rejectOperationsForSource(message.sourceId);
				}
				break;
			case 'dispatchRequest':
				if (message.targetSourceId === this.sourceId) {
					this._handleDispatchRequest(message);
				}
				break;
			case 'dispatchCancel':
				if (message.targetSourceId === this.sourceId) {
					const cts = this._incomingDispatches.get(message.requestId);
					if (cts) {
						this._incomingDispatches.delete(message.requestId);
						cts.cancel();
					}
				}
				break;
			case 'dispatchResult':
				if (message.targetSourceId === this.sourceId) {
					this._handleDispatchResult(message);
				}
				break;
			case 'dispatchCompletion':
				if (message.targetSourceId === this.sourceId) {
					this._handleDispatchCompletion(message);
				}
				break;
		}
	}

	private _handleDispatchRequest(message: IGlobalOmniSessionDispatchRequestMessage): void {
		if (this._incomingDispatches.has(message.requestId)) {
			return;
		}
		const identity = decodeGlobalOmniSessionCandidateId(message.candidateId);
		const localSession = this._localSessions.get(message.resource);
		if (!identity
			|| identity.sourceId !== this.sourceId
			|| identity.resource !== message.resource
			|| !localSession) {
			this._postDispatchResult(message.sourceId, message.requestId, {
				status: 'rejected',
				resource: message.resource,
				reason: 'The source session is no longer available.',
				reasonCode: 'providerRemoved',
			});
			return;
		}

		let resource: URI;
		let options: IChatSendRequestOptions;
		try {
			resource = URI.parse(message.resource);
			options = deserializeGlobalOmniSessionRequestOptions(message.serializedOptions);
		} catch (error) {
			this.onError(error);
			this._postDispatchResult(message.sourceId, message.requestId, {
				status: 'rejected',
				resource: message.resource,
				reason: 'The routed request could not be decoded.',
			});
			return;
		}

		const cts = new CancellationTokenSource();
		this._incomingDispatches.set(message.requestId, cts);
		void this._runDispatch(message, resource, options, cts);
	}

	private async _runDispatch(
		message: IGlobalOmniSessionDispatchRequestMessage,
		resource: URI,
		options: IChatSendRequestOptions,
		cts: CancellationTokenSource,
	): Promise<void> {
		try {
			const result = await this.sendRequest(resource, message.message, options, cts.token);
			if (this._isDisposed || cts.token.isCancellationRequested) {
				return;
			}
			this._postDispatchResult(message.sourceId, message.requestId, this._toWireResult(result));
			if (result.status === 'queued' && result.completion) {
				void result.completion.then(
					completion => {
						if (!this._isDisposed) {
							this._postDispatchCompletion(message.sourceId, message.requestId, this._toWireResult(completion));
						}
					},
					error => {
						this.onError(error);
						if (!this._isDisposed) {
							this._postDispatchCompletion(message.sourceId, message.requestId, {
								status: 'rejected',
								resource: resource.toString(),
								reason: error instanceof Error ? error.message : String(error),
							});
						}
					},
				);
			}
		} catch (error) {
			this.onError(error);
			if (!this._isDisposed && !cts.token.isCancellationRequested) {
				this._postDispatchResult(message.sourceId, message.requestId, {
					status: 'rejected',
					resource: resource.toString(),
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		} finally {
			this._incomingDispatches.delete(message.requestId);
			cts.dispose();
		}
	}

	private _handleDispatchResult(message: IGlobalOmniSessionDispatchResultMessage): void {
		const pending = this._pendingDispatches.get(message.requestId);
		if (!pending || pending.targetSourceId !== message.sourceId) {
			return;
		}
		const result = this._fromWireResult(message.result, pending.resource);
		if (result.status === 'queued') {
			const deferred = new DeferredPromise<IChatSessionRoutingDispatchResult>();
			this._pendingCompletions.set(message.requestId, {
				targetSourceId: message.sourceId,
				resource: result.resource ?? pending.resource,
				deferred,
			});
			this._completePendingDispatch(message.requestId, { ...result, completion: deferred.p });
			return;
		}
		this._completePendingDispatch(message.requestId, result);
	}

	private _handleDispatchCompletion(message: IGlobalOmniSessionDispatchResultMessage): void {
		const pending = this._pendingCompletions.get(message.requestId);
		if (!pending || pending.targetSourceId !== message.sourceId) {
			return;
		}
		this._pendingCompletions.delete(message.requestId);
		pending.deferred.complete(this._fromWireResult(message.result, pending.resource));
	}

	private _heartbeat(): void {
		if (this._isDisposed) {
			return;
		}
		this._post({
			type: 'heartbeat',
			profileId: this.profileId,
			sourceId: this.sourceId,
			sentAt: this.now(),
		});
		for (const sourceId of this._model.expireSources(this.now(), this._sourceExpiry)) {
			this._rejectOperationsForSource(sourceId);
		}
	}

	private _publishSnapshot(): void {
		if (this._isDisposed) {
			return;
		}
		this._post({
			type: 'snapshot',
			profileId: this.profileId,
			sourceId: this.sourceId,
			sentAt: this.now(),
			sessions: [...this._localSessions.values()],
		});
	}

	private _postDispatchResult(targetSourceId: string, requestId: string, result: IGlobalOmniSessionWireDispatchResult): void {
		this._post({
			type: 'dispatchResult',
			profileId: this.profileId,
			sourceId: this.sourceId,
			targetSourceId,
			requestId,
			result,
		});
	}

	private _postDispatchCompletion(targetSourceId: string, requestId: string, result: IGlobalOmniSessionWireDispatchResult): void {
		this._post({
			type: 'dispatchCompletion',
			profileId: this.profileId,
			sourceId: this.sourceId,
			targetSourceId,
			requestId,
			result,
		});
	}

	private _toWireResult(result: IChatSessionRoutingDispatchResult): IGlobalOmniSessionWireDispatchResult {
		return {
			status: result.status,
			resource: result.resource?.toString(),
			requestId: result.requestId,
			reason: result.reason,
			reasonCode: result.reasonCode,
		};
	}

	private _fromWireResult(result: IGlobalOmniSessionWireDispatchResult, fallbackResource: URI): IChatSessionRoutingDispatchResult {
		let resource = fallbackResource;
		if (result.resource) {
			try {
				resource = URI.parse(result.resource);
			} catch (error) {
				this.onError(error);
				return {
					status: 'rejected',
					resource: fallbackResource,
					reason: 'The source window returned an invalid session resource.',
				};
			}
		}
		return { ...result, resource };
	}

	private _completePendingDispatch(requestId: string, result: IChatSessionRoutingDispatchResult): void {
		const pending = this._pendingDispatches.get(requestId);
		if (!pending) {
			return;
		}
		this._pendingDispatches.delete(requestId);
		pending.disposables.dispose();
		pending.deferred.complete(result);
	}

	private _rejectOperationsForSource(sourceId: string): void {
		for (const [requestId, pending] of this._pendingDispatches) {
			if (pending.targetSourceId === sourceId) {
				this._completePendingDispatch(requestId, this._sourceUnavailable(pending.resource));
			}
		}
		for (const [requestId, pending] of this._pendingCompletions) {
			if (pending.targetSourceId === sourceId) {
				this._pendingCompletions.delete(requestId);
				pending.deferred.complete(this._sourceUnavailable(pending.resource));
			}
		}
	}

	private _cancelled(resource: URI): IChatSessionRoutingDispatchResult {
		return {
			status: 'rejected',
			resource,
			reason: 'The routed request was cancelled.',
			reasonCode: 'cancelled',
		};
	}

	private _sourceUnavailable(resource?: URI): IChatSessionRoutingDispatchResult {
		return {
			status: 'rejected',
			resource,
			reason: 'The source window is no longer available.',
			reasonCode: 'providerRemoved',
		};
	}

	private _post(message: GlobalOmniSessionBrokerMessage): boolean {
		if (this._isDisposed) {
			return false;
		}
		try {
			this.channel.postData(message);
			return true;
		} catch (error) {
			this.onError(error);
			return false;
		}
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._post({
			type: 'goodbye',
			profileId: this.profileId,
			sourceId: this.sourceId,
			sentAt: this.now(),
		});
		this._isDisposed = true;
		for (const [requestId, pending] of this._pendingDispatches) {
			this._completePendingDispatch(requestId, this._sourceUnavailable(pending.resource));
		}
		for (const pending of this._pendingCompletions.values()) {
			pending.deferred.complete(this._sourceUnavailable(pending.resource));
		}
		this._pendingCompletions.clear();
		for (const cts of this._incomingDispatches.values()) {
			cts.cancel();
			cts.dispose();
		}
		this._incomingDispatches.clear();
		super.dispose();
	}
}
