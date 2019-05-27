/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from 'vs/editor/common/model';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { mergeSort } from 'vs/base/common/arrays';
import { Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { ProviderResult } from 'vs/editor/common/modes';
import { IRange } from 'vs/editor/common/core/range';

export interface ICodeInsetSymbol {
	id: string;
	range: IRange;
	height?: number;
}

export interface CodeInsetProvider {
	onDidChange?: Event<this>;
	provideCodeInsets(model: ITextModel, token: CancellationToken): ProviderResult<ICodeInsetSymbol[]>;
	resolveCodeInset(model: ITextModel, codeInset: ICodeInsetSymbol, token: CancellationToken): ProviderResult<ICodeInsetSymbol>;
}

export const CodeInsetProviderRegistry = new LanguageFeatureRegistry<CodeInsetProvider>();

export interface ICodeInsetData {
	symbol: ICodeInsetSymbol;
	provider: CodeInsetProvider;
	resolved?: boolean;
}

export function getCodeInsetData(model: ITextModel, token: CancellationToken): Promise<ICodeInsetData[]> {

	const symbols: ICodeInsetData[] = [];
	const providers = CodeInsetProviderRegistry.ordered(model);

	const promises = providers.map(provider =>
		Promise.resolve(provider.provideCodeInsets(model, token)).then(result => {
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
			} else if (providers.indexOf(a.provider) < providers.indexOf(b.provider)) {
				return -1;
			} else if (providers.indexOf(a.provider) > providers.indexOf(b.provider)) {
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
