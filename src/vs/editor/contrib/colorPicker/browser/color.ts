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

export async function getColors(registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken): Promise<{ colorData: IColorData[]; usingDefaultDocumentColorProvider: boolean }> {
	return _findDocumentColors(Source.InBuiltCode, registry, model, token);
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

function _extendsIColorData(color: IColorData | IExtColorData): color is IColorData {
	return (<IColorData>color).colorInfo !== undefined && (<IColorData>color).provider !== undefined;
}

function _isArrayOfIColorData(array: any[]): array is IColorData[] {
	return Array.isArray(array) && array.every(color => _extendsIColorData(color));
}

function _formatReturnColorData(colors: IColorData[] | IExtColorData[], usingDefaultDocumentColorProvider: boolean): IExtColorData[] | { colorData: IColorData[]; usingDefaultDocumentColorProvider: boolean } {
	return _isArrayOfIColorData(colors) ? { colorData: colors, usingDefaultDocumentColorProvider: usingDefaultDocumentColorProvider } : colors;
}

function _formatColorData(source: Source, colorInfo: IColorInformation, provider: DocumentColorProvider): IColorData | IExtColorData {
	return source === Source.InBuiltCode ? { colorInfo, provider } : { range: colorInfo.range, color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha] };
}

function _pushToColorsArray(source: Source, colors: any[], provider: DocumentColorProvider, colorInformation: IColorInformation[] | null | undefined) {
	if (Array.isArray(colorInformation)) {
		for (const colorInfo of colorInformation) {
			colors.push(_formatColorData(source, colorInfo, provider));
		}
	}
}

async function _computeDocumentColorsFromExtensionDocumentColorProviders(providersFromExtensions: DocumentColorProvider[], model: ITextModel, token: CancellationToken, source: Source, colors: any[]) {
	let validDocumentColorProviderFound = false;
	await Promise.all(providersFromExtensions.map(provider => Promise.resolve(provider.provideDocumentColors(model, token)).then(documentColors => {
		validDocumentColorProviderFound = Array.isArray(documentColors) ? true : validDocumentColorProviderFound;
		_pushToColorsArray(source, colors, provider, documentColors);
	}).catch((e) => {
		onUnexpectedExternalError(e);
	})));
	return validDocumentColorProviderFound;
}

async function _computeDocumentColorsFromDefaultDocumentColorProvider(defaultDocumentColorProvider: DocumentColorProvider, model: ITextModel, token: CancellationToken, source: Source, colors: any[]) {
	return Promise.resolve(defaultDocumentColorProvider.provideDocumentColors(model, token)).then(documentColors => {
		_pushToColorsArray(source, colors, defaultDocumentColorProvider, documentColors);
	});
}

async function _findDocumentColors<T extends Source>(source: T, registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken): Promise<T extends Source.Extension ? IExtColorData[] : { colorData: IColorData[]; usingDefaultDocumentColorProvider: boolean }>;
async function _findDocumentColors(source: Source, registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken): Promise<IExtColorData[] | { colorData: IColorData[]; usingDefaultDocumentColorProvider: boolean }> {
	const colors: any[] = [];
	const orderedDocumentColorProviderRegistry = registry.ordered(model).reverse();
	const providersFromExtensions = orderedDocumentColorProviderRegistry.filter(provider => !(provider instanceof DefaultDocumentColorProvider));
	const validDocumentColorProviderFound = await _computeDocumentColorsFromExtensionDocumentColorProviders(providersFromExtensions, model, token, source, colors);
	if (validDocumentColorProviderFound) {
		return _formatReturnColorData(colors, false);
	}
	const defaultDocumentColorProvider = orderedDocumentColorProviderRegistry.find(provider => provider instanceof DefaultDocumentColorProvider);
	if (!defaultDocumentColorProvider) {
		return Promise.resolve({ colorData: [], usingDefaultDocumentColorProvider: false });
	} else {
		return _computeDocumentColorsFromDefaultDocumentColorProvider(defaultDocumentColorProvider, model, token, source, colors).then(() => {
			return _formatReturnColorData(colors, true);
		});
	}
}

async function _computeColorPresentationsFromExtensionDocumentColorProviders(providersFromExtensions: DocumentColorProvider[], model: ITextModel, colorInfo: IColorInformation, presentations: IColorPresentation[]) {
	let validDocumentColorProviderFound = false;
	await Promise.all(providersFromExtensions.map(provider => Promise.resolve(provider.provideColorPresentations(model, colorInfo, CancellationToken.None)).then(result => {
		if (Array.isArray(result)) {
			validDocumentColorProviderFound = true;
			presentations.push(...result);
		}
	})));
	return validDocumentColorProviderFound;
}

async function _computeColorPresentationsFromDefaultDocumentColorProvider(defaultDocumentColorProvider: DocumentColorProvider, model: ITextModel, colorInfo: IColorInformation, presentations: IColorPresentation[]) {
	return Promise.resolve(defaultDocumentColorProvider.provideColorPresentations(model, colorInfo, CancellationToken.None)).then(result => {
		if (Array.isArray(result)) {
			presentations.push(...result);
		}
	});
}

async function _findColorPresentations(colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, range: IRange, color: number[]): Promise<IColorPresentation[]> {
	const [red, green, blue, alpha] = color;
	const colorInfo = {
		range,
		color: { red, green, blue, alpha }
	};
	const presentations: IColorPresentation[] = [];
	const orderedDocumentColorProviderRegistry = colorProviderRegistry.ordered(model).reverse();
	const providersFromExtensions = orderedDocumentColorProviderRegistry.filter(provider => !(provider instanceof DefaultDocumentColorProvider));
	const validDocumentColorProviderFound = await _computeColorPresentationsFromExtensionDocumentColorProviders(providersFromExtensions, model, colorInfo, presentations);
	if (validDocumentColorProviderFound) {
		return presentations;
	}
	const defaultDocumentColorProvider = orderedDocumentColorProviderRegistry.find(provider => provider instanceof DefaultDocumentColorProvider);
	if (!defaultDocumentColorProvider) {
		return Promise.resolve([]);
	} else {
		return _computeColorPresentationsFromDefaultDocumentColorProvider(defaultDocumentColorProvider, model, colorInfo, presentations).then(() => {
			return presentations;
		});
	}
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
	const { colorProvider: colorProviderRegistry } = accessor.get(ILanguageFeaturesService);
	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		throw illegalArgument();
	}
	return _findColorPresentations(colorProviderRegistry, model, range, color);
});
