/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableResourceMap, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, constObservable, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxRequestError, ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatProgress, IChatService } from '../../common/chatService/chatService.js';
import { getChatSessionHistoryContent, IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionServerRequest } from '../../common/chatSessionsService.js';
import { IChatSessionHistoryStatus } from '../../../../../platform/chat/common/chatSessionHistory.js';
import { CloudSandboxSessionTrace } from '../../common/cloudSandboxSessionTrace.js';
import { CloudSandboxReadOnlySessionHandler, ICloudSandboxReadOnlyConfig, ReadOnlyChatSession } from './cloudSandboxReadOnlySessionHandler.js';
import type { ICanvasContext } from '../../../canvases/common/canvas.js';

const LIVE_CONTENT_TIMEOUT_MS = 30_000;

interface ICloudSandboxSessionConfig extends ICloudSandboxReadOnlyConfig {
	readonly connectionStatus?: IObservable<RemoteAgentHostConnectionStatus>;
}

/** Keeps the contributed session and its model alive while recorded history becomes live. */
class PromotableCloudSandboxChatSession extends Disposable implements IChatSession {
	readonly preserveHistoryItemIdentity = true;
	private readonly _sourceStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;
	private readonly _onDidChangeHistory = this._register(new Emitter<readonly IChatSessionHistoryItem[]>());
	readonly onDidChangeHistory = this._onDidChangeHistory.event;
	private readonly _onDidStartServerRequest = this._register(new Emitter<IChatSessionServerRequest>());
	readonly onDidStartServerRequest = this._onDidStartServerRequest.event;
	readonly progressObs = observableValue<IChatProgress[]>(this, []);
	readonly isCompleteObs = observableValue(this, true);
	readonly isReadOnly = observableValue(this, true);
	readonly isInputBlocked = observableValue(this, false);
	readonly historyStatus = observableValue<IChatSessionHistoryStatus | undefined>(this, undefined);
	readonly backgroundShellCount = observableValue<number | undefined>(this, undefined);
	readonly canvasContext = observableValue<ICanvasContext | undefined>(this, undefined);
	readonly sessionResource: URI;
	private _disposed = false;

	constructor(private _source: IChatSession, private readonly _invalidateHistory: () => void, live: boolean) {
		super();
		this.sessionResource = _source.sessionResource;
		this._bindSource(_source, false, live);
	}

	get history() { return this._source.history; }
	get title() { return this._source.title; }
	get options() { return this._source.options; }
	get transferredState() { return this._source.transferredState; }
	get requestHandler(): IChatSession['requestHandler'] {
		const source = this._source;
		return source.requestHandler ? (request, progress, history, token) => source.requestHandler!(request, progress, history, token) : undefined;
	}
	get forkSession(): IChatSession['forkSession'] {
		const source = this._source;
		return source.forkSession ? (request, token) => source.forkSession!(request, token) : undefined;
	}
	get renameSession(): IChatSession['renameSession'] {
		const source = this._source;
		return source.renameSession ? (title, token) => source.renameSession!(title, token) : undefined;
	}
	get prepareForClientTools(): IChatSession['prepareForClientTools'] {
		const source = this._source;
		return source.prepareForClientTools ? token => source.prepareForClientTools!(token) : undefined;
	}
	get retryInput(): IChatSession['retryInput'] {
		const source = this._source;
		return source.retryInput ? () => source.retryInput!() : undefined;
	}

	readonly interruptActiveResponseCallback = async (): Promise<boolean> =>
		this._source.interruptActiveResponseCallback?.() ?? true;

	promote(source: IChatSession, live: boolean): void {
		this._bindSource(source, true, live);
	}

