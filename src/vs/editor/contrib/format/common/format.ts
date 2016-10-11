/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { illegalArgument } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { IReadOnlyModel, ISingleEditOperation } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import { DocumentFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry, OnTypeFormattingEditProviderRegistry, FormattingOptions } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';
import { IConfigurationService, getConfigurationValue } from 'vs/platform/configuration/common/configuration';

/**
 * Language to formatting providers
 */
export interface FormatterConfiguration {
	[language: string]: string;
}

export namespace FormattingPriorities {


	export function getDocumentFormatterConfiguration(service: IConfigurationService): FormatterConfiguration {
		return getConfigurationValue<FormatterConfiguration>(service.getConfiguration(), 'editor.formatter.document');
	}

	export function getDocumentRangeFormatterConfiguration(service: IConfigurationService): FormatterConfiguration {
		return getConfigurationValue<FormatterConfiguration>(service.getConfiguration(), 'editor.formatter.documentRange');
	}

	export function pick<T extends { name?: string }>(registry: LanguageFeatureRegistry<T>, model: IReadOnlyModel, config: FormatterConfiguration): T {

		const ordered = registry.ordered(model);
		const customConfig = config[model.getModeId()];

		if (customConfig) {
			for (const provider of ordered) {
				if (provider.name === customConfig) {
					return provider;
				}
			}
		} else {
			return ordered[0];
		}
	}
}

export function getDocumentRangeFormattingEdits(model: IReadOnlyModel, range: Range, options: FormattingOptions, priorities: FormatterConfiguration = {}): TPromise<ISingleEditOperation[]> {

	const support = FormattingPriorities.pick(DocumentRangeFormattingEditProviderRegistry, model, priorities);
	if (!support) {
		return TPromise.as(undefined);
	}

	return asWinJsPromise((token) => {
		return support.provideDocumentRangeFormattingEdits(model, range, options, token);
	});
}

export function getDocumentFormattingEdits(model: IReadOnlyModel, options: FormattingOptions, priorities: FormatterConfiguration = {}): TPromise<ISingleEditOperation[]> {

	const support = FormattingPriorities.pick(DocumentFormattingEditProviderRegistry, model, priorities);
	if (!support) {
		return TPromise.as(undefined);
	}

	return asWinJsPromise((token) => {
		return support.provideDocumentFormattingEdits(model, options, token);
	});
}

export function getOnTypeFormattingEdits(model: IReadOnlyModel, position: Position, ch: string, options: FormattingOptions): TPromise<ISingleEditOperation[]> {
	const [support] = OnTypeFormattingEditProviderRegistry.ordered(model);
	if (!support) {
		return TPromise.as(undefined);
	}
	if (support.autoFormatTriggerCharacters.indexOf(ch) < 0) {
		return TPromise.as(undefined);
	}

	return asWinJsPromise((token) => {
		return support.provideOnTypeFormattingEdits(model, position, ch, options, token);
	});
}

CommonEditorRegistry.registerLanguageCommand('_executeFormatRangeProvider', function (accessor, args) {
	const {resource, range, options} = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}

	return getDocumentRangeFormattingEdits(model, Range.lift(range), options, FormattingPriorities.getDocumentRangeFormatterConfiguration(accessor.get(IConfigurationService)));
});

CommonEditorRegistry.registerLanguageCommand('_executeFormatDocumentProvider', function (accessor, args) {
	const {resource, options} = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}


	return getDocumentFormattingEdits(model, options, FormattingPriorities.getDocumentFormatterConfiguration(accessor.get(IConfigurationService)));
});

CommonEditorRegistry.registerDefaultLanguageCommand('_executeFormatOnTypeProvider', function (model, position, args) {
	const {ch, options } = args;
	if (typeof ch !== 'string') {
		throw illegalArgument('ch');
	}
	return getOnTypeFormattingEdits(model, position, ch, options);
});
