/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
/**
 * Returns the progress percentage based on the current and maximum progress values.
 */
export function computeProgressPercent(current, max) {
    if (current === undefined || max === undefined || max <= 0) {
        return undefined;
    }
    return Math.max(Math.min(Math.round((current / max) * 100), 100), 0);
}
/**
 * Computes an estimate of remaining download time in seconds.
 */
export function computeDownloadTimeRemaining(state) {
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
export function computeDownloadSpeed(state) {
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
export function computeUpdateInfoVersion(currentVersion, targetVersion) {
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
export function getUpdateInfoUrl(version) {
    const versionLabel = version.replace(/\./g, '_').replace(/_0$/, '');
    return `https://code.visualstudio.com/raw/v${versionLabel}_update.md`;
}
/**
 * Formats the time remaining as a human-readable string.
 */
export function formatTimeRemaining(seconds) {
    const hours = seconds / 3600;
    if (hours >= 1) {
        const formattedHours = formatDecimal(hours);
        if (formattedHours === '1') {
            return localize('update.timeRemainingHour', "{0} hour", formattedHours);
        }
        else {
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
export function formatBytes(bytes) {
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
export function tryParseDate(date) {
    if (date === undefined) {
        return undefined;
    }
    try {
        const parsed = Date.parse(date);
        return isNaN(parsed) ? undefined : parsed;
    }
    catch {
        return undefined;
    }
}
/**
 * Formats a timestamp as a localized date string.
 */
export function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
/**
 * Formats a number to 1 decimal place, omitting ".0" for whole numbers.
 */
export function formatDecimal(value) {
    const rounded = Math.round(value * 10) / 10;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
}
/**
 * Parses a version string in the format "major.minor.patch" and returns an object with the components.
 */
export function tryParseVersion(version) {
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
    }
    catch {
        return undefined;
    }
}
/**
 * Processes an error message and returns a user-friendly version of it, or undefined if the error should be ignored.
 */
export function preprocessError(error) {
    if (!error) {
        return undefined;
    }
    if (/The request timed out|The network connection was lost/i.test(error)) {
        return undefined;
    }
    return error.replace(/See https:\/\/github\.com\/Squirrel\/Squirrel\.Mac\/issues\/182 for more information/, 'This might mean the application was put on quarantine by macOS. See [this link](https://github.com/microsoft/vscode/issues/7426#issuecomment-425093469) for more information');
}
/**
 * Determines whether there is a major or minor version change between two versions.
 */
export function isMajorMinorVersionChange(previousVersion, newVersion) {
    const previous = tryParseVersion(previousVersion);
    const current = tryParseVersion(newVersion);
    return !!previous && !!current && (previous.major !== current.major || previous.minor !== current.minor);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlVXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi91cGRhdGUvY29tbW9uL3VwZGF0ZVV0aWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUc5Qzs7R0FFRztBQUNILE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxPQUEyQixFQUFFLEdBQXVCO0lBQzFGLElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxHQUFHLEtBQUssU0FBUyxJQUFJLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUM1RCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUN0RSxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsNEJBQTRCLENBQUMsS0FBa0I7SUFDOUQsTUFBTSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLEdBQUcsS0FBSyxDQUFDO0lBQ3pELElBQUksZUFBZSxLQUFLLFNBQVMsSUFBSSxVQUFVLEtBQUssU0FBUyxJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMxRixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLFNBQVMsQ0FBQztJQUN6QyxJQUFJLGVBQWUsSUFBSSxDQUFDLElBQUksVUFBVSxJQUFJLENBQUMsSUFBSSxTQUFTLElBQUksQ0FBQyxFQUFFLENBQUM7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