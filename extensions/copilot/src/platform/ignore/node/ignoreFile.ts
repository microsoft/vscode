/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gitignoreToMinimatch } from '@humanwhocodes/gitignore-to-minimatch';
import ignore, { Ignore } from 'ignore';
import { dirname, normalize, posix, relative, sep } from '../../../util/vs/base/common/path';
import { splitLines } from '../../../util/vs/base/common/strings';
import { URI } from '../../../util/vs/base/common/uri';

type IgnoreEntry = {
	ignore: Ignore;
	patterns: string[];
};

export class IgnoreFile {

	private readonly _ignoreMap = new Map<string, IgnoreEntry>();
	private _ignoreCache = new Map<string, boolean>();
	private _searchRankCache: string[] | null = null;

	constructor() { }

	/**
	 * With a given ignore file, create the ignore instance and add its contents
	 */
	setIgnoreFile(workspaceRoot: URI | undefined, ignoreFile: URI, contents: string) {
		let scope = '';
		if (workspaceRoot) {
			scope = relative(workspaceRoot.fsPath, dirname(ignoreFile.fsPath));
			if (scope.startsWith('..')) {
				scope = '';
			}
		}

		this._ignoreMap.set(ignoreFile.fsPath, {
			ignore: ignore().add(contents),
			patterns: splitLines(contents)
				// Remove comments and empty lines
				.filter(x => x.trim() && !x.startsWith('#'))
				.map(gitignoreToMinimatch)
				.map(pattern => scope ? posix.join(scope, pattern) : pattern)

		});
		this._searchRankCache = null;
		this._ignoreCache.clear();
	}

	/**
	 * Removes the ignore file from being tracked
	 * @param ignoreFile The ignore file URI
	 */
	removeIgnoreFile(ignoreFile: URI) {
		this._ignoreMap.delete(ignoreFile.fsPath);
		this._searchRankCache = null;
		this._ignoreCache.clear();
	}

	/**
		* Remove all ignore instances for a given workspace
	*/
	removeWorkspace(workspace: URI) {
		let count = 0;
		for (const f of this._ignoreMap.keys()) {
			if (isDescendant(workspace.fsPath, f)) {
				this._ignoreMap.delete(f);
				count += 1;
			}
		}
		if (count > 0) {
			// Invalidate the search rank cache
			this._searchRankCache = null;
			this._ignoreCache.clear();
		}
	}

	asMinimatchPatterns(): string[] {
		return [...this._ignoreMap.values()].flatMap(x => x.patterns);
	}

	/**
	 * Check if a given file is ignored finding its ignore instance first
	 */
	isIgnored(file: URI) {
		if (this._ignoreMap.size === 0) {
			return false;
		}

		const target = file.fsPath;
		if (this._ignoreCache.has(target)) {
			return this._ignoreCache.get(target)!;
		}

		let ignoreIterations = 0;
		let result = { ignored: false, unignored: false };

		try {
			// We need to traverse up the tree using the first file we see, if it doesnt exist continue looking
			const searchRank = this._searchRank;
			for (const cur of searchRank) {
				ignoreIterations += 1;

				const dir = dirname(cur); // is like /Users/username/Project/
				const rel = relative(dir, target); // is like src/index.ts
				if (rel.startsWith('..')) {
					continue; // is outside of the scope of this file
				}

				// if the target is a descendant of the ignore location, check this ignore file
				if (dir !== target && isDescendant(dir, target)) {
					const entry = this._ignoreMap.get(cur);
					if (!entry) {
						throw new Error(`No ignore patterns found for ${cur}`);
					}
					result = entry.ignore.test(rel);
					if (result.ignored || result.unignored) {
						break;
					}
				}
			}
			this._ignoreCache.set(target, result.ignored);
			return result.ignored;
		} catch {
			return false;
		}
	}

	private get _searchRank() {
		if (this._searchRankCache !== null) {
			return this._searchRankCache;
		}

		const cache: Record<string, number> = {};
		const toRank = (value: string) => value.split(sep).length;
		return (this._searchRankCache = [...this._ignoreMap.keys()].sort(
			(a, b) => (cache[b] ||= toRank(b)) - (cache[a] ||= toRank(a))
		));
	}
}

/**
 * Checks if a path is a descendant of another path
 * @param parent The parent path
 * @param descendant The descendant path
 * @returns True if a descendant, false otherwise
 */
function isDescendant(parent: string, descendant: string) {
	if (parent === descendant) {
		return true;
	}
	if (parent.charAt(parent.length - 1) !== sep) {
		parent += sep;
	}
	return normalize(descendant).startsWith(normalize(parent));
}
