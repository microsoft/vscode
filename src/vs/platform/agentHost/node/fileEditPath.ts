/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/** Removes the `.` segments of a file's path. `..` segments stay, since the folder before one can be a symbolic link. */
function withoutDotSegments(resource: URI): URI {
	if (resource.scheme !== Schemas.file || !resource.path.includes('/./')) {
		return resource;
	}
	return resource.with({ path: resource.path.replace(/\/(?:\.\/)+/g, '/') });
}

/**
 * The key of the file at `resource`. Edit tools name a file with the path they were called with, so one file can
 * have several spellings; everything that lists, addresses or coordinates changes of a file must use this key.
 */
export function getFileEditResourceKey(resource: URI): string {
	return extUriBiasedIgnorePathCase.getComparisonKey(withoutDotSegments(resource));
}

/** The key of the file that a recorded edit's path names, see {@link getFileEditResourceKey}. */
export function getFileEditPathKey(filePath: string): string {
	return getFileEditResourceKey(URI.file(filePath));
}

/** The resource that the file of a recorded edit's path is shown at. */
export function toFileEditResource(filePath: string): URI {
	return withoutDotSegments(URI.file(filePath));
}

/** Whether two recorded paths name the same file, see {@link getFileEditPathKey}. */
export function isSameFileEditPath(a: string, b: string): boolean {
	return a === b || getFileEditPathKey(a) === getFileEditPathKey(b);
}

/** Whether a recorded path names the file at `resource`, see {@link getFileEditResourceKey}. */
export function isFileEditPath(filePath: string | undefined, resource: URI): boolean {
	return filePath !== undefined && getFileEditPathKey(filePath) === getFileEditResourceKey(resource);
}
