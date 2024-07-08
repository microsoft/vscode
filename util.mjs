/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';

/** @type {Set<string>} */
const ensureDirCache = new Set();
/**
 * @param dirPath
 */
export function ensureDir(dirPath) {
	if (ensureDirCache.has(dirPath)) {
		return;
	}
	ensureDirCache.add(dirPath);
	ensureDir(dirname(dirPath));
	if (!existsSync(dirPath)) {
		mkdirSync(dirPath);
	}
}

/**
 * @param dirPath
 * @param result
 */
export function readdir(dirPath, result) {
	const entries = readdirSync(dirPath);
	for (const entry of entries) {
		const entryPath = join(dirPath, entry);
		const stat = statSync(entryPath);
		if (stat.isDirectory()) {
			readdir(join(dirPath, entry), result);
		} else {
			result.push(entryPath);
		}
	}
}
