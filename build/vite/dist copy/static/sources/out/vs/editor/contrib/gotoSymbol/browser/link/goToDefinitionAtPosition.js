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
var GotoDefinitionAtPositionEditorContribution_1;
import { createCancelablePromise } from '../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import './goToDefinitionAtPosition.css';
import { EditorState } from '../../../editorState/browser/editorState.js';
import { registerEditorContribution } from '../../../../browser/editorExtensions.js';
import { Range } from '../../../../common/core/range.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { ITextModelService } from '../../../../common/services/resolverService.js';
import { ClickLinkGesture } from './clickLinkGesture.js';
import { PeekContext } from '../../../peekView/browser/peekView.js';
import * as nls from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { DefinitionAction } from '../goToCommands.js';
import { getDefinitionsAtPosition } from '../goToSymbol.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { ModelDecorationInjectedTextOptions } from '../../../../common/model/textModel.js';
let GotoDefinitionAtPositionEditorContribution = class GotoDefinitionAtPositionEditorContribution {
    static { GotoDefinitionAtPositionEditorContribution_1 = this; }
    static { this.ID = 'editor.contrib.gotodefinitionatposition'; }
    static { this.MAX_SOURCE_PREVIEW_LINES = 8; }
    constructor(editor, textModelResolverService, languageService, languageFeaturesService) {
        this.textModelResolverService = textModelResolverService;
        this.languageService = languageService;
        this.languageFeaturesService = languageFeaturesService;
        this.toUnhook = new DisposableStore();
        this.toUnhookForKeyboard = new DisposableStore();
        this.currentWordAtPosition = null;
        this.previousPromise = null;
        this.editor = editor;
        this.linkDecorations = this.editor.createDecorationsCollection();
        const linkGesture = new ClickLinkGesture(editor);
        this.toUnhook.add(linkGesture);
        this.toUnhook.add(linkGesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, keyboardEvent]) => {
            this.startFindDefinitionFromMouse(mouseEvent, keyboardEvent ?? undefined);
        }));
        this.toUnhook.add(linkGesture.onExecute((mouseEvent) => {
            if (this.isEnabled(mouseEvent)) {
                this.gotoDefinition(mouseEvent.target.position, mouseEvent.hasSideBySideModifier)
                    .catch((error) => {
                    onUnexpectedError(error);
                })
                    .finally(() => {
                    this.removeLinkDecorations();
                });
            }
        }));
        this.toUnhook.add(linkGesture.onCancel(() => {
            this.removeLinkDecorations();
            this.currentWordAtPosition = null;
        }));
    }
    static get(editor) {
        return editor.getContribution(GotoDefinitionAtPositionEditorContribution_1.ID);
    }
    async startFindDefinitionFromCursor(position) {
        // For issue: https://github.com/microsoft/vscode/issues/46257
        // equivalent to mouse move with meta/ctrl key
        // First find the definition and add decorations
        // to the editor to be shown with the content hover widget
        await this.startFindDefinition(position);
        // Add listeners for editor cursor move and key down events
        // Dismiss the "extended" editor decorations when the user hides
        // the hover widget. There is no event for the widget itself so these
        // serve as a best effort. After removing the link decorations, the hover
        // widget is clean and will only show declarations per next request.
        this.toUnhookForKeyboard.add(this.editor.onDidChangeCursorPosition(() => {
            this.currentWordAtPosition = null;
            this.removeLinkDecorations();
            this.toUnhookForKeyboard.clear();
        }));
        this.toUnhookForKeyboard.add(this.editor.onKeyDown((e) => {
            if (e) {
                this.currentWordAtPosition = null;
                this.removeLinkDecorations();
                this.toUnhookForKeyboard.clear();
            }
        }));
    }
    startFindDefinitionFromMouse(mouseEvent, withKey) {
        // check if we are active and on a content widget
        if (mouseEvent.target.type === 9 /* MouseTargetType.CONTENT_WIDGET */ && this.linkDecorations.length > 0) {
            return;
        }
        if (!this.editor.hasModel() || !this.isEnabled(mouseEvent, withKey)) {
            this.currentWordAtPosition = null;
            this.removeLinkDecorations();
            return;
        }
        const position = mouseEvent.target.position;
        this.startFindDefinition(position);
    }
    async startFindDefinition(position) {
        // Dispose listeners for updating decorations when using keyboard to show definition hover
        this.toUnhookForKeyboard.clear();
        // Find word at mouse position
        const word = position ? this.editor.getModel()?.getWordAtPosition(position) : null;
        if (!word) {
            this.currentWordAtPosition = null;
            this.removeLinkDecorations();
            return;
        }
        // Return early if word at position is still the same
        if (this.currentWordAtPosition && this.currentWordAtPosition.startColumn === word.startColumn && this.currentWordAtPosition.endColumn === word.endColumn && this.currentWordAtPosition.word === word.word) {
            return;
        }
        this.currentWordAtPosition = word;
        // Find definition and decorate word if found
        const state = new EditorState(this.editor, 4 /* CodeEditorStateFlag.Position */ | 1 /* CodeEditorStateFlag.Value */ | 2 /* CodeEditorStateFlag.Selection */ | 8 /* CodeEditorStateFlag.Scroll */);
        if (this.previousPromise) {
            this.previousPromise.cancel();
            this.previousPromise = null;
        }
        this.previousPromise = createCancelablePromise(token => this.findDefinition(position, token));
        let results;
        try {
            results = await this.previousPromise;
        }
        catch (error) {
            onUnexpectedError(error);
            return;
        }
        if (!results || !results.length || !state.validate(this.editor)) {
            this.removeLinkDecorations();
            return;
        }
        const linkRange = results[0].originSelectionRange
            ? Range.lift(results[0].originSelectionRange)
            : new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        // Multiple results
        if (results.length > 1) {
            let combinedRange = linkRange;
            for (const { originSelectionRange } of results) {
                if (originSelectionRange) {
                    combinedRange = Range.plusRange(combinedRange, originSelectionRange);
                }
            }
            this.addDecoration(combinedRange, new MarkdownString().appendText(nls.localize('multipleResults', "Click to show {0} definitions.", results.length)));
        }
        else {
            // Single result
            const result = results[0];
            if (!result.uri) {
                return;
            }
            return this.textModelResolverService.createModelReference(result.uri).then(ref => {
                if (!ref.object || !ref.object.textEditorModel) {
                    ref.dispose();
                    return;
                }
                const { object: { textEditorModel } } = ref;
                const { startLineNumber } = result.range;
                if (startLineNumber < 1 || startLineNumber > textEditorModel.getLineCount()) {
                    // invalid range
                    ref.dispose();
                    return;
                }
                const previewValue = this.getPreviewValue(textEditorModel, startLineNumber, result);
                const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(textEditorModel.uri);
                this.addDecoration(linkRange, previewValue ? new MarkdownString().appendCodeblock(languageId ? languageId : '', previewValue) : undefined);
                ref.dispose();
            });
        }
    }
    getPreviewValue(textEditorModel, startLineNumber, result) {
        let rangeToUse = result.range;
        const numberOfLinesInRange = rangeToUse.endLineNumber - rangeToUse.startLineNumber;
        if (numberOfLinesInRange >= GotoDefinitionAtPositionEditorContribution_1.MAX_SOURCE_PREVIEW_LINES) {
            rangeToUse = this.getPreviewRangeBasedOnIndentation(textEditorModel, startLineNumber);
        }
        rangeToUse = textEditorModel.validateRange(rangeToUse);
        const previewValue = this.stripIndentationFromPreviewRange(textEditorModel, startLineNumber, rangeToUse);
        return previewValue;
    }
    stripIndentationFromPreviewRange(textEditorModel, startLineNumber, previewRange) {
        const startIndent = textEditorModel.getLineFirstNonWhitespaceColumn(startLineNumber);
        let minIndent = startIndent;
        for (let endLineNumber = startLineNumber + 1; endLineNumber < previewRange.endLineNumber; endLineNumber++) {
            const endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);
            minIndent = Math.min(minIndent, endIndent);
        }
        const previewValue = textEditorModel.getValueInRange(previewRange).replace(new RegExp(`^\\s{${minIndent - 1}}`, 'gm'), '').trim();
        return previewValue;
    }
    getPreviewRangeBasedOnIndentation(textEditorModel, startLineNumber) {
        const startIndent = textEditorModel.getLineFirstNonWhitespaceColumn(startLineNumber);
        const maxLineNumber = Math.min(textEditorModel.getLineCount(), startLineNumber + GotoDefinitionAtPositionEditorContribution_1.MAX_SOURCE_PREVIEW_LINES);
        let endLineNumber = startLineNumber + 1;
        for (; endLineNumber < maxLineNumber; endLineNumber++) {
            const endIndent = textEditorModel.getLineFirstNonWhitespaceColumn(endLineNumber);
            if (startIndent === endIndent) {
                break;
            }
        }
        return new Range(startLineNumber, 1, endLineNumber + 1, 1);
    }
    addDecoration(range, hoverMessage) {
        const newDecorations = {
            range: range,
            options: {
                description: 'goto-definition-link',
                inlineClassName: 'goto-definition-link',
                hoverMessage
            }
        };
        this.linkDecorations.set([newDecorations]);
    }
    removeLinkDecorations() {
        this.linkDecorations.clear();
    }
    isEnabled(mouseEvent, withKey) {
        return this.editor.hasModel()
            && mouseEvent.isLeftClick
            && mouseEvent.isNoneOrSingleMouseDown
            && mouseEvent.target.type === 6 /* MouseTargetType.CONTENT_TEXT */
            && !(mouseEvent.target.detail.injectedText?.options instanceof ModelDecorationInjectedTextOptions)
            && (mouseEvent.hasTriggerModifier || (withKey ? withKey.keyCodeIsTriggerKey : false))
            && this.languageFeaturesService.definitionProvider.has(this.editor.getModel());
    }
    findDefinition(position, token) {
        const model = this.editor.getModel();
        if (!model) {
            return Promise.resolve(null);
        }
        return getDefinitionsAtPosition(this.languageFeaturesService.definitionProvider, model, position, false, token);
    }
    async gotoDefinition(position, openToSide) {
        this.editor.setPosition(position);
        return this.editor.invokeWithinContext((accessor) => {
            const canPeek = !openToSide && this.editor.getOption(101 /* EditorOption.definitionLinkOpensInPeek */) && !this.isInPeekEditor(accessor);
            const action = new DefinitionAction({ openToSide, openInPeek: canPeek, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
            return action.run(accessor);
        });
    }
    isInPeekEditor(accessor) {
        const contextKeyService = accessor.get(IContextKeyService);
        return PeekContext.inPeekEditor.getValue(contextKeyService);
    }
    dispose() {
        this.toUnhook.dispose();
        this.toUnhookForKeyboard.dispose();
    }
};
GotoDefinitionAtPositionEditorContribution = GotoDefinitionAtPositionEditorContribution_1 = __decorate([
    __param(1, ITextModelService),
    __param(2, ILanguageService),
    __param(3, ILanguageFeaturesService)
], GotoDefinitionAtPositionEditorContribution);
export { GotoDefinitionAtPositionEditorContribution };
registerEditorContribution(GotoDefinitionAtPositionEditorContribution.ID, GotoDefinitionAtPositionEditorContribution, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ29Ub0RlZmluaXRpb25BdFBvc2l0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2xpbmsvZ29Ub0RlZmluaXRpb25BdFBvc2l0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFakcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLGdDQUFnQyxDQUFDO0FBQ3hDLE9BQU8sRUFBdUIsV0FBVyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFL0YsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBR3RILE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUlqRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsZ0JBQWdCLEVBQStDLE1BQU0sdUJBQXVCLENBQUM7QUFDdEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFDN0MsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFN0YsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDdEQsT0FBTyxFQUFFLHdCQUF3QixF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