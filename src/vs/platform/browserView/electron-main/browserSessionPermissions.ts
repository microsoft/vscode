/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IApplicationStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { StorageScope, StorageTarget } from '../../storage/common/storage.js';
import {
	BrowserPermissionStore,
	IPermissionCategoryState,
	ISerializedBrowserPermissionsSnapshot,
	PermissionCategory,
	electronPermissionToCategories,
	isAlwaysAllowedPermission,
	toOriginKey,
} from '../common/browserPermissions.js';
import { BrowserViewStorageScope, IBrowserViewPermissionRequestEvent, IBrowserViewStorageKeys } from '../common/browserView.js';
import type { BrowserSession } from './browserSession.js';

/** Time the main process waits for a prompt answer before a non-persisted deny. */
const PROMPT_TIMEOUT_MS = 30_000;

/**
 * Fired when a permission request for an undecided category needs UI. The view
 * that owns {@link webContents} should {@link claim} it and surface a prompt;
 * if no listener claims it, the request is left undecided (effective deny).
 */
export interface IBrowserSessionPermissionRequest {
	/** The top-level web contents the request originates from. */
	readonly webContents: Electron.WebContents;
	/** The origin + category being requested. */
	readonly request: IBrowserViewPermissionRequestEvent;
	/** Called by the owning view to take responsibility for prompting. */
	claim(): void;
}


export interface IBrowserSessionPermissions {
	readonly storageKeys: IBrowserViewStorageKeys;
	/**
	 * Fires when an undecided permission needs UI. Each browser view listens and
	 * claims the requests targeting its own web contents.
	 */
	readonly onDidRequestPermission: Event<IBrowserSessionPermissionRequest>;
	/** Fires whenever any recorded decision changes (including hydrate / clear). */
	readonly onDidChange: Event<void>;
	/** Current snapshot of all recorded decisions, mirrored to the workbench. */
	serialize(): ISerializedBrowserPermissionsSnapshot;
	/** Record permission decisions for an origin and persist immediately. */
	set(origin: string, grants: readonly IPermissionCategoryState[]): void;
	/** Clear all recorded permission state for this session. */
	clear(): void;
}

interface IPendingRequest {
	readonly origin: string;
	readonly category: PermissionCategory;
	readonly deferred: DeferredPromise<void>;
}

/**
 * Per-{@link BrowserSession} permission state. Owns the authoritative
 * {@link BrowserPermissionStore}, installs the Electron permission handlers that
 * consult it, and brokers prompts for categories that have no recorded decision.
 *
 * Every change to the store is flushed to application storage immediately so
 * decisions survive a crash right after they are made.
 */
export class BrowserSessionPermissions extends Disposable implements IBrowserSessionPermissions {

	private readonly _permissionStore = this._register(new BrowserPermissionStore());

	/** Fires on any change to the store (set, clear, hydrate). */
	readonly onDidChange: Event<void> = this._permissionStore.onDidChange;

	private _storage: IApplicationStorageMainService | undefined;
	private _persistable = false;

	/** While set, store changes are coalesced into a single deferred flush. */
	private _batching = false;
	private _batchDirty = false;

	private readonly _onDidRequestPermission = this._register(new Emitter<IBrowserSessionPermissionRequest>());
	readonly onDidRequestPermission = this._onDidRequestPermission.event;

	private readonly _pending = new Set<IPendingRequest>();

	readonly storageKeys: IBrowserViewStorageKeys;

	constructor(session: BrowserSession) {
		super();

		this.storageKeys = session.storageScope === BrowserViewStorageScope.Ephemeral
			? {}
			: { permissions: `browser.permissions.${session.id}` };

		this._register(this._permissionStore.onDidChange(() => {
			this._resolvePending();
			// During a batched `set()` defer the write so several category
			// changes collapse into a single storage flush.
			if (this._batching) {
				this._batchDirty = true;
				return;
			}
			if (this._persistable) {
				this._flushNow();
			}
		}));

		this._register(toDisposable(() => {
			for (const pending of this._pending) {
				pending.deferred.complete();
			}
			this._pending.clear();
		}));
	}

