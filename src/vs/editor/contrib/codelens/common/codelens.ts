/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {illegalArgument, isPromiseCanceledError, onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {CodeLensProviderRegistry, CodeLensProvider, ICodeLensSymbol} from 'vs/editor/common/modes';
import {IModelService} from 'vs/editor/common/services/modelService';
import {asWinJsPromise} from 'vs/base/common/async';

export interface ICodeLensData {
	symbol: ICodeLensSymbol;
	support: CodeLensProvider;
}

export function getCodeLensData(model: IModel): TPromise<ICodeLensData[]> {

	const symbols: ICodeLensData[] = [];
	const promises = CodeLensProviderRegistry.all(model).map(support => {
		return asWinJsPromise((token) => {
			return support.provideCodeLenses(model, token);
		}).then(result => {
			if (!Array.isArray(result)) {
				return;
			}
			for (let symbol of result) {
				symbols.push({ symbol, support });
			}
		}, err => {
			if (!isPromiseCanceledError(err)) {
				onUnexpectedError(err);
			}
		});
	});

	return TPromise.join(promises).then(() => symbols);
}

CommonEditorRegistry.registerLanguageCommand('_executeCodeLensProvider', function(accessor, args) {

	const {resource} = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	return getCodeLensData(model);
});
