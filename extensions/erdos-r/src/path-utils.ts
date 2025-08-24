/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export function isParentPath(filePath: string, parentPath: string): boolean {
	if (!parentPath.endsWith(path.sep)) {
		parentPath += path.sep;
	}
	if (!filePath.endsWith(path.sep)) {
		filePath += path.sep;
	}
	return normCasePath(filePath).startsWith(normCasePath(parentPath));
}

export function normCasePath(filePath: string): string {
	return os.platform() === 'win32' ? path.normalize(filePath).toUpperCase() : path.normalize(filePath);
}

export function arePathsSame(path1: string, path2: string): boolean {
	return normCasePath(path1) === normCasePath(path2);
}

export function untildify(path: string): string {
	return path.replace(/^~($|\/|\\)/, `${os.homedir()}$1`);
}

export function isFile(filePath: string): boolean {
	try {
		const stats = fs.lstatSync(filePath);
		if (stats.isSymbolicLink()) {
			let resolvedPath = fs.realpathSync(filePath);
			const maximumDepth = 5;
			for (let i = 0; i < maximumDepth; i++) {
				const resolvedStats = fs.lstatSync(resolvedPath);
				if (resolvedStats.isFile()) {
					return true;
				}
				resolvedPath = fs.realpathSync(resolvedPath);
			}
			console.error(`[isFile] Detected a potential symbolic link loop at ${filePath}, terminating resolution.`);
			return false;
		}
		return stats.isFile();
	} catch (error) {
		console.error(`[isFile] Error checking if path is a file: ${error}`);
		return false;
	}
}

export function isDirectory(filePath: string): boolean {
	try {
		const stats = fs.lstatSync(filePath);
		return stats.isDirectory();
	} catch (error) {
		console.error(`[isDirectory] Error checking if path is a directory: ${error}`);
		return false;
	}
}
