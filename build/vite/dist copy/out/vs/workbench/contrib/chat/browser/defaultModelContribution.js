/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../common/languageModels.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../common/widget/input/modelPickerWidget.js';
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
/**
 * Creates the initial static arrays used by configuration registration code.
 * The returned arrays are mutated in-place by {@link DefaultModelContribution}.
 */
export function createDefaultModelArrays() {
    return {
        modelIds: [''],
        modelLabels: [localize('defaultModel', 'Auto (Vendor Default)')],
        modelDescriptions: [localize('defaultModelDescription', "Use the vendor's default model")],
    };
}
/**
 * Shared base class for workbench contributions that populate a dynamic enum
 * of language models for a settings picker.
 */
let DefaultModelContribution = class DefaultModelContribution extends Disposable {
    constructor(_arrays, _options, _languageModelsService, _logService) {
        super();
        this._arrays = _arrays;
        this._options = _options;
        this._languageModelsService = _languageModelsService;
        this._logService = _logService;
        this._register(_languageModelsService.onDidChangeLanguageModels(() => this._updateModelValues()));
        this._updateModelValues();
    }
    _updateModelValues() {
        const { modelIds, modelLabels, modelDescriptions } = this._arrays;
        const { configKey, configSectionId, logPrefix, filter } = this._options;
        try {
            // Clear arrays
            modelIds.length = 0;
            modelLabels.length = 0;
            modelDescriptions.length = 0;
            // Add default/empty option
            modelIds.push('');
            modelLabels.push(localize('defaultModel', 'Auto (Vendor Default)'));
            modelDescriptions.push(localize('defaultModelDescription', "Use the vendor's default model"));
            const models = [];
            const allModelIds = this._languageModelsService.getLanguageModelIds();
            for (const modelId of allModelIds) {
                try {
                    const metadata = this._languageModelsService.lookupLanguageModel(modelId);
                    if (metadata) {
                        models.push({ identifier: modelId, metadata });
                    }
                    else {
                        this._logService.warn(`${logPrefix} No metadata found for model ID: ${modelId}`);
                    }
                }
                catch (e) {
                    this._logService.error(`${logPrefix} Error looking up model ${modelId}:`, e);
                }
            }
            const supportedModels = models.filter(model => {
                if (!model.metadata?.isUserSelectable) {
                    return false;
                }
                if (filter && !filter(model.metadata)) {
                    return false;
                }
                return true;
            });
            supportedModels.sort((a, b) => {
                const aCategory = a.metadata.modelPickerCategory ?? DEFAULT_MODEL_PICKER_CATEGORY;
                const bCategory = b.metadata.modelPickerCategory ?? DEFAULT_MODEL_PICKER_CATEGORY;
                if (aCategory.order !== bCategory.order) {
                    return aCategory.order - bCategory.order;
                }
                return a.metadata.name.localeCompare(b.metadata.name);
            });
            for (const model of supportedModels) {
                try {
                    const qualifiedName = ILanguageModelChatMetadata.asQualifiedName(model.metadata);
                    modelIds.push(qualifiedName);
                    modelLabels.push(model.metadata.name);
                    modelDescriptions.push(model.metadata.tooltip ?? model.metadata.detail ?? '');
                }
                catch (e) {
                    this._logService.error(`${logPrefix} Error adding model ${model.metadata.name}:`, e);
                }
            }
            if (configSectionId) {
                configurationRegistry.notifyConfigurationSchemaUpdated({
                    id: configSectionId,
                    properties: {
                        [configKey]: {}
                    }
                });
            }
        }
        catch (e) {
            this._logService.error(`${logPrefix} Error updating model values:`, e);
        }
    }
};
DefaultModelContribution = __decorate([
    __param(2, ILanguageModelsService),
    __param(3, ILogService)
], DefaultModelContribution);
export { DefaultModelContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdE1vZGVsQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2RlZmF1bHRNb2RlbENvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBMEIsVUFBVSxJQUFJLHVCQUF1QixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDbkosT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUU1RixNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBbUJ6Rzs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsd0JBQXdCO0lBQ3ZDLE9BQU87UUFDTixRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDZCxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLHVCQUF1QixDQUFDLENBQUM7UUFDaEUsaUJBQWlCLEVBQUUsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztLQUMxRixDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7R0FHRztBQUNJLElBQWUsd0JBQXdCLEdBQXZDLE1BQWUsd0JBQXlCLFNBQVEsVUFB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