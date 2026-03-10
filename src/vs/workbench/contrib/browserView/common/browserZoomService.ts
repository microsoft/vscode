/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { browserZoomDefaultIndex, browserZoomFactors } from '../../../../platform/browserView/common/browserView.js';
import { zoomLevelToZoomFactor } from '../../../../platform/window/common/window.js';

export const IBrowserZoomService = createDecorator<IBrowserZoomService>('browserZoomService');

/** Setting key that holds the per-host persistent zoom map. */
export const BROWSER_ZOOM_PER_HOST_SETTING = 'workbench.browser.zoom.zoomLevels';

/**
 * Special value for the default zoom level setting that instructs the browser view
 * to dynamically match the closest zoom level to VS Code's current UI zoom.
 */
export const MATCH_VSCODE_LABEL = 'Match VS Code';

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
 * Manages the three-level cascading zoom hierarchy for integrated browser views:
 *
 *  Level 1 (lowest)  — Configured default: `workbench.browser.zoom.pageZoom`
 *  Level 2 (middle)  — Persistent per-host: `workbench.browser.zoom.zoomLevels` (user setting).
 *  Level 3 (highest) — Ephemeral per-host: in-memory only, never persisted across restarts.
 *
 * Cascade resolution (highest-priority first):
 *   `ephemeral override` ?? `persistent override` ?? `configured default`
 *
 * Key rules:
 *  - A persistent per-host value that equals the current default is never stored; it is removed
 *    so the view falls back to the default cleanly.
 *  - Ephemeral overrides are always stored in memory (to mask persistent values within a session)
 *    and are silently dropped on VS Code restart.
 *  - A non-ephemeral change propagates to ALL views (ephemeral views inherit persistent values).
 *  - An ephemeral change propagates only to ephemeral views; non-ephemeral views are unaffected.
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
	 * Non-ephemeral: the value is persisted to `workbench.browser.zoom.zoomLevels`. If it
	 * equals the current default, any existing entry is removed so the view falls back to the default.
	 *
	 * Ephemeral: the value is stored in memory only and always kept within the session
	 * (even when it equals the default) so that it masks any persistent override.
	 */
	setHostZoomIndex(host: string, zoomIndex: number, isEphemeral: boolean): void;

	/**
	 * Notifies the service of VS Code's current UI zoom factor.
	 * Must be called once on startup and again whenever VS Code's zoom changes.
	 * Only relevant when the default zoom level is set to `MATCH_VSCODE_LABEL`.
	 */
	notifyVSCodeZoomChanged(vsCodeZoomFactor: number): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Debounce delay for flushing pending config writes (ms). */
const CONFIG_WRITE_DEBOUNCE_MS = 500;

