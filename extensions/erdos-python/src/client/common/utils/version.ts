// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as semver from 'semver';
import { verboseRegExp } from './regexp';

// basic version info

/**
 * basic version information
 *
 * A normalized object will only have non-negative numbers, or `-1`,
 * in its properties.  A `-1` value is an indicator that the property
 * is not set.  Lower properties will not be set if a higher property
 * is not.
 *
 * Note that any object can be forced to look like a VersionInfo and
 * any of the properties may be forced to hold a non-number value.
 * To resolve this situation, pass the object through
 * `normalizeVersionInfo()` and then `validateVersionInfo()`.
 */
export type BasicVersionInfo = {
    major: number;
    minor: number;
    micro: number;
    // There is also a hidden `unnormalized` property.
};

type ErrorMsg = string;

function normalizeVersionPart(part: unknown): [number, ErrorMsg] {
    // Any -1 values where the original is not a number are handled in validation.
    if (typeof part === 'number') {
        if (Number.isNaN(part)) {
            return [-1, 'missing'];
        }
        if (part < 0) {
            // We leave this as a marker.
            return [-1, ''];
        }
        return [part, ''];
    }
    if (typeof part === 'string') {
        const parsed = parseInt(part, 10);
        if (Number.isNaN(parsed)) {
            return [-1, 'string not numeric'];
        }
        if (parsed < 0) {
            return [-1, ''];
        }
        return [parsed, ''];
    }
    if (part === undefined || part === null) {
        return [-1, 'missing'];
    }
    return [-1, 'unsupported type'];
}

type RawBasicVersionInfo = BasicVersionInfo & {
    unnormalized?: {
        major?: ErrorMsg;
        minor?: ErrorMsg;
        micro?: ErrorMsg;
    };
};

export const EMPTY_VERSION: RawBasicVersionInfo = {
    major: -1,
    minor: -1,
    micro: -1,
};
Object.freeze(EMPTY_VERSION);

function copyStrict<T extends BasicVersionInfo>(info: T): RawBasicVersionInfo {
    const copied: RawBasicVersionInfo = {
        major: info.major,
        minor: info.minor,
        micro: info.micro,
    };

    const { unnormalized } = (info as unknown) as RawBasicVersionInfo;
    if (unnormalized !== undefined) {
        copied.unnormalized = {
            major: unnormalized.major,
            minor: unnormalized.minor,
            micro: unnormalized.micro,
        };
    }

    return copied;
}

/**
 * Make a copy and set all the properties properly.
 *
 * Only the "basic" version info will be set (and normalized).
 * The caller is responsible for any other properties beyond that.
 */
function normalizeBasicVersionInfo<T extends BasicVersionInfo>(info: T | undefined): T {
    if (!info) {
        return EMPTY_VERSION as T;
    }
    const norm = copyStrict(info);
    // Do not normalize if it has already been normalized.
    if (norm.unnormalized === undefined) {
        norm.unnormalized = {};
        [norm.major, norm.unnormalized.major] = normalizeVersionPart(norm.major);
        [norm.minor, norm.unnormalized.minor] = normalizeVersionPart(norm.minor);
        [norm.micro, norm.unnormalized.micro] = normalizeVersionPart(norm.micro);
    }
    return norm as T;
}

function validateVersionPart(prop: string, part: number, unnormalized?: ErrorMsg) {
    // We expect a normalized version part here, so there's no need
    // to check for NaN or non-numbers here.
    if (part === 0 || part > 0) {
        return;
    }
    if (!unnormalized || unnormalized === '') {
        return;
    }
    throw Error(`invalid ${prop} version (failed to normalize; ${unnormalized})`);
}

/**
 * Fail if any properties are not set properly.
 *
 * The info is expected to be normalized already.
 *
 * Only the "basic" version info will be validated.  The caller
 * is responsible for any other properties beyond that.
 */
function validateBasicVersionInfo<T extends BasicVersionInfo>(info: T): void {
    const raw = (info as unknown) as RawBasicVersionInfo;
    validateVersionPart('major', info.major, raw.unnormalized?.major);
    validateVersionPart('minor', info.minor, raw.unnormalized?.minor);
    validateVersionPart('micro', info.micro, raw.unnormalized?.micro);
    if (info.major < 0) {
        throw Error('missing major version');
    }
    if (info.minor < 0) {
        if (info.micro === 0 || info.micro > 0) {
            throw Error('missing minor version');
        }
    }
}

/**
 * Convert the info to a simple string.
 *
 * Any negative parts are ignored.
 *
 * The object is expected to be normalized.
 */
export function getVersionString<T extends BasicVersionInfo>(info: T): string {
    if (info.major < 0) {
        return '';
    }
    if (info.minor < 0) {
        return `${info.major}`;
    }
    if (info.micro < 0) {
        return `${info.major}.${info.minor}`;
    }
    return `${info.major}.${info.minor}.${info.micro}`;
}

export type ParseResult<T extends BasicVersionInfo = BasicVersionInfo> = {
    version: T;
    before: string;
    after: string;
};

const basicVersionPattern = `
    ^
    (.*?)  # <before>
    (\\d+)  # <major>
    (?:
        [.]
        (\\d+)  # <minor>
        (?:
            [.]
            (\\d+)  # <micro>
        )?
    )?
    ([^\\d].*)?  # <after>
    $
`;
const basicVersionRegexp = verboseRegExp(basicVersionPattern, 's');

/**
 * Extract a version from the given text.
 *
 * If the version is surrounded by other text then that is provided
 * as well.
 */
