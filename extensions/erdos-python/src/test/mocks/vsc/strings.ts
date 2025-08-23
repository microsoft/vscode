// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

/**
 * Determines if haystack starts with needle.
 */
export function startsWith(haystack: string, needle: string): boolean {
    if (haystack.length < needle.length) {
        return false;
    }

    for (let i = 0; i < needle.length; i += 1) {
        if (haystack[i] !== needle[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
    const diff = haystack.length - needle.length;
    if (diff > 0) {
        return haystack.indexOf(needle, diff) === diff;
    }
    if (diff === 0) {
        return haystack === needle;
    }
    return false;
}
