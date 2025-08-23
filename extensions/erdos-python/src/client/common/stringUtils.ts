// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export interface SplitLinesOptions {
    trim?: boolean;
    removeEmptyEntries?: boolean;
}

/**
 * Split a string using the cr and lf characters and return them as an array.
 * By default lines are trimmed and empty lines are removed.
 * @param {SplitLinesOptions=} splitOptions - Options used for splitting the string.
 */
export function splitLines(
    source: string,
    splitOptions: SplitLinesOptions = { removeEmptyEntries: true, trim: true },
): string[] {
    let lines = source.split(/\r?\n/g);
    if (splitOptions?.trim) {
        lines = lines.map((line) => line.trim());
    }
    if (splitOptions?.removeEmptyEntries) {
        lines = lines.filter((line) => line.length > 0);
    }
    return lines;
}

/**
 * Replaces all instances of a substring with a new substring.
 */
export function replaceAll(source: string, substr: string, newSubstr: string): string {
    if (!source) {
        return source;
    }

    /** Escaping function from the MDN web docs site
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
     * Escapes all the following special characters in a string . * + ? ^ $ { } ( ) | \ \\
     */

    function escapeRegExp(unescapedStr: string): string {
        return unescapedStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
    }

    return source.replace(new RegExp(escapeRegExp(substr), 'g'), newSubstr);
}
