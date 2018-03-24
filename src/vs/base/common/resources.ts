/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as paths from 'vs/base/common/paths';
import uri from 'vs/base/common/uri';
import { equalsIgnoreCase } from 'vs/base/common/strings';

export function basenameOrAuthority(resource: uri): string {
	return paths.basename(resource.fsPath) || resource.authority;
}

export function isEqualOrParent(resource: uri, candidate: uri, ignoreCase?: boolean): boolean {
	if (resource.scheme === candidate.scheme && resource.authority === candidate.authority) {
		return paths.isEqualOrParent(resource.fsPath, candidate.fsPath, ignoreCase);
	}

	return false;
}

export function isEqual(first: uri, second: uri, ignoreCase?: boolean): boolean {
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

export function dirname(resource: uri): uri {
	const dirname = paths.dirname(resource.path);
	if (resource.authority && dirname && !paths.isAbsolute(dirname)) {
		return null; // If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character
	}

	return resource.with({
		path: dirname
	});
}

export function distinctParents<T>(items: T[], resourceAccessor: (item: T) => uri): T[] {
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