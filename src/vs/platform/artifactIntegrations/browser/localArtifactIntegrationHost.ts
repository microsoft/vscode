/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BroadcastDataChannel } from '../../../base/browser/broadcast.js';
import { IndexedDB } from '../../../base/browser/indexedDB.js';
import { mainWindow } from '../../../base/browser/window.js';
import { DeferredPromise, IntervalTimer, raceTimeout, TimeoutTimer } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { ArtifactIntegrationClient, ArtifactIntegrationRequest, ArtifactIntegrationResponse, ArtifactIntegrationServer, ArtifactIntegrationUpdate, IArtifactIntegrationTransport, isArtifactIntegrationRequest, isArtifactIntegrationResponse, isArtifactIntegrationUpdate } from '../common/artifactIntegrationProtocol.js';
import { ArtifactIntegrationService } from '../common/artifactIntegrationService.js';
import { IArtifactIntegrationStorage } from '../common/artifactRuntime.js';

type LocalMessage =
	| { readonly kind: 'hello' | 'goodbye'; readonly client: string }
	| { readonly kind: 'ready'; readonly owner: string }
	| { readonly kind: 'request'; readonly client: string; readonly owner: string; readonly id: string; readonly request: ArtifactIntegrationRequest }
	| { readonly kind: 'response'; readonly client: string; readonly owner: string; readonly id: string; readonly response?: ArtifactIntegrationResponse; readonly error?: string }
	| { readonly kind: 'update'; readonly client: string; readonly owner: string; readonly update: ArtifactIntegrationUpdate };

function isLocalMessage(value: unknown): value is LocalMessage {
	if (!value || typeof value !== 'object' || !('kind' in value)) {
		return false;
	}
	if (value.kind === 'ready') {
		return 'owner' in value && typeof value.owner === 'string';
	}
	if (!('client' in value) || typeof value.client !== 'string') {
		return false;
	}
	if (value.kind === 'hello' || value.kind === 'goodbye') {
		return true;
	}
	if (!('owner' in value) || typeof value.owner !== 'string') {
		return false;
	}
	if (value.kind === 'update') {
		return 'update' in value && isArtifactIntegrationUpdate(value.update);
	}
	if (!('id' in value) || typeof value.id !== 'string') {
		return false;
	}
	return value.kind === 'request' ? 'request' in value && isArtifactIntegrationRequest(value.request)
		: value.kind === 'response' && (('response' in value && isArtifactIntegrationResponse(value.response)) || ('error' in value && typeof value.error === 'string'));
}

class BrowserArtifactIntegrationStorage implements IArtifactIntegrationStorage {
	private previous: string | undefined;

	constructor(private readonly database: IndexedDB) { }

	async read(): Promise<string | undefined> {
		const value: unknown = await this.database.runInTransaction('ledger', 'readonly', store => store.get('state'));
		if (value !== undefined && typeof value !== 'string') {
			throw new Error('Invalid local artifact integration storage');
		}
		this.previous = value;
		return value;
	}

	async write(value: string): Promise<void> {
		const result = await this.database.compareAndSwap('ledger', 'state', this.previous, value, (value): value is string => typeof value === 'string');
		if (!result.swapped) {
			throw new Error('Local artifact integration storage ownership changed');
		}
		this.previous = value;
	}
}

/** Windows share one Web Lock owner and a machine-local ledger, never a Settings Sync entry. */
export class LocalArtifactIntegrationHost extends Disposable implements IArtifactIntegrationTransport {
	private readonly clientId = generateUuid();
	private readonly channel: BroadcastDataChannel<LocalMessage>;
	private readonly updates = this._register(new Emitter<ArtifactIntegrationUpdate>());
	readonly onDidUpdate = this.updates.event;
	private readonly reset = this._register(new Emitter<void>());
	readonly onDidReset = this.reset.event;
	private readonly pending = new Map<string, DeferredPromise<ArtifactIntegrationResponse>>();
	private readonly ready = new DeferredPromise<void>();
	private readonly released = new DeferredPromise<void>();
	private readonly abort = new AbortController();
	private ownerId: string | undefined;
	private failure: Error | undefined;
	private localReceiver: ((message: LocalMessage) => void) | undefined;
	readonly client: ArtifactIntegrationClient;

