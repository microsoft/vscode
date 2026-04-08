/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Downloading } from '../../../../platform/update/common/update.js';

/**
 * Returns the progress percentage based on the current and maximum progress values.
 */
export function computeProgressPercent(current: number | undefined, max: number | undefined): number | undefined {
	if (current === undefined || max === undefined || max <= 0) {
		return undefined;
	}

	return Math.max(Math.min(Math.round((current / max) * 100), 100), 0);
}

/**
 * Computes an estimate of remaining download time in seconds.
 */
export function computeDownloadTimeRemaining(state: Downloading): number | undefined {
	const { downloadedBytes, totalBytes, startTime } = state;
	if (downloadedBytes === undefined || totalBytes === undefined || startTime === undefined) {
		return undefined;
	}

	const elapsedMs = Date.now() - startTime;
	if (downloadedBytes <= 0 || totalBytes <= 0 || elapsedMs <= 0) {
		return undefined;
	}

	const remainingBytes = totalBytes - downloadedBytes;
	if (remainingBytes <= 0) {
		return 0;
	}

	const bytesPerMs = downloadedBytes / elapsedMs;
	if (bytesPerMs <= 0) {
		return undefined;
	}

	const remainingMs = remainingBytes / bytesPerMs;
	return Math.ceil(remainingMs / 1000);
}

/**
 * Computes the current download speed in bytes per second.
 */
export function computeDownloadSpeed(state: Downloading): number | undefined {
	const { downloadedBytes, startTime } = state;
	if (downloadedBytes === undefined || startTime === undefined) {
		return undefined;
	}

	const elapsedMs = Date.now() - startTime;
	if (elapsedMs <= 0 || downloadedBytes <= 0) {
		return undefined;
	}

	return (downloadedBytes / elapsedMs) * 1000;
}

/**
 * Computes the version to use for fetching update info.
 * - If the minor version differs: returns `{major}.{minor}` (e.g., 1.108.2 -> 1.109.5 => 1.109)
 * - If the same minor: returns the target version as-is (e.g., 1.109.2 -> 1.109.5 => 1.109.5)
 */
export function computeUpdateInfoVersion(currentVersion: string, targetVersion: string): string | undefined {
	const current = tryParseVersion(currentVersion);
	const target = tryParseVersion(targetVersion);
	if (!current || !target) {
		return undefined;
	}

	if (current.minor !== target.minor || current.major !== target.major) {
		return `${target.major}.${target.minor}`;
	}

	return `${target.major}.${target.minor}.${target.patch}`;
}

/**
 * Computes the URL to fetch update info from.
 * Follows the release notes URL pattern but with `_update` suffix.
 */
export function getUpdateInfoUrl(version: string): string {
	const versionLabel = version.replace(/\./g, '_').replace(/_0$/, '');
	return `https://code.visualstudio.com/raw/v${versionLabel}_update.md`;
}

/**
 * Formats the time remaining as a human-readable string.
 */
export function formatTimeRemaining(seconds: number): string {
	const hours = seconds / 3600;
	if (hours >= 1) {
		const formattedHours = formatDecimal(hours);
		if (formattedHours === '1') {
			return localize('update.timeRemainingHour', "{0} hour", formattedHours);
		} else {
			return localize('update.timeRemainingHours', "{0} hours", formattedHours);
		}
	}

	const minutes = Math.floor(seconds / 60);
	if (minutes >= 1) {
		return localize('update.timeRemainingMinutes', "{0} min", minutes);
	}

	return localize('update.timeRemainingSeconds', "{0}s", seconds);
}

/**
 * Formats a byte count as a human-readable string.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return localize('update.bytes', "{0} B", bytes);
	}

	const kb = bytes / 1024;
	if (kb < 1024) {
		return localize('update.kilobytes', "{0} KB", formatDecimal(kb));
	}

	const mb = kb / 1024;
	if (mb < 1024) {
		return localize('update.megabytes', "{0} MB", formatDecimal(mb));
	}

	const gb = mb / 1024;
	return localize('update.gigabytes', "{0} GB", formatDecimal(gb));
}

/**
 * Tries to parse a date string and returns the timestamp or undefined if parsing fails.
 */
export function tryParseDate(date: string | undefined): number | undefined {
	if (date === undefined) {
		return undefined;
	}

	try {
		const parsed = Date.parse(date);
		return isNaN(parsed) ? undefined : parsed;
	} catch {
		return undefined;
	}
}

/**
 * Formats a timestamp as a localized date string.
 */
export function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Formats a number to 1 decimal place, omitting ".0" for whole numbers.
 */
export function formatDecimal(value: number): string {
	const rounded = Math.round(value * 10) / 10;
	return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
}

export interface IVersion {
	major: number;
	minor: number;
	patch: number;
}

/**
 * Parses a version string in the format "major.minor.patch" and returns an object with the components.
 */
export function tryParseVersion(version: string | undefined): IVersion | undefined {
	if (version === undefined) {
		return undefined;
	}

	const match = /^(\d{1,10})\.(\d{1,10})\.(\d{1,10})/.exec(version);
	if (!match) {
		return undefined;
	}

	try {
		return {
			major: parseInt(match[1]),
			minor: parseInt(match[2]),
			patch: parseInt(match[3])
		};
	} catch {
		return undefined;
	}
}

/**
 * Processes an error message and returns a user-friendly version of it, or undefined if the error should be ignored.
 */
export function preprocessError(error?: string): string | undefined {
	if (!error) {
		return undefined;
	}

	if (/The request timed out|The network connection was lost/i.test(error)) {
		return undefined;
	}

	return error.replace(
		/See https:\/\/github\.com\/Squirrel\/Squirrel\.Mac\/issues\/182 for more information/,
		'This might mean the application was put on quarantine by macOS. See [this link](https://github.com/microsoft/vscode/issues/7426#issuecomment-425093469) for more information'
	);
}

/**
 * Determines whether there is a major or minor version change between two versions.
 */
export function isMajorMinorVersionChange(previousVersion?: string, newVersion?: string): boolean {
	const previous = tryParseVersion(previousVersion);
	const current = tryParseVersion(newVersion);
	return !!previous && !!current && (previous.major !== current.major || previous.minor !== current.minor);
}
