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
import { PromptLinkProvider } from '../../common/promptSyntax/languageProviders/promptLinkProvider.js';
import { PromptBodyAutocompletion } from '../../common/promptSyntax/languageProviders/promptBodyAutocompletion.js';
import { PromptHeaderAutocompletion } from '../../common/promptSyntax/languageProviders/promptHeaderAutocompletion.js';
import { PromptHoverProvider } from '../../common/promptSyntax/languageProviders/promptHovers.js';
import { PromptHeaderDefinitionProvider } from '../../common/promptSyntax/languageProviders/PromptHeaderDefinitionProvider.js';
import { MARKERS_OWNER_ID, PromptValidator } from '../../common/promptSyntax/languageProviders/promptValidator.js';
import { PromptDocumentSemanticTokensProvider } from '../../common/promptSyntax/languageProviders/promptDocumentSemanticTokensProvider.js';
import { PromptCodeActionProvider } from '../../common/promptSyntax/languageProviders/promptCodeActions.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ALL_PROMPTS_LANGUAGE_SELECTOR, getPromptsTypeForLanguageId } from '../../common/promptSyntax/promptTypes.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IChatModeService } from '../../common/chatModes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { Delayer } from '../../../../../base/common/async.js';
import { ResourceMap } from '../../../../../base/common/map.js';
let PromptLanguageFeaturesProvider = class PromptLanguageFeaturesProvider extends Disposable {
    static { this.ID = 'chat.promptLanguageFeatures'; }
    constructor(languageService, instantiationService) {
        super();
        this._register(languageService.linkProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptLinkProvider)));
        this._register(languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptBodyAutocompletion)));
        this._register(languageService.completionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHeaderAutocompletion)));
        this._register(languageService.hoverProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHoverProvider)));
        this._register(languageService.definitionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptHeaderDefinitionProvider)));
        this._register(languageService.documentSemanticTokensProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptDocumentSemanticTokensProvider)));
        this._register(languageService.codeActionProvider.register(ALL_PROMPTS_LANGUAGE_SELECTOR, instantiationService.createInstance(PromptCodeActionProvider)));
        this._register(instantiationService.createInstance(PromptValidatorContribution));
    }
};
PromptLanguageFeaturesProvider = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IInstantiationService)
], PromptLanguageFeaturesProvider);
export { PromptLanguageFeaturesProvider };
/**
 * Tracks open code editors and validates prompt models that are visible in an editor.
 * Only emits markers for models that are currently open in an editor.
 */
let PromptValidatorContribution = class PromptValidatorContribution extends Disposable {
    constructor(codeEditorService, instantiationService, markerService, promptsService, languageModelsService, languageModelToolsService, chatModeService) {
        super();
        this.codeEditorService = codeEditorService;
        this.markerService = markerService;
        this.promptsService = promptsService;
        this.languageModelsService = languageModelsService;
        this.languageModelToolsService = languageModelToolsService;
        this.chatModeService = chatModeService;
        this.localDisposables = this._register(new DisposableStore());
        this.validator = instantiationService.createInstance(PromptValidator);
        this.updateRegistration();
    }
    updateRegistration() {
        this.localDisposables.clear();
        const trackers = new ResourceMap();
        this.localDisposables.add(toDisposable(() => {
            trackers.forEach(tracker => tracker.dispose());
            trackers.clear();
        }));
        // Increment the ref count for a model, creating a tracker if needed
        const acquire = (editor) => {
            const model = editor.getModel();
            if (!model) {
                return;
            }
            const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
            if (promptType) {
                const existing = trackers.get(model.uri);
                if (existing) {
                    existing.refCount++;
                    return;
                }
                trackers.set(model.uri, new ModelTracker(model, promptType, this.validator, this.promptsService, this.markerService));
            }
        };
        // Decrement the ref count, disposing the tracker when it reaches zero
        const release = (uri) => {
            const tracker = trackers.get(uri);
            if (tracker && --tracker.refCount === 0) {
                tracker.dispose();
                trackers.delete(uri);
            }
        };
        const perEditorDisposables = new DisposableMap();
        this.localDisposables.add(perEditorDisposables);
        const onCodeEditorAdd = (editor) => {
            acquire(editor);
            const store = new DisposableStore();
            // Track model changes within the editor (e.g. when a different file is opened in the same editor)
            store.add(editor.onDidChangeModel((e) => {
                if (e.oldModelUrl) {
                    release(e.oldModelUrl);
                }
                acquire(editor);
            }));
            store.add(editor.onDidChangeModelLanguage((e) => {
                const model = editor.getModel();
                if (model) {
                    release(model.uri);
                    acquire(editor);
                }
            }));
            perEditorDisposables.set(editor.getId(), store);
        };
        // Track models from editors that are currently open
        for (const editor of this.codeEditorService.listCodeEditors()) {
            onCodeEditorAdd(editor);
        }
        // When an editor is added, start tracking its model
        this.localDisposables.add(this.codeEditorService.onCodeEditorAdd((editor) => {
            onCodeEditorAdd(editor);
        }));
        // When an editor is removed, clean up its per-editor listeners and release its model
        this.localDisposables.add(this.codeEditorService.onCodeEditorRemove((editor) => {
            perEditorDisposables.deleteAndDispose(editor.getId());
            const model = editor.getModel();
            if (model) {
                release(model.uri);
            }
        }));
        const validateAll = () => trackers.forEach(tracker => tracker.validate());
        this.localDisposables.add(this.languageModelToolsService.onDidChangeTools(() => validateAll()));
        this.localDisposables.add(this.chatModeService.onDidChangeChatModes(() => validateAll()));
        this.localDisposables.add(this.languageModelsService.onDidChangeLanguageModels(() => validateAll()));
    }
};
PromptValidatorContribution = __decorate([
    __param(0, ICodeEditorService),
    __param(1, IInstantiationService),
    __param(2, IMarkerService),
    __param(3, IPromptsService),
    __param(4, ILanguageModelsService),
    __param(5, ILanguageModelToolsService),
    __param(6, IChatModeService)
], PromptValidatorContribution);
class ModelTracker extends Disposable {
    constructor(textModel, promptType, validator, promptsService, markerService) {
        super();
        this.textModel = textModel;
        this.promptType = promptType;
        this.validator = validator;
        this.promptsService = promptsService;
        this.markerService = markerService;
        this.refCount = 1;
        this.delayer = this._register(new Delayer(200));
        this._register(textModel.onDidChangeContent(() => this.validate()));
        this.validate();
    }
    validate() {
        this.delayer.trigger(async () => {
            const markers = [];
            const ast = this.promptsService.getParsedPromptFile(this.textModel);
            await this.validator.validate(ast, this.promptType, m => markers.push(m));
            if (!this._store.isDisposed) {
                this.markerService.changeOne(MARKERS_OWNER_ID, this.textModel.uri, markers);
            }
        });
    }
    dispose() {
        this.markerService.remove(MARKERS_OWNER_ID, [this.textModel.uri]);
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZUNvbnRyaWJ1dGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcHJvbXB0U3ludGF4L3Byb21wdEZpbGVDb250cmlidXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlFQUF5RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBQ3ZILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQy9ILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuSCxPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSxxRkFBcUYsQ0FBQztBQUMzSSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUM1RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkgsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDJCQUEyQixFQUFlLE1BQU0sMENBQTBDLENBQUM7QUFDbkksT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFFakcsT0FBTyxFQUFlLGNBQWMsRUFBRSxN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