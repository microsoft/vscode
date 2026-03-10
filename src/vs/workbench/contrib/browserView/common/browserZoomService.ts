/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
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
	 * Non-ephemeral: persisted to `workbench.browser.zoom.zoomLevels`. Also propagated into
	 * the ephemeral map so ephemeral views immediately reflect the change.
	 *
	 * Ephemeral: stored in memory only, dropped on restart.
	 *
	 * In both cases, if the value equals the current default, the entry is removed so the
	 * view tracks the default going forward.
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

const CONFIG_WRITE_DEBOUNCE_MS = 500;

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
	 * Kept in sync with the configuration setting; written back asynchronously.
	 */
	private _persistentZoomMap: Record<string, number>;

	/** In-memory only; dropped on restart. */
	private readonly _ephemeralZoomMap = new Map<string, number>();

	/** Used to ignore `onDidChangeConfiguration` events we triggered ourselves. */
	private _pendingConfigWrites = 0;

	private readonly _debouncedWrite: RunOnceScheduler;

	private _vsCodeZoomFactor: number = zoomLevelToZoomFactor(0); // default: zoom level 0 → factor 1.0

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._debouncedWrite = this._register(new RunOnceScheduler(() => this._flushPersistentWrite(), CONFIG_WRITE_DEBOUNCE_MS));

		this._persistentZoomMap = this._readPersistentZoomMapFromConfig();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.browser.zoom.pageZoom')) {
				this._onDidChangeZoom.fire({ host: undefined, isEphemeralChange: false });
			}

			if (e.affectsConfiguration(BROWSER_ZOOM_PER_HOST_SETTING)) {
				if (this._pendingConfigWrites > 0) {
					return;
				}
				const oldMap = this._persistentZoomMap;
				const newMap = this._readPersistentZoomMapFromConfig();
				const defaultIndex = this._getDefaultZoomIndex();
				const affectedHosts = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
				this._persistentZoomMap = newMap;
				for (const host of affectedHosts) {
					if (oldMap[host] !== newMap[host]) {
						// Propagate to ephemeral map.
						const newIndex = newMap[host];
						if (newIndex === undefined || newIndex === defaultIndex) {
							this._ephemeralZoomMap.delete(host);
						} else {
							this._ephemeralZoomMap.set(host, newIndex);
						}
						this._onDidChangeZoom.fire({ host, isEphemeralChange: false });
					}
				}
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
				this._schedulePersistentWrite();
			}
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
		if (this._debouncedWrite.isScheduled()) {
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
		return ZOOM_LABEL_TO_INDEX.get(label) ?? browserZoomDefaultIndex;
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
			const index = ZOOM_LABEL_TO_INDEX.get(label);
			if (index !== undefined) {
				result[host] = index;
			}
		}
		return result;
	}

	/** Converts a zoom index to a locale-independent percentage label (e.g. index 9 → "125%"). */
	private _indexToLabel(index: number): string {
		return `${Math.round(browserZoomFactors[index] * 100)}%`;
	}

	private _schedulePersistentWrite(): void {
		this._debouncedWrite.schedule();
	}

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
