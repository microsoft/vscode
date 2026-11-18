/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from '../../../../base/common/path.js';
import * as glob from '../../../../base/common/glob.js';
import { normalizeNFD } from '../../../../base/common/normalization.js';
import * as extpath from '../../../../base/common/extpath.js';
import { isMacintosh as isMac } from '../../../../base/common/platform.js';
import * as strings from '../../../../base/common/strings.js';
import { IFileQuery, IFolderQuery } from '../common/search.js';
import { anchorGlob } from './ripgrepSearchUtils.js';
import { getExcludeExceptionGlobs } from './ripgrepTextSearchEngine.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';

export async function spawnRipgrepCmd(config: IFileQuery, folderQuery: IFolderQuery, includePattern?: glob.IExpression, excludePattern?: glob.IExpression, numThreads?: number, excludeExceptions?: readonly string[]) {
	const rgArgs = getRgArgs(config, folderQuery, includePattern, excludePattern, numThreads, excludeExceptions);
	const cwd = folderQuery.folder.fsPath;
	const resolvedRgDiskPath = await rgDiskPath();
	return {
		cmd: cp.spawn(resolvedRgDiskPath, rgArgs.args, { cwd }),
		rgDiskPath: resolvedRgDiskPath,
		siblingClauses: rgArgs.siblingClauses,
		rgArgs,
		cwd
	};
}

function getRgArgs(config: IFileQuery, folderQuery: IFolderQuery, includePattern?: glob.IExpression, excludePattern?: glob.IExpression, numThreads?: number, excludeExceptions?: readonly string[]) {
	const args = ['--files', '--hidden', '--case-sensitive', '--no-require-git'];

	if (config.ignoreGlobCase || folderQuery.ignoreGlobCase) {
		args.push('--glob-case-insensitive');
		args.push('--ignore-file-case-insensitive');
	}

	const pushGlob = (globArg: string) => {
		args.push('-g', globArg);
		if (isMac) {
			const normalized = normalizeNFD(globArg);
			if (normalized !== globArg) {
				args.push('-g', normalized);
			}
		}
	};

	// Includes are applied to the results of an exception run instead, because
	// ripgrep cannot intersect them with the globs of the exceptions
	const rgGlobs: IRgGlobResult = excludeExceptions ? { globArgs: [], siblingClauses: {} } : foldersToRgExcludeGlobs([folderQuery], excludePattern, undefined, false);
	if (excludeExceptions) {
		getExcludeExceptionGlobs(excludeExceptions).forEach(pushGlob);
	} else {
		// includePattern can't have siblingClauses
		foldersToIncludeGlobs([folderQuery], includePattern, false).forEach(globArg => pushGlob(anchorGlob(globArg)));
		rgGlobs.globArgs.forEach(globArg => pushGlob(`!${anchorGlob(globArg)}`));
	}

	// Exception runs ignore ignore files: the globs of the exceptions only match re-included paths,
	// which override ignore files, and folders that lead to them may be ignored themselves
	if (excludeExceptions || folderQuery.disregardIgnoreFiles !== false) {
		// Don't use .gitignore or .ignore
		args.push('--no-ignore');
	} else if (folderQuery.disregardParentIgnoreFiles !== false) {
		args.push('--no-ignore-parent');
	}

	// Follow symlinks
	if (!folderQuery.ignoreSymlinks) {
		args.push('--follow');
	}

	// Exception runs list their candidates, because they are filtered further before existence is known
	if (config.exists && !excludeExceptions) {
		args.push('--quiet');
	}

	if (numThreads) {
		args.push('--threads', `${numThreads}`);
	}

	args.push('--no-config');
	if (folderQuery.disregardGlobalIgnoreFiles) {
		args.push('--no-ignore-global');
	}

	return {
		args,
		siblingClauses: rgGlobs.siblingClauses
	};
}

interface IRgGlobResult {
	globArgs: string[];
	siblingClauses: glob.IExpression;
}

function foldersToRgExcludeGlobs(folderQueries: IFolderQuery[], globalExclude?: glob.IExpression, excludesToSkip?: Set<string>, absoluteGlobs = true): IRgGlobResult {
	const globArgs: string[] = [];
	let siblingClauses: glob.IExpression = {};
	folderQueries.forEach(folderQuery => {
		const totalExcludePattern = glob.withoutExcludeExceptions(Object.assign({}, folderQuery.excludePattern || {}, globalExclude || {}));
		const result = globExprsToRgGlobs(totalExcludePattern, absoluteGlobs ? folderQuery.folder.fsPath : undefined, excludesToSkip);
		globArgs.push(...result.globArgs);
		if (result.siblingClauses) {
			siblingClauses = Object.assign(siblingClauses, result.siblingClauses);
		}
	});

	return { globArgs, siblingClauses };
}

function foldersToIncludeGlobs(folderQueries: IFolderQuery[], globalInclude?: glob.IExpression, absoluteGlobs = true): string[] {
	const globArgs: string[] = [];
	folderQueries.forEach(folderQuery => {
		const totalIncludePattern = Object.assign({}, globalInclude || {}, folderQuery.includePattern || {});
		const result = globExprsToRgGlobs(totalIncludePattern, absoluteGlobs ? folderQuery.folder.fsPath : undefined);
		globArgs.push(...result.globArgs);
	});

	return globArgs;
}

function globExprsToRgGlobs(patterns: glob.IExpression, folder?: string, excludesToSkip?: Set<string>): IRgGlobResult {
	const globArgs: string[] = [];
	const siblingClauses: glob.IExpression = {};
	Object.keys(patterns)
		.forEach(key => {
			if (excludesToSkip && excludesToSkip.has(key)) {
				return;
			}

			if (!key) {
				return;
			}

			const value = patterns[key];
			key = trimTrailingSlash(folder ? getAbsoluteGlob(folder, key) : key);

			// glob.ts requires forward slashes, but a UNC path still must start with \\
			// #38165 and #38151
			if (key.startsWith('\\\\')) {
				key = '\\\\' + key.substr(2).replace(/\\/g, '/');
			} else {
				key = key.replace(/\\/g, '/');
			}

			if (typeof value === 'boolean' && value) {
				if (key.startsWith('\\\\')) {
					// Absolute globs UNC paths don't work properly, see #58758
					key += '**';
				}

				globArgs.push(fixDriveC(key));
			} else if (value && value.when) {
				siblingClauses[key] = value;
			}
		});

	return { globArgs, siblingClauses };
}

/**
 * Resolves a glob like "node_modules/**" in "/foo/bar" to "/foo/bar/node_modules/**".
 * Special cases C:/foo paths to write the glob like /foo instead - see https://github.com/BurntSushi/ripgrep/issues/530.
 *
 * Exported for testing
 */
export function getAbsoluteGlob(folder: string, key: string): string {
	return path.isAbsolute(key) ?
		key :
		path.join(folder, key);
}

function trimTrailingSlash(str: string): string {
	str = strings.rtrim(str, '\\');
	return strings.rtrim(str, '/');
}

export function fixDriveC(path: string): string {
	const root = extpath.getRoot(path);
	return root.toLowerCase() === 'c:/' ?
		path.replace(/^c:[/\\]/i, '/') :
		path;
}
