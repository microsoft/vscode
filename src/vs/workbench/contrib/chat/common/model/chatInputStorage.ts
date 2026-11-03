/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ChatBinaryReferenceCollection, getChatBinaryReference, retainChatBinaryReferences } from './chatSessionResources.js';
import { ChatStorageOwner, IChatOwnedStorageData, IChatSessionStore } from './chatSessionStore.js';

/** Owns a small input-state snapshot whose binary payloads are persisted separately. */
export class ChatInputStorage<K extends ChatStorageOwner> extends Disposable {
	private current: IChatOwnedStorageData[K];
	private comparison: unknown;
	private storedComparison: unknown;
	private readonly binaryIdentities = new WeakMap<object, symbol>();
	private ready = false;
	private loadFailed = false;
	private loadRetryDelay = 200;
	private generation = 0;
	private changed = false;
	private readonly reference = this._register(new MutableDisposable<IReference<IChatOwnedStorageData[K]>>());
	private readonly liveReferences = this._register(new ChatBinaryReferenceCollection());
	private readonly emitter = this._register(new Emitter<void>());
	readonly onDidLoad = this.emitter.event;
	readonly whenReady: Promise<void>;
	private saving: Promise<void> | undefined;
	private readonly scheduler = this._register(new RunOnceScheduler(() => {
		void this.save().catch(error => this.logService.error('Unable to save chat input', this.owner, error));
	}, 200));

	constructor(
		private readonly owner: K,
		initial: IChatOwnedStorageData[K],
		private readonly removeLegacy: () => void,
		@IChatSessionStore private readonly sessionStore: IChatSessionStore,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.current = initial;
		this.comparison = this.comparisonValue(initial);
		this.liveReferences.set(initial);
		this.whenReady = this.load();
		this._register(sessionStore.onDidInvalidateOwnedData(owner => {
			if (owner === this.owner && this.ready && !this.loadFailed) {
				this.changed = true;
				this.generation++;
				this.scheduler.schedule();
			}
		}));
		this._register(storageService.onWillSaveState(() => {
			void this.save().catch(error => this.logService.error('Unable to save chat input', owner, error));
		}));
		this._register(lifecycleService.onWillShutdown(event => {
			this.scheduler.cancel();
			event.join(this.save().finally(() => this.scheduler.cancel()).catch(error => this.logService.error('Unable to save chat input', owner, error)), {
				id: `chatInput.${owner}`,
				label: localize('chatInput.saving', "Saving chat input"),
			});
		}));
	}

	get value(): IChatOwnedStorageData[K] {
		return this.current;
	}

	get isReady(): boolean {
		return this.ready && !this.loadFailed;
	}

	set(value: IChatOwnedStorageData[K]): void {
		if (this._store.isDisposed) {
			return;
		}
		const comparison = this.comparisonValue(value);
		if (equals(comparison, this.comparison) || equals(comparison, this.storedComparison)) {
			return;
		}
		this.liveReferences.set(value);
		this.current = value;
		this.comparison = comparison;
		this.storedComparison = undefined;
		this.generation++;
		this.changed = true;
		void this.save().catch(error => this.logService.error('Unable to save chat input', this.owner, error));
	}

	private async load(): Promise<void> {
		let stored: IReference<IChatOwnedStorageData[K]> | undefined;
		try {
			stored = await this.sessionStore.readOwnedData(this.owner);
			this.loadFailed = false;
			this.loadRetryDelay = 200;
		} catch (error) {
			this.loadFailed = true;
			this.logService.error('Unable to load chat input', this.owner, error);
			if (!this._store.isDisposed) {
				this.scheduler.schedule(this.loadRetryDelay);
				this.loadRetryDelay = Math.min(this.loadRetryDelay * 2, 30000);
			}
		}
		if (this._store.isDisposed || this.generation) {
			stored?.dispose();
			this.ready = true;
			return;
		}
		if (stored) {
			this.liveReferences.set(stored.object);
			this.current = stored.object;
			this.comparison = this.comparisonValue(stored.object);
			this.reference.value = stored;
			this.removeLegacy();
		} else if (!this.loadFailed) {
			this.changed = true;
			this.scheduler.schedule();
		}
		this.ready = true;
		if (!this.loadFailed) {
			this.emitter.fire();
		}
	}

	private comparisonValue(value: unknown): unknown {
		const reference = getChatBinaryReference(value);
		if (reference) {
			return { binary: reference.descriptor, representation: URI.isUri(value) ? 'uri' : reference.descriptor.representation };
		}
		if (value instanceof Uint8Array || value instanceof ArrayBuffer || value instanceof VSBuffer) {
			let identity = this.binaryIdentities.get(value);
			if (!identity) {
				identity = Symbol('chatBinary');
				this.binaryIdentities.set(value, identity);
			}
			return identity;
		}
		if (URI.isUri(value)) {
			return { scheme: value.scheme, authority: value.authority, path: value.path, query: value.query, fragment: value.fragment };
		}
		if (Array.isArray(value)) {
			return value.map(child => this.comparisonValue(child));
		}
		if (value && typeof value === 'object') {
			return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, this.comparisonValue(child)]));
		}
		return value;
	}

	save(): Promise<void> {
		if (this._store.isDisposed) {
			return this.saving ?? this.whenReady;
		}
		if (!this.changed && !this.loadFailed) {
			return this.whenReady;
		}
		const lease = retainChatBinaryReferences(this.current);
		return this.saveCurrent().finally(() => lease.dispose());
	}

	private async saveCurrent(): Promise<void> {
		if (!this.ready && !this.generation) {
			await this.whenReady;
		}
		if (this.saving) {
			await this.saving;
			if (this.changed) {
				return this.saveCurrent();
			}
			return;
		}
		if (!this.changed && !this.loadFailed) {
			return;
		}
		this.saving = (async () => {
			if (this.loadFailed && !this.generation) {
				await this.load();
			}
			if (!this.changed) {
				return;
			}
			const generation = this.generation;
			const value = this.current;
			const lease = retainChatBinaryReferences(value);
			try {
				const stored = await this.sessionStore.writeOwnedData(this.owner, value);
				if (this._store.isDisposed || generation !== this.generation) {
					stored.dispose();
				} else {
					this.liveReferences.set(stored.object);
					this.current = stored.object;
					this.storedComparison = this.comparisonValue(stored.object);
					this.reference.value = stored;
				}
				if (generation === this.generation) {
					this.changed = false;
					this.ready = true;
					this.loadFailed = false;
					this.loadRetryDelay = 200;
					this.removeLegacy();
				}
			} finally {
				lease.dispose();
			}
		})();
		try {
			await this.saving;
		} finally {
			this.saving = undefined;
		}
		if (this.changed) {
			return this.saveCurrent();
		}
	}
}
