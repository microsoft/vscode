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
var BaseTextEditorModel_1;
import { EditorModel } from './editorModel.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../editor/common/languages/modesRegistry.js';
import { ILanguageDetectionService, LanguageDetectionLanguageEventSource } from '../../services/languageDetection/common/languageDetectionWorkerService.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { localize } from '../../../nls.js';
/**
 * The base text editor model leverages the code editor model. This class is only intended to be subclassed and not instantiated.
 */
let BaseTextEditorModel = class BaseTextEditorModel extends EditorModel {
    static { BaseTextEditorModel_1 = this; }
    static { this.AUTO_DETECT_LANGUAGE_THROTTLE_DELAY = 600; }
    constructor(modelService, languageService, languageDetectionService, accessibilityService, textEditorModelHandle) {
        super();
        this.modelService = modelService;
        this.languageService = languageService;
        this.languageDetectionService = languageDetectionService;
        this.accessibilityService = accessibilityService;
        this.textEditorModelHandle = undefined;
        this.modelDisposeListener = this._register(new MutableDisposable());
        this.autoDetectLanguageThrottler = this._register(new ThrottledDelayer(BaseTextEditorModel_1.AUTO_DETECT_LANGUAGE_THROTTLE_DELAY));
        this._blockLanguageChangeListener = false;
        this._languageChangeSource = undefined;
        if (textEditorModelHandle) {
            this.handleExistingModel(textEditorModelHandle);
        }
    }
    handleExistingModel(textEditorModelHandle) {
        // We need the resource to point to an existing model
        const model = this.modelService.getModel(textEditorModelHandle);
        if (!model) {
            throw new Error(`Document with resource ${textEditorModelHandle.toString(true)} does not exist`);
        }
        this.textEditorModelHandle = textEditorModelHandle;
        // Make sure we clean up when this model gets disposed
        this.registerModelDisposeListener(model);
    }
    registerModelDisposeListener(model) {
        this.modelDisposeListener.value = model.onWillDispose(() => {
            this.textEditorModelHandle = undefined; // make sure we do not dispose code editor model again
            this.dispose();
        });
    }
    get textEditorModel() {
        return this.textEditorModelHandle ? this.modelService.getModel(this.textEditorModelHandle) : null;
    }
    isReadonly() {
        return true;
    }
    get languageChangeSource() { return this._languageChangeSource; }
    get hasLanguageSetExplicitly() {
        // This is technically not 100% correct, because 'api' can also be
        // set as source if a model is resolved as text first and then
        // transitions into the resolved language. But to preserve the current
        // behaviour, we do not change this property. Rather, `languageChangeSource`
        // can be used to get more fine grained information.
        return typeof this._languageChangeSource === 'string';
    }
    setLanguageId(languageId, source) {
        // Remember that an explicit language was set
        this._languageChangeSource = 'user';
        this.setLanguageIdInternal(languageId, source);
    }
    setLanguageIdInternal(languageId, source) {
        if (!this.isResolved()) {
            return;
        }
        if (!languageId || languageId === this.textEditorModel.getLanguageId()) {
            return;
        }
        this._blockLanguageChangeListener = true;
        try {
            this.textEditorModel.setLanguage(this.languageService.createById(languageId), source);
        }
        finally {
            this._blockLanguageChangeListener = false;
        }
    }
    installModelListeners(model) {
        // Setup listener for lower level language changes
        const disposable = this._register(model.onDidChangeLanguage(e => {
            if (e.source === LanguageDetectionLanguageEventSource ||
                this._blockLanguageChangeListener) {
                return;
            }
            this._languageChangeSource = 'api';
            disposable.dispose();
        }));
    }
    getLanguageId() {
        return this.textEditorModel?.getLanguageId();
    }
    autoDetectLanguage() {
        return this.autoDetectLanguageThrottler.trigger(() => this.doAutoDetectLanguage());
    }
    async doAutoDetectLanguage() {
        if (this.hasLanguageSetExplicitly || // skip detection when the user has made an explicit choice on the language
            !this.textEditorModelHandle || // require a URI to run the detection for
            !this.languageDetectionService.isEnabledForLanguage(this.getLanguageId() ?? PLAINTEXT_LANGUAGE_ID) // require a valid language that is enlisted for detection
        ) {
            return;
        }
        const lang = await this.languageDetectionService.detectLanguage(this.textEditorModelHandle);
        const prevLang = this.getLanguageId();
        if (lang && lang !== prevLang && !this.isDisposed()) {
            this.setLanguageIdInternal(lang, LanguageDetectionLanguageEventSource);
            const languageName = this.languageService.getLanguageName(lang);
            this.accessibilityService.alert(localize('languageAutoDetected', "Language {0} was automatically detected and set as the language mode.", languageName ?? lang));
        }
    }
    /**
     * Creates the text editor model with the provided value, optional preferred language
     * (can be comma separated for multiple values) and optional resource URL.
     */
    createTextEditorModel(value, resource, preferredLanguageId) {
        const firstLineText = this.getFirstLineText(value);
        const languageSelection = this.getOrCreateLanguage(resource, this.languageService, preferredLanguageId, firstLineText);
        return this.doCreateTextEditorModel(value, languageSelection, resource);
    }
    doCreateTextEditorModel(value, languageSelection, resource) {
        let model = resource && this.modelService.getModel(resource);
        if (!model) {
            model = this.modelService.createModel(value, languageSelection, resource);
            this.createdEditorModel = true;
            // Make sure we clean up when this model gets disposed
            this.registerModelDisposeListener(model);
        }
        else {
            this.updateTextEditorModel(value, languageSelection.languageId);
        }
        this.textEditorModelHandle = model.uri;
        return model;
    }
    getFirstLineText(value) {
        // text buffer factory
        const textBufferFactory = value;
        if (typeof textBufferFactory.getFirstLineText === 'function') {
            return textBufferFactory.getFirstLineText(1000 /* ModelConstants.FIRST_LINE_DETECTION_LENGTH_LIMIT */);
        }
        // text model
        const textSnapshot = value;
        return textSnapshot.getLineContent(1).substr(0, 1000 /* ModelConstants.FIRST_LINE_DETECTION_LENGTH_LIMIT */);
    }
    /**
     * Gets the language for the given identifier. Subclasses can override to provide their own implementation of this lookup.
     *
     * @param firstLineText optional first line of the text buffer to set the language on. This can be used to guess a language from content.
     */
    getOrCreateLanguage(resource, languageService, preferredLanguage, firstLineText) {
        // lookup language via resource path if the provided language is unspecific
        if (!preferredLanguage || preferredLanguage === PLAINTEXT_LANGUAGE_ID) {
            return languageService.createByFilepathOrFirstLine(resource ?? null, firstLineText);
        }
        // otherwise take the preferred language for granted
        return languageService.createById(preferredLanguage);
    }
    /**
     * Updates the text editor model with the provided value. If the value is the same as the model has, this is a no-op.
     */
    updateTextEditorModel(newValue, preferredLanguageId, reason) {
        if (!this.isResolved()) {
            return;
        }
        // contents
        if (newValue) {
            this.modelService.updateModel(this.textEditorModel, newValue, reason);
        }
        // language (only if specific and changed)
        if (preferredLanguageId && preferredLanguageId !== PLAINTEXT_LANGUAGE_ID && this.textEditorModel.getLanguageId() !== preferredLanguageId) {
            this.textEditorModel.setLanguage(this.languageService.createById(preferredLanguageId));
        }
    }
    createSnapshot() {
        if (!this.textEditorModel) {
            return null;
        }
        return this.textEditorModel.createSnapshot(true /* preserve BOM */);
    }
    isResolved() {
        return !!this.textEditorModelHandle;
    }
    dispose() {
        this.modelDisposeListener.dispose(); // dispose this first because it will trigger another dispose() otherwise
        if (this.textEditorModelHandle && this.createdEditorModel) {
            this.modelService.destroyModel(this.textEditorModelHandle);
        }
        this.textEditorModelHandle = undefined;
        this.createdEditorModel = false;
        super.dispose();
    }
};
BaseTextEditorModel = BaseTextEditorModel_1 = __decorate([
    __param(0, IModelService),
    __param(1, ILanguageService),
    __param(2, ILanguageDetectionService),
    __param(3, IAccessibilityService)
], BaseTextEditorModel);
export { BaseTextEditorModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEVkaXRvck1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IvdGV4dEVkaXRvck1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFJL0MsT0FBTyxFQUFFLGdCQUFnQixFQUFzQixNQUFNLDhDQUE4QyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMxRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSwyRUFBMkUsQ0FBQztBQUM1SixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFJM0M7O0dBRUc7QUFDSSxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLFdBQVc7O2FBRTNCLHdDQUFtQyxHQUFHLEdBQUcsQUFBTixDQUFPO0lBU2xFLFlBQ2dCLFlBQXFDLEVBQ2xDLGVBQTJDLEVBQ2xDLHdCQUFvRSxFQUN4RSxvQkFBNEQsRUFDbkYscUJBQTJCO1FBRTNCLEtBQUssRUFBRSxDQUFDO1FBTmlCLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQ3hCLG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtRQUNqQiw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTJCO1FBQ3ZELHlCQUFvQixHQUFw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