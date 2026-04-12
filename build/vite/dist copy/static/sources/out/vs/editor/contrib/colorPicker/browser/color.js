/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { illegalArgument, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { IModelService } from '../../../common/services/model.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { DefaultDocumentColorProvider } from './defaultDocumentColorProvider.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
export async function getColors(colorProviderRegistry, model, token, defaultColorDecoratorsEnablement = 'auto') {
    return _findColorData(new ColorDataCollector(), colorProviderRegistry, model, token, defaultColorDecoratorsEnablement);
}
export function getColorPresentations(model, colorInfo, provider, token) {
    return Promise.resolve(provider.provideColorPresentations(model, colorInfo, token));
}
class ColorDataCollector {
    constructor() { }
    async compute(provider, model, token, colors) {
        const documentColors = await provider.provideDocumentColors(model, token);
        if (Array.isArray(documentColors)) {
            for (const colorInfo of documentColors) {
                colors.push({ colorInfo, provider });
            }
        }
        return Array.isArray(documentColors);
    }
}
export class ExtColorDataCollector {
    constructor() { }
    async compute(provider, model, token, colors) {
        const documentColors = await provider.provideDocumentColors(model, token);
        if (Array.isArray(documentColors)) {
            for (const colorInfo of documentColors) {
                colors.push({ range: colorInfo.range, color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha] });
            }
        }
        return Array.isArray(documentColors);
    }
}
export class ColorPresentationsCollector {
    constructor(colorInfo) {
        this.colorInfo = colorInfo;
    }
    async compute(provider, model, _token, colors) {
        const documentColors = await provider.provideColorPresentations(model, this.colorInfo, CancellationToken.None);
        if (Array.isArray(documentColors)) {
            colors.push(...documentColors);
        }
        return Array.isArray(documentColors);
    }
}
export async function _findColorData(collector, colorProviderRegistry, model, token, defaultColorDecoratorsEnablement) {
    let validDocumentColorProviderFound = false;
    let defaultProvider;
    const colorData = [];
    const documentColorProviders = colorProviderRegistry.ordered(model);
    for (let i = documentColorProviders.length - 1; i >= 0; i--) {
        const provider = documentColorProviders[i];
        if (defaultColorDecoratorsEnablement !== 'always' && provider instanceof DefaultDocumentColorProvider) {
            defaultProvider = provider;
        }
        else {
            try {
                if (await collector.compute(provider, model, token, colorData)) {
                    validDocumentColorProviderFound = true;
                }
            }
            catch (e) {
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
export function _setupColorCommand(accessor, resource) {
    const { colorProvider: colorProviderRegistry } = accessor.get(ILanguageFeaturesService);
    const model = accessor.get(IModelService).getModel(resource);
    if (!model) {
        throw illegalArgument();
    }
    const defaultColorDecoratorsEnablement = accessor.get(IConfigurationService).getValue('editor.defaultColorDecorators', { resource });
    return { model, colorProviderRegistry, defaultColorDecoratorsEnablement };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2xvclBpY2tlci9icm93c2VyL2NvbG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUsvRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFeEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHbkcsTUFBTSxDQUFDLEtBQUssVUFBVSxTQUFTLENBQUMscUJBQXFFLEVBQUUsS0FBaUIsRUFBRSxLQUF3QixFQUFFLG1DQUFnRSxNQUFNO0lBQ3pOLE9BQU8sY0FBYyxDQUFhLElBQUksa0JBQWtCLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7QUFDcEksQ0FBQztBQUVELE1BQU0sVUFBVSxxQkFBcUIsQ0FBQyxLQUFpQixFQUFFLFNBQTRCLEVBQUUsUUFBK0IsRUFBRSxLQUF3QjtJQUMvSSxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLHlCQUF5QixDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNyRixDQUFDO0FBYUQsTUFBTSxrQkFBa0I7SUFDdkIsZ0JBQWdCLENBQUM7SUFDakIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUErQixFQUFFLEtBQWlCLEVBQUUs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