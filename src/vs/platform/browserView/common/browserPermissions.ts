/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';

/**
 * UI-agnostic, per-origin permission model for the integrated browser, modeled
 * on Chromium's user-friendly Site Settings categories rather than the raw
 * Electron permission strings. This module intentionally ships NO UI and no
 * Electron import so it can load in both the main process (authoritative store)
 * and the workbench renderer (read mirror hydrated from storage).
 *
 * The Electron permission string list is taken from Electron's own source
 * (`shell/common/gin_converters/content_converter.cc`), the single source of
 * truth for the strings passed to the permission handlers. Any
 * `blink::PermissionType` Electron does not explicitly name is reported as
 * `'unknown'`.
 */

/**
 * A decision a user can record for a (origin, category) pair. These are the
 * only two values ever persisted; clearing a decision removes it entirely.
 *   - 'allow' -> grant without prompting
 *   - 'deny'  -> reject without prompting
 */
export type PermissionDecision = 'allow' | 'deny';

/**
 * The effective state of a (origin, category) pair: either a recorded
 * {@link PermissionDecision}, or 'ask' when no decision has been recorded.
 * 'ask' is only ever a default/effective value -- it is never stored.
 */
export type PermissionState = PermissionDecision | 'ask';

/**
 * User-facing permission categories. These are deliberately coarser and more
 * meaningful than Electron's raw permission strings. For example Electron's
 * single `media` permission is split into `Camera` and `Microphone`, and the
 * various clipboard permissions collapse into `Clipboard`.
 */
export const enum PermissionCategory {
	Location = 'location',
	Camera = 'camera',
	Microphone = 'microphone',
	Notifications = 'notifications',
	Sensors = 'sensors',
	Clipboard = 'clipboard',
	Devices = 'devices',
}

/**
 * The kinds of hardware-device chooser flows the {@link PermissionCategory.Devices}
 * category gates. Each maps to a distinct Electron device-selection event but is
 * surfaced to the user through one unified request/selection flow.
 */
export type BrowserDeviceType = 'usb' | 'serial' | 'hid' | 'bluetooth';

/**
 * A single hardware device offered to the user during a device-chooser flow.
 * Only plain, user-presentable data crosses the IPC boundary; the opaque
 * `deviceId` is echoed back verbatim to select the device.
 */
export interface IBrowserDeviceCandidate {
	/** Opaque, device-type-specific identifier echoed back to select the device. */
	readonly deviceId: string;
	/** Primary, user-facing label (e.g. product name). */
	readonly label: string;
	/** Optional secondary detail (e.g. manufacturer or vendor:product ids). */
	readonly detail?: string;
}

/**
 * Static metadata describing a category and how it maps to Electron's raw
 * permission strings. A UI can iterate {@link PERMISSION_CATEGORY_DESCRIPTORS}
 * to render a settings list directly from this data.
 */
export interface IPermissionCategoryDescriptor {
	readonly category: PermissionCategory;
	/** Short, human-readable label suitable for a settings row. */
	readonly label: string;
	/** One-line description of what granting this category enables. */
	readonly description: string;
	/** The icon to display for this category. */
	readonly icon: ThemeIcon;
	/** Electron permission strings that map to this category. */
	readonly permissions: string[];
	/** State assumed for this category when an origin has not recorded a decision. */
	readonly defaultState: PermissionState;
}

