/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError, illegalArgument} from 'vs/base/common/errors';
import {IDisposable} from 'vs/base/common/lifecycle';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IRange} from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import {ISearchConfiguration} from 'vs/platform/search/common/search';
import glob = require('vs/base/common/glob');

/**
 * Interface used to navigate to types by value.
 */
export interface IWorkspaceSymbol {
	name: string;
	type: string;
	containerName: string;
	range: IRange;
	resource: URI;
}

export interface IWorkspaceSymbolProvider {
	provideWorkspaceSymbols(search: string): TPromise<IWorkspaceSymbol[]>;
	resolveWorkspaceSymbol?: (item: IWorkspaceSymbol) => TPromise<IWorkspaceSymbol>;
}

export namespace WorkspaceSymbolProviderRegistry {

	const _supports: IWorkspaceSymbolProvider[] = [];

	export function register(support: IWorkspaceSymbolProvider): IDisposable {

		if (support) {
			_supports.push(support);
		}

		return {
			dispose() {
				if (support) {
					let idx = _supports.indexOf(support);
					if (idx >= 0) {
						_supports.splice(idx, 1);
						support = undefined;
					}
				}
			}
		};
	}

	export function all(): IWorkspaceSymbolProvider[] {
		return _supports.slice(0);
	}
}

export function getWorkspaceSymbols(query: string): TPromise<[IWorkspaceSymbolProvider, IWorkspaceSymbol[]][]> {

	const result: [IWorkspaceSymbolProvider, IWorkspaceSymbol[]][] = [];

	const promises = WorkspaceSymbolProviderRegistry.all().map(support => {
		return support.provideWorkspaceSymbols(query).then(value => {
			if (Array.isArray(value)) {
				result.push([support, value]);
			}
		}, onUnexpectedError);
	});

	return TPromise.join(promises).then(_ => result);
}

CommonEditorRegistry.registerLanguageCommand('_executeWorkspaceSymbolProvider', function (accessor, args: { query: string; }) {
	let {query} = args;
	if (typeof query !== 'string') {
		throw illegalArgument();
	}
	return getWorkspaceSymbols(query);
});

export interface IWorkbenchSearchConfiguration extends ISearchConfiguration {
	search: {
		quickOpen: {
			includeSymbols: boolean;
		},
		exclude: glob.IExpression;
	};
}