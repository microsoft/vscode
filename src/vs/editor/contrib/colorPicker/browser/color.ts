/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentColorProvider, IColorInformation, IColorPresentation } from 'vs/editor/common/languages';
import { IModelService } from 'vs/editor/common/services/model';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { DefaultDocumentColorProvider } from 'vs/editor/contrib/colorPicker/browser/defaultDocumentColorProvider';


export interface IColorData {
	colorInfo: IColorInformation;
	provider: DocumentColorProvider;
}

enum Source {
	InBuiltCode,
	Extension
}

async function _findDocumentColors(source: Source, registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken) {
	const colors: any[] = [];
	let validDocumentColorProviderFound = false;
	const orderedDocumentColorProviderRegistry = registry.ordered(model).reverse();
	const providers = orderedDocumentColorProviderRegistry.filter(provider => !(provider instanceof DefaultDocumentColorProvider));
	const promises = providers.map(provider => Promise.resolve(provider.provideDocumentColors(model, token)).then(result => {
		if (Array.isArray(result)) {
			validDocumentColorProviderFound = true;
			for (const colorInfo of result) {
				if (source === Source.InBuiltCode) {
					colors.push({ colorInfo, provider });
				} else {
					colors.push({ range: colorInfo.range, color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha] });
				}
			}
		}
	}).catch((e) => {
		onUnexpectedExternalError(e);
	}));

	await Promise.all(promises);
	if (validDocumentColorProviderFound) {
		return { colorData: colors, usingDefaultDocumentColorProvider: false };
	} else {
		const defaultDocumentColorProvider = orderedDocumentColorProviderRegistry.find(provider => provider instanceof DefaultDocumentColorProvider);
		if (!defaultDocumentColorProvider) {
			return Promise.resolve({ colorData: [], usingDefaultDocumentColorProvider: false });
		} else {
			const promise = Promise.resolve(defaultDocumentColorProvider.provideDocumentColors(model, token)).then(result => {
				if (Array.isArray(result)) {
					for (const colorInfo of result) {
						if (source === Source.InBuiltCode) {
							colors.push({ colorInfo, provider: defaultDocumentColorProvider });
						} else {
							colors.push({ range: colorInfo.range, color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha] });
						}
					}
				}
			});
			return promise.then(() => { return { colorData: colors, usingDefaultDocumentColorProvider: true }; });
		}
	}
}

export async function getColors(registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken): Promise<{ colorData: IColorData[]; usingDefaultDocumentColorProvider: boolean }> {
	return _findDocumentColors(Source.InBuiltCode, registry, model, token);
}

export function getColorPresentations(model: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider, token: CancellationToken): Promise<IColorPresentation[] | null | undefined> {
	return Promise.resolve(provider.provideColorPresentations(model, colorInfo, token));
}

CommandsRegistry.registerCommand('_executeDocumentColorProvider', function (accessor, ...args) {

	const [resource] = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}
	const { colorProvider: colorProviderRegistry } = accessor.get(ILanguageFeaturesService);
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	return _findDocumentColors(Source.Extension, colorProviderRegistry, model, CancellationToken.None);
});


CommandsRegistry.registerCommand('_executeColorPresentationProvider', function (accessor, ...args) {

	const [color, context] = args;
	const { uri, range } = context;
	if (!(uri instanceof URI) || !Array.isArray(color) || color.length !== 4 || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const [red, green, blue, alpha] = color;

	const { colorProvider: colorProviderRegistry } = accessor.get(ILanguageFeaturesService);
	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		throw illegalArgument();
	}

	const colorInfo = {
		range,
		color: { red, green, blue, alpha }
	};

	const presentations: IColorPresentation[] = [];
	const providers = colorProviderRegistry.ordered(model).reverse();
	const promises = providers.map(provider => Promise.resolve(provider.provideColorPresentations(model, colorInfo, CancellationToken.None)).then(result => {
		if (Array.isArray(result)) {
			presentations.push(...result);
		}
	}));
	return Promise.all(promises).then(() => presentations);
});
