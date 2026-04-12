/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorOptions } from '../../../../common/config/editorOptions.js';
import { CompletionModel } from '../../browser/completionModel.js';
import { CompletionItem, getSuggestionComparator } from '../../browser/suggest.js';
import { WordDistance } from '../../browser/wordDistance.js';
export function createSuggestItem(label, overwriteBefore, kind = 9 /* languages.CompletionItemKind.Property */, incomplete = false, position = { lineNumber: 1, column: 1 }, sortText, filterText) {
    const suggestion = {
        label,
        sortText,
        filterText,
        range: { startLineNumber: position.lineNumber, startColumn: position.column - overwriteBefore, endLineNumber: position.lineNumber, endColumn: position.column },
        insertText: typeof label === 'string' ? label : label.label,
        kind
    };
    const container = {
        incomplete,
        suggestions: [suggestion]
    };
    const provider = {
        _debugDisplayName: 'test',
        provideCompletionItems() {
            return;
        }
    };
    return new CompletionItem(position, suggestion, container, provider);
}
suite('CompletionModel', function () {
    const defaultOptions = {
        insertMode: 'insert',
        snippetsPreventQuickSuggestions: true,
        filterGraceful: true,
        localityBonus: false,
        shareSuggestSelections: false,
        showIcons: true,
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showDeprecated: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
    };
    let model;
    setup(function () {
        model = new CompletionModel([
            createSuggestItem('foo', 3),
            createSuggestItem('Foo', 3),
            createSuggestItem('foo', 2),
        ], 1, {
            leadingLineContent: 'foo',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('filtering - cached', function () {
        const itemsNow = model.items;
        let itemsThen = model.items;
        assert.ok(itemsNow === itemsThen);
        // still the same context
        model.lineContext = { leadingLineContent: 'foo', characterCountDelta: 0 };
        itemsThen = model.items;
        assert.ok(itemsNow === itemsThen);
        // different context, refilter
        model.lineContext = { leadingLineContent: 'foo1', characterCountDelta: 1 };
        itemsThen = model.items;
        assert.ok(itemsNow !== itemsThen);
    });
    test('complete/incomplete', () => {
        assert.strictEqual(model.getIncompleteProvider().size, 0);
        const incompleteModel = new CompletionModel([
            createSuggestItem('foo', 3, undefined, true),
            createSuggestItem('foo', 2),
        ], 1, {
            leadingLineContent: 'foo',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        assert.strictEqual(incompleteModel.getIncompleteProvider().size, 1);
    });
    test('Fuzzy matching of snippets stopped working with inline snippet suggestions #49895', function () {
        const completeItem1 = createSuggestItem('foobar1', 1, undefined, false, { lineNumber: 1, column: 2 });
        const completeItem2 = createSuggestItem('foobar2', 1, undefined, false, { lineNumber: 1, column: 2 });
        const completeItem3 = createSuggestItem('foobar3', 1, undefined, false, { lineNumber: 1, column: 2 });
        const completeItem4 = createSuggestItem('foobar4', 1, undefined, false, { lineNumber: 1, column: 2 });
        const completeItem5 = createSuggestItem('foobar5', 1, undefined, false, { lineNumber: 1, column: 2 });
        const incompleteItem1 = createSuggestItem('foofoo1', 1, undefined, true, { lineNumber: 1, column: 2 });
        const model = new CompletionModel([
            completeItem1,
            completeItem2,
            completeItem3,
            completeItem4,
            completeItem5,
            incompleteItem1,
        ], 2, { leadingLineContent: 'f', characterCountDelta: 0 }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        assert.strictEqual(model.getIncompleteProvider().size, 1);
        assert.strictEqual(model.items.length, 6);
    });
    test('proper current word when length=0, #16380', function () {
        model = new CompletionModel([
            createSuggestItem('    </div', 4),
            createSuggestItem('a', 0),
            createSuggestItem('p', 0),
            createSuggestItem('    </tag', 4),
            createSuggestItem('    XYZ', 4),
        ], 1, {
            leadingLineContent: '   <',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        assert.strictEqual(model.items.length, 4);
        const [a, b, c, d] = model.items;
        assert.strictEqual(a.completion.label, '    </div');
        assert.strictEqual(b.completion.label, '    </tag');
        assert.strictEqual(c.completion.label, 'a');
        assert.strictEqual(d.completion.label, 'p');
    });
    test('keep snippet sorting with prefix: top, #25495', function () {
        model = new CompletionModel([
            createSuggestItem('Snippet1', 1, 28 /* languages.CompletionItemKind.Snippet */),
            createSuggestItem('tnippet2', 1, 28 /* languages.CompletionItemKind.Snippet */),
            createSuggestItem('semver', 1, 9 /* languages.CompletionItemKind.Property */),
        ], 1, {
            leadingLineContent: 's',
            characterCountDelta: 0
        }, WordDistance.None, defaultOptions, 'top', undefined);
        assert.strictEqual(model.items.length, 2);
        const [a, b] = model.items;
        assert.strictEqual(a.completion.label, 'Snippet1');
        assert.strictEqual(b.completion.label, 'semver');
        assert.ok(a.score < b.score); // snippet really promoted
    });
    test('keep snippet sorting with prefix: bottom, #25495', function () {
        model = new CompletionModel([
            createSuggestItem('snippet1', 1, 28 /* languages.CompletionItemKind.Snippet */),
            createSuggestItem('tnippet2', 1, 28 /* languages.CompletionItemKind.Snippet */),
            createSuggestItem('Semver', 1, 9 /* languages.CompletionItemKind.Property */),
        ], 1, {
            leadingLineContent: 's',
            characterCountDelta: 0
        }, WordDistance.None, defaultOptions, 'bottom', undefined);
        assert.strictEqual(model.items.length, 2);
        const [a, b] = model.items;
        assert.strictEqual(a.completion.label, 'Semver');
        assert.strictEqual(b.completion.label, 'snippet1');
        assert.ok(a.score < b.score); // snippet really demoted
    });
    test('keep snippet sorting with prefix: inline, #25495', function () {
        model = new CompletionModel([
            createSuggestItem('snippet1', 1, 28 /* languages.CompletionItemKind.Snippet */),
            createSuggestItem('tnippet2', 1, 28 /* languages.CompletionItemKind.Snippet */),
            createSuggestItem('Semver', 1),
        ], 1, {
            leadingLineContent: 's',
            characterCountDelta: 0
        }, WordDistance.None, defaultOptions, 'inline', undefined);
        assert.strictEqual(model.items.length, 2);
        const [a, b] = model.items;
        assert.strictEqual(a.completion.label, 'snippet1');
        assert.strictEqual(b.completion.label, 'Semver');
        assert.ok(a.score > b.score); // snippet really demoted
    });
    test('filterText seems ignored in autocompletion, #26874', function () {
        const item1 = createSuggestItem('Map - java.util', 1, undefined, undefined, undefined, undefined, 'Map');
        const item2 = createSuggestItem('Map - java.util', 1);
        model = new CompletionModel([item1, item2], 1, {
            leadingLineContent: 'M',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        assert.strictEqual(model.items.length, 2);
        model.lineContext = {
            leadingLineContent: 'Map ',
            characterCountDelta: 3
        };
        assert.strictEqual(model.items.length, 1);
    });
    test('Vscode 1.12 no longer obeys \'sortText\' in completion items (from language server), #26096', function () {
        const item1 = createSuggestItem('<- groups', 2, 9 /* languages.CompletionItemKind.Property */, false, { lineNumber: 1, column: 3 }, '00002', '  groups');
        const item2 = createSuggestItem('source', 0, 9 /* languages.CompletionItemKind.Property */, false, { lineNumber: 1, column: 3 }, '00001', 'source');
        const items = [item1, item2].sort(getSuggestionComparator(1 /* SnippetSortOrder.Inline */));
        model = new CompletionModel(items, 3, {
            leadingLineContent: '  ',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        assert.strictEqual(model.items.length, 2);
        const [first, second] = model.items;
        assert.strictEqual(first.completion.label, 'source');
        assert.strictEqual(second.completion.label, '<- groups');
    });
    test('Completion item sorting broken when using label details #153026', function () {
        const itemZZZ = createSuggestItem({ label: 'ZZZ' }, 0, 11 /* languages.CompletionItemKind.Operator */, false);
        const itemAAA = createSuggestItem({ label: 'AAA' }, 0, 11 /* languages.CompletionItemKind.Operator */, false);
        const itemIII = createSuggestItem('III', 0, 11 /* languages.CompletionItemKind.Operator */, false);
        const cmp = getSuggestionComparator(1 /* SnippetSortOrder.Inline */);
        const actual = [itemZZZ, itemAAA, itemIII].sort(cmp);
        assert.deepStrictEqual(actual, [itemAAA, itemIII, itemZZZ]);
    });
    test('Score only filtered items when typing more, score all when typing less', function () {
        model = new CompletionModel([
            createSuggestItem('console', 0),
            createSuggestItem('co_new', 0),
            createSuggestItem('bar', 0),
            createSuggestItem('car', 0),
            createSuggestItem('foo', 0),
        ], 1, {
            leadingLineContent: '',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        assert.strictEqual(model.items.length, 5);
        // narrow down once
        model.lineContext = { leadingLineContent: 'c', characterCountDelta: 1 };
        assert.strictEqual(model.items.length, 3);
        // query gets longer, narrow down the narrow-down'ed-set from before
        model.lineContext = { leadingLineContent: 'cn', characterCountDelta: 2 };
        assert.strictEqual(model.items.length, 2);
        // query gets shorter, refilter everything
        model.lineContext = { leadingLineContent: '', characterCountDelta: 0 };
        assert.strictEqual(model.items.length, 5);
    });
    test('Have more relaxed suggest matching algorithm #15419', function () {
        model = new CompletionModel([
            createSuggestItem('result', 0),
            createSuggestItem('replyToUser', 0),
            createSuggestItem('randomLolut', 0),
            createSuggestItem('car', 0),
            createSuggestItem('foo', 0),
        ], 1, {
            leadingLineContent: '',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        // query gets longer, narrow down the narrow-down'ed-set from before
        model.lineContext = { leadingLineContent: 'rlut', characterCountDelta: 4 };
        assert.strictEqual(model.items.length, 3);
        const [first, second, third] = model.items;
        assert.strictEqual(first.completion.label, 'result'); // best with `rult`
        assert.strictEqual(second.completion.label, 'replyToUser'); // best with `rltu`
        assert.strictEqual(third.completion.label, 'randomLolut'); // best with `rlut`
    });
    test('Emmet suggestion not appearing at the top of the list in jsx files, #39518', function () {
        model = new CompletionModel([
            createSuggestItem('from', 0),
            createSuggestItem('form', 0),
            createSuggestItem('form:get', 0),
            createSuggestItem('testForeignMeasure', 0),
            createSuggestItem('fooRoom', 0),
        ], 1, {
            leadingLineContent: '',
            characterCountDelta: 0
        }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        model.lineContext = { leadingLineContent: 'form', characterCountDelta: 4 };
        assert.strictEqual(model.items.length, 5);
        const [first, second, third] = model.items;
        assert.strictEqual(first.completion.label, 'form'); // best with `form`
        assert.strictEqual(second.completion.label, 'form:get'); // best with `form`
        assert.strictEqual(third.completion.label, 'from'); // best with `from`
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGxldGlvbk1vZGVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zdWdnZXN0L3Rlc3QvYnJvd3Nlci9jb21wbGV0aW9uTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGFBQWEsRUFBMEIsTUFBTSw0Q0FBNEMsQ0FBQztBQUduRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGNBQWMsRUFBRSx1QkFBdUIsRUFBb0IsTUFBTSwwQkFBMEIsQ0FBQztBQUNyRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFN0QsTUFBTSxVQUFVLGlCQUFpQixDQUFDLEtBQTZDLEVBQUUsZUFBdUIsRUFBRSxJQUFJLGdEQUF3QyxFQUFFLGFBQXNCLEtBQUssRUFBRSxXQUFzQixFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQWlCLEVBQUUsVUFBbUI7SUFDOVEsTUFBTSxVQUFVLEdBQTZCO1FBQzVDLEtBQUs7UUFDTCxRQUFRO1FBQ1IsVUFBVTtRQUNWLEtBQUssRUFBRSxFQUFFLGVBQWUsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLGVBQWUsRUFBRSxhQUFhLEVBQUUsUUFBUSxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRTtRQUMvSixVQUFVLEVBQUUsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FB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