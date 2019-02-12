/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { registerDefaultLanguageCommand, registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { DocumentFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry, OnTypeFormattingEditProviderRegistry, FormattingOptions, TextEdit } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { first } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';
import { CancellationToken } from 'vs/base/common/cancellation';

export class NoProviderError extends Error {

	static is(thing: any): thing is NoProviderError {
		return thing instanceof Error && thing.name === NoProviderError._name;
	}

	private static readonly _name = 'NOPRO';

	constructor(message?: string) {
		super();
		this.name = NoProviderError._name;
		if (message) {
			this.message = message;
		}
	}
}

export function getDocumentRangeFormattingEdits(model: ITextModel, range: Range, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[] | undefined | null> {

	const providers = DocumentRangeFormattingEditProviderRegistry.ordered(model);

	if (providers.length === 0) {
		return Promise.reject(new NoProviderError());
	}

	return first(providers.map(provider => () => {
		return Promise.resolve(provider.provideDocumentRangeFormattingEdits(model, range, options, token))
			.then(undefined, onUnexpectedExternalError);
	}), isNonEmptyArray);
}

export function getDocumentFormattingEdits(model: ITextModel, options: FormattingOptions, token: CancellationToken): Promise<TextEdit[] | null | undefined> {
	const providers = DocumentFormattingEditProviderRegistry.ordered(model);

	// try range formatters when no document formatter is registered
	if (providers.length === 0) {
		return getDocumentRangeFormattingEdits(model, model.getFullModelRange(), options, token);
	}

	return first(providers.map(provider => () => {
		return Promise.resolve(provider.provideDocumentFormattingEdits(model, options, token))
			.then(undefined, onUnexpectedExternalError);
	}), isNonEmptyArray);
}

export function getOnTypeFormattingEdits(model: ITextModel, position: Position, ch: string, options: FormattingOptions): Promise<TextEdit[] | null | undefined> {
	const [support] = OnTypeFormattingEditProviderRegistry.ordered(model);
	if (!support) {
		return Promise.resolve(undefined);
	}
	if (support.autoFormatTriggerCharacters.indexOf(ch) < 0) {
		return Promise.resolve(undefined);
	}

	return Promise.resolve(support.provideOnTypeFormattingEdits(model, position, ch, options, CancellationToken.None)).then(r => r, onUnexpectedExternalError);
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
	return getDocumentRangeFormattingEdits(model, Range.lift(range), options, CancellationToken.None);
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

	return getDocumentFormattingEdits(model, options, CancellationToken.None);
});

registerDefaultLanguageCommand('_executeFormatOnTypeProvider', function (model, position, args) {
	const { ch, options } = args;
	if (typeof ch !== 'string') {
		throw illegalArgument('ch');
	}
	return getOnTypeFormattingEdits(model, position, ch, options);
});
