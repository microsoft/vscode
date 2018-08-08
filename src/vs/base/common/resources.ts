/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { equalsIgnoreCase } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import { isLinux } from 'vs/base/common/platform';
import { CharCode } from 'vs/base/common/charCode';

export function getComparisonKey(resource: URI): string {
	return hasToIgnoreCase(resource) ? resource.toString().toLowerCase() : resource.toString();
}

export function hasToIgnoreCase(resource: URI): boolean {
	// A file scheme resource is in the same platform as code, so ignore case for non linux platforms
	// Resource can be from another platform. Lowering the case as an hack. Should come from File system provider
	return resource.scheme === Schemas.file ? !isLinux : true;
}

export function basenameOrAuthority(resource: URI): string {
	return basename_urlpath(resource.path) || resource.authority;
}

export function isEqualOrParent(resource: URI, candidate: URI, ignoreCase?: boolean): boolean {
	if (resource.scheme === candidate.scheme && resource.authority === candidate.authority) {
		if (resource.scheme === 'file') {
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
	if (resource.scheme === 'file') {
		return paths.basename(resource.fsPath);
	}
	return basename_urlpath(resource.path);
}

export function dirname(resource: URI): URI {
	if (resource.scheme === 'file') {
		return URI.file(paths.dirname(resource.fsPath));
	}
	let dirname = dirname_urlpath(resource.path);
	if (resource.authority && dirname.length && dirname.charCodeAt(0) !== CharCode.Slash) {
		return null; // If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character
	}
	return resource.with({
		path: dirname
	});
}

export function joinPath(resource: URI, pathFragment: string): URI {
	if (resource.scheme === 'file') {
		return URI.file(paths.join(resource.path || '/', pathFragment));
	}

	let path = resource.path || '';
	let last = path.charCodeAt(path.length - 1);
	let next = pathFragment.charCodeAt(0);
	if (last !== CharCode.Slash) {
		if (next !== CharCode.Slash) {
			path += '/';
		}
	} else {
		if (next === CharCode.Slash) {
			pathFragment = pathFragment.substr(1);
		}
	}
	return resource.with({
		path: path + pathFragment
	});
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

function dirname_urlpath(path: string): string {
	const idx = ~path.lastIndexOf('/');
	if (idx === 0) {
		return '';
	} else if (~idx === 0) {
		return path[0];
	} else if (~idx === path.length - 1) {
		return dirname_urlpath(path.substring(0, path.length - 1));
	} else {
		return path.substring(0, ~idx);
	}
}

function basename_urlpath(path: string): string {
	const idx = ~path.lastIndexOf('/');
	if (idx === 0) {
		return path;
	} else if (~idx === path.length - 1) {
		return basename_urlpath(path.substring(0, path.length - 1));
	} else {
		return path.substr(~idx + 1);
	}
}
