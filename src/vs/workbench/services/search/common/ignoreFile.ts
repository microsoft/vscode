/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from '../../../../base/common/glob.js';
import { startsWithIgnoreCase } from '../../../../base/common/strings.js';

export class IgnoreFile {

	private isPathIgnored: (path: string, isDir: boolean, parent?: IgnoreFile) => boolean;

	constructor(
		contents: string,
		private readonly location: string,
		private readonly parent?: IgnoreFile,
		private readonly ignoreCase = false) {
		if (location[location.length - 1] === '\\') {
			throw Error('Unexpected path format, do not use trailing backslashes');
		}
		if (location[location.length - 1] !== '/') {
			location += '/';
		}
		this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
	}

	/**
	 * Updates the contents of the ignore file. Preserving the location and parent
	 * @param contents The new contents of the gitignore file
	 */
	updateContents(contents: string) {
		this.isPathIgnored = this.parseIgnoreFile(contents, this.location, this.parent);
	}

	/**
	 * Returns true if a path in a traversable directory has not been ignored.
	 *
	 * Note: For performance reasons this does not check if the parent directories have been ignored,
	 * so it should always be used in tandem with `shouldTraverseDir` when walking a directory.
	 *
	 * In cases where a path must be tested in isolation, `isArbitraryPathIncluded` should be used.
	 */
	isPathIncludedInTraversal(path: string, isDir: boolean): boolean {
		if (path[0] !== '/' || path[path.length - 1] === '/') {
			throw Error('Unexpected path format, expected to begin with slash and end without. got:' + path);
		}

		const ignored = this.isPathIgnored(path, isDir);

		return !ignored;
	}

	/**
	 * Returns true if an arbitrary path has not been ignored.
	 * This is an expensive operation and should only be used outside of traversals.
	 */
	isArbitraryPathIgnored(path: string, isDir: boolean): boolean {
		if (path[0] !== '/' || path[path.length - 1] === '/') {
			throw Error('Unexpected path format, expected to begin with slash and end without. got:' + path);
		}

		const segments = path.split('/').filter(x => x);
		let ignored = false;

		let walkingPath = '';

		for (let i = 0; i < segments.length; i++) {
			const isLast = i === segments.length - 1;
			const segment = segments[i];

			walkingPath = walkingPath + '/' + segment;

			if (!this.isPathIncludedInTraversal(walkingPath, isLast ? isDir : true)) {
				ignored = true;
				break;
			}
		}

		return ignored;
	}

	private gitignoreLinesToExpression(lines: string[], dirPath: string, trimForExclusions: boolean): glob.ParsedExpression {
		const includeLines = lines.map(line => this.gitignoreLineToGlob(line, dirPath));

		const includeExpression: glob.IExpression = Object.create(null);
		for (const line of includeLines) {
			includeExpression[line] = true;
		}

		return glob.parse(includeExpression, { trimForExclusions, ignoreCase: this.ignoreCase });
	}

	private parseIgnoreFile(ignoreContents: string, dirPath: string, parent: IgnoreFile | undefined): (path: string, isDir: boolean) => boolean {
		const contentLines = ignoreContents
			.split('\n')
			.map(line => line.trim())
			.filter(line => line && line[0] !== '#');

		// Pull out all the lines that end with `/`, those only apply to directories
		const fileLines = contentLines.filter(line => !line.endsWith('/'));

		const fileIgnoreLines = fileLines.filter(line => !line.includes('!'));
		const isFileIgnored = this.gitignoreLinesToExpression(fileIgnoreLines, dirPath, true);

		// TODO: Slight hack... this naive approach may reintroduce too many files in cases of weirdly complex .gitignores
		const fileIncludeLines = fileLines.filter(line => line.includes('!')).map(line => line.replace(/!/g, ''));
		const isFileIncluded = this.gitignoreLinesToExpression(fileIncludeLines, dirPath, false);

		// When checking if a dir is ignored we can use all lines
		const dirIgnoreLines = contentLines.filter(line => !line.includes('!'));
		const isDirIgnored = this.gitignoreLinesToExpression(dirIgnoreLines, dirPath, true);

		// Same hack.
		const dirIncludeLines = contentLines.filter(line => line.includes('!')).map(line => line.replace(/!/g, ''));
		const isDirIncluded = this.gitignoreLinesToExpression(dirIncludeLines, dirPath, false);

		const isPathIgnored = (path: string, isDir: boolean) => {
			if (!(this.ignoreCase ? startsWithIgnoreCase(path, dirPath) : path.startsWith(dirPath))) { return false; }
			if (isDir && isDirIgnored(path) && !isDirIncluded(path)) { return true; }
			if (isFileIgnored(path) && !isFileIncluded(path)) { return true; }

			if (parent) { return parent.isPathIgnored(path, isDir); }

			return false;
		};

		return isPathIgnored;
	}

	private gitignoreLineToGlob(line: string, dirPath: string): string {
		const firstSep = line.indexOf('/');
		if (firstSep === -1 || firstSep === line.length - 1) {
			line = '**/' + line;
		} else {
			if (firstSep === 0) {
				if (dirPath.slice(-1) === '/') {
					line = line.slice(1);
				}
			} else {
				if (dirPath.slice(-1) !== '/') {
					line = '/' + line;
				}
			}
			line = dirPath + line;
		}

		return line;
	}
}