export class BrowserZoomService extends Disposable implements IBrowserZoomService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeZoom = this._register(new Emitter<IBrowserZoomChangeEvent>());
	readonly onDidChangeZoom: Event<IBrowserZoomChangeEvent> = this._onDidChangeZoom.event;

	/**
	 * In-memory cache of the persistent per-host map.
	 * Kept in sync with the configuration setting; written back asynchronously.
	 */
	private _persistentZoomMap: Record<string, number>;

	/** Ephemeral per-host map: host string → zoom index (integer). In-memory only. */
	private readonly _ephemeralZoomMap = new Map<string, number>();

	/**
	 * Incremented before writing to configuration, decremented after the write settles.
	 * Used to ignore `onDidChangeConfiguration` events we triggered ourselves.
	 */
	private _pendingConfigWrites = 0;

	/** Timer id for debounced config writes. */
	private _configWriteTimer: Timeout | undefined;

	/** Current VS Code UI zoom factor, kept in sync via notifyVSCodeZoomChanged(). */
	private _vsCodeZoomFactor: number = zoomLevelToZoomFactor(0); // default: zoom level 0 → factor 1.0

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		// Load from the user setting.
		this._persistentZoomMap = this._readPersistentZoomMapFromConfig();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.browser.zoom.pageZoom')) {
				// Signal all views because the baseline changed.
				this._onDidChangeZoom.fire({ host: undefined, isEphemeralChange: false });
			}

			if (e.affectsConfiguration(BROWSER_ZOOM_PER_HOST_SETTING)) {
				// Skip events caused by our own writes.
				if (this._pendingConfigWrites > 0) {
					return;
				}
				// React to external edits (user modified settings.json manually).
				const oldMap = this._persistentZoomMap;
				const newMap = this._readPersistentZoomMapFromConfig();
				const affectedHosts = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
				this._persistentZoomMap = newMap;
				for (const host of affectedHosts) {
					if (oldMap[host] !== newMap[host]) {
						this._onDidChangeZoom.fire({ host, isEphemeralChange: false });
					}
				}
			}
		}));
	}

	getEffectiveZoomIndex(host: string | undefined, isEphemeral: boolean): number {
		if (host !== undefined) {
			// Highest priority: ephemeral override (only for ephemeral sessions).
			if (isEphemeral) {
				const ephemeralIndex = this._ephemeralZoomMap.get(host);
				if (ephemeralIndex !== undefined) {
					return this._clamp(ephemeralIndex);
				}
			}

			// Middle priority: persistent per-host override.
			const persistentIndex = this._persistentZoomMap[host];
			if (persistentIndex !== undefined) {
				return this._clamp(persistentIndex);
			}
		}

		// Lowest priority: configured default.
		return this._getDefaultZoomIndex();
	}

	setHostZoomIndex(host: string, zoomIndex: number, isEphemeral: boolean): void {
		const clamped = this._clamp(zoomIndex);

		if (isEphemeral) {
			// Always store in the ephemeral map to mask persistent values within the session.
			const prev = this._ephemeralZoomMap.get(host);
			if (prev === clamped) {
				return;
			}
			this._ephemeralZoomMap.set(host, clamped);
			this._onDidChangeZoom.fire({ host, isEphemeralChange: true });
		} else {
			const defaultIndex = this._getDefaultZoomIndex();
			if (clamped === defaultIndex) {
				// Value matches the default: remove the stored entry so the view falls back cleanly.
				if (!Object.prototype.hasOwnProperty.call(this._persistentZoomMap, host)) {
					return;
				}
				delete this._persistentZoomMap[host];
			} else {
				if (this._persistentZoomMap[host] === clamped) {
					return;
				}
				this._persistentZoomMap[host] = clamped;
			}
			this._schedulePersistentWrite();
			this._onDidChangeZoom.fire({ host, isEphemeralChange: false });
		}
	}

	notifyVSCodeZoomChanged(vsCodeZoomFactor: number): void {
		this._vsCodeZoomFactor = vsCodeZoomFactor;
		const label = this.configurationService.getValue<string>('workbench.browser.zoom.pageZoom');
		if (label === MATCH_VSCODE_LABEL) {
			this._onDidChangeZoom.fire({ host: undefined, isEphemeralChange: false });
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
		const label = this.configurationService.getValue<string>('workbench.browser.zoom.pageZoom');
		if (label === MATCH_VSCODE_LABEL) {
			return this._getMatchVSCodeZoomIndex();
		}
		const index = browserZoomFactors.findIndex(f => `${Math.round(f * 100)}%` === label);
		return index >= 0 ? index : browserZoomDefaultIndex;
	}

	/**
	 * Finds the browser zoom index whose factor is closest to VS Code's current UI zoom
	 * factor, measuring distance on a log scale (since VS Code zoom levels are powers of 1.2).
	 */
	private _getMatchVSCodeZoomIndex(): number {
		const vscodeFactor = this._vsCodeZoomFactor;
		let bestIndex = browserZoomDefaultIndex;
		let bestDist = Infinity;
		for (let i = 0; i < browserZoomFactors.length; i++) {
			const dist = Math.abs(Math.log(browserZoomFactors[i]) - Math.log(vscodeFactor));
			if (dist < bestDist) {
				bestDist = dist;
				bestIndex = i;
			}
		}
		return bestIndex;
	}

	/**
	 * Reads the persistent per-host zoom map from the user setting.
	 * Ignores any entries with unrecognized zoom labels (tolerates manual edits of unknown values).
	 */
	private _readPersistentZoomMapFromConfig(): Record<string, number> {
		const setting = this.configurationService.getValue<Record<string, string>>(BROWSER_ZOOM_PER_HOST_SETTING) ?? {};
		const result: Record<string, number> = {};
		for (const [host, label] of Object.entries(setting)) {
			const index = browserZoomFactors.findIndex(f => `${Math.round(f * 100)}%` === label);
			if (index >= 0) {
				result[host] = index;
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
		for (const [host, index] of Object.entries(this._persistentZoomMap)) {
			map[host] = this._indexToLabel(index);
		}
		this._pendingConfigWrites++;
		void this.configurationService
			.updateValue(BROWSER_ZOOM_PER_HOST_SETTING, Object.keys(map).length > 0 ? map : undefined, ConfigurationTarget.USER)
			.finally(() => { this._pendingConfigWrites--; });
	}

	private _clamp(index: number): number {
		return Math.max(0, Math.min(Math.trunc(index), browserZoomFactors.length - 1));
	}
}