export function parseBasicVersionInfo<T extends BasicVersionInfo>(verStr: string): ParseResult<T> | undefined {
    const match = verStr.match(basicVersionRegexp);
    if (!match) {
        return undefined;
    }
    // Ignore the first element (the full match).
    const [, before, majorStr, minorStr, microStr, after] = match;
    if (before && before.endsWith('.')) {
        return undefined;
    }

    if (after && after !== '') {
        if (after === '.') {
            return undefined;
        }
        // Disallow a plain version with trailing text if it isn't complete
        if (!before || before === '') {
            if (!microStr || microStr === '') {
                return undefined;
            }
        }
    }
    const major = parseInt(majorStr, 10);
    const minor = minorStr ? parseInt(minorStr, 10) : -1;
    const micro = microStr ? parseInt(microStr, 10) : -1;
    return {
        // This is effectively normalized.
        version: ({ major, minor, micro } as unknown) as T,
        before: before || '',
        after: after || '',
    };
}

/**
 * Returns true if the given version appears to be not set.
 *
 * The object is expected to already be normalized.
 */
export function isVersionInfoEmpty<T extends BasicVersionInfo>(info: T): boolean {
    if (!info) {
        return false;
    }
    if (typeof info.major !== 'number' || typeof info.minor !== 'number' || typeof info.micro !== 'number') {
        return false;
    }
    return info.major < 0 && info.minor < 0 && info.micro < 0;
}

/**
 * Decide if two versions are the same or if one is "less".
 *
 * Note that a less-complete object that otherwise matches
 * is considered "less".
 *
 * Additional checks for an otherwise "identical" version may be made
 * through `compareExtra()`.
 *
 * @returns - the customary comparison indicator (e.g. -1 means left is "more")
 * @returns - a string that indicates the property where they differ (if any)
 */
export function compareVersions<T extends BasicVersionInfo, V extends BasicVersionInfo>(
    // the versions to compare:
    left: T,
    right: V,
    compareExtra?: (v1: T, v2: V) => [number, string],
): [number, string] {
    if (left.major < right.major) {
        return [1, 'major'];
    }
    if (left.major > right.major) {
        return [-1, 'major'];
    }
    if (left.major === -1) {
        // Don't bother checking minor or micro.
        return [0, ''];
    }

    if (left.minor < right.minor) {
        return [1, 'minor'];
    }
    if (left.minor > right.minor) {
        return [-1, 'minor'];
    }
    if (left.minor === -1) {
        // Don't bother checking micro.
        return [0, ''];
    }

    if (left.micro < right.micro) {
        return [1, 'micro'];
    }
    if (left.micro > right.micro) {
        return [-1, 'micro'];
    }

    if (compareExtra !== undefined) {
        return compareExtra(left, right);
    }

    return [0, ''];
}

// base version info

/**
 * basic version information
 *
 * @prop raw - the unparsed version string, if any
 */
export type VersionInfo = BasicVersionInfo & {
    raw?: string;
};

/**
 * Make a copy and set all the properties properly.
 */
export function normalizeVersionInfo<T extends VersionInfo>(info: T): T {
    const norm = normalizeBasicVersionInfo(info);
    norm.raw = info.raw;
    if (!norm.raw) {
        norm.raw = '';
    }
    // Any string value of "raw" is considered normalized.
    return norm;
}

/**
 * Fail if any properties are not set properly.
 *
 * Optional properties that are not set are ignored.
 *
 * This assumes that the info has already been normalized.
 */
export function validateVersionInfo<T extends VersionInfo>(info: T): void {
    validateBasicVersionInfo(info);
    // `info.raw` can be anything.
}

/**
 * Extract a version from the given text.
 *
 * If the version is surrounded by other text then that is provided
 * as well.
 */
export function parseVersionInfo<T extends VersionInfo>(verStr: string): ParseResult<T> | undefined {
    const result = parseBasicVersionInfo<T>(verStr);
    if (result === undefined) {
        return undefined;
    }
    result.version.raw = verStr;
    return result;
}

/**
 * Checks if major, minor, and micro match.
 *
 * Additional checks may be made through `compareExtra()`.
 */
export function areIdenticalVersion<T extends BasicVersionInfo, V extends BasicVersionInfo>(
    // the versions to compare:
    left: T,
    right: V,
    compareExtra?: (v1: T, v2: V) => [number, string],
): boolean {
    const [result] = compareVersions(left, right, compareExtra);
    return result === 0;
}

/**
 * Checks if the versions are identical or one is more complete than other (and otherwise the same).
 *
 * At the least the major version must be set (non-negative).
 */
export function areSimilarVersions<T extends BasicVersionInfo, V extends BasicVersionInfo>(
    // the versions to compare:
    left: T,
    right: V,
    compareExtra?: (v1: T, v2: V) => [number, string],
): boolean {
    const [result, prop] = compareVersions(left, right, compareExtra);
    if (result === 0) {
        return true;
    }

    if (prop === 'major') {
        // An empty version is never similar (except to another empty version).
        return false;
    }

    if (result < 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((right as unknown) as any)[prop] === -1;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((left as unknown) as any)[prop] === -1;
}

// semver

export function parseSemVerSafe(raw: string): semver.SemVer {
    raw = raw.replace(/\.00*(?=[1-9]|0\.)/, '.');
    const ver = semver.coerce(raw);
    if (ver === null || !semver.valid(ver)) {
        // TODO: Raise an exception instead?
        return new semver.SemVer('0.0.0');
    }
    return ver;
}
