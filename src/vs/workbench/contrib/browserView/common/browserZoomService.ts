/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { browserZoomDefaultIndex, browserZoomFactors } from '../../../../platform/browserView/common/browserView.js';
import { zoomLevelToZoomFactor } from '../../../../platform/window/common/window.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const IBrowserZoomService = createDecorator<IBrowserZoomService>('browserZoomService');

/** Storage key for the per-host persistent zoom map. */
const BROWSER_ZOOM_PER_HOST_STORAGE_KEY = 'browserView.zoomPerHost';

/**
 * Special value for the default zoom level setting that instructs the browser view
 * to dynamically match the closest zoom level to the application's current UI zoom.
 */
export const MATCH_WINDOW_ZOOM_LABEL = 'Match Window';

export interface IBrowserZoomChangeEvent {
	/**
	 * The host (e.g. `"example.com"`) whose zoom changed, or `undefined`
	 * when the global default zoom level changed.
	 */
	readonly host: string | undefined;

	/**
	 * Whether the change came from an ephemeral session.
	 * - `true`  → only ephemeral views need to react.
	 * - `false` → all views (ephemeral and non-ephemeral) for the host may be affected.
	 */
	readonly isEphemeralChange: boolean;
}

/**
 * Manages two independent cascading zoom hierarchies for integrated browser views:
 *
 *  Normal views:    `persistent per-host override` ?? `configured default`
 *  Ephemeral views: `ephemeral per-host override`  ?? `configured default`
 *
 * Ephemeral views never see persistent overrides directly. Instead, when a persistent
 * value changes, it is copied into the ephemeral map so that ephemeral views
 * immediately reflect the new level. Conversely, ephemeral changes never affect
 * normal views.
 *
 * Per-host values that equal the current default are always removed (both persistent
 * and ephemeral), so the view tracks the default going forward.
 */
export interface IBrowserZoomService {
	readonly _serviceBrand: undefined;

	/** Fired whenever the effective zoom for a host may have changed. */
	readonly onDidChangeZoom: Event<IBrowserZoomChangeEvent>;

	/**
	 * Returns the effective zoom index for the given host and session type.
	 * Pass `host = undefined` to obtain only the configured default zoom index.
	 */
	getEffectiveZoomIndex(host: string | undefined, isEphemeral: boolean): number;

	/**
	 * Set the zoom for a host.
	 *
	 * Non-ephemeral: persisted to storage. Also propagated into
	 * the ephemeral map so ephemeral views immediately reflect the change.
	 *
	 * Ephemeral: stored in memory only, dropped on restart.
	 *
	 * In both cases, if the value equals the current default, the entry is removed so the
	 * view tracks the default going forward.
	 */
	setHostZoomIndex(host: string, zoomIndex: number, isEphemeral: boolean): void;

	/**
	 * Notifies the service of the application's current UI zoom factor.
	 * Must be called once on startup and again whenever the window zoom changes.
	 * Only relevant when the default zoom level is set to `MATCH_WINDOW_LABEL`.
	 */
	notifyWindowZoomChanged(windowZoomFactor: number): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Pre-computed map from percentage label (e.g. "125%") to index into browserZoomFactors. */
const ZOOM_LABEL_TO_INDEX = new Map<string, number>(
	browserZoomFactors.map((f, i) => [`${Math.round(f * 100)}%`, i])
);

export class BrowserZoomService extends Disposable implements IBrowserZoomService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeZoom = this._register(new Emitter<IBrowserZoomChangeEvent>());
	readonly onDidChangeZoom: Event<IBrowserZoomChangeEvent> = this._onDidChangeZoom.event;

	/**
	 * In-memory cache of the persistent per-host map.
	 * Backed by IStorageService.
	 */
	private _persistentZoomMap: Record<string, number>;

	/** In-memory only; dropped on restart. */
	private readonly _ephemeralZoomMap = new Map<string, number>();

