/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import picomatch from 'picomatch';
import type vscode from 'vscode';
import * as path from '../vs/base/common/path';
import { isWindows } from '../vs/base/common/platform';
import { URI } from '../vs/base/common/uri';

export function isMatch(uri: URI, glob: vscode.GlobPattern): boolean {
	if (typeof glob === 'string') {
		return picomatch.isMatch(uri.fsPath, glob, { dot: true, windows: isWindows });
	} else {
		if (uri.fsPath === glob.baseUri.fsPath && glob.pattern === '*') {
			return true;
		}

		const relativePath = path.relative(glob.baseUri.fsPath, uri.fsPath);
		if (!relativePath.startsWith('..')) {
			return picomatch.isMatch(relativePath, glob.pattern, { dot: true, windows: isWindows });
		}

		return picomatch.isMatch(uri.fsPath, glob.pattern, { dot: true, windows: isWindows });
	}
}

export interface GlobIncludeOptions {
	/**
	 * Globs for files to explicitly include in the search.
	 *
	 * If this is provided, only files matching these globs will be included.
	 */
	readonly include?: readonly vscode.GlobPattern[];

	/**
	 * Globs for files to exclude from the search.
	 *
	 * This takes precedence over the {@linkcode include} globs.
	 */
	readonly exclude?: readonly vscode.GlobPattern[];
}

export function shouldInclude(uri: URI, options: GlobIncludeOptions | undefined): boolean {
	if (!options) {
		return true;
	}

	if (options.exclude?.some(x => isMatch(uri, x))) {
		return false;
	}

	if (options.include) {
		return options.include.some(x => isMatch(uri, x));
	}

	return true;
}

/**
 * Combines two globs into a single glob that matches whatever either of them matches.
 * Brace groups are flattened because `{a.ts,{b.js,c.js}}` does not match `b.js` in VS Code search.
 */
export function combineGlob(glob1: string | vscode.RelativePattern, glob2: string | vscode.RelativePattern): string {
	const alternatives = [...toGlobAlternatives(glob1), ...toGlobAlternatives(glob2)];
	return `{${alternatives.join(',')}}`;
}

/**
 * Splits a glob into the top level alternatives it is built from, so they can be flattened.
 * A pattern that is not a single brace group, or cannot be split safely, is returned unchanged.
 */
function toGlobAlternatives(glob: string | vscode.RelativePattern): string[] {
	const pattern = typeof glob === 'string' ? glob : glob.baseUri.toString() + glob.pattern;
	if (!pattern.startsWith('{') || !pattern.endsWith('}')) {
		return [pattern];
	}

	const alternatives: string[] = [];
	let current = '';
	let depth = 0;
	for (const character of pattern.slice(1, -1)) {
		if (character === ',' && depth === 0) {
			alternatives.push(current);
			current = '';
			continue;
		}
		if (character === '{') {
			depth++;
		} else if (character === '}') {
			depth--;
			if (depth < 0) {
				// The outer braces were not a single wrapping group after all.
				return [pattern];
			}
		}
		current += character;
	}
	alternatives.push(current);

	return depth === 0 && alternatives.every(alternative => alternative.length > 0) ? alternatives : [pattern];
}
