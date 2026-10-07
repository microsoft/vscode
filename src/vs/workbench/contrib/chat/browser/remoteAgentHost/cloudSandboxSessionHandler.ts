/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableResourceMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IChatProgress } from '../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionServerRequest } from '../../common/chatSessionsService.js';
import { CloudSandboxReadOnlySessionHandler, ICloudSandboxReadOnlyConfig, ReadOnlyChatSession } from './cloudSandboxReadOnlySessionHandler.js';

/** Keeps the contributed session and its model alive while recorded history becomes live. */
class PromotableCloudSandboxChatSession extends Disposable implements IChatSession {
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
	readonly sessionResource: URI;
	private _disposed = false;

	constructor(private _source: IChatSession) {
		super();
		this.sessionResource = _source.sessionResource;
		this._bindSource(_source, false);
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

	promote(source: IChatSession): void {
		this._bindSource(source, true);
	}

	private _bindSource(source: IChatSession, promote: boolean): void {
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
				store.add(source.onDidChangeHistory(history => this._onDidChangeHistory.fire(history)));
			}
			if (source.onDidStartServerRequest) {
				store.add(source.onDidStartServerRequest(request => this._onDidStartServerRequest.fire(request)));
			}
			store.add(autorun(reader => {
				const progress = source.progressObs?.read(reader) ?? [];
				const complete = source.isCompleteObs?.read(reader) ?? true;
				const readOnly = source.isReadOnly?.read(reader) ?? false;
				const blocked = source.isInputBlocked?.read(reader) ?? false;
				transaction(tx => {
					this.progressObs.set(progress, tx);
					this.isCompleteObs.set(complete, tx);
					this.isReadOnly.set(readOnly, tx);
					this.isInputBlocked.set(blocked, tx);
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

interface ISandboxChatEntry extends IDisposable {
	readonly resource: URI;
	readonly store: DisposableStore;
	readonly token: CancellationToken;
	readonly historyStore: DisposableStore;
	readonly historyToken: CancellationToken;
	readonly ready: DeferredPromise<PromotableCloudSandboxChatSession>;
	readonly notification: MutableDisposable<IDisposable>;
	session?: PromotableCloudSandboxChatSession;
	liveRequested: boolean;
	live: boolean;
	waiters: number;
	claimed: boolean;
}

/** Serves whichever source is ready first, then promotes recorded history without unregistering. */
export class CloudSandboxSessionHandler extends Disposable implements IChatSessionContentProvider {
	private readonly _sessions = this._register(new DisposableResourceMap<ISandboxChatEntry>());
	private readonly _readOnlyHandler: CloudSandboxReadOnlySessionHandler;
	private readonly _liveReady = new DeferredPromise<IChatSessionContentProvider | undefined>();
	private _liveProvider: IChatSessionContentProvider | undefined;

	constructor(
		private readonly _config: ICloudSandboxReadOnlyConfig,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this._readOnlyHandler = this._register(instantiationService.createInstance(CloudSandboxReadOnlySessionHandler, _config));
	}

	setLiveProvider(provider: IChatSessionContentProvider): void {
		this._liveProvider = provider;
		if (!this._liveReady.isSettled) {
			void this._liveReady.complete(provider);
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
			entry = {
				resource, store, token: cancelOnDispose(store),
				historyStore, historyToken: cancelOnDispose(historyStore),
				ready: new DeferredPromise<PromotableCloudSandboxChatSession>(),
				notification: store.add(new MutableDisposable<IDisposable>()),
				liveRequested: false, live: false, waiters: 0, claimed: false,
				dispose: () => store.dispose(),
			};
			this._sessions.set(resource, entry);
			void this._loadHistory(entry);
			this._loadLive(entry);
		}
		entry.waiters++;
		try {
			const session = await raceCancellationError(raceCancellationError(entry.ready.p, entry.token), token);
			entry.claimed = true;
			return session;
		} finally {
			entry.waiters--;
			if (!entry.claimed && entry.waiters === 0 && this._sessions.get(resource) === entry) {
				this._sessions.deleteAndDispose(resource);
			}
		}
	}

	private _accept(entry: ISandboxChatEntry, source: IChatSession, live: boolean): void {
		if (entry.token.isCancellationRequested || entry.live) {
			source.dispose();
			return;
		}
		if (!isEqual(source.sessionResource, entry.resource)) {
			source.dispose();
			throw new Error('The sandbox content provider returned a different session resource.');
		}
		if (entry.session) {
			entry.session.promote(source);
		} else {
			const session = entry.store.add(new PromotableCloudSandboxChatSession(source));
			entry.session = session;
			entry.store.add(Event.once(session.onWillDispose)(() => {
				if (this._sessions.get(entry.resource) === entry) {
					this._sessions.deleteAndDispose(entry.resource);
				}
			}));
			void entry.ready.complete(session);
		}
		entry.live = live;
		if (live) {
			entry.historyStore.dispose();
			entry.notification.clear();
		}
	}

	private async _loadHistory(entry: ISandboxChatEntry): Promise<void> {
		try {
			this._accept(entry, await this._readOnlyHandler.provideChatSessionContent(entry.resource, entry.historyToken), false);
		} catch (error) {
			if (entry.historyToken.isCancellationRequested || entry.live) {
				return;
			}
			if (isCancellationError(error)) {
				void entry.ready.error(error);
				return;
			}
			this._logService.error('[CloudSandbox] Failed to load recorded conversation', error);
			this._accept(entry, new ReadOnlyChatSession(entry.resource, [{
				type: 'request', prompt: '', participant: this._config.agentId, isSystemInitiated: true,
				systemInitiatedLabel: localize('cloudSandbox.historyLoadFailed', "Couldn't load recorded conversation"),
			}, {
				type: 'response', parts: [], participant: this._config.agentId,
				errorDetails: { message: toErrorMessage(error) },
			}], undefined, constObservable(true)), false);
		}
	}

	private _loadLive(entry: ISandboxChatEntry): void {
		const provider = this._liveProvider;
		if (!provider || entry.liveRequested || entry.token.isCancellationRequested) {
			return;
		}
		entry.notification.clear();
		entry.liveRequested = true;
		void (async () => {
			try {
				this._accept(entry, await provider.provideChatSessionContent(entry.resource, entry.token), true);
			} catch (error) {
				entry.liveRequested = false;
				if (!entry.token.isCancellationRequested && !isCancellationError(error)) {
					this._logService.error('[CloudSandbox] Failed to load live conversation; retaining recorded history', error);
					const notification = this._notificationService.prompt(Severity.Error,
						localize('cloudSandbox.liveHistoryFailed', "Could not load the live conversation: {0}", toErrorMessage(error)), [{
							label: localize('cloudSandbox.retryLiveHistory', "Retry"),
							run: () => this._loadLive(entry),
						}]);
					entry.notification.value = toDisposable(() => notification.close());
				}
			}
		})();
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
