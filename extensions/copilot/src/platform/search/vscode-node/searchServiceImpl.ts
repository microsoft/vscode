/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { combineGlob } from '../../../util/common/glob';
import { filterIngoredResources, IIgnoreService } from '../../ignore/common/ignoreService';
import { LogExecTime } from '../../log/common/logExecTime';
import { ILogService } from '../../log/common/logService';
import { BaseSearchServiceImpl } from '../vscode/baseSearchServiceImpl';

export class SearchServiceImpl extends BaseSearchServiceImpl {

	constructor(
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	override async findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: 1, token: vscode.CancellationToken): Promise<vscode.Uri | undefined>;
	override async findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: number | undefined, token: vscode.CancellationToken): Promise<vscode.Uri[]>;
	override async findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: 1 | number | undefined, token: vscode.CancellationToken): Promise<vscode.Uri | vscode.Uri[] | undefined> {
		const copilotIgnoreExclude = await this._ignoreService.asMinimatchPattern();
		const results = await this._findFilesWithDefaultExcludesAndExcludes(include, copilotIgnoreExclude, maxResults, token);
		if (!results) {
			return results;
		} else if (Array.isArray(results)) {
			return await filterIngoredResources(this._ignoreService, results);
		} else {
			return await this._ignoreService.isCopilotIgnored(results) ? undefined : results;
		}
	}

	@LogExecTime(self => self._logService, 'SearchServiceImpl::findFiles')
	override async findFiles(filePattern: vscode.GlobPattern | vscode.GlobPattern[], options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Promise<vscode.Uri[]> {
		const copilotIgnoreExclude = await this._ignoreService.asMinimatchPattern();
		if (options?.exclude) {
			options = { ...options, exclude: copilotIgnoreExclude ? options.exclude.map(e => combineGlob(e, copilotIgnoreExclude)) : options.exclude };
		} else {
			options = { ...options, exclude: copilotIgnoreExclude ? [copilotIgnoreExclude] : options?.exclude };
		}
		const results = await super.findFiles(filePattern, options, token);
		return await filterIngoredResources(this._ignoreService, results);
	}

	override findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
		// The search cannot start until the exclusion pattern is known, so it is kicked off as a
		// promise and both members of the response are derived from that one search.
		return excludeIgnoredTextSearchResults(this._ignoreService, (async () => {
			const copilotIgnoreExclude = await this._ignoreService.asMinimatchPattern();
			// Exclude patterns are combined with a logical AND, so appending an entry only narrows
			// the results. No need to merge into existing entries as `findFiles` does.
			const exclude = copilotIgnoreExclude ? [...options?.exclude ?? [], copilotIgnoreExclude] : options?.exclude;
			return super.findTextInFiles2(query, { ...options, exclude }, token);
		})());
	}

	override async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
		const jobs: Promise<void>[] = [];
		const ignoreSupportedProgress: vscode.Progress<vscode.TextSearchResult> = {
			report: async (value) => {
				jobs.push((async () => {
					if (await this._ignoreService.isCopilotIgnored(value.uri)) {
						return;
					} else {
						progress.report(value);
					}
				})());
			}
		};
		const result = await super.findTextInFiles(query, options, ignoreSupportedProgress, token);
		await Promise.all(jobs);
		return result;
	}
}

/**
 * Filters content excluded files out of a streamed text search response.
 * Results carry matching lines, and content rules are not expressible as a glob, so each hit is checked.
 */
export function excludeIgnoredTextSearchResults(ignoreService: IIgnoreService, search: Promise<vscode.FindTextInFilesResponse>): vscode.FindTextInFilesResponse {
	const complete = search.then(response => response.complete);
	// A caller that abandons the iteration may never await `complete`, so make sure a failed search
	// is not reported as an unhandled rejection. Anyone who does await it still observes the error.
	complete.catch(() => { });

	return {
		results: (async function* () {
			const response = await search;
			for await (const result of response.results) {
				if (!await ignoreService.isCopilotIgnored(result.uri)) {
					yield result;
				}
			}
		})(),
		complete
	};
}