	private _bindSource(source: IChatSession, promote: boolean, live: boolean): void {
		const activeRequest = !source.isCompleteObs?.get() && source.progressObs
			? source.history.findLast(item => item.type === 'request')
			: undefined;
		if (activeRequest && !activeRequest.id) {
			source.dispose();
			throw new Error('A live sandbox turn must have an ID before it can be promoted.');
		}

		this._sourceStore.clear();
		this._source = source;
		const store = new DisposableStore();
		this._sourceStore.value = store;
		store.add(source);

		transaction(() => {
			if (promote) {
				this._onDidChangeHistory.fire(source.history);
				if (activeRequest?.id) {
					this._onDidStartServerRequest.fire({ id: activeRequest.id, prompt: activeRequest.prompt, resume: true });
				}
			}
			if (source.onDidChangeHistory) {
				store.add(source.onDidChangeHistory(history => {
					if (live) {
						this._invalidateHistory();
					}
					this._onDidChangeHistory.fire(history);
				}));
			}
			if (source.onDidStartServerRequest) {
				store.add(source.onDidStartServerRequest(request => {
					if (live) {
						this._invalidateHistory();
					}
					this._onDidStartServerRequest.fire(request);
				}));
			}
			let previousProgress = source.progressObs?.get();
			let previousComplete = source.isCompleteObs?.get();
			store.add(autorun(reader => {
				const progress = source.progressObs?.read(reader);
				const complete = source.isCompleteObs?.read(reader);
				const readOnly = source.isReadOnly?.read(reader) ?? false;
				const blocked = source.isInputBlocked?.read(reader) ?? false;
				const backgroundShellCount = source.backgroundShellCount?.read(reader);
				const canvasContext = source.canvasContext?.read(reader);
				if (live && (previousProgress !== progress || previousComplete !== complete)) {
					this._invalidateHistory();
				}
				previousProgress = progress;
				previousComplete = complete;
				transaction(tx => {
					this.progressObs.set(progress ?? [], tx);
					this.isCompleteObs.set(complete ?? true, tx);
					this.isReadOnly.set(readOnly, tx);
					this.isInputBlocked.set(blocked, tx);
					this.backgroundShellCount.set(backgroundShellCount, tx);
					this.canvasContext.set(canvasContext, tx);
				});
			}));
		});
	}

	override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this.isCompleteObs.set(true, undefined);
		this._onWillDispose.fire();
		super.dispose();
	}
}

/** Releases one consumer without disposing another consumer's live conversation. */
class CloudSandboxChatSessionReference extends Disposable implements IChatSession {
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;
	private _disposed = false;

	constructor(
		private readonly _session: PromotableCloudSandboxChatSession,
		private readonly _release: () => void,
	) {
		super();
		this._register(Event.once(_session.onWillDispose)(() => this.dispose()));
	}

	get sessionResource() { return this._session.sessionResource; }
	get history() { return this._session.history; }
	get preserveHistoryItemIdentity() { return this._session.preserveHistoryItemIdentity; }
	get title() { return this._session.title; }
	get options() { return this._session.options; }
	get transferredState() { return this._session.transferredState; }
	get progressObs() { return this._session.progressObs; }
	get isCompleteObs() { return this._session.isCompleteObs; }
	get isReadOnly() { return this._session.isReadOnly; }
	get isInputBlocked() { return this._session.isInputBlocked; }
	get historyStatus() { return this._session.historyStatus; }
	get backgroundShellCount() { return this._session.backgroundShellCount; }
	get canvasContext() { return this._session.canvasContext; }
	get onDidChangeHistory() { return this._session.onDidChangeHistory; }
	get onDidStartServerRequest() { return this._session.onDidStartServerRequest; }
	get requestHandler() { return this._session.requestHandler; }
	get forkSession() { return this._session.forkSession; }
	get renameSession() { return this._session.renameSession; }
	get prepareForClientTools() { return this._session.prepareForClientTools; }
	get retryInput() { return this._session.retryInput; }
	get interruptActiveResponseCallback() { return this._session.interruptActiveResponseCallback; }

	override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._onWillDispose.fire();
		super.dispose();
		this._release();
	}
}

interface ISandboxChatEntry extends IDisposable {
	readonly resource: URI;
	readonly store: DisposableStore;
	readonly token: CancellationToken;
	readonly historyStore: DisposableStore;
	readonly historyToken: CancellationToken;
	readonly ready: DeferredPromise<PromotableCloudSandboxChatSession>;
	readonly liveStore: MutableDisposable<DisposableStore>;
	readonly liveProviderTimeout: MutableDisposable<IDisposable>;
	readonly trace: CloudSandboxSessionTrace;
	session?: PromotableCloudSandboxChatSession;
	liveRequested: boolean;
	historyRequested: boolean;
	hasHistory: boolean;
	historyFailed: boolean;
	historyRetryAfter: number;
	liveFailed: boolean;
	liveProviderWaitExpired: boolean;
	live: boolean;
	waiters: number;
	references: number;
}

