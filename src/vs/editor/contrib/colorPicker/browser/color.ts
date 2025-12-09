/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { illegalArgument, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../common/core/range.js';
import { ITextModel } from '../../../common/model.js';
import { DocumentColorProvider, IColorInformation, IColorPresentation } from '../../../common/languages.js';
import { IModelService } from '../../../common/services/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { DefaultDocumentColorProvider } from './defaultDocumentColorProvider.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../browser/editorExtensions.js';

export async function getColors(colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, defaultColorDecoratorsEnablement: 'auto' | 'always' | 'never' = 'auto'): Promise<IColorData[]> {
	return _findColorData<IColorData>(new ColorDataCollector(), colorProviderRegistry, model, token, defaultColorDecoratorsEnablement);
}

export function getColorPresentations(model: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider, token: CancellationToken): Promise<IColorPresentation[] | null | undefined> {
	return Promise.resolve(provider.provideColorPresentations(model, colorInfo, token));
}

export interface IColorData {
	colorInfo: IColorInformation;
	provider: DocumentColorProvider;
}

export interface IExtColorData { range: IRange; color: [number, number, number, number] }

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

export class ExtColorDataCollector implements DataCollector<IExtColorData> {
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

export class ColorPresentationsCollector implements DataCollector<IColorPresentation> {
	constructor(private colorInfo: IColorInformation) { }
	async compute(provider: DocumentColorProvider, model: ITextModel, _token: CancellationToken, colors: IColorPresentation[]): Promise<boolean> {
		const documentColors = await provider.provideColorPresentations(model, this.colorInfo, CancellationToken.None);
		if (Array.isArray(documentColors)) {
			colors.push(...documentColors);
		}
		return Array.isArray(documentColors);
	}
}

export async function _findColorData<T extends IColorPresentation | IExtColorData | IColorData>(collector: DataCollector<T>, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>, model: ITextModel, token: CancellationToken, defaultColorDecoratorsEnablement: 'auto' | 'always' | 'never'): Promise<T[]> {
	let validDocumentColorProviderFound = false;
	let defaultProvider: DefaultDocumentColorProvider | undefined;
	const colorData: T[] = [];
	const documentColorProviders = colorProviderRegistry.ordered(model);
	for (let i = documentColorProviders.length - 1; i >= 0; i--) {
		const provider = documentColorProviders[i];
		if (defaultColorDecoratorsEnablement !== 'always' && provider instanceof DefaultDocumentColorProvider) {
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
	if (defaultProvider && defaultColorDecoratorsEnablement !== 'never') {
		await collector.compute(defaultProvider, model, token, colorData);
		return colorData;
	}
	return [];
}

export function _setupColorCommand(accessor: ServicesAccessor, resource: URI): { model: ITextModel; colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>; defaultColorDecoratorsEnablement: 'auto' | 'always' | 'never' } {
	const { colorProvider: colorProviderRegistry } = accessor.get(ILanguageFeaturesService);
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}
	const defaultColorDecoratorsEnablement = accessor.get(IConfigurationService).getValue<'auto' | 'always' | 'never'>('editor.defaultColorDecorators', { resource });
	return { model, colorProviderRegistry, defaultColorDecoratorsEnablement };
}

