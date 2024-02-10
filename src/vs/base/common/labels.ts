/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { firstOrDefault } from 'vs/base/common/arrays';
import { hasDriveLetter, toSlashes } from 'vs/base/common/extpath';
import { posix, sep, win32 } from 'vs/base/common/path';
import { isMacintosh, isWindows, OperatingSystem, OS } from 'vs/base/common/platform';
import { extUri, extUriIgnorePathCase } from 'vs/base/common/resources';
import { rtrim, startsWithIgnoreCase } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';

export interface IPathLabelFormatting {

	/**
	 * The OS the path label is from to produce a label
	 * that matches OS expectations.
	 */
	readonly os: OperatingSystem;

	/**
	 * Whether to add a `~` when the path is in the
	 * user home directory.
	 *
	 * Note: this only applies to Linux, macOS but not
	 * Windows.
	 */
	readonly tildify?: IUserHomeProvider;

	/**
	 * Whether to convert to a relative path if the path
	 * is within any of the opened workspace folders.
	 */
	readonly relative?: IRelativePathProvider;
}

export interface IRelativePathProvider {

	/**
	 * Whether to not add a prefix when in multi-root workspace.
	 */
	readonly noPrefix?: boolean;

	getWorkspace(): { folders: { uri: URI; name?: string }[] };
	getWorkspaceFolder(resource: URI): { uri: URI; name?: string } | null;
}

export interface IUserHomeProvider {
	userHome: URI;
}

