/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { hasDriveLetter, toSlashes } from './extpath.js';
import { posix, sep, win32 } from './path.js';
import { isMacintosh, isWindows, OS } from './platform.js';
import { extUri, extUriIgnorePathCase } from './resources.js';
import { rtrim, startsWithIgnoreCase } from './strings.js';
export function getPathLabel(resource, formatting) {
    const { os, tildify: tildifier, relative: relatifier } = formatting;
    // return early with a relative path if we can resolve one
    if (relatifier) {
        const relativePath = getRelativePathLabel(resource, relatifier, os);
        if (typeof relativePath === 'string') {
            return relativePath;
        }
    }
    // otherwise try to resolve a absolute path label and
    // apply target OS standard path separators if target
    // OS differs from actual OS we are running in
    let absolutePath = resource.fsPath;
    if (os === 1 /* OperatingSystem.Windows */ && !isWindows) {
        absolutePath = absolutePath.replace(/\//g, '\\');
    }
    else if (os !== 1 /* OperatingSystem.Windows */ && isWindows) {
        absolutePath = absolutePath.replace(/\\/g, '/');
    }
    // macOS/Linux: tildify with provided user home directory
    if (os !== 1 /* OperatingSystem.Windows */ && tildifier?.userHome) {
        const userHome = tildifier.userHome.fsPath;
        // This is a bit of a hack, but in order to figure out if the
        // resource is in the user home, we need to make sure to convert it
        // to a user home resource. We cannot assume that the resource is
        // already a user home resource.
        let userHomeCandidate;
        if (resource.scheme !== tildifier.userHome.scheme && resource.path[0] === posix.sep && resource.path[1] !== posix.sep) {
            userHomeCandidate = tildifier.userHome.with({ path: resource.path }).fsPath;
        }
        else {
            userHomeCandidate = absolutePath;
        }
        absolutePath = tildify(userHomeCandidate, userHome, os);
    }
    // normalize
    const pathLib = os === 1 /* OperatingSystem.Windows */ ? win32 : posix;
    return pathLib.normalize(normalizeDriveLetter(absolutePath, os === 1 /* OperatingSystem.Windows */));
}
function getRelativePathLabel(resource, relativePathProvider, os) {
    const pathLib = os === 1 /* OperatingSystem.Windows */ ? win32 : posix;
    const extUriLib = os === 3 /* OperatingSystem.Linux */ ? extUri : extUriIgnorePathCase;
    const workspace = relativePathProvider.getWorkspace();
    const firstFolder = workspace.folders.at(0);
    if (!firstFolder) {
        return undefined;
    }
    // This is a bit of a hack, but in order to figure out the folder
    // the resource belongs to, we need to make sure to convert it
    // to a workspace resource. We cannot assume that the resource is
    // already matching the workspace.
    if (resource.scheme !== firstFolder.uri.scheme && resource.path[0] === posix.sep && resource.path[1] !== posix.sep) {
        resource = firstFolder.uri.with({ path: resource.path });
    }
    const folder = relativePathProvider.getWorkspaceFolder(resource);
    if (!folder) {
        return undefined;
    }
    let relativePathLabel = undefined;
    if (extUriLib.isEqual(folder.uri, resource)) {
        relativePathLabel = ''; // no label if paths are identical
    }
    else {
        relativePathLabel = extUriLib.relativePath(folder.uri, resource) ?? '';
    }
    // normalize
    if (relativePathLabel) {
        relativePathLabel = pathLib.normalize(relativePathLabel);
    }
    // always show root basename if there are multiple folders
    if (workspace.folders.length > 1 && !relativePathProvider.noPrefix) {
        const rootName = folder.name ? folder.name : extUriLib.basenameOrAuthority(folder.uri);
        relativePathLabel = relativePathLabel ? `${rootName} • ${relativePathLabel}` : rootName;
    }
    return relativePathLabel;
}
export function normalizeDriveLetter(path, isWindowsOS = isWindows) {
    if (hasDriveLetter(path, isWindowsOS)) {
        return path.charAt(0).toUpperCase() + path.slice(1);
    }
    return path;
}
let normalizedUserHomeCached = Object.create(null);
export function tildify(path, userHome, os = OS) {
    if (os === 1 /* OperatingSystem.Windows */ || !path || !userHome) {
        return path; // unsupported on Windows
    }
    let normalizedUserHome = normalizedUserHomeCached.original === userHome ? normalizedUserHomeCached.normalized : undefined;
    if (!normalizedUserHome) {
        normalizedUserHome = userHome;
        if (isWindows) {
            normalizedUserHome = toSlashes(normalizedUserHome); // make sure that the path is POSIX normalized on Windows
        }
        normalizedUserHome = `${rtrim(normalizedUserHome, posix.sep)}${posix.sep}`;
        normalizedUserHomeCached = { original: userHome, normalized: normalizedUserHome };
    }
    let normalizedPath = path;
    if (isWindows) {
        normalizedPath = toSlashes(normalizedPath); // make sure that the path is POSIX normalized on Windows
    }
    // Linux: case sensitive, macOS: case insensitive
    if (os === 3 /* OperatingSystem.Linux */ ? normalizedPath.startsWith(normalizedUserHome) : startsWithIgnoreCase(normalizedPath, normalizedUserHome)) {
        return `~/${normalizedPath.substr(normalizedUserHome.length)}`;
    }
    return path;
}
export function untildify(path, userHome) {
    return path.replace(/^~($|\/|\\)/, `${userHome}$1`);
}
/**
 * Shortens the paths but keeps them easy to distinguish.
 * Replaces not important parts with ellipsis.
 * Every shorten path matches only one original path and vice versa.
 *
 * Algorithm for shortening paths is as follows:
 * 1. For every path in list, find unique substring of that path.
 * 2. Unique substring along with ellipsis is shortened path of that path.
 * 3. To find unique substring of path, consider every segment of length from 1 to path.length of path from end of string
 *    and if present segment is not substring to any other paths then present segment is unique path,
 *    else check if it is not present as suffix of any other path and present segment is suffix of path itself,
 *    if it is true take present segment as unique path.
 * 4. Apply ellipsis to unique segment according to whether segment is present at start/in-between/end of path.
 *
 * Example 1
 * 1. consider 2 paths i.e. ['a\\b\\c\\d', 'a\\f\\b\\c\\d']
 * 2. find unique path of first path,
 * 	a. 'd' is present in path2 and is suffix of path2, hence not unique of present path.
 * 	b. 'c' is present in path2 and 'c' is not suffix of present path, similarly for 'b' and 'a' also.
 * 	c. 'd\\c' is suffix of path2.
 *  d. 'b\\c' is not suffix of present path.
 *  e. 'a\\b' is not present in path2, hence unique path is 'a\\b...'.
 * 3. for path2, 'f' is not present in path1 hence unique is '...\\f\\...'.
 *
 * Example 2
 * 1. consider 2 paths i.e. ['a\\b', 'a\\b\\c'].
 * 	a. Even if 'b' is present in path2, as 'b' is suffix of path1 and is not suffix of path2, unique path will be '...\\b'.
 * 2. for path2, 'c' is not present in path1 hence unique path is '..\\c'.
 */
const ellipsis = '\u2026';
const unc = '\\\\';
const urlSchemaRegexp = /^[^:/\\?#]+?:\/\//;
const home = '~';
export function shorten(paths, defaultPathSeparator = sep) {
    const shortenedPaths = new Array(paths.length);
    // for every path
    let match = false;
    for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
        let pathSeparator = defaultPathSeparator;
        const originalPath = paths[pathIndex];
        if (originalPath === '') {
            shortenedPaths[pathIndex] = `.${pathSeparator}`;
            continue;
        }
        if (!originalPath) {
            shortenedPaths[pathIndex] = originalPath;
            continue;
        }
        match = true;
        // trim for now and concatenate unc path (e.g. \\network) or root path (/etc, ~/etc) later
        let prefix = '';
        let trimmedPath = originalPath;
        if (urlSchemaRegexp.test(trimmedPath)) {
            prefix = trimmedPath.substr(0, trimmedPath.indexOf('//') + 2);
            trimmedPath = trimmedPath.substr(trimmedPath.indexOf('//') + 2);
            pathSeparator = '/';
        }
        else if (trimmedPath.indexOf(unc) === 0) {
            prefix = trimmedPath.substr(0, trimmedPath.indexOf(unc) + unc.length);
            trimmedPath = trimmedPath.substr(trimmedPath.indexOf(unc) + unc.length);
        }
        else if (trimmedPath.indexOf(pathSeparator) === 0) {
            prefix = trimmedPath.substr(0, trimmedPath.indexOf(pathSeparator) + pathSeparator.length);
            trimmedPath = trimmedPath.substr(trimmedPath.indexOf(pathSeparator) + pathSeparator.length);
        }
        else if (trimmedPath.indexOf(home) === 0) {
            prefix = trimmedPath.substr(0, trimmedPath.indexOf(home) + home.length);
            trimmedPath = trimmedPath.substr(trimmedPath.indexOf(home) + home.length);
        }
        // pick the first shortest subpath found
        const segments = trimmedPath.split(pathSeparator);
        for (let subpathLength = 1; match && subpathLength <= segments.length; subpathLength++) {
            for (let start = segments.length - subpathLength; match && start >= 0; start--) {
                match = false;
                let subpath = segments.slice(start, start + subpathLength).join(pathSeparator);
                // that is unique to any other path
                for (let otherPathIndex = 0; !match && otherPathIndex < paths.length; otherPathIndex++) {
                    // suffix subpath treated specially as we consider no match 'x' and 'x/...'
                    if (otherPathIndex !== pathIndex && paths[otherPathIndex] && paths[otherPathIndex].indexOf(subpath) > -1) {
                        const isSubpathEnding = (start + subpathLength === segments.length);
                        // Adding separator as prefix for subpath, such that 'endsWith(src, trgt)' considers subpath as directory name instead of plain string.
                        // prefix is not added when either subpath is root directory or path[otherPathIndex] does not have multiple directories.
                        const subpathWithSep = (start > 0 && paths[otherPathIndex].indexOf(pathSeparator) > -1) ? pathSeparator + subpath : subpath;
                        const isOtherPathEnding = paths[otherPathIndex].endsWith(subpathWithSep);
                        match = !isSubpathEnding || isOtherPathEnding;
                    }
                }
                // found unique subpath
                if (!match) {
                    let result = '';
                    // preserve disk drive or root prefix
                    if (segments[0].endsWith(':') || prefix !== '') {
                        if (start === 1) {
                            // extend subpath to include disk drive prefix
                            start = 0;
                            subpathLength++;
                            subpath = segments[0] + pathSeparator + subpath;
                        }
                        if (start > 0) {
                            result = segments[0] + pathSeparator;
                        }
                        result = prefix + result;
                    }
                    // add ellipsis at the beginning if needed
                    if (start > 0) {
                        result = result + ellipsis + pathSeparator;
                    }
                    result = result + subpath;
                    // add ellipsis at the end if needed
                    if (start + subpathLength < segments.length) {
                        // If the last segment is empty, preserve the trailing slash.
                        if (start + subpathLength === segments.length - 1 && segments[segments.length - 1] === '') {
                            result = result + pathSeparator;
                        }
                        else {
                            result = result + pathSeparator + ellipsis;
                        }
                    }
                    shortenedPaths[pathIndex] = result;
                }
            }
        }
        if (match) {
            shortenedPaths[pathIndex] = originalPath; // use original path if no unique subpaths found
        }
    }
    return shortenedPaths;
}
var Type;
(function (Type) {
    Type[Type["TEXT"] = 0] = "TEXT";
    Type[Type["VARIABLE"] = 1] = "VARIABLE";
    Type[Type["SEPARATOR"] = 2] = "SEPARATOR";
})(Type || (Type = {}));
/**
 * Helper to insert values for specific template variables into the string. E.g. "this $(is) a $(template)" can be
 * passed to this function together with an object that maps "is" and "template" to strings to have them replaced.
 * @param value string to which template is applied
 * @param values the values of the templates to use
 */
export function template(template, values = Object.create(null)) {
    const segments = [];
    let inVariable = false;
    let curVal = '';
    for (const char of template) {
        // Beginning of variable
        if (char === '$' || (inVariable && char === '{')) {
            if (curVal) {
                segments.push({ value: curVal, type: Type.TEXT });
            }
            curVal = '';
            inVariable = true;
        }
        // End of variable
        else if (char === '}' && inVariable) {
            const resolved = values[curVal];
            // Variable
            if (typeof resolved === 'string') {
                if (resolved.length) {
                    segments.push({ value: resolved, type: Type.VARIABLE });
                }
            }
            // Separator
            else if (resolved) {
                const prevSegment = segments[segments.length - 1];
                if (!prevSegment || prevSegment.type !== Type.SEPARATOR) {
                    segments.push({ value: resolved.label, type: Type.SEPARATOR }); // prevent duplicate separators
                }
            }
            curVal = '';
            inVariable = false;
        }
        // Text or Variable Name
        else {
            curVal += char;
        }
    }
    // Tail
    if (curVal && !inVariable) {
        segments.push({ value: curVal, type: Type.TEXT });
    }
    return segments.filter((segment, index) => {
        // Only keep separator if we have values to the left and right
        if (segment.type === Type.SEPARATOR) {
            const left = segments[index - 1];
            const right = segments[index + 1];
            return [left, right].every(segment => segment && (segment.type === Type.VARIABLE || segment.type === Type.TEXT) && segment.value.length > 0);
        }
        // accept any TEXT and VARIABLE
        return true;
    }).map(segment => segment.value).join('');
}
/**
 * Handles mnemonics for menu items. Depending on OS:
 * - Windows: Supported via & character (replace && with &)
 * -   Linux: Supported via & character (replace && with &)
 * -   macOS: Unsupported (replace && with empty string)
 */
export function mnemonicMenuLabel(label, forceDisableMnemonics) {
    if (isMacintosh || forceDisableMnemonics) {
        return label.replace(/\(&&\w\)|&&/g, '').replace(/&/g, isMacintosh ? '&' : '&&');
    }
    return label.replace(/&&|&/g, m => m === '&' ? '&&' : '&');
}
export function mnemonicButtonLabel(label, forceDisableMnemonics) {
    const withoutMnemonic = label.replace(/\(&&\w\)|&&/g, '');
    if (forceDisableMnemonics) {
        return withoutMnemonic;
    }
    if (isMacintosh) {
        return { withMnemonic: withoutMnemonic, withoutMnemonic };
    }
    let withMnemonic;
    if (isWindows) {
        withMnemonic = label.replace(/&&|&/g, m => m === '&' ? '&&' : '&');
    }
    else {
        withMnemonic = label.replace(/&&/g, '_');
    }
    return { withMnemonic, withoutMnemonic };
}
export function unmnemonicLabel(label) {
    return label.replace(/&/g, '&&');
}
/**
 * Splits a recent label in name and parent path, supporting both '/' and '\' and workspace suffixes.
 * If the location is remote, the remote name is included in the name part.
 */
export function splitRecentLabel(recentLabel) {
    if (recentLabel.endsWith(']')) {
        // label with workspace suffix
        const lastIndexOfSquareBracket = recentLabel.lastIndexOf(' [', recentLabel.length - 2);
        if (lastIndexOfSquareBracket !== -1) {
            const split = splitName(recentLabel.substring(0, lastIndexOfSquareBracket));
            const remoteNameWithSpace = recentLabel.substring(lastIndexOfSquareBracket);
            return { name: split.name + remoteNameWithSpace, parentPath: split.parentPath };
        }
    }
    return splitName(recentLabel);
}
function splitName(fullPath) {
    const p = fullPath.indexOf('/') !== -1 ? posix : win32;
    const name = p.basename(fullPath);
    const parentPath = p.dirname(fullPath);
    if (name.length) {
        return { name, parentPath };
    }
    // only the root segment
    return { name: parentPath, parentPath: '' };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFiZWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vbGFiZWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUM5QyxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBbUIsRUFBRSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQzVFLE9BQU8sRUFBRSxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUM5RCxPQUFPLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBMEMzRCxNQUFNLFVBQVUsWUFBWSxDQUFDLFFBQWEsRUFBRSxVQUFnQztJQUMzRSxNQUFNLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxHQUFHLFVBQVUsQ0FBQztJQUVwRSwwREFBMEQ7SUFDMUQsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNoQixNQUFNLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxRQUFRLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLElBQUksT0FBTyxZQUFZLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdEMsT0FBTyxZQUFZLENBQUM7UUFDckIsQ0FBQztJQUNGLENBQUM7SUFFRCxxREFBcUQ7SUFDckQscURBQXFEO0lBQ3JELDhDQUE4QztJQUM5QyxJQUFJLFlBQVksR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO0lBQ25DLElBQUksRUFBRSxvQ0FBNEIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2xELFlBQVksR0FB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