/** Serves whichever source is ready first, then promotes recorded history without unregistering. */
export class CloudSandboxSessionHandler extends Disposable implements IChatSessionContentProvider {
	private readonly _sessions = this._register(new DisposableResourceMap<ISandboxChatEntry>());
	private readonly _readOnlyHandler: CloudSandboxReadOnlySessionHandler;
	private readonly _liveReady = new DeferredPromise<IChatSessionContentProvider | undefined>();
	private _liveProvider: IChatSessionContentProvider | undefined;

	constructor(
		private readonly _config: ICloudSandboxSessionConfig,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@ICloudSandboxApiService private readonly _apiService: ICloudSandboxApiService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
		this._readOnlyHandler = this._register(instantiationService.createInstance(CloudSandboxReadOnlySessionHandler, _config));
	}

	setLiveProvider(provider: IChatSessionContentProvider): void {
		this._liveProvider = provider;
		if (!this._liveReady.isSettled) {
			void this._liveReady.complete(provider);
		}
		for (const entry of this._sessions.values()) {
			entry.trace.record('liveProviderReady');
		}
		this.retryLiveSessions();
	}

	retryLiveSessions(): void {
		for (const entry of this._sessions.values()) {
			this._loadLive(entry);
		}
	}

	async provideChatSessionContent(resource: URI, token: CancellationToken): Promise<IChatSession> {
		let entry = this._sessions.get(resource);
		if (!entry) {
			const store = new DisposableStore();
			const historyStore = store.add(new DisposableStore());
			const entryToken = cancelOnDispose(store);
			const historyToken = cancelOnDispose(historyStore);
			const trace = store.add(new CloudSandboxSessionTrace(this._logService));
			entry = {
				resource, store, token: entryToken,
				historyStore, historyToken, trace,
				ready: new DeferredPromise<PromotableCloudSandboxChatSession>(),
				liveStore: store.add(new MutableDisposable<DisposableStore>()),
				liveProviderTimeout: store.add(new MutableDisposable<IDisposable>()),
				liveRequested: false, historyRequested: false, live: false, waiters: 0, references: 0,
				hasHistory: false, historyFailed: false, historyRetryAfter: 0, liveFailed: false, liveProviderWaitExpired: false,
				dispose: () => store.dispose(),
			};
			this._sessions.set(resource, entry);
			const current = entry;
			let previousConnection = this._config.connectionStatus?.get().kind;
			store.add(autorun(reader => {
				const connection = this._config.connectionStatus?.read(reader).kind;
				if (connection !== previousConnection) {
					previousConnection = connection;
					current.liveProviderWaitExpired = false;
					current.liveProviderTimeout.clear();
				}
				this._updateHistoryStatus(current);
			}));
			store.add(this._chatService.onDidSubmitRequest(event => {
				if (isEqual(event.chatSessionResource, resource)) {
					this._apiService.invalidateSessionHistory(this._config.taskId);
				}
			}));
			if (this._liveProvider) {
				entry.trace.record('liveProviderReady');
			}
			void this._loadHistory(entry);
			this._loadLive(entry);
		}
		entry.waiters++;
		try {
			const session = await raceCancellationError(raceCancellationError(entry.ready.p, entry.token), token);
			if (token.isCancellationRequested || entry.token.isCancellationRequested) {
				throw new CancellationError();
			}
			entry.references++;
			const current = entry;
			const reference = new CloudSandboxChatSessionReference(session, () => {
				current.references--;
				this._disposeUnreferencedSession(current);
			});
			entry.trace.associate(reference);
			return reference;
		} finally {
			entry.waiters--;
			this._disposeUnreferencedSession(entry);
		}
	}

	private _disposeUnreferencedSession(entry: ISandboxChatEntry): void {
		if (entry.references === 0 && entry.waiters === 0 && this._sessions.get(entry.resource) === entry) {
			this._sessions.deleteAndDispose(entry.resource);
		}
	}

