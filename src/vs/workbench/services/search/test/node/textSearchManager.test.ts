/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ITextQuery, QueryType } from 'vs/platform/search/common/search';
import { TextSearchManager } from 'vs/workbench/services/search/node/textSearchManager';
import * as vscode from 'vscode';

suite('TextSearchManager', () => {
	test('fixes encoding', async () => {
		let correctEncoding = false;
		const provider: vscode.TextSearchProvider = {
			provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextSearchComplete> {
				correctEncoding = options.encoding === 'windows-1252';

				return null;
			}
		};

		const query: ITextQuery = {
			type: QueryType.Text,
			contentPattern: {
				pattern: 'a'
			},
			folderQueries: [{
				folder: URI.file('/some/folder'),
				fileEncoding: 'windows1252'
			}]
		};

		const m = new TextSearchManager(query, provider);
		await m.search(() => { }, new CancellationTokenSource().token);

		assert.ok(correctEncoding);
	});
});
