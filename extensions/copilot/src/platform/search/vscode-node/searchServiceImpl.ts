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
		if (!this._ignoreService.isRegexExclusionsEnabled || !results) {
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
		if (!this._ignoreService.isRegexExclusionsEnabled) {
			return results;
		} else {
			return await filterIngoredResources(this._ignoreService, results);
		}
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
