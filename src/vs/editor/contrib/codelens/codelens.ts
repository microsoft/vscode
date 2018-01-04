/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { mergeSort } from 'vs/base/common/arrays';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITextModel } from 'vs/editor/common/model';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { CodeLensProviderRegistry, CodeLensProvider, ICodeLensSymbol } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { asWinJsPromise } from 'vs/base/common/async';

export interface ICodeLensData {
	symbol: ICodeLensSymbol;
	provider: CodeLensProvider;
}

export function getCodeLensData(model: ITextModel): TPromise<ICodeLensData[]> {

	const symbols: ICodeLensData[] = [];
	const provider = CodeLensProviderRegistry.ordered(model);

	const promises = provider.map(provider => asWinJsPromise(token => provider.provideCodeLenses(model, token)).then(result => {
		if (Array.isArray(result)) {
			for (let symbol of result) {
				symbols.push({ symbol, provider });
			}
		}
	}, onUnexpectedExternalError));

	return TPromise.join(promises).then(() => {

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

	const { resource } = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	return getCodeLensData(model).then(value => value.map(item => item.symbol));
});
