/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { CharCode } from 'vs/base/common/charCode';

export function getComparisonKey(resource: URI): string {
	return hasToIgnoreCase(resource) ? resource.toString().toLowerCase() : resource.toString();
}

export function hasToIgnoreCase(resource: URI): boolean {
	// A file scheme resource is in the same platform as code, so ignore case for non linux platforms
	// Resource can be from another platform. Lowering the case as an hack. Should come from File system provider
	return resource && resource.scheme === Schemas.file ? !isLinux : true;
}

export function basenameOrAuthority(resource: URI): string {
	return basename(resource) || resource.authority;
}

export function isEqualOrParent(resource: URI, candidate: URI, ignoreCase?: boolean): boolean {
	if (resource.scheme === candidate.scheme && resource.authority === candidate.authority) {
		if (resource.scheme === Schemas.file) {
			return paths.isEqualOrParent(resource.fsPath, candidate.fsPath, ignoreCase);
		}
		return paths.isEqualOrParent(resource.path, candidate.path, ignoreCase, '/');
	}

	return false;
}

export function isEqual(first: URI, second: URI, ignoreCase?: boolean): boolean {
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
export function dirname(resource: URI): URI {
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
		joinedPath = URI.file(paths.join(resource.fsPath, pathFragment)).path;
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
		normalizedPath = URI.file(paths.normalize(resource.fsPath)).path;
	} else {
		normalizedPath = paths.normalize(resource.path);
	}
	return resource.with({
		path: normalizedPath
	});
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

export function isMalformedFileUri(candidate: URI): URI | undefined {
	if (!candidate.scheme || isWindows && candidate.scheme.match(/^[a-zA-Z]$/)) {
		return URI.file((candidate.scheme ? candidate.scheme + ':' : '') + candidate.path);
	}
	return void 0;
}