	private _accept(entry: ISandboxChatEntry, source: IChatSession, kind: 'cache' | 'history' | 'live' | 'historyError'): void {
		const live = kind === 'live';
		if (entry.token.isCancellationRequested || entry.live || (kind === 'cache' && entry.session)) {
			entry.trace.record('discarded', { source: kind, reason: entry.live ? 'liveAlreadyAccepted' : entry.token.isCancellationRequested ? 'disposed' : 'alreadyLoaded' });
			source.dispose();
			return;
		}
		if (!isEqual(source.sessionResource, entry.resource)) {
			source.dispose();
			throw new Error('The sandbox content provider returned a different session resource.');
		}
		if (live) {
			const unchanged = entry.hasHistory && !!entry.session && equals(getChatSessionHistoryContent(entry.session.history), getChatSessionHistoryContent(source.history));
			this._apiService.invalidateSessionHistory(this._config.taskId, unchanged);
		}
		if (entry.session) {
			const session = entry.session;
			transaction(tx => {
				session.promote(source, live);
				session.historyStatus.set(undefined, tx);
				if (source.title !== undefined) {
					this._chatService.setSessionTitle(entry.resource, source.title);
				}
			});
			entry.trace.record('promoted', { source: kind, historyItems: source.history.length });
		} else {
			const session = entry.store.add(new PromotableCloudSandboxChatSession(source, () => this._apiService.invalidateSessionHistory(this._config.taskId), live));
			entry.trace.associate(session);
			entry.session = session;
			entry.store.add(Event.once(session.onWillDispose)(() => {
				if (this._sessions.get(entry.resource) === entry) {
					this._sessions.deleteAndDispose(entry.resource);
				}
			}));
			entry.trace.record('contentReady', { source: kind, historyItems: source.history.length });
			void entry.ready.complete(session);
		}
		entry.live = live;
		entry.hasHistory = kind !== 'historyError' && source.history.length > 0;
		entry.historyFailed = false;
		if (live) {
			entry.historyStore.dispose();
		}
		this._updateHistoryStatus(entry);
	}

	private _updateHistoryStatus(entry: ISandboxChatEntry): void {
		if (entry.token.isCancellationRequested) {
			return;
		}
		const connection = this._config.connectionStatus?.get().kind;
		const waitingForProvider = connection === 'connected' && !this._liveProvider && !entry.liveProviderWaitExpired;
		if (waitingForProvider && entry.historyFailed && !entry.liveProviderTimeout.value) {
			entry.liveProviderTimeout.value = disposableTimeout(() => {
				entry.liveProviderWaitExpired = true;
				this._logService.warn('[CloudSandbox] Live content provider did not become available before the recorded-history recovery deadline.');
				this._updateHistoryStatus(entry);
			}, LIVE_CONTENT_TIMEOUT_MS);
		} else if (!waitingForProvider || entry.live) {
			entry.liveProviderTimeout.clear();
		}
		const pending = connection === 'connecting' || connection === 'reconnecting' || waitingForProvider || entry.liveRequested;
		const kind = !entry.live && !pending
			? entry.hasHistory && entry.historyFailed ? 'history' : entry.liveFailed ? 'live' : undefined
			: undefined;
		const session = entry.session;
		if (!session || session.historyStatus.get()?.kind === kind) {
			return;
		}
		session.historyStatus.set(kind === 'history' ? {
			kind,
			message: localize('cloudSandbox.historyRefreshFailed', "Couldn't refresh this conversation. Recent messages may be missing."),
			action: { label: localize('cloudSandbox.refreshHistory', "Refresh"), run: () => this._loadHistory(entry) },
		} : kind === 'live' ? {
			kind,
			message: localize('cloudSandbox.liveHistoryFailed', "Couldn't load the live conversation. Try again to continue."),
			action: { label: localize('cloudSandbox.retryLiveHistory', "Retry"), run: () => this._loadLive(entry) },
		} : undefined, undefined);
	}

