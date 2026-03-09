/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { browserZoomDefaultIndex, browserZoomFactors } from '../../../../platform/browserView/common/browserView.js';

export const IBrowserZoomService = createDecorator<IBrowserZoomService>('browserZoomService');

/** Setting key that holds the per-origin persistent zoom map. */
export const BROWSER_ZOOM_PER_ORIGIN_SETTING = 'workbench.browser.zoom.perOriginZoomLevels';

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
 *  Level 2 (middle)  — Persistent per-origin: `workbench.browser.zoom.perOriginZoomLevels` (user setting).
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
	 * Non-ephemeral: the value is persisted to `workbench.browser.zoom.perOriginZoomLevels`. If it
	 * equals the current default, any existing entry is removed so the view falls back to the default.
	 *
	 * Ephemeral: the value is stored in memory only and always kept within the session
	 * (even when it equals the default) so that it masks any persistent override.
	 */
	setOriginZoomIndex(origin: string, zoomIndex: number, isEphemeral: boolean): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Legacy storage key used before per-origin zoom was promoted to a user setting.
 * Data from this key is migrated to the new setting on first load and then removed.
 */
const LEGACY_STORAGE_KEY = 'browserView.zoom.perOrigin';

/** Debounce delay for flushing pending config writes (ms). */
const CONFIG_WRITE_DEBOUNCE_MS = 500;

export class BrowserZoomService extends Disposable implements IBrowserZoomService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeZoom = this._register(new Emitter<IBrowserZoomChangeEvent>());
	readonly onDidChangeZoom: Event<IBrowserZoomChangeEvent> = this._onDidChangeZoom.event;

	/**
	 * In-memory cache of the persistent per-origin map.
	 * Kept in sync with the configuration setting; written back asynchronously.
	 */
	private _persistentZoomMap: Record<string, number>;

	/** Ephemeral per-origin map: origin string → zoom index (integer). In-memory only. */
	private readonly _ephemeralZoomMap = new Map<string, number>();

	/**
	 * Incremented before writing to configuration, decremented after the write settles.
	 * Used to ignore `onDidChangeConfiguration` events we triggered ourselves.
	 */
	private _pendingConfigWrites = 0;

	/** Timer id for debounced config writes. */
	private _configWriteTimer: Timeout | undefined;

	constructor(
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		// Load from the user setting (primary source).
		this._persistentZoomMap = this._readPersistentZoomMapFromConfig();

		// One-time migration: if the legacy storage key has data and the setting is empty, import it.
		this._migrateFromLegacyStorage(storageService);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.browser.zoom.defaultZoomLevel')) {
				// Signal all views because the baseline changed.
				this._onDidChangeZoom.fire({ origin: undefined, isEphemeralChange: false });
			}

			if (e.affectsConfiguration(BROWSER_ZOOM_PER_ORIGIN_SETTING)) {
				// Skip events caused by our own writes.
				if (this._pendingConfigWrites > 0) {
					return;
				}
				// React to external edits (user modified settings.json manually).
				const oldMap = this._persistentZoomMap;
				const newMap = this._readPersistentZoomMapFromConfig();
				const affectedOrigins = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
				this._persistentZoomMap = newMap;
				for (const origin of affectedOrigins) {
					if (oldMap[origin] !== newMap[origin]) {
						this._onDidChangeZoom.fire({ origin, isEphemeralChange: false });
					}
				}
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
				if (!Object.prototype.hasOwnProperty.call(this._persistentZoomMap, origin)) {
					return;
				}
				delete this._persistentZoomMap[origin];
			} else {
				if (this._persistentZoomMap[origin] === clamped) {
					return;
				}
				this._persistentZoomMap[origin] = clamped;
			}
			this._schedulePersistentWrite();
			this._onDidChangeZoom.fire({ origin, isEphemeralChange: false });
		}
	}

	override dispose(): void {
		// Flush any pending debounced write immediately before disposal.
		if (this._configWriteTimer !== undefined) {
			clearTimeout(this._configWriteTimer);
			this._configWriteTimer = undefined;
			this._flushPersistentWrite();
		}
		super.dispose();
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	private _getDefaultZoomIndex(): number {
		const label = this.configurationService.getValue<string>('workbench.browser.zoom.defaultZoomLevel');
		const index = browserZoomFactors.findIndex(f => `${Math.round(f * 100)}%` === label);
		return index >= 0 ? index : browserZoomDefaultIndex;
	}

	/**
	 * Reads the persistent per-origin zoom map from the user setting.
	 * Ignores any entries with unrecognized zoom labels (tolerates manual edits of unknown values).
	 */
	private _readPersistentZoomMapFromConfig(): Record<string, number> {
		const setting = this.configurationService.getValue<Record<string, string>>(BROWSER_ZOOM_PER_ORIGIN_SETTING) ?? {};
		const result: Record<string, number> = {};
		for (const [origin, label] of Object.entries(setting)) {
			const index = browserZoomFactors.findIndex(f => `${Math.round(f * 100)}%` === label);
			if (index >= 0) {
				result[origin] = index;
			}
		}
		return result;
	}

	/** Converts a zoom index to a locale-independent percentage label (e.g. index 9 → "125%"). */
	private _indexToLabel(index: number): string {
		return `${Math.round(browserZoomFactors[index] * 100)}%`;
	}

	/** Schedules a debounced write of _persistentZoomMap to the user setting. */
	private _schedulePersistentWrite(): void {
		if (this._configWriteTimer !== undefined) {
			clearTimeout(this._configWriteTimer);
		}
		this._configWriteTimer = setTimeout(() => {
			this._configWriteTimer = undefined;
			this._flushPersistentWrite();
		}, CONFIG_WRITE_DEBOUNCE_MS);
	}

	/** Writes _persistentZoomMap to the user setting immediately. */
	private _flushPersistentWrite(): void {
		const map: Record<string, string> = {};
		for (const [origin, index] of Object.entries(this._persistentZoomMap)) {
			map[origin] = this._indexToLabel(index);
		}
		this._pendingConfigWrites++;
		void this.configurationService
			.updateValue(BROWSER_ZOOM_PER_ORIGIN_SETTING, Object.keys(map).length > 0 ? map : undefined, ConfigurationTarget.USER)
			.finally(() => { this._pendingConfigWrites--; });
	}

	/**
	 * One-time migration: if the legacy opaque storage key has data and the new setting is empty,
	 * import the data into the setting and remove the legacy key.
	 */
	private _migrateFromLegacyStorage(storageService: IStorageService): void {
		const raw = storageService.get(LEGACY_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}

		try {
			const parsed: unknown = JSON.parse(raw);
			if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
				// Only migrate when the new setting has no entries yet.
				if (Object.keys(this._persistentZoomMap).length === 0) {
					const map: Record<string, string> = {};
					for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
						if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < browserZoomFactors.length) {
							map[key] = this._indexToLabel(value);
						}
					}
					if (Object.keys(map).length > 0) {
						this._pendingConfigWrites++;
						void this.configurationService
							.updateValue(BROWSER_ZOOM_PER_ORIGIN_SETTING, map, ConfigurationTarget.USER)
							.then(() => { this._persistentZoomMap = this._readPersistentZoomMapFromConfig(); })
							.finally(() => { this._pendingConfigWrites--; });
					}
				}
			}
		} catch {
			// Ignore malformed legacy data.
		}

		storageService.remove(LEGACY_STORAGE_KEY, StorageScope.PROFILE);
	}

	private _clamp(index: number): number {
		return Math.max(0, Math.min(Math.trunc(index), browserZoomFactors.length - 1));
	}
}
