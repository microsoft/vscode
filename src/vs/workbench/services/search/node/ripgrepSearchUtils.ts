/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { IExcludeException } from '../../../../base/common/glob.js';
import { isAbsolute } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { rtrim, startsWithIgnoreCase } from '../../../../base/common/strings.js';
import { SearchRange } from '../common/search.js';
import * as searchExtTypes from '../common/searchExtTypes.js';

export type Maybe<T> = T | null | undefined;

export function anchorGlob(glob: string): string {
	return glob.startsWith('**') || glob.startsWith('/') ? glob : `/${glob}`;
}

/**
 * An additional ripgrep run for `!`-prefixed exclude exceptions. ripgrep does not descend
 * into excluded folders, so paths that an exception re-includes are searched separately.
 */
export interface IExcludeExceptionRun {

	/**
	 * The path to search, relative to the searched folder, or an empty string for the whole folder.
	 */
	readonly root: string;

	/**
	 * Globs, relative to the searched folder, that match the re-included paths.
	 */
	readonly globs: readonly string[];
}

/**
 * Groups exclude exceptions into ripgrep runs rooted at their literal prefix, merging runs whose roots are nested.
 */
export function getExcludeExceptionRuns(exceptions: readonly IExcludeException[], folder: string): IExcludeExceptionRun[] {
	const runs: { root: string; globs: string[] }[] = [];
	const relativeExceptions = exceptions
		.map(exception => toFolderRelativeException(exception, folder))
		.filter((exception): exception is IExcludeException => !!exception)
		.sort((a, b) => a.literalPrefix.length - b.literalPrefix.length);

	for (const exception of relativeExceptions) {
		const globs = [exception.pattern, `${exception.pattern}/**`];
		const run = runs.find(run => !run.root || exception.literalPrefix === run.root || exception.literalPrefix.startsWith(`${run.root}/`));
		if (run) {
			run.globs.push(...globs);
		} else {
			runs.push({ root: exception.literalPrefix, globs });
		}
	}

	return runs;
}

function toFolderRelativeException(exception: IExcludeException, folder: string): IExcludeException | undefined {
	if (!isAbsolute(exception.pattern)) {
		return exception;
	}

	const folderPath = rtrim(folder.replace(/\\/g, '/'), '/');
	const prefix = exception.literalPrefix.replace(/\\/g, '/');
	const isInFolder = isLinux ? prefix.startsWith(`${folderPath}/`) : startsWithIgnoreCase(prefix, `${folderPath}/`);
	if (!isInFolder) {
		return undefined;
	}

	return {
		pattern: exception.pattern.replace(/\\/g, '/').substring(folderPath.length + 1),
		literalPrefix: prefix.substring(folderPath.length + 1)
	};
}

export function rangeToSearchRange(range: searchExtTypes.Range): SearchRange {
	return new SearchRange(range.start.line, range.start.character, range.end.line, range.end.character);
}

export function searchRangeToRange(range: SearchRange): searchExtTypes.Range {
	return new searchExtTypes.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}

/**
 * The number of symbolic link loops a single ripgrep run may report before we stop following
 * symbolic links. ripgrep only detects links that point back to an ancestor, so a tree of
 * cross-linked symbolic links (e.g. a fake sysfs) makes it enumerate exponentially many paths
 * and the search effectively never finishes. Regular workspaces report about one loop per
 * self-referencing link.
 */
export const MAX_RIPGREP_SYMLINK_LOOPS = 1000;

/**
 * Counts the symbolic link loops that ripgrep reports on stderr while following symbolic links.
 */
export class RipgrepSymlinkLoopDetector {
	private loopCount = 0;
	private partialLine = '';

	/**
	 * @returns whether ripgrep has reported more than {@link MAX_RIPGREP_SYMLINK_LOOPS} loops
	 */
	handleStderr(data: string): boolean {
		const lines = (this.partialLine + data).split('\n');
		this.partialLine = lines.pop() ?? '';
		for (const line of lines) {
			if (line.includes('File system loop found')) {
				this.loopCount++;
			}
		}

		return this.loopCount > MAX_RIPGREP_SYMLINK_LOOPS;
	}
}

export interface IOutputChannel {
	appendLine(msg: string): void;
}

export class OutputChannel implements IOutputChannel {
	constructor(private prefix: string, @ILogService private readonly logService: ILogService) { }

	appendLine(msg: string): void {
		this.logService.debug(`${this.prefix}#search`, msg);
	}
}
