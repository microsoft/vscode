/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { compareBy, numberComparator } from '../../../../../base/common/arrays.js';
import { findFirstMax } from '../../../../../base/common/arraysFind.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { SelectedSuggestionInfo } from '../../../../common/languages.js';
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';
import { SnippetParser } from '../../../snippet/browser/snippetParser.js';
import { SnippetSession } from '../../../snippet/browser/snippetSession.js';
import { SuggestController } from '../../../suggest/browser/suggestController.js';
import { observableFromEvent } from '../../../../../base/common/observable.js';
export class SuggestWidgetAdaptor extends Disposable {
    get selectedItem() {
        return this._currentSuggestItemInfo;
    }
    constructor(editor, suggestControllerPreselector, onWillAccept) {
        super();
        this.editor = editor;
        this.suggestControllerPreselector = suggestControllerPreselector;
        this.onWillAccept = onWillAccept;
        this.isSuggestWidgetVisible = false;
        this.isShiftKeyPressed = false;
        this._isActive = false;
        this._currentSuggestItemInfo = undefined;
        this._onDidSelectedItemChange = this._register(new Emitter());
        this.onDidSelectedItemChange = this._onDidSelectedItemChange.event;
        // See the command acceptAlternativeSelectedSuggestion that is bound to shift+tab
        this._register(editor.onKeyDown(e => {
            if (e.shiftKey && !this.isShiftKeyPressed) {
                this.isShiftKeyPressed = true;
                this.update(this._isActive);
            }
        }));
        this._register(editor.onKeyUp(e => {
            if (e.shiftKey && this.isShiftKeyPressed) {
                this.isShiftKeyPressed = false;
                this.update(this._isActive);
            }
        }));
        const suggestController = SuggestController.get(this.editor);
        if (suggestController) {
            this._register(suggestController.registerSelector({
                priority: 100,
                select: (model, pos, suggestItems) => {
                    const textModel = this.editor.getModel();
                    if (!textModel) {
                        // Should not happen
                        return -1;
                    }
                    const i = this.suggestControllerPreselector();
                    const itemToPreselect = i ? singleTextRemoveCommonPrefix(i, textModel) : undefined;
                    if (!itemToPreselect) {
                        return -1;
                    }
                    const position = Position.lift(pos);
                    const candidates = suggestItems
                        .map((suggestItem, index) => {
                        const suggestItemInfo = SuggestItemInfo.fromSuggestion(suggestController, textModel, position, suggestItem, this.isShiftKeyPressed);
                        const suggestItemTextEdit = singleTextRemoveCommonPrefix(suggestItemInfo.getSingleTextEdit(), textModel);
                        const valid = singleTextEditAugments(itemToPreselect, suggestItemTextEdit);
                        return { index, valid, prefixLength: suggestItemTextEdit.text.length, suggestItem };
                    })
                        .filter(item => item && item.valid && item.prefixLength > 0);
                    const result = findFirstMax(candidates, compareBy(s => s.prefixLength, numberComparator));
                    return result ? result.index : -1;
                }
            }));
            let isBoundToSuggestWidget = false;
            const bindToSuggestWidget = () => {
                if (isBoundToSuggestWidget) {
                    return;
                }
                isBoundToSuggestWidget = true;
                this._register(suggestController.widget.value.onDidShow(() => {
                    this.isSuggestWidgetVisible = true;
                    this.update(true);
                }));
                this._register(suggestController.widget.value.onDidHide(() => {
                    this.isSuggestWidgetVisible = false;
                    this.update(false);
                }));
                this._register(suggestController.widget.value.onDidFocus(() => {
                    this.isSuggestWidgetVisible = true;
                    this.update(true);
                }));
            };
            this._register(Event.once(suggestController.model.onDidTrigger)(e => {
                bindToSuggestWidget();
            }));
            this._register(suggestController.onWillInsertSuggestItem(e => {
                const position = this.editor.getPosition();
                const model = this.editor.getModel();
                if (!position || !model) {
                    return undefined;
                }
                const suggestItemInfo = SuggestItemInfo.fromSuggestion(suggestController, model, position, e.item, this.isShiftKeyPressed);
                this.onWillAccept(suggestItemInfo);
            }));
        }
        this.update(this._isActive);
    }
    update(newActive) {
        const newInlineCompletion = this.getSuggestItemInfo();
        if (this._isActive !== newActive || !suggestItemInfoEquals(this._currentSuggestItemInfo, newInlineCompletion)) {
            this._isActive = newActive;
            this._currentSuggestItemInfo = newInlineCompletion;
            this._onDidSelectedItemChange.fire();
        }
    }
    getSuggestItemInfo() {
        const suggestController = SuggestController.get(this.editor);
        if (!suggestController || !this.isSuggestWidgetVisible) {
            return undefined;
        }
        // When offWhenInlineCompletions is active, don't expose the selected
        // suggest item to the inline completions model so that it does not
        // trigger an inline completion request while the suggest widget is open
        const quickSuggestions = this.editor.getOption(102 /* EditorOption.quickSuggestions */);
        if (typeof quickSuggestions === 'object'
            && (quickSuggestions.other === 'offWhenInlineCompletions'
                || quickSuggestions.comments === 'offWhenInlineCompletions'
                || quickSuggestions.strings === 'offWhenInlineCompletions')) {
            return undefined;
        }
        const focusedItem = suggestController.widget.value.getFocusedItem();
        const position = this.editor.getPosition();
        const model = this.editor.getModel();
        if (!focusedItem || !position || !model) {
            return undefined;
        }
        return SuggestItemInfo.fromSuggestion(suggestController, model, position, focusedItem.item, this.isShiftKeyPressed);
    }
    stopForceRenderingAbove() {
        const suggestController = SuggestController.get(this.editor);
        suggestController?.stopForceRenderingAbove();
    }
    forceRenderingAbove() {
        const suggestController = SuggestController.get(this.editor);
        suggestController?.forceRenderingAbove();
    }
}
export class SuggestItemInfo {
    static fromSuggestion(suggestController, model, position, item, toggleMode) {
        let { insertText } = item.completion;
        let isSnippetText = false;
        if (item.completion.insertTextRules & 4 /* CompletionItemInsertTextRule.InsertAsSnippet */) {
            const snippet = new SnippetParser().parse(insertText);
            if (snippet.children.length < 100) {
                // Adjust whitespace is expensive.
                SnippetSession.adjustWhitespace(model, position, true, snippet);
            }
            insertText = snippet.toString();
            isSnippetText = true;
        }
        const info = suggestController.getOverwriteInfo(item, toggleMode);
        return new SuggestItemInfo(Range.fromPositions(position.delta(0, -info.overwriteBefore), position.delta(0, Math.max(info.overwriteAfter, 0))), insertText, item.completion.kind, isSnippetText, item.container.incomplete ?? false);
    }
    constructor(range, insertText, completionItemKind, isSnippetText, listIncomplete) {
        this.range = range;
        this.insertText = insertText;
        this.completionItemKind = completionItemKind;
        this.isSnippetText = isSnippetText;
        this.listIncomplete = listIncomplete;
    }
    equals(other) {
        return this.range.equalsRange(other.range)
            && this.insertText === other.insertText
            && this.completionItemKind === other.completionItemKind
            && this.isSnippetText === other.isSnippetText;
    }
    toSelectedSuggestionInfo() {
        return new SelectedSuggestionInfo(this.range, this.insertText, this.completionItemKind, this.isSnippetText);
    }
    getSingleTextEdit() {
        return new TextReplacement(this.range, this.insertText);
    }
}
function suggestItemInfoEquals(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return a.equals(b);
}
export class ObservableSuggestWidgetAdapter extends Disposable {
    constructor(_editorObs, _handleSuggestAccepted, _suggestControllerPreselector) {
        super();
        this._editorObs = _editorObs;
        this._handleSuggestAccepted = _handleSuggestAccepted;
        this._suggestControllerPreselector = _suggestControllerPreselector;
        this._suggestWidgetAdaptor = this._register(new SuggestWidgetAdaptor(this._editorObs.editor, () => {
            this._editorObs.forceUpdate();
            return this._suggestControllerPreselector();
        }, (item) => this._editorObs.forceUpdate(_tx => {
            /** @description InlineCompletionsController.handleSuggestAccepted */
            this._handleSuggestAccepted(item);
        })));
        this.selectedItem = observableFromEvent(this, cb => this._suggestWidgetAdaptor.onDidSelectedItemChange(() => {
            this._editorObs.forceUpdate(_tx => cb(undefined));
        }), () => this._suggestWidgetAdaptor.selectedItem);
    }
    stopForceRenderingAbove() {
        this._suggestWidgetAdaptor.stopForceRenderingAbove();
    }
    forceRenderingAbove() {
        this._suggestWidgetAdaptor.forceRenderingAbove();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdFdpZGdldEFkYXB0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL3N1Z2dlc3RXaWRnZXRBZGFwdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDNUUsT0FBTyxFQUFvRCxzQkFBc0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTNILE9BQU8sRUFBRSxzQkFBc0IsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ2xHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHL0UsTUFBTSxPQUFPLG9CQUFxQixTQUFRLFVBQVU7SUFLbkQsSUFBVyxZQUFZO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLHVC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