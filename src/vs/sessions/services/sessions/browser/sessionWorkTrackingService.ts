/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { derived, IObservable, ISettableObservable, observableSignal, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ISession } from '../common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionWorkTrackingState, isSessionWorkTimestamp, readSessionWorkResultVersion } from '../common/sessionWorkSummary.js';

export interface ISessionWorkTrackingService {
	readonly _serviceBrand: undefined;
	getState(resource: URI): IObservable<ISessionWorkTrackingState>;
	/** Records a local opening explicitly reported by the view layer. */
	markOpened(resource: URI): void;
	markReviewed(session: ISession): void;
	keep(resource: URI, keep: boolean): void;
}

export const ISessionWorkTrackingService = createDecorator<ISessionWorkTrackingService>('sessionWorkTrackingService');

interface IStoredEntry extends ISessionWorkTrackingState {
	readonly resource: string;
}

const emptyState: ISessionWorkTrackingState = Object.freeze({});

function statesEqual(a: ISessionWorkTrackingState, b: ISessionWorkTrackingState): boolean {
	return a.lastOpenedAt === b.lastOpenedAt && a.reviewedResult === b.reviewedResult && a.keepArchiveSuggestion === b.keepArchiveSuggestion;
}

function mergeStates(source: ISessionWorkTrackingState, target: ISessionWorkTrackingState | undefined): ISessionWorkTrackingState {
	const lastOpenedAt = source.lastOpenedAt === undefined ? target?.lastOpenedAt
		: target?.lastOpenedAt === undefined ? source.lastOpenedAt : Math.max(source.lastOpenedAt, target.lastOpenedAt);
	const reviewedResult = target?.reviewedResult ?? source.reviewedResult;
	const keepArchiveSuggestion = source.keepArchiveSuggestion === true || target?.keepArchiveSuggestion === true
		? true : target?.keepArchiveSuggestion ?? source.keepArchiveSuggestion;
	return {
		...(lastOpenedAt !== undefined ? { lastOpenedAt } : {}),
		...(reviewedResult !== undefined ? { reviewedResult } : {}),
		...(keepArchiveSuggestion !== undefined ? { keepArchiveSuggestion } : {}),
	};
}

function isStoredEntry(value: unknown): value is IStoredEntry {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		&& 'resource' in value && typeof value.resource === 'string'
		&& (!('lastOpenedAt' in value) || isSessionWorkTimestamp(value.lastOpenedAt))
		&& (!('reviewedResult' in value) || typeof value.reviewedResult === 'string' && value.reviewedResult.length > 0)
		&& (!('keepArchiveSuggestion' in value) || typeof value.keepArchiveSuggestion === 'boolean')
		&& ('lastOpenedAt' in value || 'reviewedResult' in value || 'keepArchiveSuggestion' in value);
}

function isStoredState(value: unknown): value is { readonly version: 1; readonly entries: readonly unknown[] } {
	return typeof value === 'object' && value !== null && 'version' in value && value.version === 1
		&& 'entries' in value && Array.isArray(value.entries);
}

/** Owns local presentation metadata, independently of provider read state and catalog membership. */
export class SessionWorkTrackingService extends Disposable implements ISessionWorkTrackingService {
	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessions.workTracking';
	private readonly entries: ResourceMap<ISettableObservable<ISessionWorkTrackingState>>;
	private readonly bindings: ResourceMap<IObservable<ISessionWorkTrackingState>>;
	private readonly redirects: ResourceMap<URI>;
	private readonly bindingsChanged = observableSignal(this);

