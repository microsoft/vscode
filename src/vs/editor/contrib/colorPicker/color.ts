/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import URI from 'vs/base/common/uri';

import { TPromise } from 'vs/base/common/winjs.base';
import { ColorProviderRegistry, DocumentColorProvider, IColorInformation, IColorPresentation } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { ITextModel } from 'vs/editor/common/model';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Range, IRange } from 'vs/editor/common/core/range';
import { illegalArgument } from 'vs/base/common/errors';
import { IModelService } from 'vs/editor/common/services/modelService';


export interface IColorData {
	colorInfo: IColorInformation;
	provider: DocumentColorProvider;
}

export function getColors(model: ITextModel): TPromise<IColorData[]> {
	const colors: IColorData[] = [];
	const providers = ColorProviderRegistry.ordered(model).reverse();
	const promises = providers.map(provider => asWinJsPromise(token => provider.provideDocumentColors(model, token)).then(result => {
		if (Array.isArray(result)) {
			for (let colorInfo of result) {
				colors.push({ colorInfo, provider });
			}
		}
	}));

	return TPromise.join(promises).then(() => colors);
}

export function getColorPresentations(model: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): TPromise<IColorPresentation[]> {
	return asWinJsPromise(token => provider.provideColorPresentations(model, colorInfo, token));
}

registerLanguageCommand('_executeDocumentColorProvider', function (accessor, args) {

	const { resource } = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	const rawCIs: { range: IRange, color: [number, number, number, number] }[] = [];
	const providers = ColorProviderRegistry.ordered(model).reverse();
	const promises = providers.map(provider => asWinJsPromise(token => provider.provideDocumentColors(model, token)).then(result => {
		if (Array.isArray(result)) {
			for (let ci of result) {
				rawCIs.push({ range: ci.range, color: [ci.color.red, ci.color.green, ci.color.blue, ci.color.alpha] });
			}
		}
	}));

	return TPromise.join(promises).then(() => rawCIs);
});


registerLanguageCommand('_executeColorPresentationProvider', function (accessor, args) {

	const { resource, color, range } = args;
	if (!(resource instanceof URI) || !Array.isArray(color) || color.length !== 4 || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const [red, green, blue, alpha] = color;

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	const colorInfo = {
		range,
		color: { red, green, blue, alpha }
	};

	const presentations: IColorPresentation[] = [];
	const providers = ColorProviderRegistry.ordered(model).reverse();
	const promises = providers.map(provider => asWinJsPromise(token => provider.provideColorPresentations(model, colorInfo, token)).then(result => {
		if (Array.isArray(result)) {
			presentations.push(...result);
		}
	}));
	return TPromise.join(promises).then(() => presentations);
});