	/**
	 * Install the permission request / check / device handlers on the session.
	 * Backed entirely by {@link BrowserPermissionStore}; unrecorded categories
	 * are brokered to the owning browser view via {@link onDidRequestPermission}.
	 */
	configure(electronSession: Electron.Session): void {
		electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
			this._resolveRequest(webContents, permission, details).then(callback, () => callback(false));
		});
		electronSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
			if (isAlwaysAllowedPermission(permission)) {
				return true;
			}
			// Prefer the full requesting URL so file: documents key off their
			// path; `requestingUrl` is absent for cross-origin subframes, in
			// which case Electron only gives us the bare origin.
			const origin = toOriginKey(details.requestingUrl || requestingOrigin);
			const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
			if (categories.length === 0) {
				return false;
			}
			// Synchronous gate used by Blink pre-checks and `permissions.query`.
			// Categories with no recorded decision fall back to their
			// `defaultState` (e.g. Location / Camera are deny-by-default until
			// granted, while others may allow by default).
			return categories.every(category => this._permissionStore.isAllowed(origin, category));
		});
	}

	connectStorage(storage: IApplicationStorageMainService): void {
		if (this._storage || !this.storageKeys.permissions) {
			return;
		}
		this._storage = storage;
		this._load();
		this._persistable = true;
	}

	serialize(): ISerializedBrowserPermissionsSnapshot {
		return this._permissionStore.serialize();
	}

	set(origin: string, grants: readonly IPermissionCategoryState[]): void {
		// Coalesce the per-category onDidChange flushes into a single write for
		// the whole batch so persisting from the management UI isn't N writes.
		this._batching = true;
		this._batchDirty = false;
		try {
			this._permissionStore.setMany(origin, grants);
		} finally {
			this._batching = false;
		}
		if (this._batchDirty && this._persistable) {
			this._flushNow();
		}
	}

	clear(): void {
		this._permissionStore.clear();
	}

	private async _resolveRequest(webContents: Electron.WebContents | null, permission: string, details: PermissionRequestDetails | undefined): Promise<boolean> {
		if (isAlwaysAllowedPermission(permission)) {
			return true;
		}
		const origin = toOriginKey(details?.requestingUrl ?? webContents?.getURL());
		const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
		if (categories.length === 0 || !origin) {
			return false;
		}

		// Fast paths that need no prompt. A category whose effective decision is
		// already 'allow' -- either an explicit user grant or an allow-by-default
		// category -- is granted silently. This keeps the async request handler
		// consistent with the synchronous check handler (both use `isAllowed`).
		// An explicit 'deny' short-circuits without prompting.
		if (categories.every(category => this._permissionStore.isAllowed(origin, category))) {
			return true;
		}
		if (categories.some(category => this._permissionStore.getDecision(origin, category) === 'deny')) {
			return false;
		}

		// At least one category is undecided: prompt for each undecided one. Do
		// this sequentially so we never surface two modal prompts at once (e.g.
		// a single `media` request maps to both Camera and Microphone).
		for (const category of categories) {
			if (!this._permissionStore.getDecision(origin, category)) {
				await this._prompt(webContents, origin, category);
			}
		}

		return categories.every(category => this._permissionStore.isAllowed(origin, category));
	}

	private _prompt(webContents: Electron.WebContents | null, origin: string, category: PermissionCategory): Promise<void> {
		let claimed = false;
		if (webContents) {
			// Fire synchronously: the owning view claims the request before fire()
			// returns, so we know whether any UI will surface a prompt.
			this._onDidRequestPermission.fire({
				webContents,
				request: { origin, category },
				claim: () => { claimed = true; },
			});
		}
		if (!claimed) {
			// No view to ask -- leave undecided (effective deny by default state).
			return Promise.resolve();
		}

		const pending: IPendingRequest = { origin, category, deferred: new DeferredPromise<void>() };
		this._pending.add(pending);

		const timer = setTimeout(() => pending.deferred.complete(), PROMPT_TIMEOUT_MS);
		return pending.deferred.p.finally(() => {
			clearTimeout(timer);
			this._pending.delete(pending);
		});
	}

	/** Resolve any pending request whose (origin, category) now has a decision. */
	private _resolvePending(): void {
		if (this._pending.size === 0) {
			return;
		}
		for (const pending of [...this._pending]) {
			if (this._permissionStore.getDecision(pending.origin, pending.category)) {
				pending.deferred.complete();
			}
		}
	}

	private _load(): void {
		const storage = this._storage;
		const key = this.storageKeys.permissions;
		if (!storage || !key) {
			return;
		}
		const snapshot = parseSnapshot<ISerializedBrowserPermissionsSnapshot>(storage.get(key, StorageScope.APPLICATION));
		// Hydration fires onDidChange; suppress flushes so we don't rewrite what we just read.
		this._persistable = false;
		try {
			this._permissionStore.hydrate(snapshot);
		} finally {
			this._persistable = true;
		}
	}

	private _flushNow(): void {
		const storage = this._storage;
		const key = this.storageKeys.permissions;
		if (!storage || !key) {
			return;
		}
		const snapshot = this._permissionStore.serialize();
		if (Object.keys(snapshot.origins).length === 0) {
			storage.remove(key, StorageScope.APPLICATION);
		} else {
			storage.store(key, JSON.stringify(snapshot), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}
}

function parseSnapshot<T>(raw: string | undefined): T | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw) as T;
		if (!parsed || typeof parsed !== 'object') {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

/**
 * The Electron details union passed to `setPermissionRequestHandler`. All
 * variants extend `PermissionRequest` (so share `requestingUrl`); only
 * `MediaAccessPermissionRequest` adds `mediaTypes`.
 */
type PermissionRequestDetails =
	| Electron.PermissionRequest
	| Electron.FilesystemPermissionRequest
	| Electron.MediaAccessPermissionRequest
	| Electron.OpenExternalPermissionRequest;

/**
 * Normalize the media hint from either permission handler's Electron details
 * into a `('video' | 'audio')[]`. The request handler supplies `mediaTypes`
 * (an array); the check handler supplies a single `mediaType`. Returns
 * `undefined` when there is no usable hint, so the mapper can assume both.
 */
function mediaKindsFromDetails(details: PermissionRequestDetails | Electron.PermissionCheckHandlerHandlerDetails | undefined): ('video' | 'audio')[] | undefined {
	if (!details) {
		return undefined;
	}
	const kinds = new Set<'video' | 'audio'>();
	// eslint-disable-next-line local/code-no-in-operator
	if ('mediaTypes' in details && details.mediaTypes) {
		for (const kind of details.mediaTypes) {
			kinds.add(kind);
		}
	}
	// eslint-disable-next-line local/code-no-in-operator
	if ('mediaType' in details && (details.mediaType === 'video' || details.mediaType === 'audio')) {
		kinds.add(details.mediaType);
	}
	return kinds.size ? [...kinds] : undefined;
}
