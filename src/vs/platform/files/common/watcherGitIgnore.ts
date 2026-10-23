/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { match } from '../../../base/common/glob.js';
import { IGitIgnorePattern, parseGitIgnore } from '../../../base/common/ignoreFile.js';
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
 * Globs that are skipped:
 * - backslashes, which watchers interpret as escapes or path separators
 * - `:`, which can make a glob look like an absolute Windows path
 * - globs that only consist of `*` and `/`, which match everything
 */
const UNSUPPORTED_GLOB = /[\\:]|^[*/]+$/;

/**
 * Paths that are never excluded: the ignore file itself, so that changes to it
 * are still reported, and `.git` folders, which git never ignores.
 */
const NEVER_EXCLUDED_PATHS = [GIT_IGNORE_FILE_NAME, '.git', '.git/HEAD', 'a/.git', 'a/.git/HEAD'];

/**
 * Converts the contents of a `.gitignore` file at the root of a watched folder
 * into exclude patterns for a recursive watch request on that folder. The
 * patterns are relative to the watched folder. For example, `/target/`
 * excludes everything inside the `target` folder of the watched folder and
 * `node_modules` excludes files and folders named `node_modules` at any depth,
 * including everything inside them. The patterns never start with `**`, which
 * watchers match against absolute paths, so that the name of a parent of the
 * watched folder cannot cause the whole folder to be excluded.
 *
 * Excluding a path that git does not ignore would drop its file events, so the
 * conversion prefers excluding too little over excluding too much:
 * - Patterns that come before a negation (`!`) are skipped, because the
 *   negation may re-include paths they match.
 * - A pattern that only matches folders excludes what is inside of a folder,
 *   but not the folder itself, which could also be a file of the same name.
 * - Patterns that cannot be expressed in the same way for all watchers are
 *   skipped, and so are patterns matching the `.gitignore` file itself, so
 *   that changes to it are still reported, or a `.git` folder.
 * - At most 500 patterns are returned.
 *
 * Only this one file is considered: nested `.gitignore` files,
 * `.git/info/exclude` and `core.excludesFile` are not read. A negation in a
 * nested `.gitignore` file is therefore not honored for paths excluded here,
 * and files that git tracks despite matching a pattern are excluded as well.
 */
export function getWatcherExcludesFromGitIgnore(contents: string): string[] {
	const patterns = parseGitIgnore(contents);
	const lastNegation = patterns.findLastIndex(pattern => pattern.negated);

	const excludes = new Set<string>();
	for (const pattern of patterns.slice(lastNegation + 1)) {
		const patternExcludes = toWatcherExcludes(pattern)?.filter(exclude => !excludes.has(exclude));
		if (!patternExcludes?.length) {
			continue;
		}

		if (excludes.size + patternExcludes.length > MAX_GIT_IGNORE_WATCHER_EXCLUDES) {
			break;
		}

		for (const exclude of patternExcludes) {
			excludes.add(exclude);
		}
	}

	return [...excludes];
}

function toWatcherExcludes(pattern: IGitIgnorePattern): string[] | undefined {
	let glob = pattern.glob;
	if (UNSUPPORTED_GLOB.test(glob) || hasControlCharacter(glob)) {
		return undefined;
	}

	// Patterns that match at any depth start with `*/**/` instead of `**/`,
	// so that watchers match them relative to the watched folder
	let anyDepth = !pattern.anchored;
	while (glob.startsWith('**/')) {
		glob = glob.substring(3);
		anyDepth = true;
	}

	if (glob.startsWith('!')) {
		return undefined; // some watchers treat a leading `!` as negation
	}

	let suffixes: string[];
	if (glob.endsWith('/**')) {
		if (pattern.directoryOnly) {
			return undefined;
		}
		suffixes = ['/*']; // everything inside the folder, but not the folder itself
	} else if (pattern.directoryOnly) {
		suffixes = ['/**/*']; // everything inside the folder, but not a file of the same name
	} else {
		suffixes = ['', '/**']; // a file, or a folder and everything inside it
	}

	const excludes: string[] = [];
	for (const prefix of anyDepth ? ['', '*/**/'] : ['']) {
		for (const suffix of suffixes) {
			excludes.push(`${prefix}${glob}${suffix}`);
		}
	}

	if (excludes.some(exclude => NEVER_EXCLUDED_PATHS.some(path => match(exclude, path)))) {
		return undefined;
	}

	return excludes;
}

function hasControlCharacter(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const charCode = value.charCodeAt(i);
		if (charCode < 0x20 || charCode === 0x7f) {
			return true;
		}
	}

	return false;
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
