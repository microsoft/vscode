/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { mergeSort } from 'vs/base/common/arrays';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { CodeLensProviderRegistry, CodeLensProvider, ICodeLensSymbol } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CancellationToken } from 'vs/base/common/cancellation';

export interface ICodeLensData {
	symbol: ICodeLensSymbol;
	provider: CodeLensProvider;
}

export function getCodeLensData(model: ITextModel, token: CancellationToken): Promise<ICodeLensData[]> {

	const symbols: ICodeLensData[] = [];
	const provider = CodeLensProviderRegistry.ordered(model);

	const promises = provider.map(provider => Promise.resolve(provider.provideCodeLenses(model, token)).then(result => {
		if (Array.isArray(result)) {
			for (let symbol of result) {
				symbols.push({ symbol, provider });
			}
		}
	}).catch(onUnexpectedExternalError));

	return Promise.all(promises).then(() => {

		return mergeSort(symbols, (a, b) => {
			// sort by lineNumber, provider-rank, and column
			if (a.symbol.range.startLineNumber < b.symbol.range.startLineNumber) {
				return -1;
			} else if (a.symbol.range.startLineNumber > b.symbol.range.startLineNumber) {
				return 1;
			} else if (provider.indexOf(a.provider) < provider.indexOf(b.provider)) {
				return -1;
			} else if (provider.indexOf(a.provider) > provider.indexOf(b.provider)) {
				return 1;
			} else if (a.symbol.range.startColumn < b.symbol.range.startColumn) {
				return -1;
			} else if (a.symbol.range.startColumn > b.symbol.range.startColumn) {
				return 1;
			} else {
				return 0;
			}
		});
	});
}

registerLanguageCommand('_executeCodeLensProvider', function (accessor, args) {

	let { resource, itemResolveCount } = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	const result: ICodeLensSymbol[] = [];
	return getCodeLensData(model, CancellationToken.None).then(value => {

		let resolve: Thenable<any>[] = [];

		for (const item of value) {
			if (typeof itemResolveCount === 'undefined' || Boolean(item.symbol.command)) {
				result.push(item.symbol);
			} else if (itemResolveCount-- > 0) {
				resolve.push(Promise.resolve(item.provider.resolveCodeLens(model, item.symbol, CancellationToken.None)).then(symbol => result.push(symbol)));
			}
		}

		return Promise.all(resolve);

	}).then(() => {
		return result;
	});
});