	private async _loadHistory(entry: ISandboxChatEntry): Promise<void> {
		if (entry.historyRequested || entry.live || entry.token.isCancellationRequested) {
			return;
		}
		entry.historyRequested = true;
		const watch = StopWatch.create(false);
		entry.trace.record('historyStarted');
		const cancellationListener = entry.historyStore.add(entry.historyToken.onCancellationRequested(() => {
			entry.trace.record('historyCancelled', { reason: entry.live ? 'liveWon' : 'disposed', durationMs: watch.elapsed() });
		}));
		try {
			const delay = entry.historyRetryAfter - Date.now();
			if (delay > 0) {
				await timeout(delay, entry.historyToken);
			}
			const source = await this._readOnlyHandler.provideChatSessionContent(entry.resource, entry.historyToken, entry.trace.id,
				cached => this._accept(entry, cached, 'cache'), entry.hasHistory);
			entry.trace.record('historyReady', { durationMs: watch.elapsed(), historyItems: source.history.length });
			this._accept(entry, source, 'history');
		} catch (error) {
			if (entry.historyToken.isCancellationRequested || entry.live) {
				return;
			}
			if (isCancellationError(error)) {
				entry.trace.record('historyCancelled', { reason: 'providerCancelled', durationMs: watch.elapsed() });
				if (!entry.session) {
					void entry.ready.error(error);
				}
				return;
			}
			entry.trace.record('historyFailed', { durationMs: watch.elapsed() });
			this._logService.error('[CloudSandbox] Failed to load recorded conversation', error);
			const accessLost = error instanceof CloudSandboxAuthenticationRequiredError
				|| (error instanceof CloudSandboxRequestError && [401, 403, 404].includes(error.statusCode ?? 0));
			if (entry.hasHistory && !accessLost) {
				entry.historyFailed = true;
				entry.historyRetryAfter = Date.now() + (error instanceof CloudSandboxRequestError ? (error.retryAfterSeconds ?? 0) * 1000 : 0);
				this._updateHistoryStatus(entry);
				return;
			}
			this._accept(entry, new ReadOnlyChatSession(entry.resource, [{
				type: 'request', prompt: '', participant: this._config.agentId, isSystemInitiated: true,
				systemInitiatedLabel: localize('cloudSandbox.historyLoadFailed', "Couldn't load recorded conversation"),
			}, {
				type: 'response', parts: [], participant: this._config.agentId,
				errorDetails: { message: toErrorMessage(error) },
			}], undefined, constObservable(true)), 'historyError');
		} finally {
			entry.historyRequested = false;
			entry.historyStore.delete(cancellationListener);
		}
	}

	private async _loadLive(entry: ISandboxChatEntry): Promise<void> {
		const provider = this._liveProvider;
		if (!provider || entry.live || entry.liveRequested || entry.token.isCancellationRequested) {
			return;
		}
		entry.liveRequested = true;
		entry.liveFailed = false;
		entry.liveProviderTimeout.clear();
		this._updateHistoryStatus(entry);
		const watch = StopWatch.create(false);
		entry.trace.record('liveStarted');
		const store = new DisposableStore();
		entry.liveStore.value = store;
		const source = store.add(new CancellationTokenSource(entry.token));
		const token = source.token;
		let timedOut = false;
		store.add(disposableTimeout(() => {
			timedOut = true;
			source.cancel();
		}, LIVE_CONTENT_TIMEOUT_MS));
		try {
			const pending = provider.provideChatSessionContent(entry.resource, token).then(session => {
				if (token.isCancellationRequested) {
					session.dispose();
					throw new CancellationError();
				}
				return session;
			});
			const session = await raceCancellationError(pending, token);
			if (token.isCancellationRequested) {
				session.dispose();
				throw new CancellationError();
			}
			entry.trace.record('liveReady', { durationMs: watch.elapsed(), historyItems: session.history.length });
			this._accept(entry, session, 'live');
		} catch (error) {
			const cancelled = entry.token.isCancellationRequested || (!timedOut && isCancellationError(error));
			entry.trace.record(cancelled ? 'liveCancelled' : 'liveFailed', { durationMs: watch.elapsed() });
			if (!cancelled) {
				entry.liveFailed = true;
				this._logService.error('[CloudSandbox] Failed to load live conversation; retaining recorded history', timedOut ? new Error('Loading the live conversation timed out.') : error);
			}
		} finally {
			entry.liveRequested = false;
			entry.liveStore.clear();
			this._updateHistoryStatus(entry);
		}
	}

	get updateChatSessionMetadata(): IChatSessionContentProvider['updateChatSessionMetadata'] {
		const provider = this._liveProvider;
		return provider?.updateChatSessionMetadata ? (resource, metadata) => provider.updateChatSessionMetadata!(resource, metadata) : undefined;
	}

	resolveChatResponseUri(resource: URI, href: string, kind: 'link' | 'image'): string {
		return this._liveProvider?.resolveChatResponseUri?.(resource, href, kind) ?? href;
	}

	provideChatInputCompletions: NonNullable<IChatSessionContentProvider['provideChatInputCompletions']> =
		async (resource, params, token) => this._liveProvider?.provideChatInputCompletions?.(resource, params, token);

	async provideChatInputCompletionTriggerCharacters(): Promise<readonly string[]> {
		const provider = await this._liveReady.p;
		const characters = await provider?.provideChatInputCompletionTriggerCharacters?.() ?? [];
		return this._store.isDisposed ? [] : characters;
	}

	override dispose(): void {
		if (!this._liveReady.isSettled) {
			void this._liveReady.complete(undefined);
		}
		super.dispose();
	}
}
