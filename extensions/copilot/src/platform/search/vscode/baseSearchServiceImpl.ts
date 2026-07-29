/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AbstractSearchService } from '../common/searchService';

export class BaseSearchServiceImpl extends AbstractSearchService {
	async findTextInFiles(query: vscode.TextSearchQuery, options: vscode.FindTextInFilesOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Promise<vscode.TextSearchComplete> {
		return await vscode.workspace.findTextInFiles(query, options, result => progress.report(result), token);
	}

	findTextInFiles2(query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse {
		return vscode.workspace.findTextInFiles2(query, options, token);
	}

	override findFiles(filePattern: vscode.GlobPattern | vscode.GlobPattern[], options?: vscode.FindFiles2Options | undefined, token?: vscode.CancellationToken | undefined): Thenable<vscode.Uri[]> {
		const filePatternToUse = Array.isArray(filePattern) ? filePattern : [filePattern];
		return vscode.workspace.findFiles2(filePatternToUse, options, token);
	}
}