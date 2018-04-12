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
import { ITextModel } from 'vs/editor/common/model';
import { registerDefaultLanguageCommand, registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { DocumentFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry, OnTypeFormattingEditProviderRegistry, FormattingOptions, TextEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { asWinJsPromise, sequence } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export class NoProviderError extends Error {

	static readonly Name = 'NOPRO';

	constructor(message?: string) {
		super();
		this.name = NoProviderError.Name;
		this.message = message;
	}
}

export function getDocumentRangeFormattingEdits(model: ITextModel, range: Range, options: FormattingOptions): TPromise<TextEdit[], NoProviderError> {

	const providers = DocumentRangeFormattingEditProviderRegistry.ordered(model);

	if (providers.length === 0) {
		return TPromise.wrapError(new NoProviderError());
	}

	let result: TextEdit[];
	return sequence(providers.map(provider => {
		return () => {
			if (!isFalsyOrEmpty(result)) {
				return undefined;
			}
			return asWinJsPromise(token => provider.provideDocumentRangeFormattingEdits(model, range, options, token)).then(value => {
				result = value;
			}, onUnexpectedExternalError);
		};
	})).then(() => result);
}

export function getDocumentFormattingEdits(model: ITextModel, options: FormattingOptions): TPromise<TextEdit[]> {
	const providers = DocumentFormattingEditProviderRegistry.ordered(model);

	// try range formatters when no document formatter is registered
	if (providers.length === 0) {
		return getDocumentRangeFormattingEdits(model, model.getFullModelRange(), options);
	}

	let result: TextEdit[];
	return sequence(providers.map(provider => {
		return () => {
			if (!isFalsyOrEmpty(result)) {
				return undefined;
			}
			return asWinJsPromise(token => provider.provideDocumentFormattingEdits(model, options, token)).then(value => {
				result = value;
			}, onUnexpectedExternalError);
		};
	})).then(() => result);
}

export function getOnTypeFormattingEdits(model: ITextModel, position: Position, ch: string, options: FormattingOptions): TPromise<TextEdit[]> {
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

registerLanguageCommand('_executeFormatRangeProvider', function (accessor, args) {
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

registerLanguageCommand('_executeFormatDocumentProvider', function (accessor, args) {
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

registerDefaultLanguageCommand('_executeFormatOnTypeProvider', function (model, position, args) {
	const { ch, options } = args;
	if (typeof ch !== 'string') {
		throw illegalArgument('ch');
	}
	return getOnTypeFormattingEdits(model, position, ch, options);
});
