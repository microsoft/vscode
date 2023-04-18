/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentColorProvider, IColorInformation, IColorPresentation } from 'vs/editor/common/languages';
import { IModelService } from 'vs/editor/common/services/model';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { DefaultDocumentColorProvider } from 'vs/editor/contrib/colorPicker/browser/defaultDocumentColorProvider';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export async function getColors(registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean = true): Promise<IColorData[]> {
	return _findDocumentColors(Source.InBuiltCode, registry, model, token, isDefaultColorDecoratorsEnabled);
}

export function getColorPresentations(model: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider, token: CancellationToken): Promise<IColorPresentation[] | null | undefined> {
	return Promise.resolve(provider.provideColorPresentations(model, colorInfo, token));
}

export interface IColorData {
	colorInfo: IColorInformation;
	provider: DocumentColorProvider;
}

enum Source {
	InBuiltCode,
	Extension
}

type IExtColorData = { range: IRange; color: [number, number, number, number] };

async function _computeDocumentColors(provider: DocumentColorProvider, colors: IExtColorData[] | IColorData[], source: Source, model: ITextModel, token: CancellationToken): Promise<boolean> {
	const documentColors = await provider.provideDocumentColors(model, token);
	colors = source === Source.Extension ? colors as IExtColorData[] : colors as IColorData[];
	if (Array.isArray(documentColors)) {
		for (const colorInfo of documentColors) {
			if (source === Source.Extension) {
				colors = colors as IExtColorData[];
				colors.push({ range: colorInfo.range, color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha] });
			} else {
				colors = colors as IColorData[];
				colors.push({ colorInfo, provider });
			}
		}
	}
	return Array.isArray(documentColors);
}

async function _computeColorPresentations(provider: DocumentColorProvider, colors: IColorPresentation[], model: ITextModel, colorInfo: IColorInformation): Promise<boolean> {
	const documentColors = await provider.provideColorPresentations(model, colorInfo, CancellationToken.None);
	if (Array.isArray(documentColors)) {
		colors.push(...documentColors);
	}
	return Array.isArray(documentColors);
}

enum RequestType {
	colorPresentations,
	documentColors
}

class ComputeDocumentColorsOptions {
	type: RequestType = RequestType.documentColors;
	constructor(public readonly source: Source) { }
}

class ComputeColorPresentationsOptions {
	type: RequestType = RequestType.colorPresentations;
	constructor(public readonly color: number[], public readonly range: IRange) { }
}

function _getColorInfo(color: number[], range: IRange): IColorInformation {
	const [red, green, blue, alpha] = color;
	return {
		range: range,
		color: { red, green, blue, alpha }
	};
}

async function _findColorData<T extends ComputeDocumentColorsOptions | ComputeColorPresentationsOptions>(options: T, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<T extends ComputeDocumentColorsOptions ? IExtColorData[] | IColorData[] : IColorPresentation[]>;
async function _findColorData(options: ComputeDocumentColorsOptions | ComputeColorPresentationsOptions, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<IExtColorData[] | IColorData[] | IColorPresentation[]> {
	let validDocumentColorProviderFound = false;
	let defaultDocumentColorProvider: DefaultDocumentColorProvider | undefined;
	// Used for dynamic determination of the type of the final color data
	const state: {
		requestType: RequestType.colorPresentations;
		colorData: IColorPresentation[];
	} | {
		requestType: RequestType.documentColors;
		colorData: IExtColorData[] | IColorData[];
	} = { requestType: options.type, colorData: [] };

	const documentColorProviders = colorProviderRegistry.ordered(model);
	for (let i = documentColorProviders.length - 1; i >= 0; i--) {
		const provider = documentColorProviders[i];
		if (provider instanceof DefaultDocumentColorProvider) {
			defaultDocumentColorProvider = provider;
		} else {
			try {
				if (state.requestType === RequestType.documentColors) {
					options = options as ComputeDocumentColorsOptions;
					validDocumentColorProviderFound ||= await _computeDocumentColors(provider, state.colorData, options.source, model, token);
				} else if (state.requestType === RequestType.colorPresentations) {
					options = options as ComputeColorPresentationsOptions;
					validDocumentColorProviderFound ||= await _computeColorPresentations(provider, state.colorData, model, _getColorInfo(options.color, options.range));
				}
			} catch (e) {
				onUnexpectedExternalError(e);
			}
		}
	}
	if (validDocumentColorProviderFound) {
		return state.colorData;
	}
	if (!defaultDocumentColorProvider || !isDefaultColorDecoratorsEnabled) {
		return [];
	} else {
		if (state.requestType === RequestType.documentColors) {
			options = options as ComputeDocumentColorsOptions;
			await _computeDocumentColors(defaultDocumentColorProvider, state.colorData, options.source, model, token);
		} else if (state.requestType === RequestType.colorPresentations) {
			options = options as ComputeColorPresentationsOptions;
			await _computeColorPresentations(defaultDocumentColorProvider, state.colorData, model, _getColorInfo(options.color, options.range));
		}
		return state.colorData;
	}
}

async function _findDocumentColors<T extends Source>(source: T, registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<T extends Source.Extension ? IExtColorData[] : IColorData[]>;
async function _findDocumentColors(source: Source, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<IExtColorData[] | IColorData[]> {
	return _findColorData(new ComputeDocumentColorsOptions(source), colorProviderRegistry, model, token, isDefaultColorDecoratorsEnabled);
}

async function _findColorPresentations(colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, range: IRange, color: number[], isDefaultColorDecoratorsEnabled: boolean): Promise<IColorPresentation[]> {
	return _findColorData(new ComputeColorPresentationsOptions(color, range), colorProviderRegistry, model, CancellationToken.None, isDefaultColorDecoratorsEnabled);
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
	const isDefaultColorDecoratorsEnabled = accessor.get(IConfigurationService).getValue<boolean>('editor.defaultColorDecorators', { resource });
	return _findDocumentColors(Source.Extension, colorProviderRegistry, model, CancellationToken.None, isDefaultColorDecoratorsEnabled);
});


CommandsRegistry.registerCommand('_executeColorPresentationProvider', function (accessor, ...args) {
	const [color, context] = args;
	const { uri, range } = context;
	if (!(uri instanceof URI) || !Array.isArray(color) || color.length !== 4 || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const { colorProvider: colorProviderRegistry } = accessor.get(ILanguageFeaturesService);
	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		throw illegalArgument();
	}
	const isDefaultColorDecoratorsEnabled = accessor.get(IConfigurationService).getValue<boolean>('editor.defaultColorDecorators', { resource: uri });
	return _findColorPresentations(colorProviderRegistry, model, range, color, isDefaultColorDecoratorsEnabled);
});
