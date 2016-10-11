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
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

/**
 * Language to formatting providers
 */
export interface FormattingPriorities {
	[language: string]: string | string[];
}

export namespace FormattingPriorities {

	const id = 'editor.formatter';

	export function value(service: IConfigurationService): FormattingPriorities {
		return service.lookup<FormattingPriorities>(id).value;
	}

	export function ordered<T extends { name?: string }>(registry: LanguageFeatureRegistry<T>, model: IReadOnlyModel, config: FormattingPriorities): T[] {

		const ordered = registry.ordered(model);
		if (ordered.length === 0) {
			return ordered;
		}

		const customOrder = config[model.getModeId()];
		if (!customOrder) {
			return ordered;
		}

		const customOrderMap: { [name: string]: number } = Object.create(null);
		if (typeof customOrder === 'string') {
			customOrderMap[customOrder] = 0;
		} else {
			customOrder.forEach((name, idx) => customOrderMap[name] = idx);
		}

		return ordered.map((provider, idx) => ({ provider, idx })).sort((a, b) => {
			// compare providers by configured order and fallback
			// to selector score order
			const customOrderA = customOrderMap[a.provider.name];
			const customOrderB = customOrderMap[b.provider.name];

			if (customOrderA === customOrderB) {
				if (a.idx < b.idx) {
					return -1;
				} else if (a.idx > b.idx) {
					return 1;
				} else {
					return 0;
				}
			} else if (typeof customOrderB !== 'number') {
				return -1;
			} else if (typeof customOrderA !== 'number') {
				return 1;
			} else if (customOrderA < customOrderB) {
				return -1;
			} else if (customOrderA > customOrderB) {
				return 1;
			} else {
				return 0;
			}
		}).map(({provider}) => provider);
	}
}

export function getDocumentRangeFormattingEdits(model: IReadOnlyModel, range: Range, options: FormattingOptions, priorities: FormattingPriorities = {}): TPromise<ISingleEditOperation[]> {

	const [support] = FormattingPriorities.ordered(DocumentRangeFormattingEditProviderRegistry, model, priorities);

	if (!support) {
		return TPromise.as(undefined);
	}

	return asWinJsPromise((token) => {
		return support.provideDocumentRangeFormattingEdits(model, range, options, token);
	});
}

export function getDocumentFormattingEdits(model: IReadOnlyModel, options: FormattingOptions, priorities: FormattingPriorities = {}): TPromise<ISingleEditOperation[]> {

	const [support] = FormattingPriorities.ordered(DocumentFormattingEditProviderRegistry, model, priorities);

	if (!support) {
		return getDocumentRangeFormattingEdits(model, model.getFullModelRange(), options, priorities);
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

	return getDocumentRangeFormattingEdits(model, Range.lift(range), options, FormattingPriorities.value(accessor.get(IConfigurationService)));
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


	return getDocumentFormattingEdits(model, options, FormattingPriorities.value(accessor.get(IConfigurationService)));
});

CommonEditorRegistry.registerDefaultLanguageCommand('_executeFormatOnTypeProvider', function (model, position, args) {
	const {ch, options } = args;
	if (typeof ch !== 'string') {
		throw illegalArgument('ch');
	}
	return getOnTypeFormattingEdits(model, position, ch, options);
});
