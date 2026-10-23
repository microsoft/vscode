/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { match } from '../../../base/common/glob.js';
import { gitIgnoreLineToGlob } from '../../../base/common/ignoreFile.js';
import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from './files.js';

/**
 * Name of the ignore file read by {@link readGitIgnoreWatcherExcludes}.
 */
export const GIT_IGNORE_FILE_NAME = '.gitignore';

const MAX_GIT_IGNORE_FILE_SIZE = 512 * 1024;
const MAX_GIT_IGNORE_WATCHER_EXCLUDES = 500;

/**
 * Lines that are skipped:
 * - leading whitespace, which git treats as part of the pattern
 * - escapes (`\`)
 * - characters that are literal in git but special in watcher globs (`{}()`)
 * - patterns that only consist of `*` and `/`, which match everything or nothing
 */
const UNSUPPORTED_LINE = /^\s|[\\{}()]|^[*/]+$/;

/**
 * Converts the contents of a `.gitignore` file at the root of a watched folder
 * into exclude patterns for a recursive watch request on that folder. The
 * patterns are relative to the watched folder.
 *
 * Excluding a path that git does not ignore would drop its file events, so the
 * conversion prefers excluding too little over excluding too much:
 * - Patterns that come before a negation (`!`) are skipped, because the
 *   negation may re-include paths they match.
 * - Lines that cannot be translated faithfully are skipped, and so are
 *   patterns matching the `.gitignore` file itself, so that changes to it are
 *   still reported.
 * - At most 500 patterns are returned.
 *
 * Only this one file is considered: nested `.gitignore` files,
 * `.git/info/exclude` and `core.excludesFile` are not read. A negation in a
 * nested `.gitignore` file is therefore not honored for paths excluded here,
 * and files that git tracks despite matching a pattern are excluded as well.
 */
export function getWatcherExcludesFromGitIgnore(contents: string): string[] {
	const lines = contents.split(/\r?\n/);

	let firstLine = 0;
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].startsWith('!')) {
			firstLine = i + 1;
			break;
		}
	}

	const excludes = new Set<string>();
	for (let i = firstLine; i < lines.length && excludes.size < MAX_GIT_IGNORE_WATCHER_EXCLUDES; i++) {
		const line = lines[i].trimEnd();
		if (!line || line.startsWith('#') || UNSUPPORTED_LINE.test(line)) {
			continue;
		}

		let pattern = gitIgnoreLineToGlob(line, '/');
		if (pattern.startsWith('/')) {
			pattern = pattern.substring(1); // anchored patterns stay relative to the watched folder
		}
		if (pattern.endsWith('/')) {
			pattern = pattern.substring(0, pattern.length - 1); // directory-only patterns
		}
		if (match(pattern, GIT_IGNORE_FILE_NAME)) {
			continue; // keep reporting changes to the ignore file itself
		}

		excludes.add(pattern);
		if (!pattern.endsWith('/**')) {
			excludes.add(`${pattern}/**`);
		}
	}

	return [...excludes].slice(0, MAX_GIT_IGNORE_WATCHER_EXCLUDES);
}

/**
 * Reads the `.gitignore` file at the root of `folder` and converts it with
 * {@link getWatcherExcludesFromGitIgnore}. Returns an empty array when the
 * file is missing, unreadable or larger than 512 KB.
 */
export async function readGitIgnoreWatcherExcludes(fileService: IFileService, folder: URI): Promise<string[]> {
	let contents: string;
	try {
		const file = await fileService.readFile(joinPath(folder, GIT_IGNORE_FILE_NAME), { limits: { size: MAX_GIT_IGNORE_FILE_SIZE } });
		contents = file.value.toString();
	} catch {
		return [];
	}

	return getWatcherExcludesFromGitIgnore(contents);
}
