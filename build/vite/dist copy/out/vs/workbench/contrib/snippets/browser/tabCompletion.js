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
var TabCompletionController_1;
import { RawContextKey, IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ISnippetsService } from './snippets.js';
import { getNonWhitespacePrefix } from './snippetsService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { registerEditorContribution, EditorCommand, registerEditorCommand } from '../../../../editor/browser/editorExtensions.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { showSimpleSuggestions } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { SnippetCompletion } from './snippetCompletionProvider.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { EditorState } from '../../../../editor/contrib/editorState/browser/editorState.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
let TabCompletionController = class TabCompletionController {
    static { TabCompletionController_1 = this; }
    static { this.ID = 'editor.tabCompletionController'; }
    static { this.ContextKey = new RawContextKey('hasSnippetCompletions', undefined); }
    static get(editor) {
        return editor.getContribution(TabCompletionController_1.ID);
    }
    constructor(_editor, _snippetService, _clipboardService, _languageFeaturesService, contextKeyService) {
        this._editor = _editor;
        this._snippetService = _snippetService;
        this._clipboardService = _clipboardService;
        this._languageFeaturesService = _languageFeaturesService;
        this._activeSnippets = [];
        this._hasSnippets = TabCompletionController_1.ContextKey.bindTo(contextKeyService);
        this._configListener = this._editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(139 /* EditorOption.tabCompletion */)) {
                this._update();
            }
        });
        this._update();
    }
    dispose() {
        this._configListener.dispose();
        this._selectionListener?.dispose();
    }
    _update() {
        const enabled = this._editor.getOption(139 /* EditorOption.tabCompletion */) === 'onlySnippets';
        if (this._enabled !== enabled) {
            this._enabled = enabled;
            if (!this._enabled) {
                this._selectionListener?.dispose();
            }
            else {
                this._selectionListener = this._editor.onDidChangeCursorSelection(e => this._updateSnippets());
                if (this._editor.getModel()) {
                    this._updateSnippets();
                }
            }
        }
    }
    _updateSnippets() {
        // reset first
        this._activeSnippets = [];
        this._completionProvider?.dispose();
        if (!this._editor.hasModel()) {
            return;
        }
        // lots of dance for getting the
        const selection = this._editor.getSelection();
        const model = this._editor.getModel();
        model.tokenization.tokenizeIfCheap(selection.positionLineNumber);
        const id = model.getLanguageIdAtPosition(selection.positionLineNumber, selection.positionColumn);
        const snippets = this._snippetService.getSnippetsSync(id, model.uri);
        if (!snippets) {
            // nothing for this language
            this._hasSnippets.set(false);
            return;
        }
        if (Range.isEmpty(selection)) {
            // empty selection -> real text (no whitespace) left of cursor
            const prefix = getNonWhitespacePrefix(model, selection.getPosition());
            if (prefix) {
                for (const snippet of snippets) {
                    if (prefix.endsWith(snippet.prefix)) {
                        this._activeSnippets.push(snippet);
                    }
                }
            }
        }
        else if (!Range.spansMultipleLines(selection) && model.getValueLengthInRange(selection) <= 100) {
            // actual selection -> snippet must be a full match
            const selected = model.getValueInRange(selection);
            if (selected) {
                for (const snippet of snippets) {
                    if (selected === snippet.prefix) {
                        this._activeSnippets.push(snippet);
                    }
                }
            }
        }
        const len = this._activeSnippets.length;
        if (len === 0) {
            this._hasSnippets.set(false);
        }
        else if (len === 1) {
            this._hasSnippets.set(true);
        }
        else {
            this._hasSnippets.set(true);
            this._completionProvider = {
                _debugDisplayName: 'tabCompletion',
                dispose: () => {
                    registration.dispose();
                },
                provideCompletionItems: (_model, position) => {
                    if (_model !== model || !selection.containsPosition(position)) {
                        return;
                    }
                    const suggestions = this._activeSnippets.map(snippet => {
                        const range = Range.fromPositions(position.delta(0, -snippet.prefix.length), position);
                        return new SnippetCompletion(snippet, range);
                    });
                    return { suggestions };
                }
            };
            const registration = this._languageFeaturesService.completionProvider.register({ language: model.getLanguageId(), pattern: model.uri.fsPath, scheme: model.uri.scheme }, this._completionProvider);
        }
    }
    async performSnippetCompletions() {
        if (!this._editor.hasModel()) {
            return;
        }
        if (this._activeSnippets.length === 1) {
            // one -> just insert
            const [snippet] = this._activeSnippets;
            // async clipboard access might be required and in that case
            // we need to check if the editor has changed in flight and then
            // bail out (or be smarter than that)
            let clipboardText;
            if (snippet.needsClipboard) {
                const state = new EditorState(this._editor, 1 /* CodeEditorStateFlag.Value */ | 4 /* CodeEditorStateFlag.Position */);
                clipboardText = await this._clipboardService.readText();
                if (!state.validate(this._editor)) {
                    return;
                }
            }
            SnippetController2.get(this._editor)?.insert(snippet.codeSnippet, {
                overwriteBefore: snippet.prefix.length, overwriteAfter: 0,
                clipboardText
            });
        }
        else if (this._activeSnippets.length > 1) {
            // two or more -> show IntelliSense box
            if (this._completionProvider) {
                showSimpleSuggestions(this._editor, this._completionProvider);
            }
        }
    }
};
TabCompletionController = TabCompletionController_1 = __decorate([
    __param(1, ISnippetsService),
    __param(2, IClipboardService),
    __param(3, ILanguageFeaturesService),
    __param(4, IContextKeyService)
], TabCompletionController);
export { TabCompletionController };
registerEditorContribution(TabCompletionController.ID, TabCompletionController, 0 /* EditorContributionInstantiation.Eager */); // eager because it needs to define a context key
const TabCompletionCommand = EditorCommand.bindToContribution(TabCompletionController.get);
registerEditorCommand(new TabCompletionCommand({
    id: 'insertSnippet',
    precondition: TabCompletionController.ContextKey,
    handler: x => x.performSnippetCompletions(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */,
        kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, EditorContextKeys.tabDoesNotMoveFocus, SnippetController2.InSnippetMode.toNegated()),
        primary: 2 /* KeyCode.Tab */
    }
}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFiQ29tcGxldGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NuaXBwZXRzL2Jyb3dzZXIvdGFiQ29tcGxldGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxjQUFjLEVBQWUsTUFBTSxzREFBc0QsQ0FBQztBQUV0SSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDakQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFHOUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxhQUFhLEVBQUUscUJBQXFCLEVBQW1DLE1BQU0sZ0RBQWdELENBQUM7QUFDbkssT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDOUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFHbkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUYsT0FBTyxFQUFFLFdBQVcsRUFBdUIsTUFBTSwrREFBK0QsQ0FBQztBQUNqSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUczRixJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF1Qjs7YUFFbkIsT0FBRSxHQUFHLGdDQUFnQyxBQUFuQyxDQUFvQzthQUV0QyxlQUFVLEdBQUcsSUFBSSxhQUFhLENBQVUsdUJBQXVCLEVB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