export const PERMISSION_CATEGORY_DESCRIPTORS: Readonly<Record<PermissionCategory, IPermissionCategoryDescriptor>> = {
	[PermissionCategory.Location]: {
		category: PermissionCategory.Location,
		label: localize('browserPermission.location.label', "Location"),
		description: localize('browserPermission.location.description', "Access this device's geographic location"),
		icon: Codicon.location,
		permissions: ['geolocation', 'geolocation-approximate'],
		defaultState: 'ask',
	},
	[PermissionCategory.Camera]: {
		category: PermissionCategory.Camera,
		label: localize('browserPermission.camera.label', "Camera"),
		description: localize('browserPermission.camera.description', "Capture video from cameras"),
		icon: Codicon.deviceCamera,
		// `media` is shared with Microphone; disambiguated via mediaType/mediaTypes.
		permissions: ['media'],
		defaultState: 'ask',
	},
	[PermissionCategory.Microphone]: {
		category: PermissionCategory.Microphone,
		label: localize('browserPermission.microphone.label', "Microphone"),
		description: localize('browserPermission.microphone.description', "Capture audio from microphones"),
		icon: Codicon.mic,
		permissions: ['media'],
		defaultState: 'ask',
	},
	[PermissionCategory.Sensors]: {
		category: PermissionCategory.Sensors,
		label: localize('browserPermission.sensors.label', "Sensors"),
		description: localize('browserPermission.sensors.description', "Read motion and environmental sensors"),
		icon: Codicon.pulse,
		permissions: ['sensors'],
		defaultState: 'allow',
	},
	[PermissionCategory.Clipboard]: {
		category: PermissionCategory.Clipboard,
		label: localize('browserPermission.clipboard.label', "Clipboard"),
		description: localize('browserPermission.clipboard.description', "Read from and write to the system clipboard"),
		icon: Codicon.clippy,
		permissions: ['clipboard-read'],
		defaultState: 'ask',
	},
	[PermissionCategory.Notifications]: {
		category: PermissionCategory.Notifications,
		label: localize('browserPermission.notifications.label', "Notifications"),
		description: localize('browserPermission.notifications.description', "Display desktop notifications"),
		icon: Codicon.bell,
		permissions: ['notifications'],
		defaultState: 'ask',
	},
	[PermissionCategory.Devices]: {
		category: PermissionCategory.Devices,
		label: localize('browserPermission.devices.label', "Devices"),
		description: localize('browserPermission.devices.description', "Request access to USB, serial, HID, and Bluetooth devices"),
		icon: Codicon.plug,
		// Each device kind has its own native chooser; this decision only gates
		// whether that chooser is allowed to surface. Bluetooth has no Electron
		// permission string (it is gated in the chooser handler directly).
		permissions: ['usb', 'serial', 'hid'],
		defaultState: 'allow',
	},
	/**
	 * Permissions not listed here are either always allowed (see
	 * {@link ALWAYS_ALLOWED_PERMISSIONS}) or, by default, always denied:
	 *
	 * No-op in Electron due to missing backend support
	 *   - Smart Cards (`smart-card`)
	 *   - NFC (`nfc`)
	 *   - Protected Content (`mediaKeySystem`)
	 *   - Augmented / Virtual Reality, Hand Tracking (`ar`, `vr`, `hand-tracking`)
	 *   - Payment Handlers (`payment-handler`)
	 *   - Background Sync (`background-sync`, `periodic-background-sync`, `background-fetch`)
	 *   - Printing (`web-printing`)
	 *   - App Installation (`web-app-installation`)
	 *   - Storage Access (`storage-access`, `top-level-storage-access`)
	 *
	 * Not currently implemented (in approximate order of 'might want')
	 *   - Local Network Access (`local-network-access`, `local-network`, `loopback-network`)
	 *   - Screen Capture, Captured Surface Control (`display-capture`, `captured-surface-control`)
	 *   - File Writing (`fileSystem`)
	 *   - Open External (`openExternal`)
	 *   - MIDI (`midi`, `midiSysex`)
	 *   - Persistent Storage (`persistent-storage`)
	 *   - Device Activity (`idle-detection`)
	 *   - Audio Output (`speaker-selection`)
	 *   - Wake Lock (`screen-wake-lock`, `system-wake-lock`)
	 *   - Window Management (`window-management`)
	 *   - Fonts (`local-fonts`)
	 *   - Automatic Fullscreen (`automatic-fullscreen`)
	 */
};

/**
 * Raw Electron permission strings that are granted unconditionally, with no
 * recorded state and no management control. These are low-risk capabilities
 * that Chrome itself also always grants automatically.
 */
export const ALWAYS_ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set([
	'pointerLock',
	'keyboardLock',
	'fullscreen',
	'clipboard-sanitized-write',
]);

/** Whether a raw Electron permission string is granted unconditionally. */
export function isAlwaysAllowedPermission(permission: string): boolean {
	return ALWAYS_ALLOWED_PERMISSIONS.has(permission);
}

/** All categories, in a stable display order. */
export const ALL_PERMISSION_CATEGORIES: readonly PermissionCategory[] = Object.keys(PERMISSION_CATEGORY_DESCRIPTORS) as PermissionCategory[];

/** The default state for each permission category. */
const DEFAULT_PERMISSION_STATES: Readonly<Record<PermissionCategory, PermissionState>> = Object.freeze(
	Object.fromEntries(ALL_PERMISSION_CATEGORIES.map(category => [category, PERMISSION_CATEGORY_DESCRIPTORS[category].defaultState])) as Record<PermissionCategory, PermissionState>
);

