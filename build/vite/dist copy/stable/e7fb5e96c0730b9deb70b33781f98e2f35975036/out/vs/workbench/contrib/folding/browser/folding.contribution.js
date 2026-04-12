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
var DefaultFoldingRangeProvider_1;
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FoldingController } from '../../../../editor/contrib/folding/browser/folding.js';
import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
let DefaultFoldingRangeProvider = class DefaultFoldingRangeProvider extends Disposable {
    static { DefaultFoldingRangeProvider_1 = this; }
    static { this.configName = 'editor.defaultFoldingRangeProvider'; }
    static { this.extensionIds = []; }
    static { this.extensionItemLabels = []; }
    static { this.extensionDescriptions = []; }
    constructor(_extensionService, _configurationService) {
        super();
        this._extensionService = _extensionService;
        this._configurationService = _configurationService;
        this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
        this._store.add(FoldingController.setFoldingRangeProviderSelector(this._selectFoldingRangeProvider.bind(this)));
        this._updateConfigValues();
    }
    async _updateConfigValues() {
        await this._extensionService.whenInstalledExtensionsRegistered();
        DefaultFoldingRangeProvider_1.extensionIds.length = 0;
        DefaultFoldingRangeProvider_1.extensionItemLabels.length = 0;
        DefaultFoldingRangeProvider_1.extensionDescriptions.length = 0;
        DefaultFoldingRangeProvider_1.extensionIds.push(null);
        DefaultFoldingRangeProvider_1.extensionItemLabels.push(nls.localize('null', 'All'));
        DefaultFoldingRangeProvider_1.extensionDescriptions.push(nls.localize('nullFormatterDescription', "All active folding range providers"));
        const languageExtensions = [];
        const otherExtensions = [];
        for (const extension of this._extensionService.extensions) {
            if (extension.main || extension.browser) {
                if (extension.categories?.find(cat => cat === 'Programming Languages')) {
                    languageExtensions.push(extension);
                }
                else {
                    otherExtensions.push(extension);
                }
            }
        }
        const sorter = (a, b) => a.name.localeCompare(b.name);
        for (const extension of languageExtensions.sort(sorter)) {
            DefaultFoldingRangeProvider_1.extensionIds.push(extension.identifier.value);
            DefaultFoldingRangeProvider_1.extensionItemLabels.push(extension.displayName ?? '');
            DefaultFoldingRangeProvider_1.extensionDescriptions.push(extension.description ?? '');
        }
        for (const extension of otherExtensions.sort(sorter)) {
            DefaultFoldingRangeProvider_1.extensionIds.push(extension.identifier.value);
            DefaultFoldingRangeProvider_1.extensionItemLabels.push(extension.displayName ?? '');
            DefaultFoldingRangeProvider_1.extensionDescriptions.push(extension.description ?? '');
        }
    }
    _selectFoldingRangeProvider(providers, document) {
        const value = this._configurationService.getValue(DefaultFoldingRangeProvider_1.configName, { overrideIdentifier: document.getLanguageId() });
        if (value) {
            return providers.filter(p => p.id === value);
        }
        return undefined;
    }
};
DefaultFoldingRangeProvider = DefaultFoldingRangeProvider_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IConfigurationService)
], DefaultFoldingRangeProvider);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    ...editorConfigurationBaseNode,
    properties: {
        [DefaultFoldingRangeProvider.configName]: {
            description: nls.localize('formatter.default', "Defines a default folding range provider that takes precedence over all other folding range providers. Must be the identifier of an extension contributing a folding range provider."),
            type: ['string', 'null'],
            default: null,
            enum: DefaultFoldingRangeProvider.extensionIds,
            enumItemLabels: DefaultFoldingRangeProvider.extensionItemLabels,
            markdownEnumDescriptions: DefaultFoldingRangeProvider.extensionDescriptions
        }
    }
});
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DefaultFoldingRangeProvider, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxJQUFJLG1CQUFtQixFQUEyRCxNQUFNLGtDQUFrQyxDQUFDO0FBQzlJLE9BQU8sRUFBMEIsVUFBVSxJQUFJLHVCQUF1QixFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDbkosT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFNUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFHdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHbkcsSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSxVQUFVOzthQUVuQyxlQUFVLEdBQUcsb0NBQW9DLEFBQXZDLENBQXdDO2FBRTNELGlCQUFZLEdBQXNCLEVBQUUsQUFBeEIsQ0FBeUI7YUFDckMsd0JBQW1CLEdBQWEsRUFBRSxBQUFmLENBQWdCO2FBQ25DLDBCQUFxQixHQUFhLEVBQUUsQUFBZixDQUFnQjtJQUU1QyxZQUNxQyxpQkFBb0MsRUFDaEMscUJBQTRDO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBSDRCLHNCQUFpQixHQUFqQixpQkFB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