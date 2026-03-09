/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { browserZoomDefaultIndex, browserZoomFactors } from '../../../../platform/browserView/common/browserView.js';

export const IBrowserZoomService = createDecorator<IBrowserZoomService>('browserZoomService');

export interface IBrowserZoomChangeEvent {
	/**
	 * The origin (e.g. `"https://example.com"`) whose zoom changed, or `undefined`
	 * when the global default zoom level changed.
	 */
	readonly origin: string | undefined;

	/**
	 * Whether the change came from an ephemeral session.
	 * - `true`  → only ephemeral views need to react.
	 * - `false` → all views (ephemeral and non-ephemeral) for the origin may be affected.
	 */
	readonly isEphemeralChange: boolean;
}

/**
 * Manages the three-level cascading zoom hierarchy for integrated browser views:
 *
 *  Level 1 (lowest)  — Configured default: `workbench.browser.zoom.defaultZoomLevel`
 *  Level 2 (middle)  — Persistent per-origin: stored in the user profile, never in ephemeral sessions.
 *  Level 3 (highest) — Ephemeral per-origin: in-memory only, never persisted across restarts.
 *
 * Cascade resolution (highest-priority first):
 *   `ephemeral override` ?? `persistent override` ?? `configured default`
 *
 * Key rules:
 *  - A persistent per-origin value that equals the current default is never stored; it is removed
 *    so the view falls back to the default cleanly.
 *  - Ephemeral overrides are always stored in memory (to mask persistent values within a session)
 *    and are silently dropped on VS Code restart.
 *  - A non-ephemeral change propagates to ALL views (ephemeral views inherit persistent values).
 *  - An ephemeral change propagates only to ephemeral views; non-ephemeral views are unaffected.
 */
export interface IBrowserZoomService {
	readonly _serviceBrand: undefined;

	/** Fired whenever the effective zoom for an origin may have changed. */
	readonly onDidChangeZoom: Event<IBrowserZoomChangeEvent>;

	/**
	 * Returns the effective zoom index for the given origin and session type.
	 * Pass `origin = undefined` to obtain only the configured default zoom index.
	 */
	getEffectiveZoomIndex(origin: string | undefined, isEphemeral: boolean): number;

	/**
	 * Set the zoom for an origin.
	 *
	 * Non-ephemeral: the value is persisted to user profile storage. If it equals the
	 * current default, any existing entry is removed so the view falls back to the default.
	 *
	 * Ephemeral: the value is stored in memory only and always persisted within the session
	 * (even when it equals the default) so that it masks any persistent override.
	 */
	setOriginZoomIndex(origin: string, zoomIndex: number, isEphemeral: boolean): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Storage key for the per-origin persistent zoom map (profile-scoped). */
const PERSISTENT_ZOOM_STORAGE_KEY = 'browserView.zoom.perOrigin';

export class BrowserZoomService extends Disposable implements IBrowserZoomService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeZoom = this._register(new Emitter<IBrowserZoomChangeEvent>());
	readonly onDidChangeZoom: Event<IBrowserZoomChangeEvent> = this._onDidChangeZoom.event;

	/** Persistent per-origin map: origin string → zoom index (integer). */
	private _persistentZoomMap: Record<string, number>;

	/** Ephemeral per-origin map: origin string → zoom index (integer). In-memory only. */
	private readonly _ephemeralZoomMap = new Map<string, number>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._persistentZoomMap = this._loadPersistentZoomMap();

		// React to changes in the configured default zoom level.
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.browser.zoom.defaultZoomLevel')) {
				// Signal all views (ephemeral and non-ephemeral) because the baseline changed.
				this._onDidChangeZoom.fire({ origin: undefined, isEphemeralChange: false });
			}
		}));
	}

	getEffectiveZoomIndex(origin: string | undefined, isEphemeral: boolean): number {
		if (origin !== undefined) {
			// Highest priority: ephemeral override (only for ephemeral sessions).
			if (isEphemeral) {
				const ephemeralIndex = this._ephemeralZoomMap.get(origin);
				if (ephemeralIndex !== undefined) {
					return this._clamp(ephemeralIndex);
				}
			}

			// Middle priority: persistent per-origin override.
			const persistentIndex = this._persistentZoomMap[origin];
			if (persistentIndex !== undefined) {
				return this._clamp(persistentIndex);
			}
		}

		// Lowest priority: configured default.
		return this._getDefaultZoomIndex();
	}

	setOriginZoomIndex(origin: string, zoomIndex: number, isEphemeral: boolean): void {
		const clamped = this._clamp(zoomIndex);

		if (isEphemeral) {
			// Always store in the ephemeral map to mask persistent values within the session.
			const prev = this._ephemeralZoomMap.get(origin);
			if (prev === clamped) {
				return;
			}
			this._ephemeralZoomMap.set(origin, clamped);
			this._onDidChangeZoom.fire({ origin, isEphemeralChange: true });
		} else {
			const defaultIndex = this._getDefaultZoomIndex();
			if (clamped === defaultIndex) {
				// Value matches the default: remove the stored entry so the view falls back cleanly.
				const hadEntry = Object.prototype.hasOwnProperty.call(this._persistentZoomMap, origin);
				if (!hadEntry) {
					return;
				}
				delete this._persistentZoomMap[origin];
			} else {
				const prev = this._persistentZoomMap[origin];
				if (prev === clamped) {
					return;
				}
				this._persistentZoomMap[origin] = clamped;
			}
			this._savePersistentZoomMap();
			this._onDidChangeZoom.fire({ origin, isEphemeralChange: false });
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private _getDefaultZoomIndex(): number {
		const label = this.configurationService.getValue<string>('workbench.browser.zoom.defaultZoomLevel');
		const index = browserZoomFactors.findIndex(f => `${Math.round(f * 100)}%` === label);
		return index >= 0 ? index : browserZoomDefaultIndex;
	}

	private _loadPersistentZoomMap(): Record<string, number> {
		try {
			const raw = this.storageService.get(PERSISTENT_ZOOM_STORAGE_KEY, StorageScope.PROFILE);
			if (raw) {
				const parsed: unknown = JSON.parse(raw);
				if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
					// Validate that all values are integers within a valid range.
					const result: Record<string, number> = {};
					for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
						if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < browserZoomFactors.length) {
							result[key] = value;
						}
					}
					return result;
				}
			}
		} catch {
			// Ignore malformed or missing storage.
		}
		return {};
	}

	private _savePersistentZoomMap(): void {
		this.storageService.store(
			PERSISTENT_ZOOM_STORAGE_KEY,
			JSON.stringify(this._persistentZoomMap),
			StorageScope.PROFILE,
			StorageTarget.USER
		);
	}

	private _clamp(index: number): number {
		return Math.max(0, Math.min(Math.trunc(index), browserZoomFactors.length - 1));
	}
}
