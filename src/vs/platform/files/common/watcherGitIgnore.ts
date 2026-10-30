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
 * Number of later negations above which a pattern is skipped without
 * comparing it to each of them.
 */
const MAX_GIT_IGNORE_NEGATIONS = 50;

/**
 * Prefixes of the excludes for a pattern that matches at any depth. Watchers
 * match every exclude against every path they find and every event they
 * report, and an exclude that starts with `**` is a complex regular expression
 * that is slow to match. Such a pattern therefore only excludes paths up to
 * three folders below the watched folder, like `files.watcherExclude` does by
 * default.
 */
const ANY_DEPTH_PREFIXES = ['', '*/', '*/*/', '*/*/*/'];

/**
 * Characters that make a glob match more than one name.
 */
const GLOB_CHARACTERS = /[*?[{]/;

/**
 * Globs that are skipped:
 * - backslashes, which watchers interpret as escapes or path separators
 * - `:`, which can make a glob look like an absolute Windows path
 * - bracket expressions that start with `]`, which Parcel does not
 *   recognize as globs and would exclude as literal paths
 * - globs that only consist of `*` and `/`, which match everything
 */
const UNSUPPORTED_GLOB = /[\\:]|\[\^?\]|^[*/]+$/;

/**
 * Paths that are never excluded: the ignore file itself, so that changes to it
 * are still reported, and `.git` folders, which git never ignores. A nested
 * repository is represented by a folder name that patterns are unlikely to
 * match on purpose, so that patterns for other folders are not skipped.
 */
const NEVER_EXCLUDED_PATHS = [GIT_IGNORE_FILE_NAME, '.git', '.git/HEAD', 'vscode-nested-repository/.git', 'vscode-nested-repository/.git/HEAD'];

/**
 * Converts the contents of a `.gitignore` file at the root of a watched folder
 * into exclude patterns for a recursive watch request on that folder. The
 * patterns are relative to the watched folder. For example, `/target/`
 * excludes everything inside the `target` folder of the watched folder and
 * `node_modules` excludes files and folders named `node_modules`, including
 * everything inside them. The patterns never start with `**`, which watchers
 * match against absolute paths, so that the name of a parent of the watched
 * folder cannot cause the whole folder to be excluded.
 *
 * Excluding a path that git does not ignore would drop its file events, so the
 * conversion prefers excluding too little over excluding too much:
 * - A pattern is skipped when a later negation (`!`) may re-include a path
 *   that it matches. Git does not re-include paths inside of an ignored
 *   folder, so this is only assumed when both patterns may match the same
 *   name, for example `*.log` and `!important.log`.
 * - A pattern that only matches folders excludes what is inside of a folder,
 *   but not the folder itself, which could also be a file of the same name.
 * - A pattern that matches at any depth, such as `node_modules`, only
 *   excludes paths up to three folders below the watched folder, because
 *   watchers are slow to match excludes that start with `**`.
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
	const negatedNames = patterns.filter(pattern => pattern.negated).map(pattern => getName(pattern.glob));

	const excludes = new Set<string>();
	let negations = 0;
	for (const pattern of patterns) {
		if (pattern.negated) {
			negations++;
			continue;
		}

		const patternExcludes = toWatcherExcludes(pattern)?.filter(exclude => !excludes.has(exclude));
		if (!patternExcludes?.length || mayBeReIncluded(getName(pattern.glob), negatedNames.slice(negations))) {
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

/**
 * Whether one of the later negations may re-include a path that matches a
 * pattern whose last segment is `name`.
 */
function mayBeReIncluded(name: string, laterNegatedNames: readonly string[]): boolean {
	return laterNegatedNames.length > MAX_GIT_IGNORE_NEGATIONS || laterNegatedNames.some(negatedName => mayMatchSameName(name, negatedName));
}

/**
 * Whether two last segments of patterns may match the same name. Git matches
 * case-insensitively when `core.ignoreCase` is set.
 */
function mayMatchSameName(a: string, b: string): boolean {
	const isGlobA = GLOB_CHARACTERS.test(a);
	const isGlobB = GLOB_CHARACTERS.test(b);
	if (isGlobA && isGlobB) {
		return true;
	}

	if (isGlobA) {
		return match(a, b, { ignoreCase: true });
	}

	if (isGlobB) {
		return match(b, a, { ignoreCase: true });
	}

	return a.toLowerCase() === b.toLowerCase();
}

/**
 * The last segment of a glob, which matches the name of a file or folder.
 */
function getName(glob: string): string {
	return glob.substring(glob.lastIndexOf('/') + 1);
}

function toWatcherExcludes(pattern: IGitIgnorePattern): string[] | undefined {
	let glob = pattern.glob;
	if (UNSUPPORTED_GLOB.test(glob) || hasControlCharacter(glob)) {
		return undefined;
	}

	// Patterns that match at any depth get the prefixes for a few depths
	// instead of `**/`, see `ANY_DEPTH_PREFIXES`
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
		suffixes = ['{,/**}']; // a file, or a folder and everything inside it
	}

	const excludes: string[] = [];
	for (const prefix of anyDepth ? ANY_DEPTH_PREFIXES : ['']) {
		for (const suffix of suffixes) {
			excludes.push(`${prefix}${glob}${suffix}`);
		}
	}

	// Watchers match excludes case-insensitively on Windows and macOS
	if (excludes.some(exclude => NEVER_EXCLUDED_PATHS.some(path => match(exclude, path, { ignoreCase: true })))) {
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
