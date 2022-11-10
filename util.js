/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const fs = require('fs');
const path = require('path');

/** @type {Set<string>} */
const ensureDirCache = new Set();
/**
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
	if (ensureDirCache.has(dirPath)) {
		return;
	}
	ensureDirCache.add(dirPath);
	ensureDir(path.dirname(dirPath));
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath);
	}
}
exports.ensureDir = ensureDir;

/**
 * @param {string} dirPath
 * @param {string[]} result
 */
function readdir(dirPath, result) {
	const entries = fs.readdirSync(dirPath);
	for (const entry of entries) {
		const entryPath = path.join(dirPath, entry);
		const stat = fs.statSync(entryPath);
		if (stat.isDirectory()) {
			readdir(path.join(dirPath, entry), result);
		} else {
			result.push(entryPath);
		}
	}
}
exports.readdir = readdir;
