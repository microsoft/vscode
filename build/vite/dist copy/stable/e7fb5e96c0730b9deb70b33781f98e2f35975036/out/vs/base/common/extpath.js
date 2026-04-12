/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isAbsolute, join, normalize, posix, sep } from './path.js';
import { isWindows } from './platform.js';
import { equalsIgnoreCase, rtrim, startsWithIgnoreCase } from './strings.js';
import { isNumber } from './types.js';
export function isPathSeparator(code) {
    return code === 47 /* CharCode.Slash */ || code === 92 /* CharCode.Backslash */;
}
/**
 * Takes a Windows OS path and changes backward slashes to forward slashes.
 * This should only be done for OS paths from Windows (or user provided paths potentially from Windows).
 * Using it on a Linux or MaxOS path might change it.
 */
export function toSlashes(osPath) {
    return osPath.replace(/[\\/]/g, posix.sep);
}
/**
 * Takes a Windows OS path (using backward or forward slashes) and turns it into a posix path:
 * - turns backward slashes into forward slashes
 * - makes it absolute if it starts with a drive letter
 * This should only be done for OS paths from Windows (or user provided paths potentially from Windows).
 * Using it on a Linux or MaxOS path might change it.
 */
export function toPosixPath(osPath) {
    if (osPath.indexOf('/') === -1) {
        osPath = toSlashes(osPath);
    }
    if (/^[a-zA-Z]:(\/|$)/.test(osPath)) { // starts with a drive letter
        osPath = '/' + osPath;
    }
    return osPath;
}
/**
 * Computes the _root_ this path, like `getRoot('c:\files') === c:\`,
 * `getRoot('files:///files/path') === files:///`,
 * or `getRoot('\\server\shares\path') === \\server\shares\`
 */
export function getRoot(path, sep = posix.sep) {
    if (!path) {
        return '';
    }
    const len = path.length;
    const firstLetter = path.charCodeAt(0);
    if (isPathSeparator(firstLetter)) {
        if (isPathSeparator(path.charCodeAt(1))) {
            // UNC candidate \\localhost\shares\ddd
            //               ^^^^^^^^^^^^^^^^^^^
            if (!isPathSeparator(path.charCodeAt(2))) {
                let pos = 3;
                const start = pos;
                for (; pos < len; pos++) {
                    if (isPathSeparator(path.charCodeAt(pos))) {
                        break;
                    }
                }
                if (start !== pos && !isPathSeparator(path.charCodeAt(pos + 1))) {
                    pos += 1;
                    for (; pos < len; pos++) {
                        if (isPathSeparator(path.charCodeAt(pos))) {
                            return path.slice(0, pos + 1) // consume this separator
                                .replace(/[\\/]/g, sep);
                        }
                    }
                }
            }
        }
        // /user/far
        // ^
        return sep;
    }
    else if (isWindowsDriveLetter(firstLetter)) {
        // check for windows drive letter c:\ or c:
        if (path.charCodeAt(1) === 58 /* CharCode.Colon */) {
            if (isPathSeparator(path.charCodeAt(2))) {
                // C:\fff
                // ^^^
                return path.slice(0, 2) + sep;
            }
            else {
                // C:
                // ^^
                return path.slice(0, 2);
            }
        }
    }
    // check for URI
    // scheme://authority/path
    // ^^^^^^^^^^^^^^^^^^^
    let pos = path.indexOf('://');
    if (pos !== -1) {
        pos += 3; // 3 -> "://".length
        for (; pos < len; pos++) {
            if (isPathSeparator(path.charCodeAt(pos))) {
                return path.slice(0, pos + 1); // consume this separator
            }
        }
    }
    return '';
}
/**
 * Check if the path follows this pattern: `\\hostname\sharename`.
 *
 * @see https://msdn.microsoft.com/en-us/library/gg465305.aspx
 * @return A boolean indication if the path is a UNC path, on none-windows
 * always false.
 */
