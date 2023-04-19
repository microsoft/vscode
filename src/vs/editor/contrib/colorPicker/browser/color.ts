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
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';

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

interface IExtColorData { range: IRange; color: [number, number, number, number] }

type IColorType = IExtColorData | IColorData | IColorPresentation;

enum Source {
	InBuiltCode,
	Extension
}

class ComputeDocumentColorsOptions {
	constructor(public readonly source: Source) { }
}

class ComputeColorPresentationsOptions {
	constructor(public readonly color: number[], public readonly range: IRange) { }
}

async function _computeDocumentColors(provider: DocumentColorProvider, colors: IColorType[], source: Source, model: ITextModel, token: CancellationToken): Promise<boolean> {
	const documentColors = await provider.provideDocumentColors(model, token);
	if (Array.isArray(documentColors)) {
		for (const colorInfo of documentColors) {
			colors.push(source === Source.Extension ? { range: colorInfo.range, color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha] } : { colorInfo, provider });
		}
	}
	return Array.isArray(documentColors);
}

async function _computeColorPresentations(provider: DocumentColorProvider, colors: IColorType[], model: ITextModel, colorInfo: IColorInformation): Promise<boolean> {
	const documentColors = await provider.provideColorPresentations(model, colorInfo, CancellationToken.None);
	if (Array.isArray(documentColors)) {
		colors.push(...documentColors);
	}
	return Array.isArray(documentColors);
}

function _getColorInfo(color: number[], range: IRange): IColorInformation {
	const [red, green, blue, alpha] = color;
	return {
		range: range,
		color: { red, green, blue, alpha }
	};
}

async function _computeColorData(options: ComputeColorPresentationsOptions | ComputeDocumentColorsOptions, provider: DocumentColorProvider, colorData: IColorType[], model: ITextModel, token: CancellationToken) {
	if (options instanceof ComputeDocumentColorsOptions) {
		return await _computeDocumentColors(provider, colorData, options.source, model, token);
	} else {
		return await _computeColorPresentations(provider, colorData, model, _getColorInfo(options.color, options.range));
	}
}

async function _findColorData<T extends ComputeDocumentColorsOptions | ComputeColorPresentationsOptions>(options: T, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<T extends ComputeDocumentColorsOptions ? IExtColorData[] | IColorData[] : IColorPresentation[]>;
async function _findColorData(options: ComputeDocumentColorsOptions | ComputeColorPresentationsOptions, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<IExtColorData[] | IColorData[] | IColorPresentation[]> {
	let validDocumentColorProviderFound = false;
	let defaultDocumentColorProvider: DefaultDocumentColorProvider | undefined;
	const colorData: IColorData[] | IExtColorData[] | IColorPresentation[] = [];
	const documentColorProviders = colorProviderRegistry.ordered(model);
	for (let i = documentColorProviders.length - 1; i >= 0; i--) {
		const provider = documentColorProviders[i];
		if (provider instanceof DefaultDocumentColorProvider) {
			defaultDocumentColorProvider = provider;
		} else {
			try {
				validDocumentColorProviderFound ||= await _computeColorData(options, provider, colorData, model, token);
			} catch (e) {
				onUnexpectedExternalError(e);
			}
		}
	}
	if (validDocumentColorProviderFound) {
		return colorData;
	}
	if (!defaultDocumentColorProvider || !isDefaultColorDecoratorsEnabled) {
		return [];
	} else {
		await _computeColorData(options, defaultDocumentColorProvider, colorData, model, token);
		return colorData;
	}
}

async function _findDocumentColors<T extends Source>(source: T, registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<T extends Source.Extension ? IExtColorData[] : IColorData[]>;
async function _findDocumentColors(source: Source, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<IExtColorData[] | IColorData[]> {
	return _findColorData(new ComputeDocumentColorsOptions(source), colorProviderRegistry, model, token, isDefaultColorDecoratorsEnabled);
}

async function _findColorPresentations(colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, range: IRange, color: number[], isDefaultColorDecoratorsEnabled: boolean): Promise<IColorPresentation[]> {
	return _findColorData(new ComputeColorPresentationsOptions(color, range), colorProviderRegistry, model, CancellationToken.None, isDefaultColorDecoratorsEnabled);
}

function _setupColorCommand(accessor: ServicesAccessor, resource: URI): { model: ITextModel; colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>; isDefaultColorDecoratorsEnabled: boolean } {
	const { colorProvider: colorProviderRegistry } = accessor.get(ILanguageFeaturesService);
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}
	const isDefaultColorDecoratorsEnabled = accessor.get(IConfigurationService).getValue<boolean>('editor.defaultColorDecorators', { resource });
	return { model, colorProviderRegistry, isDefaultColorDecoratorsEnabled };
}

CommandsRegistry.registerCommand('_executeDocumentColorProvider', function (accessor, ...args) {
	const [resource] = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}
	const { model, colorProviderRegistry, isDefaultColorDecoratorsEnabled } = _setupColorCommand(accessor, resource);
	return _findDocumentColors(Source.Extension, colorProviderRegistry, model, CancellationToken.None, isDefaultColorDecoratorsEnabled);
});

CommandsRegistry.registerCommand('_executeColorPresentationProvider', function (accessor, ...args) {
	const [color, context] = args;
	const { uri, range } = context;
	if (!(uri instanceof URI) || !Array.isArray(color) || color.length !== 4 || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const { model, colorProviderRegistry, isDefaultColorDecoratorsEnabled } = _setupColorCommand(accessor, uri);
	return _findColorPresentations(colorProviderRegistry, model, range, color, isDefaultColorDecoratorsEnabled);
});
