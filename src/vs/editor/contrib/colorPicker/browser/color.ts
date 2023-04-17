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

async function _findDocumentColors<T extends Source>(source: T, registry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<T extends Source.Extension ? IExtColorData[] : IColorData[]>;
async function _findDocumentColors(source: Source, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<IExtColorData[] | IColorData[]> {
	let validDocumentColorProviderFound = false;
	let defaultDocumentColorProvider: DefaultDocumentColorProvider | null = null;
	const colors: IExtColorData[] | IColorData[] = [];
	const documentColorProviders = colorProviderRegistry.ordered(model);
	for (let i = documentColorProviders.length - 1; i >= 0; i--) {
		const provider = documentColorProviders[i];
		if (provider instanceof DefaultDocumentColorProvider) {
			defaultDocumentColorProvider = provider;
		} else {
			const documentColors = await provider.provideDocumentColors(model, token);
			try {
				validDocumentColorProviderFound ||= Array.isArray(documentColors);
				_pushToColorsArray(source, colors, provider, documentColors);
			} catch (e) {
				onUnexpectedExternalError(e);
			}
		}
	}
	if (validDocumentColorProviderFound) {
		return colors;
	}
	if (!defaultDocumentColorProvider || !isDefaultColorDecoratorsEnabled) {
		return [];
	} else {
		// Added in order to avoid case when defaultDocumentColorProvider is null inside of the then() callback
		const defaultDocumentColorProviderUsed = defaultDocumentColorProvider;
		const documentColors = await defaultDocumentColorProviderUsed.provideDocumentColors(model, token);
		_pushToColorsArray(source, colors, defaultDocumentColorProviderUsed, documentColors);
		return colors;
	}
}

async function _findColorPresentations(colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, range: IRange, color: number[]): Promise<IColorPresentation[]> {
	let validDocumentColorProviderFound = false;
	let defaultDocumentColorProvider: DefaultDocumentColorProvider | null = null;
	const [red, green, blue, alpha] = color;
	const colorInfo = {
		range,
		color: { red, green, blue, alpha }
	};
	const presentations: IColorPresentation[] = [];
	const documentColorProviders = colorProviderRegistry.ordered(model);
	for (let i = documentColorProviders.length - 1; i >= 0; i--) {
		const provider = documentColorProviders[i];
		if (provider instanceof DefaultDocumentColorProvider) {
			defaultDocumentColorProvider = provider;
		} else {
			const documentColors = await provider.provideColorPresentations(model, colorInfo, CancellationToken.None);
			try {
				if (Array.isArray(documentColors)) {
					validDocumentColorProviderFound = true;
					presentations.push(...documentColors);
				}
			} catch (e) {
				onUnexpectedExternalError(e);
			}
		}
	}
	if (validDocumentColorProviderFound) {
		return presentations;
	}
	if (!defaultDocumentColorProvider) {
		return [];
	} else {
		const colorPresentation = await Promise.resolve(defaultDocumentColorProvider.provideColorPresentations(model, colorInfo, CancellationToken.None));
		if (Array.isArray(colorPresentation)) {
			presentations.push(...colorPresentation);
		}
		return presentations;
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
	const isDefaultColorDecoratorsEnabled = accessor.get(IConfigurationService).getValue<boolean>('editor.defaultColorDecorators');
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
	return _findColorPresentations(colorProviderRegistry, model, range, color);
});