	constructor(
		scope: string,
		createRuntime: (authority: string, storage: IArtifactIntegrationStorage, isOwner: () => boolean) => ArtifactIntegrationService,
		private readonly logService: ILogService,
		locks: LockManager | undefined = mainWindow.navigator.locks,
	) {
		super();
		if (!locks) {
			throw new Error(localize('artifactLocalCoordinationUnavailable', "Local artifact automation requires a browser that supports cross-window execution locks."));
		}
		this.channel = this._register(new BroadcastDataChannel<LocalMessage>(`vscode-artifact-integrations:${scope}`));
		this._register(this.channel.onDidReceiveData(message => this.receive(message)));
		const heartbeat = this._register(new IntervalTimer());
		heartbeat.cancelAndSet(() => this.post({ kind: 'hello', client: this.clientId }), 10_000);
		this.client = this._register(new ArtifactIntegrationClient(this, logService));
		void locks.request(`vscode-artifact-integrations:${scope}`, { signal: this.abort.signal }, async () => {
			if (this._store.isDisposed) {
				return;
			}
			const database = await IndexedDB.create(`vscode-artifact-integrations:${scope}`, 1, ['ledger']);
			const lifetime = new DisposableStore();
			lifetime.add(toDisposable(() => database.close()));
			let runtime: ArtifactIntegrationService | undefined;
			try {
				if (this._store.isDisposed) {
					return;
				}
				const identity: unknown = await database.runInTransaction('ledger', 'readonly', store => store.get('authority'));
				if (identity !== undefined && typeof identity !== 'string') {
					throw new Error('Invalid local artifact authority');
				}
				const authority = identity ?? `client:${generateUuid()}`;
				if (identity === undefined) {
					await database.runInTransaction('ledger', 'readwrite', store => store.put(authority, 'authority'));
				}
				const owner = generateUuid();
				const coordinator = runtime = lifetime.add(createRuntime(authority, new BrowserArtifactIntegrationStorage(database), () => !lifetime.isDisposed && !this._store.isDisposed));
				await coordinator.initialize();
				if (this._store.isDisposed) {
					return;
				}
				const serverChannel = lifetime.add(new BroadcastDataChannel<LocalMessage>(`vscode-artifact-integrations:${scope}`));
				const servers = lifetime.add(new DisposableMap<string, DisposableStore>());
				const endpoints = new Map<string, { endpoint: ArtifactIntegrationServer; seen: number }>();
				const send = (message: LocalMessage) => {
					if (!lifetime.isDisposed) {
						this.receive(message);
						serverChannel.postData(message);
					}
				};
				const receive = (message: unknown) => {
					if (!isLocalMessage(message)) {
						this.logService.error('[ArtifactIntegrations] Invalid local coordination message');
						return;
					}
					if (message.kind === 'hello') {
						const client = endpoints.get(message.client);
						if (client) {
							client.seen = Date.now();
						}
						send({ kind: 'ready', owner });
					} else if (message.kind === 'goodbye') {
						servers.deleteAndDispose(message.client);
					} else if (message.kind === 'request' && message.owner === owner) {
						let client = endpoints.get(message.client);
						if (!client) {
							const store = new DisposableStore();
							servers.set(message.client, store);
							const endpoint = store.add(new ArtifactIntegrationServer(coordinator));
							client = { endpoint, seen: Date.now() };
							endpoints.set(message.client, client);
							store.add(toDisposable(() => endpoints.delete(message.client)));
							store.add(endpoint.onDidUpdate(update => send({ kind: 'update', client: message.client, owner, update })));
						}
						client.seen = Date.now();
						void client.endpoint.request(message.request).then(
							response => send({ kind: 'response', client: message.client, owner, id: message.id, response }),
							error => send({ kind: 'response', client: message.client, owner, id: message.id, error: toErrorMessage(error) }),
						);
					}
				};
				this.localReceiver = receive;
				lifetime.add(serverChannel.onDidReceiveData(receive));
				const expiry = lifetime.add(new IntervalTimer());
				expiry.cancelAndSet(() => {
					for (const [client, value] of endpoints) {
						if (Date.now() - value.seen > 45_000) {
							servers.deleteAndDispose(client);
						}
					}
				}, 15_000);
				send({ kind: 'ready', owner });
				await this.released.p;
			} finally {
				this.localReceiver = undefined;
				try {
					runtime?.dispose();
					await runtime?.whenIdle();
				} finally {
					lifetime.dispose();
				}
			}
		}).catch(error => {
			if (!this._store.isDisposed) {
				this.logService.error('[ArtifactIntegrations] Local coordinator failed', error);
				this.failure = error instanceof Error ? error : new Error(toErrorMessage(error));
				void this.ready.complete();
			}
		});
		this.post({ kind: 'hello', client: this.clientId });
	}

