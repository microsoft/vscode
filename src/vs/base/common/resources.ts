/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { CharCode } from 'vs/base/common/charCode';

export function getComparisonKey(resource: URI): string {
	return hasToIgnoreCase(resource) ? resource.toString().toLowerCase() : resource.toString();
}

export function hasToIgnoreCase(resource: URI | undefined): boolean {
	// A file scheme resource is in the same platform as code, so ignore case for non linux platforms
	// Resource can be from another platform. Lowering the case as an hack. Should come from File system provider
	return resource && resource.scheme === Schemas.file ? !isLinux : true;
}

export function basenameOrAuthority(resource: URI): string {
	return basename(resource) || resource.authority;
}

/**
 * Tests whether a `candidate` URI is a parent or equal of a given `base` URI.
 * @param base A uri which is "longer"
 * @param parentCandidate A uri which is "shorter" then `base`
 */
export function isEqualOrParent(base: URI, parentCandidate: URI, ignoreCase = hasToIgnoreCase(base)): boolean {
	if (base.scheme === parentCandidate.scheme) {
		if (base.scheme === Schemas.file) {
			return paths.isEqualOrParent(fsPath(base), fsPath(parentCandidate), ignoreCase);
		}
		if (isEqualAuthority(base.authority, parentCandidate.authority, ignoreCase)) {
			return paths.isEqualOrParent(base.path, parentCandidate.path, ignoreCase, '/');
		}
	}
	return false;
}

function isEqualAuthority(a1: string, a2: string, ignoreCase?: boolean) {
	return a1 === a2 || ignoreCase && a1 && a2 && equalsIgnoreCase(a1, a2);
}

export function isEqual(first: URI | undefined, second: URI | undefined, ignoreCase = hasToIgnoreCase(first)): boolean {
	const identityEquals = (first === second);
	if (identityEquals) {
		return true;
	}

	if (!first || !second) {
		return false;
	}

	if (ignoreCase) {
		return equalsIgnoreCase(first.toString(), second.toString());
	}

	return first.toString() === second.toString();
}

export function basename(resource: URI): string {
	return paths.basename(resource.path);
}

/**
 * Return a URI representing the directory of a URI path.
 *
 * @param resource The input URI.
 * @returns The URI representing the directory of the input URI.
 */
export function dirname(resource: URI): URI | null {
	if (resource.scheme === Schemas.file) {
		return URI.file(paths.dirname(fsPath(resource)));
	}
	let dirname = paths.dirname(resource.path, '/');
	if (resource.authority && dirname.length && dirname.charCodeAt(0) !== CharCode.Slash) {
		return null; // If a URI contains an authority component, then the path component must either be empty or begin with a CharCode.Slash ("/") character
	}
	return resource.with({
		path: dirname
	});
}

/**
 * Join a URI path with a path fragment and normalizes the resulting path.
 *
 * @param resource The input URI.
 * @param pathFragment The path fragment to add to the URI path.
 * @returns The resulting URI.
 */
export function joinPath(resource: URI, pathFragment: string): URI {
	let joinedPath: string;
	if (resource.scheme === Schemas.file) {
		joinedPath = URI.file(paths.join(fsPath(resource), pathFragment)).path;
	} else {
		joinedPath = paths.join(resource.path, pathFragment);
	}
	return resource.with({
		path: joinedPath
	});
}

/**
 * Normalizes the path part of a URI: Resolves `.` and `..` elements with directory names.
 *
 * @param resource The URI to normalize the path.
 * @returns The URI with the normalized path.
 */
export function normalizePath(resource: URI): URI {
	let normalizedPath: string;
	if (resource.scheme === Schemas.file) {
		normalizedPath = URI.file(paths.normalize(fsPath(resource))).path;
	} else {
		normalizedPath = paths.normalize(resource.path);
	}
	return resource.with({
		path: normalizedPath
	});
}

/**
 * Returns the fsPath of an URI where the drive letter is not normalized.
 * See #56403.
 */
export function fsPath(uri: URI): string {
	let value: string;
	if (uri.authority && uri.path.length > 1 && uri.scheme === 'file') {
		// unc path: file://shares/c$/far/boo
		value = `//${uri.authority}${uri.path}`;
	} else if (
		isWindows
		&& uri.path.charCodeAt(0) === CharCode.Slash
		&& (uri.path.charCodeAt(1) >= CharCode.A && uri.path.charCodeAt(1) <= CharCode.Z || uri.path.charCodeAt(1) >= CharCode.a && uri.path.charCodeAt(1) <= CharCode.z)
		&& uri.path.charCodeAt(2) === CharCode.Colon
	) {
		value = uri.path.substr(1);
	} else {
		// other path
		value = uri.path;
	}
	if (isWindows) {
		value = value.replace(/\//g, '\\');
	}
	return value;
}

/**
 * Returns true if the URI path is absolute.
 */
export function isAbsolutePath(resource: URI): boolean {
	return paths.isAbsolute(resource.path);
}

export function distinctParents<T>(items: T[], resourceAccessor: (item: T) => URI): T[] {
	const distinctParents: T[] = [];
	for (let i = 0; i < items.length; i++) {
		const candidateResource = resourceAccessor(items[i]);
		if (items.some((otherItem, index) => {
			if (index === i) {
				return false;
			}

			return isEqualOrParent(candidateResource, resourceAccessor(otherItem));
		})) {
			continue;
		}

		distinctParents.push(items[i]);
	}

	return distinctParents;
}

/**
 * Tests whether the given URL is a file URI created by `URI.parse` instead of `URI.file`.
 * Such URI have no scheme or scheme that consist of a single letter (windows drive letter)
 * @param candidate The URI to test
 * @returns A corrected, real file URI if the input seems to be malformed.
 * Undefined is returned if the input URI looks fine.
 */
export function isMalformedFileUri(candidate: URI): URI | undefined {
	if (!candidate.scheme || isWindows && candidate.scheme.match(/^[a-zA-Z]$/)) {
		return URI.file((candidate.scheme ? candidate.scheme + ':' : '') + candidate.path);
	}
	return undefined;
}


/**
 * Data URI related helpers.
 */
export namespace DataUri {

	export const META_DATA_LABEL = 'label';
	export const META_DATA_DESCRIPTION = 'description';
	export const META_DATA_SIZE = 'size';
	export const META_DATA_MIME = 'mime';

	export function parseMetaData(dataUri: URI): Map<string, string> {
		const metadata = new Map<string, string>();

		// Given a URI of:  data:image/png;size:2313;label:SomeLabel;description:SomeDescription;base64,77+9UE5...
		// the metadata is: size:2313;label:SomeLabel;description:SomeDescription
		const meta = dataUri.path.substring(dataUri.path.indexOf(';') + 1, dataUri.path.lastIndexOf(';'));
		meta.split(';').forEach(property => {
			const [key, value] = property.split(':');
			if (key && value) {
				metadata.set(key, value);
			}
		});

		// Given a URI of:  data:image/png;size:2313;label:SomeLabel;description:SomeDescription;base64,77+9UE5...
		// the mime is: image/png
		const mime = dataUri.path.substring(0, dataUri.path.indexOf(';'));
		if (mime) {
			metadata.set(META_DATA_MIME, mime);
		}

		return metadata;
	}
}