/**
 * Reverse lookup table built once from the descriptors:
 *   electron permission string -> categories that own it.
 * `media` is intentionally omitted here because it requires `details` to
 * disambiguate; it is handled explicitly in {@link electronPermissionToCategories}.
 */
const PERMISSION_TO_CATEGORIES: ReadonlyMap<string, PermissionCategory[]> = (() => {
	const map = new Map<string, PermissionCategory[]>();
	for (const category of ALL_PERMISSION_CATEGORIES) {
		for (const permission of PERMISSION_CATEGORY_DESCRIPTORS[category].permissions) {
			if (permission === 'media') {
				continue;
			}
			const existing = map.get(permission);
			if (existing) {
				existing.push(category);
			} else {
				map.set(permission, [category]);
			}
		}
	}
	return map;
})();

/**
 * Map a raw Electron permission string (from either handler, or a device type)
 * to the user-friendly category/categories it represents.
 *
 * Notes:
 *   - `media` resolves to `Camera`, `Microphone`, or both depending on the
 *     normalized `mediaKinds` hint extracted by the caller from Electron's
 *     details. With no hint it conservatively resolves to both, so the caller
 *     can require the strictest decision.
 *   - `unknown` (and anything unrecognized) resolves to an empty array.
 */
export function electronPermissionToCategories(permission: string, mediaKinds?: ReadonlyArray<'video' | 'audio'>): PermissionCategory[] {
	if (permission === 'media') {
		return resolveMediaCategories(mediaKinds);
	}
	return PERMISSION_TO_CATEGORIES.get(permission) ?? [];
}

function resolveMediaCategories(mediaKinds?: ReadonlyArray<'video' | 'audio'>): PermissionCategory[] {
	const categories = new Set<PermissionCategory>();
	for (const kind of mediaKinds ?? []) {
		categories.add(kind === 'video' ? PermissionCategory.Camera : PermissionCategory.Microphone);
	}
	// No usable hint: assume both so callers apply the strictest decision.
	if (categories.size === 0) {
		return [PermissionCategory.Camera, PermissionCategory.Microphone];
	}
	return [...categories];
}

/**
 * Normalize a full URL down to a stable permission key.
 *
 * For URLs with a real origin (http/https/etc.) this returns the origin
 * (scheme + host + port), e.g. "https://example.com:8443". Host-less URLs such
 * as `file:` have no meaningful origin, so they key off the scheme and full
 * path instead (query and fragment removed), e.g. "file:///home/user/page.html".
 * Falls back to the trimmed raw input if it cannot be parsed.
 */
export function toOriginKey(url: string | undefined | null): string {
	// Trim first so leading/trailing whitespace doesn't push otherwise valid
	// URLs into the catch path. Electron also reports opaque/unique origins
	// (sandboxed frames, data: URLs, etc.) as the literal string "null"; that is
	// not a real host, so treat it as no origin to keep category defaults from
	// applying to it.
	const trimmed = url?.trim();
	if (!trimmed || trimmed === 'null') {
		return '';
	}
	try {
		const parsed = new URL(trimmed);
		// Host-less schemes such as file: have no meaningful origin (it is
		// reported as "null" in Node but "file://" in Chromium), so key off the
		// scheme and full path instead -- query and fragment are dropped.
		if (!parsed.host) {
			return `${parsed.protocol}//${parsed.pathname}`;
		}
		return parsed.origin;
	} catch {
		return trimmed;
	}
}

/** A single recorded grant: which origin, which category, what decision. */
export interface IPermissionGrant {
	readonly origin: string;
	readonly category: PermissionCategory;
	readonly state: PermissionDecision;
}

/**
 * A (category, decision) pair for one (implied) origin; the write API payload.
 * A `null` decision clears any recorded choice, falling back to the default.
 */
export interface IPermissionCategoryState {
	readonly category: PermissionCategory;
	readonly state: PermissionDecision | null;
}

/**
 * On-disk shape of the whole store: `{ origin: { category: decision } }`.
 */
export interface ISerializedBrowserPermissionsSnapshot {
	readonly origins: Readonly<Record<string, Partial<Record<PermissionCategory, PermissionDecision>>>>;
}

const VALID_CATEGORIES = new Set<string>(ALL_PERMISSION_CATEGORIES);

/**
 * In-memory, serializable tracker of permission state keyed by (origin,
 * category). The main process owns the authoritative instance; the workbench
 * keeps a read mirror hydrated from storage. Mutate with `set` / `setMany`,
 * observe with `onDidChange`, persist with `serialize` / `hydrate`.
 */
