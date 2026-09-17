/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { ExcludeSettingOptions } from '../../../vscodeTypes';

export const ISearchService = createServiceIdentifier<ISearchService>('ISearchService');

export interface ISearchService {
	readonly _serviceBrand: undefined;
	findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: 1, token: vscode.CancellationToken): Promise<vscode.Uri | undefined>;
	findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: number | undefined, token: vscode.CancellationToken): Promise<vscode.Uri[]>;
	findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete>;
	findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse;
	findFiles(filePattern: vscode.GlobPattern | vscode.GlobPattern[], options?: vscode.FindFiles2Options, token?: vscode.CancellationToken): Thenable<vscode.Uri[]>;
	findFilesWithExcludes(include: vscode.GlobPattern, exclude: vscode.GlobPattern, maxResults: 1, token: vscode.CancellationToken): Promise<vscode.Uri | undefined>;
}

export abstract class AbstractSearchService implements ISearchService {

	declare _serviceBrand: undefined;

	async findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: 1, token: vscode.CancellationToken): Promise<vscode.Uri | undefined>;
	async findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: number | undefined, token: vscode.CancellationToken): Promise<vscode.Uri[]>;
	async findFilesWithDefaultExcludes(include: vscode.GlobPattern, maxResults: number | undefined, token: vscode.CancellationToken): Promise<vscode.Uri[] | vscode.Uri | undefined> {
		return this._findFilesWithDefaultExcludesAndExcludes(include, undefined, maxResults, token);
	}
	async findFilesWithExcludes(include: vscode.GlobPattern, exclude: vscode.GlobPattern, maxResults: 1, token: vscode.CancellationToken): Promise<vscode.Uri | undefined>;
	async findFilesWithExcludes(include: vscode.GlobPattern, exclude: vscode.GlobPattern, maxResults: number | undefined, token: vscode.CancellationToken): Promise<vscode.Uri[] | vscode.Uri | undefined> {
		return this._findFilesWithDefaultExcludesAndExcludes(include, exclude, maxResults, token);
	}

	protected async _findFilesWithDefaultExcludesAndExcludes(include: vscode.GlobPattern, exclude: vscode.GlobPattern | undefined, maxResults: number | undefined, token: vscode.CancellationToken): Promise<vscode.Uri[] | vscode.Uri | undefined> {

		const options: vscode.FindFiles2Options = {
			maxResults,
			exclude: exclude ? [exclude] : undefined,
			useExcludeSettings: ExcludeSettingOptions.SearchAndFilesExclude,
		};

		const results = await this.findFiles(include, options, token);

		if (maxResults === 1) {
			return results[0];
		} else {
			return results;
		}
	}

	abstract findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete>;
	abstract findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse;
	abstract findFiles(filePattern: vscode.GlobPattern | vscode.GlobPattern[], options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Thenable<vscode.Uri[]>;
}
