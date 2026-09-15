/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import picomatch from 'picomatch';

// Windows and macOS are treated as case-insensitive file systems in VS Code
// (see `util.ts`). Kept local to avoid importing `vscode` into this module.
const isCaseInsensitiveFileSystem = process.platform === 'win32' || process.platform === 'darwin';

export function getWorktreeIncludePaths(repositoryRoot: string, globs: readonly string[], filesOutput: string, directoriesOutput: string, trackedFilesOutput: string): string[] {
	const ignoredFiles = filesOutput.split('\0').filter(Boolean);
	if (ignoredFiles.length === 0) {
		return [];
	}

	const matchers = globs.map(pattern => {
		const normalized = pattern.replaceAll('\\', '/');
		return picomatch(normalized.endsWith('/') ? `${normalized}**` : normalized, { dot: true });
	});
	const wholeDirectories = new Set(directoriesOutput.split('\0').filter(entry => entry.endsWith('/')));
	// Normalized lookup sets for case-insensitive file systems (Windows/macOS). Original
	// spellings are retained in `wholeDirectories`/`matchedFiles` for the returned copy paths.
	const normalizedWholeDirectories = new Set([...wholeDirectories].map(normalizePathForComparison));
	const normalizedTrackedFiles = new Set(trackedFilesOutput.split('\0').filter(Boolean).map(normalizePathForComparison));
	const matchedFiles: string[] = [];
	const nonCollapsibleDirectories = new Set<string>();

	for (const file of normalizedTrackedFiles) {
		const directory = normalizedWholeDirectories.has(`${file}/`) ? `${file}/` : findContainingDirectory(file, normalizedWholeDirectories);
		if (directory) {
			nonCollapsibleDirectories.add(directory);
		}
	}

	for (const file of ignoredFiles) {
		if (matchers.some(matcher => matcher(file)) && !hasTrackedPathOrAncestor(file, normalizedTrackedFiles)) {
			matchedFiles.push(file);
			continue;
		}

		const containingDirectory = findContainingDirectory(file, normalizedWholeDirectories);
		if (containingDirectory) {
			nonCollapsibleDirectories.add(containingDirectory);
		}
	}

	const collapsedDirectories = new Set<string>();
	for (const directory of wholeDirectories) {
		if (!nonCollapsibleDirectories.has(normalizePathForComparison(directory))) {
			collapsedDirectories.add(directory);
		}
	}
	const normalizedCollapsedDirectories = new Set([...collapsedDirectories].map(normalizePathForComparison));

	const includePaths = [...collapsedDirectories];
	for (const file of matchedFiles) {
		if (!findContainingDirectory(file, normalizedCollapsedDirectories)) {
			includePaths.push(file);
		}
	}

	return includePaths.map(entry => path.join(repositoryRoot, entry));
}

/**
 * Normalizes a Git path for comparison. Windows and macOS are treated as
 * case-insensitive file systems in VS Code, so casing is lowered to avoid
 * missing path aliases (e.g. `Cache/` vs `cache/`). Git paths always use `/`
 * separators, so only the casing needs to be normalized.
 */
function normalizePathForComparison(filePath: string): string {
	return isCaseInsensitiveFileSystem ? filePath.toLowerCase() : filePath;
}

function findContainingDirectory(file: string, normalizedDirectories: ReadonlySet<string>): string | undefined {
	const normalizedFile = normalizePathForComparison(file);
	let index = normalizedFile.indexOf('/');
	while (index !== -1) {
		const prefix = normalizedFile.slice(0, index + 1);
		if (normalizedDirectories.has(prefix)) {
			return prefix;
		}
		index = normalizedFile.indexOf('/', index + 1);
	}
	return undefined;
}

function hasTrackedPathOrAncestor(file: string, normalizedTrackedFiles: ReadonlySet<string>): boolean {
	const normalizedFile = normalizePathForComparison(file);
	if (normalizedTrackedFiles.has(normalizedFile)) {
		return true;
	}

	let index = normalizedFile.indexOf('/');
	while (index !== -1) {
		if (normalizedTrackedFiles.has(normalizedFile.slice(0, index))) {
			return true;
		}
		index = normalizedFile.indexOf('/', index + 1);
	}
	return false;
}
