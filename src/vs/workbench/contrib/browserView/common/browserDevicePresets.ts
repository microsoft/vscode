/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBrowserDeviceProfile } from '../../../../platform/browserView/common/browserView.js';

/**
 * A named device preset. Applying a preset stamps its `device` (including
 * any embedded viewport width/height) onto the active device profile, while
 * preserving the user's current scale.
 */
export interface IBrowserDevicePreset {
	readonly name: string;
	readonly device?: IBrowserDeviceProfile;
}

export const BrowserCustomDevicePresetsSettingId = 'workbench.browser.customDevicePresets';

/** Matches the emulation toolbar's dimension inputs. */
export const BROWSER_DEVICE_MIN_DIMENSION = 1;
export const BROWSER_DEVICE_MAX_DIMENSION = 9999;

export const BROWSER_DEVICE_MIN_SCALE_FACTOR = 0.25;
export const BROWSER_DEVICE_MAX_SCALE_FACTOR = 10;

const MAX_PRESET_NAME_LENGTH = 100;
const MAX_USER_AGENT_LENGTH = 2048;

export const DEFAULT_BROWSER_DEVICE_PRESETS: readonly IBrowserDevicePreset[] = [
	{
		name: 'iPhone 15 Pro',
		device: { width: 393, height: 852, mobile: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
	},
	{
		name: 'iPhone SE',
		device: { width: 375, height: 667, mobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
	},
	{
		name: 'Pixel 8',
		device: { width: 412, height: 915, mobile: true, deviceScaleFactor: 2.625, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' },
	},
	{
		name: 'iPad Mini',
		device: { width: 768, height: 1024, mobile: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
	},
];

export interface IResolvedBrowserDevicePresets {
	/** Built-in presets whose names were not overridden. */
	readonly builtins: readonly IBrowserDevicePreset[];
	/** Valid entries from {@link BrowserCustomDevicePresetsSettingId}. */
	readonly custom: readonly IBrowserDevicePreset[];
}

/**
 * Merge `workbench.browser.customDevicePresets` onto the built-in list.
 * Invalid entries are dropped. A custom preset with the same name as a
 * built-in replaces that built-in and is returned in `custom`.
 */
export function resolveBrowserDevicePresets(configured: unknown): IResolvedBrowserDevicePresets {
	const custom = parseCustomDevicePresets(configured);
	if (custom.length === 0) {
		return { builtins: DEFAULT_BROWSER_DEVICE_PRESETS, custom };
	}
	const overridden = new Set(custom.map(preset => preset.name));
	return {
		builtins: DEFAULT_BROWSER_DEVICE_PRESETS.filter(preset => !overridden.has(preset.name)),
		custom,
	};
}

function parseCustomDevicePresets(configured: unknown): IBrowserDevicePreset[] {
	if (!Array.isArray(configured)) {
		return [];
	}
	const ordered: IBrowserDevicePreset[] = [];
	const indexByName = new Map<string, number>();
	for (const entry of configured) {
		const preset = parseCustomDevicePreset(entry);
		if (!preset) {
			continue;
		}
		const existing = indexByName.get(preset.name);
		if (existing === undefined) {
			indexByName.set(preset.name, ordered.length);
			ordered.push(preset);
		} else {
			ordered[existing] = preset;
		}
	}
	return ordered;
}

function parseCustomDevicePreset(entry: unknown): IBrowserDevicePreset | undefined {
	if (!isRecord(entry)) {
		return undefined;
	}
	if (typeof entry.name !== 'string') {
		return undefined;
	}
	const name = entry.name.trim();
	if (name.length === 0 || name.length > MAX_PRESET_NAME_LENGTH) {
		return undefined;
	}
	const width = parseDimension(entry.width);
	const height = parseDimension(entry.height);
	if (width === undefined || height === undefined) {
		return undefined;
	}

	let mobile = false;
	if (hasOwn(entry, 'mobile')) {
		if (typeof entry.mobile !== 'boolean') {
			return undefined;
		}
		mobile = entry.mobile;
	}
	let deviceScaleFactor: number | undefined;
	if (hasOwn(entry, 'deviceScaleFactor')) {
		deviceScaleFactor = parseDeviceScaleFactor(entry.deviceScaleFactor);
		if (deviceScaleFactor === undefined) {
			return undefined;
		}
	}
	let userAgent: string | undefined;
	if (hasOwn(entry, 'userAgent')) {
		if (typeof entry.userAgent !== 'string' || entry.userAgent.length > MAX_USER_AGENT_LENGTH) {
			return undefined;
		}
		const trimmed = entry.userAgent.trim();
		if (trimmed.length > 0) {
			userAgent = trimmed;
		}
	}

	const device: IBrowserDeviceProfile = {
		width,
		height,
		mobile,
		...(deviceScaleFactor !== undefined ? { deviceScaleFactor } : {}),
		...(userAgent !== undefined ? { userAgent } : {}),
	};
	return { name, device };
}

function parseDimension(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isInteger(value)) {
		return undefined;
	}
	if (value < BROWSER_DEVICE_MIN_DIMENSION || value > BROWSER_DEVICE_MAX_DIMENSION) {
		return undefined;
	}
	return value;
}

function parseDeviceScaleFactor(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return undefined;
	}
	if (value < BROWSER_DEVICE_MIN_SCALE_FACTOR || value > BROWSER_DEVICE_MAX_SCALE_FACTOR) {
		return undefined;
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> & { mobile?: boolean; deviceScaleFactor?: number; userAgent?: string } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}
