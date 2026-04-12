/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { TextModel } from '../../common/model/textModel.js';
import { ILanguageConfigurationService } from '../../common/languages/languageConfigurationRegistry.js';
import { ILanguageService } from '../../common/languages/language.js';
import { LanguageService } from '../../common/services/languageService.js';
import { ITextResourcePropertiesService } from '../../common/services/textResourceConfiguration.js';
import { TestLanguageConfigurationService } from './modes/testLanguageConfigurationService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../platform/dialogs/test/common/testDialogService.js';
import { ILogService, NullLogService } from '../../../platform/log/common/log.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../platform/notification/test/common/testNotificationService.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { IUndoRedoService } from '../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../platform/undoRedo/common/undoRedoService.js';
import { TestTextResourcePropertiesService } from './services/testTextResourcePropertiesService.js';
import { IModelService } from '../../common/services/model.js';
import { ModelService } from '../../common/services/modelService.js';
import { createServices } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../common/languages/modesRegistry.js';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from '../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../common/services/languageFeaturesService.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { mock } from '../../../base/test/common/mock.js';
import { ITreeSitterLibraryService } from '../../common/services/treeSitter/treeSitterLibraryService.js';
import { TestTreeSitterLibraryService } from './services/testTreeSitterLibraryService.js';
class TestTextModel extends TextModel {
    registerDisposable(disposable) {
        this._register(disposable);
    }
}
export function withEditorModel(text, callback) {
    const model = createTextModel(text.join('\n'));
    callback(model);
    model.dispose();
}
function resolveOptions(_options) {
    const defaultOptions = TextModel.DEFAULT_CREATION_OPTIONS;
    return {
        tabSize: (typeof _options.tabSize === 'undefined' ? defaultOptions.tabSize : _options.tabSize),
        indentSize: (typeof _options.indentSize === 'undefined' ? defaultOptions.indentSize : _options.indentSize),
        insertSpaces: (typeof _options.insertSpaces === 'undefined' ? defaultOptions.insertSpaces : _options.insertSpaces),
        detectIndentation: (typeof _options.detectIndentation === 'undefined' ? defaultOptions.detectIndentation : _options.detectIndentation),
        trimAutoWhitespace: (typeof _options.trimAutoWhitespace === 'undefined' ? defaultOptions.trimAutoWhitespace : _options.trimAutoWhitespace),
        defaultEOL: (typeof _options.defaultEOL === 'undefined' ? defaultOptions.defaultEOL : _options.defaultEOL),
        isForSimpleWidget: (typeof _options.isForSimpleWidget === 'undefined' ? defaultOptions.isForSimpleWidget : _options.isForSimpleWidget),
        largeFileOptimizations: (typeof _options.largeFileOptimizations === 'undefined' ? defaultOptions.largeFileOptimizations : _options.largeFileOptimizations),
        bracketPairColorizationOptions: (typeof _options.bracketColorizationOptions === 'undefined' ? defaultOptions.bracketPairColorizationOptions : _options.bracketColorizationOptions),
    };
}
export function createTextModel(text, languageId = null, options = TextModel.DEFAULT_CREATION_OPTIONS, uri = null) {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const model = instantiateTextModel(instantiationService, text, languageId, options, uri);
    model.registerDisposable(disposables);
    return model;
}
export function instantiateTextModel(instantiationService, text, languageId = null, _options = TextModel.DEFAULT_CREATION_OPTIONS, uri = null) {
    const options = resolveOptions(_options);
    return instantiationService.createInstance(TestTextModel, text, languageId || PLAINTEXT_LANGUAGE_ID, options, uri);
}
export function createModelServices(disposables, services = []) {
    return createServices(disposables, services.concat([
        [INotificationService, TestNotificationService],
        [IDialogService, TestDialogService],
        [IUndoRedoService, UndoRedoService],
        [ILanguageService, LanguageService],
        [ILanguageConfigurationService, TestLanguageConfigurationService],
        [IConfigurationService, TestConfigurationService],
        [ITextResourcePropertiesService, TestTextResourcePropertiesService],
        [IThemeService, TestThemeService],
        [ILogService, NullLogService],
        [IEnvironmentService, new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.isBuilt = true;
                    this.isExtensionDevelopment = false;
                }
            }],
        [ILanguageFeatureDebounceService, LanguageFeatureDebounceService],
        [ILanguageFeaturesService, LanguageFeaturesService],
        [IModelService, ModelService],
        [IModelService, ModelService],
        [ITreeSitterLibraryService, TestTreeSitterLibraryService],
    ]));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFRleHRNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUdqRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDNUQsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDeEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUUvRixPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ2hILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5REFBeUQsQ0FB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