	constructor(
		private readonly now: () => number = Date.now,
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const resourceKey = (resource: URI) => this.uriIdentityService.extUri.getComparisonKey(resource);
		this.entries = new ResourceMap(resourceKey);
		this.bindings = new ResourceMap(resourceKey);
		this.redirects = new ResourceMap(resourceKey);
		this.load();

		this._register(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, SessionWorkTrackingService.STORAGE_KEY, this._store)(event => {
			if (event.external) {
				this.load();
			}
		}));
		this._register(this.managementService.onDidReplaceSession(({ from, to }) => this.migrate(from.resource, to.resource)));
		this._register(this.managementService.onDidReplaceNewDraftSession(({ from, to }) => this.migrate(from.resource, to.resource)));
		this._register(this.managementService.onDidDeleteSession(session => this.delete(session.resource)));
	}

	getState(resource: URI): IObservable<ISessionWorkTrackingState> {
		let binding = this.bindings.get(resource);
		if (!binding) {
			binding = derived(this, reader => {
				this.bindingsChanged.read(reader);
				return this.entries.get(this.resolveResource(resource))?.read(reader) ?? emptyState;
			});
			this.bindings.set(resource, binding);
		}
		return binding;
	}

	markOpened(resource: URI): void {
		const now = this.now();
		if (!isSessionWorkTimestamp(now)) {
			this.logService.warn('[SessionWorkTracking] Cannot record a local opening with an invalid clock value.');
			return;
		}
		this.update(resource, state => ({ ...state, lastOpenedAt: Math.max(state.lastOpenedAt ?? now, now) }));
	}

	markReviewed(session: ISession): void {
		const reviewedResult = readSessionWorkResultVersion(session);
		this.update(session.resource, state => ({ ...state, reviewedResult }));
	}

	keep(resource: URI, keep: boolean): void {
		this.update(resource, state => ({ ...state, keepArchiveSuggestion: keep }));
	}

	private resolveResource(resource: URI): URI {
		let redirected: URI | undefined;
		while ((redirected = this.redirects.get(resource))) {
			resource = redirected;
		}
		return resource;
	}

	private update(resource: URI, update: (state: ISessionWorkTrackingState) => ISessionWorkTrackingState): void {
		resource = this.resolveResource(resource);
		const entry = this.entries.get(resource);
		const state = update(entry?.get() ?? emptyState);
		if (entry && statesEqual(entry.get(), state)) {
			return;
		}
		transaction(tx => {
			if (entry) {
				entry.set(Object.freeze(state), tx);
			} else {
				this.entries.set(resource, observableValue(this, Object.freeze(state)));
				this.bindingsChanged.trigger(tx);
			}
			this.save();
		});
	}

	private migrate(previous: URI, resource: URI): void {
		previous = this.resolveResource(previous);
		resource = this.resolveResource(resource);
		if (this.uriIdentityService.extUri.isEqual(previous, resource)) {
			return;
		}
		const source = this.entries.get(previous)?.get();
		const target = this.entries.get(resource)?.get();
		transaction(tx => {
			if (source) {
				const state = mergeStates(source, target);
				this.entries.get(resource)?.set(Object.freeze(state), tx);
				if (!this.entries.has(resource)) {
					this.entries.set(resource, observableValue(this, Object.freeze(state)));
				}
			}
			this.entries.delete(previous);
			this.redirects.set(previous, resource);
			this.bindingsChanged.trigger(tx);
			if (source) {
				this.save();
			}
		});
	}

	private delete(resource: URI): void {
		resource = this.resolveResource(resource);
		transaction(tx => {
			this.entries.delete(resource);
			const aliases = [...this.redirects.keys()].filter(alias => this.uriIdentityService.extUri.isEqual(this.resolveResource(alias), resource));
			for (const alias of aliases) {
				this.redirects.delete(alias);
				this.bindings.delete(alias);
			}
			this.bindings.delete(resource);
			this.bindingsChanged.trigger(tx);
			this.save();
		});
	}

	private load(): void {
		const raw = this.storageService.get(SessionWorkTrackingService.STORAGE_KEY, StorageScope.WORKSPACE);
		const entries = new ResourceMap<ISessionWorkTrackingState>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
		if (raw !== undefined) {
			let stored: unknown;
			try {
				stored = JSON.parse(raw);
			} catch (error) {
				this.logService.warn('[SessionWorkTracking] Could not parse stored work tracking metadata.', error);
				return;
			}
			if (!isStoredState(stored)) {
				this.logService.warn('[SessionWorkTracking] Ignoring an invalid work tracking storage format.');
				return;
			}
			let invalidEntries = 0;
			for (const entry of stored.entries) {
				if (!isStoredEntry(entry)) {
					invalidEntries++;
					continue;
				}
				let resource: URI;
				try {
					resource = this.resolveResource(URI.parse(entry.resource, true));
				} catch {
					invalidEntries++;
					continue;
				}
				if (entries.has(resource)) {
					invalidEntries++;
				}
				const state: ISessionWorkTrackingState = {
					...(entry.lastOpenedAt !== undefined ? { lastOpenedAt: entry.lastOpenedAt } : {}),
					...(entry.reviewedResult !== undefined ? { reviewedResult: entry.reviewedResult } : {}),
					...(entry.keepArchiveSuggestion !== undefined ? { keepArchiveSuggestion: entry.keepArchiveSuggestion } : {}),
				};
				entries.set(resource, Object.freeze(mergeStates(state, entries.get(resource))));
			}
			if (invalidEntries) {
				this.logService.warn(`[SessionWorkTracking] Ignored ${invalidEntries} invalid work tracking records.`);
			}
		}
		transaction(tx => {
			for (const resource of this.entries.keys()) {
				if (!entries.has(resource)) {
					this.entries.delete(resource);
				}
			}
			for (const [resource, state] of entries) {
				const entry = this.entries.get(resource);
				if (!entry) {
					this.entries.set(resource, observableValue(this, state));
				} else if (!statesEqual(entry.get(), state)) {
					entry.set(state, tx);
				}
			}
			this.bindingsChanged.trigger(tx);
		});
	}

	private save(): void {
		if (!this.entries.size) {
			this.storageService.remove(SessionWorkTrackingService.STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}
		const entries: IStoredEntry[] = [...this.entries].map(([resource, state]) => ({ resource: resource.toString(), ...state.get() }));
		this.storageService.store(SessionWorkTrackingService.STORAGE_KEY, JSON.stringify({ version: 1, entries }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

registerSingleton(ISessionWorkTrackingService, new SyncDescriptor(SessionWorkTrackingService, [undefined]));
