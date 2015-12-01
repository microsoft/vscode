/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IFormattingSupport, IFormattingOptions} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {onUnexpectedError, illegalArgument} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {IAction, Action} from 'vs/base/common/actions';
import {IModelService} from 'vs/editor/common/services/modelService';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IRange, IPosition, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';

export const FormatRegistry = new LanguageFeatureRegistry<IFormattingSupport>('formattingSupport');
export const FormatOnTypeRegistry = new LanguageFeatureRegistry<IFormattingSupport>('formattingSupport');

export {IFormattingSupport};

export function formatRange(model: IModel, range: IRange, options: IFormattingOptions): TPromise<ISingleEditOperation[]> {
	const support = FormatRegistry.ordered(model)[0];
	if (!support) {
		return;
	}
	return support.formatRange(model.getAssociatedResource(), range, options);
}

export function formatDocument(model: IModel, options: IFormattingOptions): TPromise<ISingleEditOperation[]> {
	const support = FormatRegistry.ordered(model)[0];
	if (!support) {
		return;
	}
	if (typeof support.formatDocument !== 'function') {
		if (typeof support.formatRange === 'function') {
			return formatRange(model, model.getFullModelRange(), options);
		} else {
			return;
		}
	}

	return support.formatDocument(model.getAssociatedResource(), options);
}

CommonEditorRegistry.registerLanguageCommand('_executeFormatRangeProvider', function(accessor, args) {
	const {resource, range, options} = args;
	if (!URI.isURI(resource) || !Range.isIRange(range)) {
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
	if (!URI.isURI(resource)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}

	return formatDocument(model, options)
});