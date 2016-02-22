/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {illegalArgument} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import {IModel, IPosition, IRange, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IFormattingOptions, IFormattingSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {IModelService} from 'vs/editor/common/services/modelService';

export const FormatRegistry = new LanguageFeatureRegistry<IFormattingSupport>('formattingSupport');
export const FormatOnTypeRegistry = new LanguageFeatureRegistry<IFormattingSupport>('formattingSupport');

export {IFormattingSupport};

export function formatRange(model: IModel, range: IRange, options: IFormattingOptions): TPromise<ISingleEditOperation[]> {
	const [support] = FormatRegistry.ordered(model)
		.filter(s => typeof s.formatRange === 'function');

	if (!support) {
		return TPromise.as(undefined);
	}
	return support.formatRange(model.getAssociatedResource(), range, options);
}

export function formatDocument(model: IModel, options: IFormattingOptions): TPromise<ISingleEditOperation[]> {
	const [support] = FormatRegistry.ordered(model);
	if (!support) {
		return TPromise.as(undefined);
	}
	if (typeof support.formatDocument !== 'function') {
		if (typeof support.formatRange === 'function') {
			return formatRange(model, model.getFullModelRange(), options);
		} else {
			return TPromise.as(undefined);
		}
	}

	return support.formatDocument(model.getAssociatedResource(), options);
}

export function formatAfterKeystroke(model: IModel, position: IPosition, ch: string, options: IFormattingOptions): TPromise<ISingleEditOperation[]> {
	const [support] = FormatOnTypeRegistry.ordered(model);
	if (!support) {
		return TPromise.as(undefined);
	}
	if (support.autoFormatTriggerCharacters.indexOf(ch) < 0) {
		return TPromise.as(undefined);
	}
	return support.formatAfterKeystroke(model.getAssociatedResource(), position, ch, options);
}

CommonEditorRegistry.registerLanguageCommand('_executeFormatRangeProvider', function(accessor, args) {
	const {resource, range, options} = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}
	return formatRange(model, range, options);
});

CommonEditorRegistry.registerLanguageCommand('_executeFormatDocumentProvider', function(accessor, args) {
	const {resource, options} = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}

	return formatDocument(model, options);
});

CommonEditorRegistry.registerDefaultLanguageCommand('_executeFormatOnTypeProvider', function(model, position, args) {
	const {ch, options } = args;
	if (typeof ch !== 'string') {
		throw illegalArgument('ch');
	}
	return formatAfterKeystroke(model, position, ch, options);
});
