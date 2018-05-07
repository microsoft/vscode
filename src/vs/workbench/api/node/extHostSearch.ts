/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { asWinJsPromise } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IPatternInfo } from 'vs/platform/search/common/search';
import * as vscode from 'vscode';
import { ExtHostSearchShape, IMainContext, MainContext, MainThreadSearchShape } from './extHost.protocol';

export class ExtHostSearch implements ExtHostSearchShape {

	private readonly _proxy: MainThreadSearchShape;
	private readonly _searchProvider = new Map<number, vscode.SearchProvider>();
	private _handlePool: number = 0;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSearch);
	}

	registerSearchProvider(scheme: string, provider: vscode.SearchProvider) {
		const handle = this._handlePool++;
		this._searchProvider.set(handle, provider);
		this._proxy.$registerSearchProvider(handle, scheme);
		return {
			dispose: () => {
				this._searchProvider.delete(handle);
				this._proxy.$unregisterProvider(handle);
			}
		};
	}

	$provideFileSearchResults(handle: number, session: number, query: string): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideFileSearchResults) {
			return TPromise.as(undefined);
		}
		const progress = {
			report: (uri) => {
				this._proxy.$handleFindMatch(handle, session, uri);
			}
		};
		return asWinJsPromise(token => provider.provideFileSearchResults(query, progress, token));
	}

	$provideTextSearchResults(handle: number, session: number, pattern: IPatternInfo, options: { includes: string[], excludes: string[] }): TPromise<void> {
		const provider = this._searchProvider.get(handle);
		if (!provider.provideTextSearchResults) {
			return TPromise.as(undefined);
		}
		const progress = {
			report: (data: vscode.TextSearchResult) => {
				this._proxy.$handleFindMatch(handle, session, [data.uri, {
					lineNumber: data.range.start.line,
					preview: data.preview.leading + data.preview.matching + data.preview.trailing,
					offsetAndLengths: [[data.preview.leading.length, data.preview.matching.length]]
				}]);
			}
		};
		return asWinJsPromise(token => provider.provideTextSearchResults(pattern, options, progress, token));
	}
}