export function getPathLabel(resource: URI, formatting: IPathLabelFormatting): string {
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
	if (os === OperatingSystem.Windows && !isWindows) {
		absolutePath = absolutePath.replace(/\//g, '\\');
	} else if (os !== OperatingSystem.Windows && isWindows) {
		absolutePath = absolutePath.replace(/\\/g, '/');
	}

	// macOS/Linux: tildify with provided user home directory
	if (os !== OperatingSystem.Windows && tildifier?.userHome) {
		const userHome = tildifier.userHome.fsPath;

		// This is a bit of a hack, but in order to figure out if the
		// resource is in the user home, we need to make sure to convert it
		// to a user home resource. We cannot assume that the resource is
		// already a user home resource.
		let userHomeCandidate: string;
		if (resource.scheme !== tildifier.userHome.scheme && resource.path[0] === posix.sep && resource.path[1] !== posix.sep) {
			userHomeCandidate = tildifier.userHome.with({ path: resource.path }).fsPath;
		} else {
			userHomeCandidate = absolutePath;
		}

		absolutePath = tildify(userHomeCandidate, userHome, os);
	}

	// normalize
	const pathLib = os === OperatingSystem.Windows ? win32 : posix;
	return pathLib.normalize(normalizeDriveLetter(absolutePath, os === OperatingSystem.Windows));
}

function getRelativePathLabel(resource: URI, relativePathProvider: IRelativePathProvider, os: OperatingSystem): string | undefined {
	const pathLib = os === OperatingSystem.Windows ? win32 : posix;
	const extUriLib = os === OperatingSystem.Linux ? extUri : extUriIgnorePathCase;

	const workspace = relativePathProvider.getWorkspace();
	const firstFolder = firstOrDefault(workspace.folders);
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

	let relativePathLabel: string | undefined = undefined;
	if (extUriLib.isEqual(folder.uri, resource)) {
		relativePathLabel = ''; // no label if paths are identical
	} else {
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

export function normalizeDriveLetter(path: string, isWindowsOS: boolean = isWindows): string {
	if (hasDriveLetter(path, isWindowsOS)) {
		return path.charAt(0).toUpperCase() + path.slice(1);
	}

	return path;
}

let normalizedUserHomeCached: { original: string; normalized: string } = Object.create(null);
export function tildify(path: string, userHome: string, os = OS): string {
	if (os === OperatingSystem.Windows || !path || !userHome) {
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
	if (os === OperatingSystem.Linux ? normalizedPath.startsWith(normalizedUserHome) : startsWithIgnoreCase(normalizedPath, normalizedUserHome)) {
		return `~/${normalizedPath.substr(normalizedUserHome.length)}`;
	}

	return path;
}

export function untildify(path: string, userHome: string): string {
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
const home = '~';
export function shorten(paths: string[], pathSeparator: string = sep): string[] {
	const shortenedPaths: string[] = new Array(paths.length);

	// for every path
	let match = false;
	for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
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
		if (trimmedPath.indexOf(unc) === 0) {
			prefix = trimmedPath.substr(0, trimmedPath.indexOf(unc) + unc.length);
			trimmedPath = trimmedPath.substr(trimmedPath.indexOf(unc) + unc.length);
		} else if (trimmedPath.indexOf(pathSeparator) === 0) {
			prefix = trimmedPath.substr(0, trimmedPath.indexOf(pathSeparator) + pathSeparator.length);
			trimmedPath = trimmedPath.substr(trimmedPath.indexOf(pathSeparator) + pathSeparator.length);
		} else if (trimmedPath.indexOf(home) === 0) {
			prefix = trimmedPath.substr(0, trimmedPath.indexOf(home) + home.length);
			trimmedPath = trimmedPath.substr(trimmedPath.indexOf(home) + home.length);
		}

		// pick the first shortest subpath found
		const segments: string[] = trimmedPath.split(pathSeparator);
		for (let subpathLength = 1; match && subpathLength <= segments.length; subpathLength++) {
			for (let start = segments.length - subpathLength; match && start >= 0; start--) {
				match = false;
				let subpath = segments.slice(start, start + subpathLength).join(pathSeparator);

				// that is unique to any other path
				for (let otherPathIndex = 0; !match && otherPathIndex < paths.length; otherPathIndex++) {

					// suffix subpath treated specially as we consider no match 'x' and 'x/...'
					if (otherPathIndex !== pathIndex && paths[otherPathIndex] && paths[otherPathIndex].indexOf(subpath) > -1) {
						const isSubpathEnding: boolean = (start + subpathLength === segments.length);

						// Adding separator as prefix for subpath, such that 'endsWith(src, trgt)' considers subpath as directory name instead of plain string.
						// prefix is not added when either subpath is root directory or path[otherPathIndex] does not have multiple directories.
						const subpathWithSep: string = (start > 0 && paths[otherPathIndex].indexOf(pathSeparator) > -1) ? pathSeparator + subpath : subpath;
						const isOtherPathEnding: boolean = paths[otherPathIndex].endsWith(subpathWithSep);

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
						result = result + pathSeparator + ellipsis;
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

export interface ISeparator {
	label: string;
}

enum Type {
	TEXT,
	VARIABLE,
	SEPARATOR
}

interface ISegment {
	value: string;
	type: Type;
}

/**
 * Helper to insert values for specific template variables into the string. E.g. "this $(is) a $(template)" can be
 * passed to this function together with an object that maps "is" and "template" to strings to have them replaced.
 * @param value string to which template is applied
 * @param values the values of the templates to use
 */
export function template(template: string, values: { [key: string]: string | ISeparator | undefined | null } = Object.create(null)): string {
	const segments: ISegment[] = [];

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
export function mnemonicMenuLabel(label: string, forceDisableMnemonics?: boolean): string {
	if (isMacintosh || forceDisableMnemonics) {
		return label.replace(/\(&&\w\)|&&/g, '').replace(/&/g, isMacintosh ? '&' : '&&');
	}

	return label.replace(/&&|&/g, m => m === '&' ? '&&' : '&');
}

/**
 * Handles mnemonics for buttons. Depending on OS:
 * - Windows: Supported via & character (replace && with & and & with && for escaping)
 * -   Linux: Supported via _ character (replace && with _)
 * -   macOS: Unsupported (replace && with empty string)
 */
export function mnemonicButtonLabel(label: string, forceDisableMnemonics?: boolean): string {
	if (isMacintosh || forceDisableMnemonics) {
		return label.replace(/\(&&\w\)|&&/g, '');
	}

	if (isWindows) {
		return label.replace(/&&|&/g, m => m === '&' ? '&&' : '&');
	}

	return label.replace(/&&/g, '_');
}

export function unmnemonicLabel(label: string): string {
	return label.replace(/&/g, '&&');
}

/**
 * Splits a recent label in name and parent path, supporting both '/' and '\' and workspace suffixes.
 * If the location is remote, the remote name is included in the name part.
 */
export function splitRecentLabel(recentLabel: string): { name: string; parentPath: string } {
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

function splitName(fullPath: string): { name: string; parentPath: string } {
	const p = fullPath.indexOf('/') !== -1 ? posix : win32;
	const name = p.basename(fullPath);
	const parentPath = p.dirname(fullPath);
	if (name.length) {
		return { name, parentPath };
	}
	// only the root segment
	return { name: parentPath, parentPath: '' };
}