	private _windowZoomFactor: number = zoomLevelToZoomFactor(0); // default: zoom level 0 → factor 1.0

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this._persistentZoomMap = this._readPersistentZoomMap();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.browser.pageZoom')) {
				this._onDidChangeZoom.fire({ host: undefined, isEphemeralChange: false });
			}
		}));
	}

	getEffectiveZoomIndex(host: string | undefined, isEphemeral: boolean): number {
		if (host !== undefined) {
			if (isEphemeral) {
				const ephemeralIndex = this._ephemeralZoomMap.get(host);
				if (ephemeralIndex !== undefined) {
					return this._clamp(ephemeralIndex);
				}
			} else {
				const persistentIndex = this._persistentZoomMap[host];
				if (persistentIndex !== undefined) {
					return this._clamp(persistentIndex);
				}
			}
		}

		return this._getDefaultZoomIndex();
	}

	setHostZoomIndex(host: string, zoomIndex: number, isEphemeral: boolean): void {
		const clamped = this._clamp(zoomIndex);
		const defaultIndex = this._getDefaultZoomIndex();
		const matchesDefault = clamped === defaultIndex;

		if (isEphemeral) {
			if (matchesDefault) {
				if (!this._ephemeralZoomMap.has(host)) {
					return;
				}
				this._ephemeralZoomMap.delete(host);
			} else {
				if (this._ephemeralZoomMap.get(host) === clamped) {
					return;
				}
				this._ephemeralZoomMap.set(host, clamped);
			}
			this._onDidChangeZoom.fire({ host, isEphemeralChange: true });
		} else {
			let persistentChanged = false;
			if (matchesDefault) {
				if (Object.prototype.hasOwnProperty.call(this._persistentZoomMap, host)) {
					delete this._persistentZoomMap[host];
					persistentChanged = true;
				}
			} else if (this._persistentZoomMap[host] !== clamped) {
				this._persistentZoomMap[host] = clamped;
				persistentChanged = true;
			}

			// Propagate to ephemeral map so ephemeral views immediately reflect the new level.
			let ephemeralChanged = false;
			if (matchesDefault) {
				ephemeralChanged = this._ephemeralZoomMap.delete(host);
			} else if (this._ephemeralZoomMap.get(host) !== clamped) {
				this._ephemeralZoomMap.set(host, clamped);
				ephemeralChanged = true;
			}

			if (!persistentChanged && !ephemeralChanged) {
				return;
			}
			if (persistentChanged) {
				this._writePersistentZoomMap();
			}
			this._onDidChangeZoom.fire({ host, isEphemeralChange: false });
		}
	}

	notifyWindowZoomChanged(windowZoomFactor: number): void {
		this._windowZoomFactor = windowZoomFactor;
		const label = this.configurationService.getValue<string>('workbench.browser.pageZoom');
		if (label === MATCH_WINDOW_ZOOM_LABEL) {
			this._onDidChangeZoom.fire({ host: undefined, isEphemeralChange: false });
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private _getDefaultZoomIndex(): number {
		const label = this.configurationService.getValue<string>('workbench.browser.pageZoom');
		if (label === MATCH_WINDOW_ZOOM_LABEL) {
			return this._getMatchWindowZoomIndex();
		}
		return ZOOM_LABEL_TO_INDEX.get(label) ?? browserZoomDefaultIndex;
	}

	/**
	 * Finds the browser zoom index whose factor is closest to the application's current UI zoom
	 * factor, measuring distance on a log scale (since window zoom levels are powers of 1.2).
	 */
	private _getMatchWindowZoomIndex(): number {
		const windowFactor = this._windowZoomFactor;
		let bestIndex = browserZoomDefaultIndex;
		let bestDist = Infinity;
		for (let i = 0; i < browserZoomFactors.length; i++) {
			const dist = Math.abs(Math.log(browserZoomFactors[i]) - Math.log(windowFactor));
			if (dist < bestDist) {
				bestDist = dist;
				bestIndex = i;
			}
		}
		return bestIndex;
	}

	/**
	 * Reads the persistent per-host zoom map from storage.
	 * The stored format is a JSON object mapping host strings to zoom indices.
	 */
	private _readPersistentZoomMap(): Record<string, number> {
		const raw = this.storageService.get(BROWSER_ZOOM_PER_HOST_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return {};
		}
		try {
			const parsed = JSON.parse(raw);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				return {};
			}
			const result: Record<string, number> = {};
			for (const [host, index] of Object.entries(parsed)) {
				if (typeof index === 'number' && index >= 0 && index < browserZoomFactors.length) {
					result[host] = index;
				}
			}
			return result;
		} catch {
			return {};
		}
	}

	private _writePersistentZoomMap(): void {
		const hasEntries = Object.keys(this._persistentZoomMap).length > 0;
		if (hasEntries) {
			this.storageService.store(BROWSER_ZOOM_PER_HOST_STORAGE_KEY, JSON.stringify(this._persistentZoomMap), StorageScope.PROFILE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(BROWSER_ZOOM_PER_HOST_STORAGE_KEY, StorageScope.PROFILE);
		}
	}

	private _clamp(index: number): number {
		return Math.max(0, Math.min(Math.trunc(index), browserZoomFactors.length - 1));
	}
}
