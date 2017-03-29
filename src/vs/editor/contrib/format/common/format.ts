/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { DocumentFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry, OnTypeFormattingEditProviderRegistry, FormattingOptions, TextEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { asWinJsPromise, sequence } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export function getDocumentRangeFormattingEdits(model: IReadOnlyModel, range: Range, options: FormattingOptions): TPromise<TextEdit[]> {

	const providers = DocumentRangeFormattingEditProviderRegistry.ordered(model);

	if (providers.length === 0) {
		return TPromise.as(undefined);
	}

	let result: TextEdit[];
	return sequence(providers.map(provider => {
		if (isFalsyOrEmpty(result)) {
			return () => {
				return asWinJsPromise(token => provider.provideDocumentRangeFormattingEdits(model, range, options, token)).then(value => {
					result = value;
				}, onUnexpectedExternalError);
			};
		}
		return undefined;
	})).then(() => result);
}

export function getDocumentFormattingEdits(model: IReadOnlyModel, options: FormattingOptions): TPromise<TextEdit[]> {
	const providers = DocumentFormattingEditProviderRegistry.ordered(model);

	// try range formatters when no document formatter is registered
	if (providers.length === 0) {
		return getDocumentRangeFormattingEdits(model, model.getFullModelRange(), options);
	}

	let result: TextEdit[];
	return sequence(providers.map(provider => {
		if (isFalsyOrEmpty(result)) {
			return () => {
				return asWinJsPromise(token => provider.provideDocumentFormattingEdits(model, options, token)).then(value => {
					result = value;
				}, onUnexpectedExternalError);
			};
		}
		return undefined;
	})).then(() => result);
}

export function getOnTypeFormattingEdits(model: IReadOnlyModel, position: Position, ch: string, options: FormattingOptions): TPromise<TextEdit[]> {
	const [support] = OnTypeFormattingEditProviderRegistry.ordered(model);
	if (!support) {
		return TPromise.as(undefined);
	}
	if (support.autoFormatTriggerCharacters.indexOf(ch) < 0) {
		return TPromise.as(undefined);
	}

	return asWinJsPromise((token) => {
		return support.provideOnTypeFormattingEdits(model, position, ch, options, token);
	}).then(r => r, onUnexpectedExternalError);
}

CommonEditorRegistry.registerLanguageCommand('_executeFormatRangeProvider', function (accessor, args) {
	const { resource, range, options } = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}
	return getDocumentRangeFormattingEdits(model, Range.lift(range), options);
});

CommonEditorRegistry.registerLanguageCommand('_executeFormatDocumentProvider', function (accessor, args) {
	const { resource, options } = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}

	return getDocumentFormattingEdits(model, options);
});

CommonEditorRegistry.registerDefaultLanguageCommand('_executeFormatOnTypeProvider', function (model, position, args) {
	const { ch, options } = args;
	if (typeof ch !== 'string') {
		throw illegalArgument('ch');
	}
	return getOnTypeFormattingEdits(model, position, ch, options);
});
