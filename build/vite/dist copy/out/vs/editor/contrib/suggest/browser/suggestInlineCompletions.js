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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FuzzyScore } from '../../../../base/common/filters.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, RefCountedDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { Range } from '../../../common/core/range.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { CompletionModel, LineContext } from './completionModel.js';
import { CompletionOptions, provideSuggestionItems, QuickSuggestionsOptions } from './suggest.js';
import { ISuggestMemoryService } from './suggestMemory.js';
import { SuggestModel } from './suggestModel.js';
import { WordDistance } from './wordDistance.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
class SuggestInlineCompletion {
    constructor(range, insertText, filterText, additionalTextEdits, command, gutterMenuLinkAction, completion) {
        this.range = range;
        this.insertText = insertText;
        this.filterText = filterText;
        this.additionalTextEdits = additionalTextEdits;
        this.command = command;
        this.gutterMenuLinkAction = gutterMenuLinkAction;
        this.completion = completion;
        this.doNotLog = true;
    }
}
let InlineCompletionResults = class InlineCompletionResults extends RefCountedDisposable {
    constructor(model, line, word, completionModel, completions, _suggestMemoryService) {
        super(completions.disposable);
        this.model = model;
        this.line = line;
        this.word = word;
        this.completionModel = completionModel;
        this._suggestMemoryService = _suggestMemoryService;
    }
    canBeReused(model, line, word) {
        return this.model === model // same model
            && this.line === line
            && this.word.word.length > 0
            && this.word.startColumn === word.startColumn && this.word.endColumn < word.endColumn // same word
            && this.completionModel.getIncompleteProvider().size === 0; // no incomplete results
    }
    get items() {
        const result = [];
        // Split items by preselected index. This ensures the memory-selected item shows first and that better/worst
        // ranked items are before/after
        const { items } = this.completionModel;
        const selectedIndex = this._suggestMemoryService.select(this.model, { lineNumber: this.line, column: this.word.endColumn + this.completionModel.lineContext.characterCountDelta }, items);
        const first = Iterable.slice(items, selectedIndex);
        const second = Iterable.slice(items, 0, selectedIndex);
        let resolveCount = 5;
        for (const item of Iterable.concat(first, second)) {
            if (item.score === FuzzyScore.Default) {
                // skip items that have no overlap
                continue;
            }
            const range = new Range(item.editStart.lineNumber, item.editStart.column, item.editInsertEnd.lineNumber, item.editInsertEnd.column + this.completionModel.lineContext.characterCountDelta // end PLUS character delta
            );
            const insertText = item.completion.insertTextRules && (item.completion.insertTextRules & 4 /* CompletionItemInsertTextRule.InsertAsSnippet */)
                ? { snippet: item.completion.insertText }
                : item.completion.insertText;
            result.push(new SuggestInlineCompletion(range, insertText, item.filterTextLow ?? item.labelLow, item.completion.additionalTextEdits, item.completion.command, item.completion.action, item));
            // resolve the first N suggestions eagerly
            if (resolveCount-- >= 0) {
                item.resolve(CancellationToken.None);
            }
        }
        return result;
    }
};
InlineCompletionResults = __decorate([
    __param(5, ISuggestMemoryService)
], InlineCompletionResults);
let SuggestInlineCompletions = class SuggestInlineCompletions extends Disposable {
    constructor(_languageFeatureService, _clipboardService, _suggestMemoryService, _editorService) {
        super();
        this._languageFeatureService = _languageFeatureService;
        this._clipboardService = _clipboardService;
        this._suggestMemoryService = _suggestMemoryService;
        this._editorService = _editorService;
        this._store.add(_languageFeatureService.inlineCompletionsProvider.register('*', this));
    }
    async provideInlineCompletions(model, position, context, token) {
        if (context.selectedSuggestionInfo) {
            return;
        }
        let editor;
        for (const candidate of this._editorService.listCodeEditors()) {
            if (candidate.getModel() === model) {
                editor = candidate;
                break;
            }
        }
        if (!editor) {
            return;
        }
        const config = editor.getOption(102 /* EditorOption.quickSuggestions */);
        if (QuickSuggestionsOptions.isAllOff(config)) {
            // quick suggest is off (for this model/language)
            return;
        }
        model.tokenization.tokenizeIfCheap(position.lineNumber);
        const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
        const tokenType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(Math.max(position.column - 1 - 1, 0)));
        if (QuickSuggestionsOptions.valueFor(config, tokenType) !== 'inline') {
            // quick suggest is off (for this token)
            return undefined;
        }
        // We consider non-empty leading words and trigger characters. The latter only
        // when no word is being typed (word characters superseed trigger characters)
        let wordInfo = model.getWordAtPosition(position);
        let triggerCharacterInfo;
        if (!wordInfo?.word) {
            triggerCharacterInfo = this._getTriggerCharacterInfo(model, position);
        }
        if (!wordInfo?.word && !triggerCharacterInfo) {
            // not at word, not a trigger character
            return;
        }
        // ensure that we have word information and that we are at the end of a word
        // otherwise we stop because we don't want to do quick suggestions inside words
        if (!wordInfo) {
            wordInfo = model.getWordUntilPosition(position);
        }
        if (wordInfo.endColumn !== position.column) {
            return;
        }
        let result;
        const leadingLineContents = model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column));
        if (!triggerCharacterInfo && this._lastResult?.canBeReused(model, position.lineNumber, wordInfo)) {
            // reuse a previous result iff possible, only a refilter is needed
            // TODO@jrieken this can be improved further and only incomplete results can be updated
            // console.log(`REUSE with ${wordInfo.word}`);
            const newLineContext = new LineContext(leadingLineContents, position.column - this._lastResult.word.endColumn);
            this._lastResult.completionModel.lineContext = newLineContext;
            this._lastResult.acquire();
            result = this._lastResult;
        }
        else {
            // refesh model is required
            const completions = await provideSuggestionItems(this._languageFeatureService.completionProvider, model, position, new CompletionOptions(undefined, SuggestModel.createSuggestFilter(editor).itemKind, triggerCharacterInfo?.providers), triggerCharacterInfo && { triggerKind: 1 /* CompletionTriggerKind.TriggerCharacter */, triggerCharacter: triggerCharacterInfo.ch }, token);
            let clipboardText;
            if (completions.needsClipboard) {
                clipboardText = await this._clipboardService.readText();
            }
            const completionModel = new CompletionModel(completions.items, position.column, new LineContext(leadingLineContents, 0), WordDistance.None, editor.getOption(134 /* EditorOption.suggest */), editor.getOption(128 /* EditorOption.snippetSuggestions */), { boostFullMatch: false, firstMatchCanBeWeak: false }, clipboardText);
            result = new InlineCompletionResults(model, position.lineNumber, wordInfo, completionModel, completions, this._suggestMemoryService);
        }
        this._lastResult = result;
        return result;
    }
    handleItemDidShow(_completions, item) {
        item.completion.resolve(CancellationToken.None);
    }
    disposeInlineCompletions(result) {
        result.release();
    }
    _getTriggerCharacterInfo(model, position) {
        const ch = model.getValueInRange(Range.fromPositions({ lineNumber: position.lineNumber, column: position.column - 1 }, position));
        const providers = new Set();
        for (const provider of this._languageFeatureService.completionProvider.all(model)) {
            if (provider.triggerCharacters?.includes(ch)) {
                providers.add(provider);
            }
        }
        if (providers.size === 0) {
            return undefined;
        }
        return { providers, ch };
    }
};
SuggestInlineCompletions = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IClipboardService),
    __param(2, ISuggestMemoryService),
    __param(3, ICodeEditorService)
], SuggestInlineCompletions);
export { SuggestInlineCompletions };
registerEditorFeature(SuggestInlineCompletions);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdElubGluZUNvbXBsZXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RJbmxpbmVDb21wbGV0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV4RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUlwRixPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFOUQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHMUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNwRSxPQUFPLEVBQXVDLGlCQUFpQixFQUFFLHNCQUFzQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDakQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFOUYsTUFBTSx1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