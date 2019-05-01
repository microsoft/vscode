/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Normalize windows/unix path to unix path
 */
export function normalizePath(path: string): string {
	if (typeof path !== 'string') {
		throw new TypeError('Expected path to be a string');
	}

	if (path === '\\' || path === '/') {
		return '/';
	}

	const len = path.length;
	if (len <= 1) {
		return path;
	}

	let prefix = '';
	if (len > 4 && path[3] === '\\') {
		const ch = path[2];
		if ((ch === '?' || ch === '.') && path.slice(0, 2) === '\\\\') {
			path = path.slice(2);
			prefix = '//';
		}
	}

	const segs = path.split(/[/\\]+/);
	return prefix + segs.join('/');
}