export class BrowserPermissionStore extends Disposable {

	private readonly _data = new Map<string, Map<PermissionCategory, PermissionDecision>>();

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	/**
	 * The default state assumed for a category when an origin has recorded no decision.
	 */
	defaultStateFor(category: PermissionCategory): PermissionState {
		return PERMISSION_CATEGORY_DESCRIPTORS[category].defaultState;
	}

	/** Get the recorded decision for a (origin, category) pair. */
	getDecision(origin: string, category: PermissionCategory): PermissionDecision | undefined {
		return this._data.get(toOriginKey(origin))?.get(category);
	}

	/**
	 * Resolve the effective boolean decision for a (origin, category) pair,
	 * applying {@link defaultStateFor} when the recorded state is 'ask'.
	 */
	isAllowed(origin: string, category: PermissionCategory): boolean {
		return (this.getDecision(origin, category) ?? this.defaultStateFor(category)) === 'allow';
	}

	/** Set (or clear, via `null`) the decision for a (origin, category) pair. */
	set(origin: string, category: PermissionCategory, decision: PermissionDecision | null): void {
		const key = toOriginKey(origin);
		if (!key) {
			return;
		}

		if (decision === null) {
			const categories = this._data.get(key);
			if (!categories?.delete(category)) {
				return; // nothing changed
			}
			if (categories.size === 0) {
				this._data.delete(key);
			}
		} else {
			let categories = this._data.get(key);
			if (categories?.get(category) === decision) {
				return; // nothing changed
			}
			if (!categories) {
				categories = new Map();
				this._data.set(key, categories);
			}
			categories.set(category, decision);
		}

		this._onDidChange.fire();
	}

	/** Set (or clear) the decision for several categories of one origin at once. */
	setMany(origin: string, grants: Iterable<IPermissionCategoryState>): void {
		for (const { category, state } of grants) {
			this.set(origin, category, state);
		}
	}

	/** Remove all recorded state for an origin. */
	clearOrigin(origin: string): void {
		const key = toOriginKey(origin);
		if (this._data.delete(key)) {
			this._onDidChange.fire();
		}
	}

	/** Remove all recorded state for every origin. */
	clear(): void {
		if (this._data.size === 0) {
			return;
		}
		this._data.clear();
		this._onDidChange.fire();
	}

	/**
	 * Return the full category->state map for one origin, including categories
	 * with no recorded decision. Ideal for rendering a
	 * per-site settings page.
	 */
	getOrigin(origin: string): Record<PermissionCategory, PermissionState> {
		const result: Record<PermissionCategory, PermissionState> = { ...DEFAULT_PERMISSION_STATES };
		const recorded = this._data.get(toOriginKey(origin));
		if (recorded) {
			for (const [category, state] of recorded) {
				result[category] = state;
			}
		}
		return result;
	}

	/** All origins that have at least one recorded decision. */
	origins(): string[] {
		return [...this._data.keys()];
	}

	/** Flat list of every recorded grant. */
	list(): IPermissionGrant[] {
		const grants: IPermissionGrant[] = [];
		for (const [origin, categories] of this._data) {
			for (const [category, state] of categories) {
				grants.push({ origin, category, state });
			}
		}
		return grants;
	}

	serialize(): ISerializedBrowserPermissionsSnapshot {
		const origins: Record<string, Partial<Record<PermissionCategory, PermissionDecision>>> = {};
		for (const [origin, categories] of this._data) {
			const entry: Partial<Record<PermissionCategory, PermissionDecision>> = {};
			for (const [category, state] of categories) {
				entry[category] = state;
			}
			origins[origin] = entry;
		}
		return { origins };
	}

	hydrate(snapshot: ISerializedBrowserPermissionsSnapshot | undefined): void {
		this._data.clear();
		if (snapshot?.origins && typeof snapshot.origins === 'object') {
			for (const [origin, categories] of Object.entries(snapshot.origins)) {
				if (!categories || typeof categories !== 'object') {
					continue;
				}
				const key = toOriginKey(origin);
				if (!key) {
					continue;
				}
				let target: Map<PermissionCategory, PermissionDecision> | undefined;
				for (const [category, state] of Object.entries(categories)) {
					if (!VALID_CATEGORIES.has(category) || (state !== 'allow' && state !== 'deny')) {
						continue;
					}
					if (!target) {
						target = new Map();
						this._data.set(key, target);
					}
					target.set(category as PermissionCategory, state);
				}
			}
		}
		this._onDidChange.fire();
	}
}
