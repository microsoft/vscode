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
var TextResourceEditor_1;
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { isTextEditorViewState } from '../../../common/editor.js';
import { applyTextEditorOptions } from '../../../common/editor/editorOptions.js';
import { TextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { BaseTextEditorModel } from '../../../common/editor/textEditorModel.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { AbstractTextCodeEditor } from './textCodeEditor.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../editor/common/languages/modesRegistry.js';
import { IFileService } from '../../../../platform/files/common/files.js';
/**
 * An editor implementation that is capable of showing the contents of resource inputs. Uses
 * the TextEditor widget to show the contents.
 */
let AbstractTextResourceEditor = class AbstractTextResourceEditor extends AbstractTextCodeEditor {
    constructor(id, group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService) {
        super(id, group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, fileService);
    }
    async setInput(input, options, context, token) {
        // Set input and resolve
        await super.setInput(input, options, context, token);
        const resolvedModel = await input.resolve();
        // Check for cancellation
        if (token.isCancellationRequested) {
            return undefined;
        }
        // Assert Model instance
        if (!(resolvedModel instanceof BaseTextEditorModel)) {
            throw new Error('Unable to open file as text');
        }
        // Set Editor Model
        const control = assertReturnsDefined(this.editorControl);
        const textEditorModel = resolvedModel.textEditorModel;
        control.setModel(textEditorModel);
        // Restore view state (unless provided by options)
        if (!isTextEditorViewState(options?.viewState)) {
            const editorViewState = this.loadEditorViewState(input, context);
            if (editorViewState) {
                if (options?.selection) {
                    editorViewState.cursorState = []; // prevent duplicate selections via options
                }
                control.restoreViewState(editorViewState);
            }
        }
        // Apply options to editor if any
        if (options) {
            applyTextEditorOptions(options, control, 1 /* ScrollType.Immediate */);
        }
        // Since the resolved model provides information about being readonly
        // or not, we apply it here to the editor even though the editor input
        // was already asked for being readonly or not. The rationale is that
        // a resolved model might have more specific information about being
        // readonly or not that the input did not have.
        control.updateOptions(this.getReadonlyConfiguration(resolvedModel.isReadonly()));
    }
    /**
     * Reveals the last line of this editor if it has a model set.
     */
    revealLastLine() {
        const control = this.editorControl;
        if (!control) {
            return;
        }
        const model = control.getModel();
        if (model) {
            const lastLine = model.getLineCount();
            control.revealPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) }, 0 /* ScrollType.Smooth */);
        }
    }
    clearInput() {
        super.clearInput();
        // Clear Model
        this.editorControl?.setModel(null);
    }
    tracksEditorViewState(input) {
        // editor view state persistence is only enabled for untitled and resource inputs
        return input instanceof UntitledTextEditorInput || input instanceof TextResourceEditorInput;
    }
};
AbstractTextResourceEditor = __decorate([
    __param(2, ITelemetryService),
    __param(3, IInstantiationService),
    __param(4, IStorageService),
    __param(5, ITextResourceConfigurationService),
    __param(6, IThemeService),
    __param(7, IEditorGroupsService),
    __param(8, IEditorService),
    __param(9, IFileService)
], AbstractTextResourceEditor);
export { AbstractTextResourceEditor };
let TextResourceEditor = class TextResourceEditor extends AbstractTextResourceEditor {
    static { TextResourceEditor_1 = this; }
    static { this.ID = 'workbench.editors.textResourceEditor'; }
    constructor(group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService, modelService, languageService, fileService) {
        super(TextResourceEditor_1.ID, group, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorGroupService, editorService, fileService);
        this.modelService = modelService;
        this.languageService = languageService;
    }
    createEditorControl(parent, configuration) {
        super.createEditorControl(parent, configuration);
        // Install a listener for paste to update this editors
        // language if the paste includes a specific language
        const control = this.editorControl;
        if (control) {
            this._register(control.onDidPaste(e => this.onDidEditorPaste(e, control)));
        }
    }
    onDidEditorPaste(e, codeEditor) {
        if (this.input instanceof UntitledTextEditorInput && this.input.hasLanguageSetExplicitly) {
            return; // do not override language if it was set explicitly
        }
        if (e.range.startLineNumber !== 1 || e.range.startColumn !== 1) {
            return; // document had existing content before the pasted text, don't override.
        }
        if (codeEditor.getOption(104 /* EditorOption.readOnly */)) {
            return; // not for readonly editors
        }
        const textModel = codeEditor.getModel();
        if (!textModel) {
            return; // require a live model
        }
        const pasteIsWholeContents = textModel.getLineCount() === e.range.endLineNumber && textModel.getLineMaxColumn(e.range.endLineNumber) === e.range.endColumn;
        if (!pasteIsWholeContents) {
            return; // document had existing content after the pasted text, don't override.
        }
        const currentLanguageId = textModel.getLanguageId();
        if (currentLanguageId !== PLAINTEXT_LANGUAGE_ID) {
            return; // require current languageId to be unspecific
        }
        let candidateLanguage = undefined;
        // A languageId is provided via the paste event so text was copied using
        // VSCode. As such we trust this languageId and use it if specific
        if (e.languageId) {
            candidateLanguage = { id: e.languageId, source: 'event' };
        }
        // A languageId was not provided, so the data comes from outside VSCode
        // We can still try to guess a good languageId from the first line if
        // the paste changed the first line
        else {
            const guess = this.languageService.guessLanguageIdByFilepathOrFirstLine(textModel.uri, textModel.getLineContent(1).substr(0, 1000 /* ModelConstants.FIRST_LINE_DETECTION_LENGTH_LIMIT */)) ?? undefined;
            if (guess) {
                candidateLanguage = { id: guess, source: 'guess' };
            }
        }
        // Finally apply languageId to model if specified
        if (candidateLanguage && candidateLanguage.id !== PLAINTEXT_LANGUAGE_ID) {
            if (this.input instanceof UntitledTextEditorInput && candidateLanguage.source === 'event') {
                // High confidence, set language id at TextEditorModel level to block future auto-detection
                this.input.setLanguageId(candidateLanguage.id);
            }
            else {
                textModel.setLanguage(this.languageService.createById(candidateLanguage.id));
            }
            const opts = this.modelService.getCreationOptions(textModel.getLanguageId(), textModel.uri, textModel.isForSimpleWidget);
            textModel.detectIndentation(opts.insertSpaces, opts.tabSize);
        }
    }
};
TextResourceEditor = TextResourceEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IInstantiationService),
    __param(3, IStorageService),
    __param(4, ITextResourceConfigurationService),
    __param(5, IThemeService),
    __param(6, IEditorService),
    __param(7, IEditorGroupsService),
    __param(8, IModelService),
    __param(9, ILanguageService),
    __param(10, IFileService)
], TextResourceEditor);
export { TextResourceEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFJlc291cmNlRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFeEUsT0FBTyxFQUFzQixxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXRGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2pGLE9BQU8sRUFBbUMsdUJBQXVCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUM3SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNoRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDcEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxGLE9BQU8sRUFBZ0Isb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUU1RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFB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