	private post(message: LocalMessage): void {
		if (this.localReceiver) {
			this.localReceiver(message);
		} else {
			this.channel.postData(message);
		}
	}

	private receive(message: unknown): void {
		if (!isLocalMessage(message)) {
			this.logService.error('[ArtifactIntegrations] Invalid local coordinator response');
			return;
		}
		if (message.kind === 'ready') {
			this.failure = undefined;
			const changed = this.ownerId !== undefined && this.ownerId !== message.owner;
			this.ownerId = message.owner;
			void this.ready.complete();
			if (changed) {
				for (const request of this.pending.values()) {
					void request.error(new Error('Local artifact coordinator changed; request outcome is uncertain'));
				}
				this.reset.fire();
			}
		} else if ((message.kind === 'update' || message.kind === 'response') && message.client === this.clientId && message.owner === this.ownerId) {
			if (message.kind === 'update') {
				if (isArtifactIntegrationUpdate(message.update)) {
					this.updates.fire(message.update);
				} else {
					this.logService.error('[ArtifactIntegrations] Invalid local coordinator update');
				}
			} else {
				const request = this.pending.get(message.id);
				if (request) {
					if (message.response && isArtifactIntegrationResponse(message.response)) {
						void request.complete(message.response);
					} else {
						void request.error(new Error(message.error ?? 'Invalid local artifact response'));
					}
				}
			}
		}
	}

	async request(request: ArtifactIntegrationRequest): Promise<ArtifactIntegrationResponse> {
		const ready = await raceTimeout(this.ready.p.then(() => true), 30_000);
		if (!ready || this.failure) {
			throw this.failure ?? new Error('Local artifact coordinator did not become ready');
		}
		if (!this.ownerId || this._store.isDisposed) {
			throw new Error('Local artifact coordinator is unavailable');
		}
		const id = generateUuid();
		const response = new DeferredPromise<ArtifactIntegrationResponse>();
		this.pending.set(id, response);
		const timeout = new TimeoutTimer(() => void response.error(new Error('Artifact request timed out; its outcome may be uncertain')), 30_000);
		try {
			this.post({ kind: 'request', client: this.clientId, owner: this.ownerId, id, request });
			return await response.p;
		} finally {
			timeout.dispose();
			this.pending.delete(id);
		}
	}

	override dispose(): void {
		this.post({ kind: 'goodbye', client: this.clientId });
		this.abort.abort();
		if (!this.ready.isSettled) {
			this.failure = new Error('Local artifact runtime was closed');
			void this.ready.complete();
		}
		void this.released.complete();
		for (const pending of this.pending.values()) {
			void pending.error(new Error('Local artifact runtime closed; request outcome may be uncertain'));
		}
		super.dispose();
	}
}
