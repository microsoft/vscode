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

export async function getColors(colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean = true): Promise<IColorData[]> {
	return _findColorData<IColorData>(new ColorDataCollector(), colorProviderRegistry, model, token, isDefaultColorDecoratorsEnabled);
}

export function getColorPresentations(model: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider, token: CancellationToken): Promise<IColorPresentation[] | null | undefined> {
	return Promise.resolve(provider.provideColorPresentations(model, colorInfo, token));
}

export interface IColorData {
	colorInfo: IColorInformation;
	provider: DocumentColorProvider;
}

interface IExtColorData { range: IRange; color: [number, number, number, number] }

interface DataCollector<T> {
	compute(provider: DocumentColorProvider, model: ITextModel, token: CancellationToken, result: T[]): Promise<boolean>;
}

class ColorDataCollector implements DataCollector<IColorData> {
	constructor() { }
	async compute(provider: DocumentColorProvider, model: ITextModel, token: CancellationToken, colors: IColorData[]): Promise<boolean> {
		const documentColors = await provider.provideDocumentColors(model, token);
		if (Array.isArray(documentColors)) {
			for (const colorInfo of documentColors) {
				colors.push({ colorInfo, provider });
			}
		}
		return Array.isArray(documentColors);
	}
}

class ExtColorDataCollector implements DataCollector<IExtColorData> {
	constructor() { }
	async compute(provider: DocumentColorProvider, model: ITextModel, token: CancellationToken, colors: IExtColorData[]): Promise<boolean> {
		const documentColors = await provider.provideDocumentColors(model, token);
		if (Array.isArray(documentColors)) {
			for (const colorInfo of documentColors) {
				colors.push({ range: colorInfo.range, color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha] });
			}
		}
		return Array.isArray(documentColors);
	}

}

class ColorPresentationsCollector implements DataCollector<IColorPresentation> {
	constructor(private colorInfo: IColorInformation) { }
	async compute(provider: DocumentColorProvider, model: ITextModel, _token: CancellationToken, colors: IColorPresentation[]): Promise<boolean> {
		const documentColors = await provider.provideColorPresentations(model, this.colorInfo, CancellationToken.None);
		if (Array.isArray(documentColors)) {
			colors.push(...documentColors);
		}
		return Array.isArray(documentColors);
	}
}

async function _findColorData<T extends IColorPresentation | IExtColorData | IColorData>(collector: DataCollector<T>, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, isDefaultColorDecoratorsEnabled: boolean): Promise<T[]> {
	let validDocumentColorProviderFound = false;
	let defaultProvider: DefaultDocumentColorProvider | undefined;
	const colorData: T[] = [];
	const documentColorProviders = colorProviderRegistry.ordered(model);
	for (let i = documentColorProviders.length - 1; i >= 0; i--) {
		const provider = documentColorProviders[i];
		if (provider instanceof DefaultDocumentColorProvider) {
			defaultProvider = provider;
		} else {
			try {
				if (await collector.compute(provider, model, token, colorData)) {
					validDocumentColorProviderFound = true;
				}
			} catch (e) {
				onUnexpectedExternalError(e);
			}
		}
	}
	if (validDocumentColorProviderFound) {
		return colorData;
	}
	if (defaultProvider && isDefaultColorDecoratorsEnabled) {
		await collector.compute(defaultProvider, model, token, colorData);
		return colorData;
	}
	return [];
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
	return _findColorData<IExtColorData>(new ExtColorDataCollector(), colorProviderRegistry, model, CancellationToken.None, isDefaultColorDecoratorsEnabled);
});

CommandsRegistry.registerCommand('_executeColorPresentationProvider', function (accessor, ...args) {
	const [color, context] = args;
	const { uri, range } = context;
	if (!(uri instanceof URI) || !Array.isArray(color) || color.length !== 4 || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const { model, colorProviderRegistry, isDefaultColorDecoratorsEnabled } = _setupColorCommand(accessor, uri);
	const [red, green, blue, alpha] = color;
	return _findColorData<IColorPresentation>(new ColorPresentationsCollector({ range: range, color: { red, green, blue, alpha } }), colorProviderRegistry, model, CancellationToken.None, isDefaultColorDecoratorsEnabled);
});