export function isUNC(path) {
    if (!isWindows) {
        // UNC is a windows concept
        return false;
    }
    if (!path || path.length < 5) {
        // at least \\a\b
        return false;
    }
    let code = path.charCodeAt(0);
    if (code !== 92 /* CharCode.Backslash */) {
        return false;
    }
    code = path.charCodeAt(1);
    if (code !== 92 /* CharCode.Backslash */) {
        return false;
    }
    let pos = 2;
    const start = pos;
    for (; pos < path.length; pos++) {
        code = path.charCodeAt(pos);
        if (code === 92 /* CharCode.Backslash */) {
            break;
        }
    }
    if (start === pos) {
        return false;
    }
    code = path.charCodeAt(pos + 1);
    if (isNaN(code) || code === 92 /* CharCode.Backslash */) {
        return false;
    }
    return true;
}
// Reference: https://en.wikipedia.org/wiki/Filename
const WINDOWS_INVALID_FILE_CHARS = /[\\/:\*\?"<>\|]/g;
const UNIX_INVALID_FILE_CHARS = /[/]/g;
const WINDOWS_FORBIDDEN_NAMES = /^(con|prn|aux|clock\$|nul|lpt[0-9]|com[0-9])(\.(.*?))?$/i;
export function isValidBasename(name, isWindowsOS = isWindows) {
    const invalidFileChars = isWindowsOS ? WINDOWS_INVALID_FILE_CHARS : UNIX_INVALID_FILE_CHARS;
    if (!name || name.length === 0 || /^\s+$/.test(name)) {
        return false; // require a name that is not just whitespace
    }
    invalidFileChars.lastIndex = 0; // the holy grail of software development
    if (invalidFileChars.test(name)) {
        return false; // check for certain invalid file characters
    }
    if (isWindowsOS && WINDOWS_FORBIDDEN_NAMES.test(name)) {
        return false; // check for certain invalid file names
    }
    if (name === '.' || name === '..') {
        return false; // check for reserved values
    }
    if (isWindowsOS && name[name.length - 1] === '.') {
        return false; // Windows: file cannot end with a "."
    }
    if (isWindowsOS && name.length !== name.trim().length) {
        return false; // Windows: file cannot end with a whitespace
    }
    if (name.length > 255) {
        return false; // most file systems do not allow files > 255 length
    }
    return true;
}
/**
 * @deprecated please use `IUriIdentityService.extUri.isEqual` instead. If you are
 * in a context without services, consider to pass down the `extUri` from the outside
 * or use `extUriBiasedIgnorePathCase` if you know what you are doing.
 */
export function isEqual(pathA, pathB, ignoreCase) {
    const identityEquals = (pathA === pathB);
    if (!ignoreCase || identityEquals) {
        return identityEquals;
    }
    if (!pathA || !pathB) {
        return false;
    }
    return equalsIgnoreCase(pathA, pathB);
}
/**
 * @deprecated please use `IUriIdentityService.extUri.isEqualOrParent` instead. If
 * you are in a context without services, consider to pass down the `extUri` from the
 * outside, or use `extUriBiasedIgnorePathCase` if you know what you are doing.
 */
export function isEqualOrParent(base, parentCandidate, ignoreCase, separator = sep) {
    if (base === parentCandidate) {
        return true;
    }
    if (!base || !parentCandidate) {
        return false;
    }
    if (parentCandidate.length > base.length) {
        return false;
    }
    if (ignoreCase) {
        const beginsWith = startsWithIgnoreCase(base, parentCandidate);
        if (!beginsWith) {
            return false;
        }
        if (parentCandidate.length === base.length) {
            return true; // same path, different casing
        }
        let sepOffset = parentCandidate.length;
        if (parentCandidate.charAt(parentCandidate.length - 1) === separator) {
            sepOffset--; // adjust the expected sep offset in case our candidate already ends in separator character
        }
        return base.charAt(sepOffset) === separator;
    }
    if (parentCandidate.charAt(parentCandidate.length - 1) !== separator) {
        parentCandidate += separator;
    }
    return base.indexOf(parentCandidate) === 0;
}
export function isWindowsDriveLetter(char0) {
    return char0 >= 65 /* CharCode.A */ && char0 <= 90 /* CharCode.Z */ || char0 >= 97 /* CharCode.a */ && char0 <= 122 /* CharCode.z */;
}
export function sanitizeFilePath(candidate, cwd) {
    // Special case: allow to open a drive letter without trailing backslash
    if (isWindows && candidate.endsWith(':')) {
        candidate += sep;
    }
    // Ensure absolute
    if (!isAbsolute(candidate)) {
        candidate = join(cwd, candidate);
    }
    // Ensure normalized
    candidate = normalize(candidate);
    // Ensure no trailing slash/backslash
    return removeTrailingPathSeparator(candidate);
}
export function removeTrailingPathSeparator(candidate) {
    if (isWindows) {
        candidate = rtrim(candidate, sep);
        // Special case: allow to open drive root ('C:\')
        if (candidate.endsWith(':')) {
            candidate += sep;
        }
    }
    else {
        candidate = rtrim(candidate, sep);
        // Special case: allow to open root ('/')
        if (!candidate) {
            candidate = sep;
        }
    }
    return candidate;
}
export function isRootOrDriveLetter(path) {
    const pathNormalized = normalize(path);
    if (isWindows) {
        if (path.length > 3) {
            return false;
        }
        return hasDriveLetter(pathNormalized) &&
            (path.length === 2 || pathNormalized.charCodeAt(2) === 92 /* CharCode.Backslash */);
    }
    return pathNormalized === posix.sep;
}
export function hasDriveLetter(path, isWindowsOS = isWindows) {
    if (isWindowsOS) {
        return isWindowsDriveLetter(path.charCodeAt(0)) && path.charCodeAt(1) === 58 /* CharCode.Colon */;
    }
    return false;
}
export function getDriveLetter(path, isWindowsOS = isWindows) {
    return hasDriveLetter(path, isWindowsOS) ? path[0] : undefined;
}
export function indexOfPath(path, candidate, ignoreCase) {
    if (candidate.length > path.length) {
        return -1;
    }
    if (path === candidate) {
        return 0;
    }
    if (ignoreCase) {
        path = path.toLowerCase();
        candidate = candidate.toLowerCase();
    }
    return path.indexOf(candidate);
}
export function parseLineAndColumnAware(rawPath) {
    const segments = rawPath.split(':'); // C:\file.txt:<line>:<column>
    let path;
    let line;
    let column;
    for (const segment of segments) {
        const segmentAsNumber = Number(segment);
        if (!isNumber(segmentAsNumber)) {
            path = path ? [path, segment].join(':') : segment; // a colon can well be part of a path (e.g. C:\...)
        }
        else if (line === undefined) {
            line = segmentAsNumber;
        }
        else if (column === undefined) {
            column = segmentAsNumber;
        }
    }
    if (!path) {
        throw new Error('Format for `--goto` should be: `FILE:LINE(:COLUMN)`');
    }
    return {
        path,
        line: line !== undefined ? line : undefined,
        column: column !== undefined ? column : line !== undefined ? 1 : undefined // if we have a line, make sure column is also set
    };
}
const pathChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const windowsSafePathFirstChars = 'BDEFGHIJKMOQRSTUVWXYZbdefghijkmoqrstuvwxyz0123456789';
export function randomPath(parent, prefix, randomLength = 8) {
    let suffix = '';
    for (let i = 0; i < randomLength; i++) {
        let pathCharsTouse;
        if (i === 0 && isWindows && !prefix && (randomLength === 3 || randomLength === 4)) {
            // Windows has certain reserved file names that cannot be used, such
            // as AUX, CON, PRN, etc. We want to avoid generating a random name
            // that matches that pattern, so we use a different set of characters
            // for the first character of the name that does not include any of
            // the reserved names first characters.
            pathCharsTouse = windowsSafePathFirstChars;
        }
        else {
            pathCharsTouse = pathChars;
        }
        suffix += pathCharsTouse.charAt(Math.floor(Math.random() * pathCharsTouse.length));
    }
    let randomFileName;
    if (prefix) {
        randomFileName = `${prefix}-${suffix}`;
    }
    else {
        randomFileName = suffix;
    }
    if (parent) {
        return join(parent, randomFileName);
    }
    return randomFileName;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0cGF0aC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2V4dHBhdGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDcEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUMxQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFdEMsTUFBTSxVQUFVLGVBQWUsQ0FBQyxJQUFZO0lBQzNDLE9BQU8sSUFBSSw0QkFBbUIsSUFBSSxJQUFJLGdDQUF1QixDQUFDO0FBQy9ELENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLFNBQVMsQ0FBQyxNQUFjO0lBQ3ZDLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzVDLENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxNQUFNLFVBQVUsV0FBVyxDQUFDLE1BQWM7SUFDekMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDaEMsTUFBTSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBQ0QsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLDZCQUE2QjtRQUNuRSxNQUFNLEdBQUcsR0FBRyxHQUFHLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDZixD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