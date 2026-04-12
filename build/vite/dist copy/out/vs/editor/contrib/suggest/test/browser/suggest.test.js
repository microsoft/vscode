/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { CompletionOptions, provideSuggestionItems } from '../../browser/suggest.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('Suggest', function () {
    let model;
    let registration;
    let registry;
    setup(function () {
        registry = new LanguageFeatureRegistry();
        model = createTextModel('FOO\nbar\BAR\nfoo', undefined, undefined, URI.parse('foo:bar/path'));
        registration = registry.register({ pattern: 'bar/path', scheme: 'foo' }, {
            _debugDisplayName: 'test',
            provideCompletionItems(_doc, pos) {
                return {
                    incomplete: false,
                    suggestions: [{
                            label: 'aaa',
                            kind: 28 /* CompletionItemKind.Snippet */,
                            insertText: 'aaa',
                            range: Range.fromPositions(pos)
                        }, {
                            label: 'zzz',
                            kind: 28 /* CompletionItemKind.Snippet */,
                            insertText: 'zzz',
                            range: Range.fromPositions(pos)
                        }, {
                            label: 'fff',
                            kind: 9 /* CompletionItemKind.Property */,
                            insertText: 'fff',
                            range: Range.fromPositions(pos)
                        }]
                };
            }
        });
    });
    teardown(() => {
        registration.dispose();
        model.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('sort - snippet inline', async function () {
        const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(1 /* SnippetSortOrder.Inline */));
        assert.strictEqual(items.length, 3);
        assert.strictEqual(items[0].completion.label, 'aaa');
        assert.strictEqual(items[1].completion.label, 'fff');
        assert.strictEqual(items[2].completion.label, 'zzz');
        disposable.dispose();
    });
    test('sort - snippet top', async function () {
        const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(0 /* SnippetSortOrder.Top */));
        assert.strictEqual(items.length, 3);
        assert.strictEqual(items[0].completion.label, 'aaa');
        assert.strictEqual(items[1].completion.label, 'zzz');
        assert.strictEqual(items[2].completion.label, 'fff');
        disposable.dispose();
    });
    test('sort - snippet bottom', async function () {
        const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(2 /* SnippetSortOrder.Bottom */));
        assert.strictEqual(items.length, 3);
        assert.strictEqual(items[0].completion.label, 'fff');
        assert.strictEqual(items[1].completion.label, 'aaa');
        assert.strictEqual(items[2].completion.label, 'zzz');
        disposable.dispose();
    });
    test('sort - snippet none', async function () {
        const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(undefined, new Set().add(28 /* CompletionItemKind.Snippet */)));
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].completion.label, 'fff');
        disposable.dispose();
    });
    test('only from', function (callback) {
        const foo = {
            triggerCharacters: [],
            provideCompletionItems() {
                return {
                    currentWord: '',
                    incomplete: false,
                    suggestions: [{
                            label: 'jjj',
                            type: 'property',
                            insertText: 'jjj'
                        }]
                };
            }
        };
        const registration = registry.register({ pattern: 'bar/path', scheme: 'foo' }, foo);
        provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(undefined, undefined, new Set().add(foo))).then(({ items, disposable }) => {
            registration.dispose();
            assert.strictEqual(items.length, 1);
            assert.ok(items[0].provider === foo);
            disposable.dispose();
            callback();
        });
    });
    test('Ctrl+space completions stopped working with the latest Insiders, #97650', async function () {
        const foo = new class {
            constructor() {
                this._debugDisplayName = 'test';
                this.triggerCharacters = [];
            }
            provideCompletionItems() {
                return {
                    suggestions: [{
                            label: 'one',
                            kind: 5 /* CompletionItemKind.Class */,
                            insertText: 'one',
                            range: {
                                insert: new Range(0, 0, 0, 0),
                                replace: new Range(0, 0, 0, 10)
                            }
                        }, {
                            label: 'two',
                            kind: 5 /* CompletionItemKind.Class */,
                            insertText: 'two',
                            range: {
                                insert: new Range(0, 0, 0, 0),
                                replace: new Range(0, 1, 0, 10)
                            }
                        }]
                };
            }
        };
        const registration = registry.register({ pattern: 'bar/path', scheme: 'foo' }, foo);
        const { items, disposable } = await provideSuggestionItems(registry, model, new Position(0, 0), new CompletionOptions(undefined, undefined, new Set().add(foo)));
        registration.dispose();
        assert.strictEqual(items.length, 2);
        const [a, b] = items;
        assert.strictEqual(a.completion.label, 'one');
        assert.strictEqual(a.isInvalid, false);
        assert.strictEqual(b.completion.label, 'two');
        assert.strictEqual(b.isInvalid, true);
        disposable.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC90ZXN0L2Jyb3dzZXIvc3VnZ2VzdC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUd6RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsc0JBQXNCLEVBQW9CLE1BQU0sMEJBQTBCLENBQUM7QUFDdkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR25HLEtBQUssQ0FBQyxTQUFTLEVBQUU7SUFDaEIsSUFBSSxLQUFnQixDQUFDO0lBQ3JCLElBQUksWUFBeUIsQ0FBQztJQUM5QixJQUFJLFFBQXlELENBQUM7SUFFOUQsS0FBSyxDQUFDO1FBQ0wsUUFBUSxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUN6QyxLQUFLLEdBQUcsZUFBZSxDQUFDLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQzlGLFlBQVksR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDeEUsaUJBQWlCLEVBQUUsTUFB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QVMsRUFBRSxTQUFTLEVBQUUsSUFBSSxHQUFHLEVBQTBCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6TCxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFdkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBRXJCLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3RDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN0QixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=