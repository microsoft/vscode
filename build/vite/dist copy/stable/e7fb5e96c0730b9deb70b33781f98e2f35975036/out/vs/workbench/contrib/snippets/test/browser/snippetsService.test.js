/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { SnippetCompletionProvider } from '../../browser/snippetCompletionProvider.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { createModelServices, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { Snippet } from '../../browser/snippetsFile.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CompletionModel } from '../../../../../editor/contrib/suggest/browser/completionModel.js';
import { CompletionItem } from '../../../../../editor/contrib/suggest/browser/suggest.js';
import { WordDistance } from '../../../../../editor/contrib/suggest/browser/wordDistance.js';
import { EditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { URI } from '../../../../../base/common/uri.js';
class SimpleSnippetService {
    constructor(snippets) {
        this.snippets = snippets;
    }
    getSnippets(languageId, resourceUri) {
        return Promise.resolve(this.getSnippetsSync(languageId, resourceUri));
    }
    getSnippetsSync(languageId, resourceUri) {
        // Filter snippets based on resourceUri if provided
        if (resourceUri) {
            return this.snippets.filter(snippet => snippet.isFileIncluded(resourceUri));
        }
        return this.snippets;
    }
    getSnippetFiles() {
        throw new Error();
    }
    isEnabled() {
        throw new Error();
    }
    updateEnablement() {
        throw new Error();
    }
    updateUsageTimestamp(snippet) {
        throw new Error();
    }
}
suite('SnippetsService', function () {
    const defaultCompletionContext = { triggerKind: 0 /* CompletionTriggerKind.Invoke */ };
    let disposables;
    let instantiationService;
    let languageService;
    let snippetService;
    setup(function () {
        disposables = new DisposableStore();
        instantiationService = createModelServices(disposables);
        languageService = instantiationService.get(ILanguageService);
        disposables.add(languageService.registerLanguage({
            id: 'fooLang',
            extensions: ['.fooLang',]
        }));
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'barTest', 'bar', '', 'barCodeSnippet', '', 1 /* SnippetSource.User */, generateUuid()), new Snippet(false, ['fooLang'], 'bazzTest', 'bazz', '', 'bazzCodeSnippet', '', 1 /* SnippetSource.User */, generateUuid())]);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    async function asCompletionModel(model, position, provider, context = defaultCompletionContext) {
        const list = await provider.provideCompletionItems(model, Position.lift(position), context);
        const result = new CompletionModel(list.suggestions.map(s => {
            return new CompletionItem(position, s, list, provider);
        }), position.column, { characterCountDelta: 0, leadingLineContent: model.getLineContent(position.lineNumber).substring(0, position.column - 1) }, WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined);
        return result;
    }
    test('snippet completions - simple', async function () {
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, '', 'fooLang'));
        await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext).then(result => {
            assert.strictEqual(result.incomplete, undefined);
            assert.strictEqual(result.suggestions.length, 2);
        });
        const completions = await asCompletionModel(model, new Position(1, 1), provider);
        assert.strictEqual(completions.items.length, 2);
    });
    test('snippet completions - simple 2', async function () {
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'hello ', 'fooLang'));
        await provider.provideCompletionItems(model, new Position(1, 6) /* hello| */, defaultCompletionContext).then(result => {
            assert.strictEqual(result.incomplete, undefined);
            assert.strictEqual(result.suggestions.length, 0);
        });
        await provider.provideCompletionItems(model, new Position(1, 7) /* hello |*/, defaultCompletionContext).then(result => {
            assert.strictEqual(result.incomplete, undefined);
            assert.strictEqual(result.suggestions.length, 2);
        });
        const completions1 = await asCompletionModel(model, new Position(1, 6) /* hello| */, provider);
        assert.strictEqual(completions1.items.length, 0);
        const completions2 = await asCompletionModel(model, new Position(1, 7) /* hello |*/, provider);
        assert.strictEqual(completions2.items.length, 2);
    });
    test('snippet completions - with prefix', async function () {
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'bar', 'fooLang'));
        await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext).then(result => {
            assert.strictEqual(result.incomplete, undefined);
            assert.strictEqual(result.suggestions.length, 1);
            assert.deepStrictEqual(result.suggestions[0].label, {
                label: 'bar',
                description: 'barTest'
            });
            assert.strictEqual(result.suggestions[0].range.insert.startColumn, 1);
            assert.strictEqual(result.suggestions[0].insertText, 'barCodeSnippet');
        });
        const completions = await asCompletionModel(model, new Position(1, 4), provider);
        assert.strictEqual(completions.items.length, 1);
        assert.deepStrictEqual(completions.items[0].completion.label, {
            label: 'bar',
            description: 'barTest'
        });
        assert.strictEqual(completions.items[0].completion.range.insert.startColumn, 1);
        assert.strictEqual(completions.items[0].completion.insertText, 'barCodeSnippet');
    });
    test('snippet completions - with different prefixes', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'barTest', 'bar', '', 's1', '', 1 /* SnippetSource.User */, generateUuid()), new Snippet(false, ['fooLang'], 'name', 'bar-bar', '', 's2', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'bar-bar', 'fooLang'));
        {
            await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext).then(result => {
                assert.strictEqual(result.incomplete, undefined);
                assert.strictEqual(result.suggestions.length, 2);
                assert.deepStrictEqual(result.suggestions[0].label, {
                    label: 'bar',
                    description: 'barTest'
                });
                assert.strictEqual(result.suggestions[0].insertText, 's1');
                assert.strictEqual(result.suggestions[0].range.insert.startColumn, 1);
                assert.deepStrictEqual(result.suggestions[1].label, {
                    label: 'bar-bar',
                    description: 'name'
                });
                assert.strictEqual(result.suggestions[1].insertText, 's2');
                assert.strictEqual(result.suggestions[1].range.insert.startColumn, 1);
            });
            const completions = await asCompletionModel(model, new Position(1, 3), provider);
            assert.strictEqual(completions.items.length, 2);
            assert.deepStrictEqual(completions.items[0].completion.label, {
                label: 'bar',
                description: 'barTest'
            });
            assert.strictEqual(completions.items[0].completion.insertText, 's1');
            assert.strictEqual(completions.items[0].completion.range.insert.startColumn, 1);
            assert.deepStrictEqual(completions.items[1].completion.label, {
                label: 'bar-bar',
                description: 'name'
            });
            assert.strictEqual(completions.items[1].completion.insertText, 's2');
            assert.strictEqual(completions.items[1].completion.range.insert.startColumn, 1);
        }
        {
            await provider.provideCompletionItems(model, new Position(1, 5), defaultCompletionContext).then(result => {
                assert.strictEqual(result.incomplete, undefined);
                assert.strictEqual(result.suggestions.length, 2);
                const [first, second] = result.suggestions;
                assert.deepStrictEqual(first.label, {
                    label: 'bar',
                    description: 'barTest'
                });
                assert.strictEqual(first.insertText, 's1');
                assert.strictEqual(first.range.insert.startColumn, 5);
                assert.deepStrictEqual(second.label, {
                    label: 'bar-bar',
                    description: 'name'
                });
                assert.strictEqual(second.insertText, 's2');
                assert.strictEqual(second.range.insert.startColumn, 1);
            });
            const completions = await asCompletionModel(model, new Position(1, 5), provider);
            assert.strictEqual(completions.items.length, 2);
            const [first, second] = completions.items.map(i => i.completion);
            assert.deepStrictEqual(first.label, {
                label: 'bar-bar',
                description: 'name'
            });
            assert.strictEqual(first.insertText, 's2');
            assert.strictEqual(first.range.insert.startColumn, 1);
            assert.deepStrictEqual(second.label, {
                label: 'bar',
                description: 'barTest'
            });
            assert.strictEqual(second.insertText, 's1');
            assert.strictEqual(second.range.insert.startColumn, 5);
        }
        {
            await provider.provideCompletionItems(model, new Position(1, 6), defaultCompletionContext).then(result => {
                assert.strictEqual(result.incomplete, undefined);
                assert.strictEqual(result.suggestions.length, 2);
                assert.deepStrictEqual(result.suggestions[0].label, {
                    label: 'bar',
                    description: 'barTest'
                });
                assert.strictEqual(result.suggestions[0].insertText, 's1');
                assert.strictEqual(result.suggestions[0].range.insert.startColumn, 5);
                assert.deepStrictEqual(result.suggestions[1].label, {
                    label: 'bar-bar',
                    description: 'name'
                });
                assert.strictEqual(result.suggestions[1].insertText, 's2');
                assert.strictEqual(result.suggestions[1].range.insert.startColumn, 1);
            });
            const completions = await asCompletionModel(model, new Position(1, 6), provider);
            assert.strictEqual(completions.items.length, 2);
            assert.deepStrictEqual(completions.items[0].completion.label, {
                label: 'bar-bar',
                description: 'name'
            });
            assert.strictEqual(completions.items[0].completion.insertText, 's2');
            assert.strictEqual(completions.items[0].completion.range.insert.startColumn, 1);
            assert.deepStrictEqual(completions.items[1].completion.label, {
                label: 'bar',
                description: 'barTest'
            });
            assert.strictEqual(completions.items[1].completion.insertText, 's1');
            assert.strictEqual(completions.items[1].completion.range.insert.startColumn, 5);
        }
    });
    test('Cannot use "<?php" as user snippet prefix anymore, #26275', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], '', '<?php', '', 'insert me', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        let model = instantiateTextModel(instantiationService, '\t<?php', 'fooLang');
        await provider.provideCompletionItems(model, new Position(1, 7), defaultCompletionContext).then(result => {
            assert.strictEqual(result.suggestions.length, 1);
        });
        const completions1 = await asCompletionModel(model, new Position(1, 7), provider);
        assert.strictEqual(completions1.items.length, 1);
        model.dispose();
        model = instantiateTextModel(instantiationService, '\t<?', 'fooLang');
        await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext).then(result => {
            assert.strictEqual(result.suggestions.length, 1);
            assert.strictEqual(result.suggestions[0].range.insert.startColumn, 2);
        });
        const completions2 = await asCompletionModel(model, new Position(1, 4), provider);
        assert.strictEqual(completions2.items.length, 1);
        assert.strictEqual(completions2.items[0].completion.range.insert.startColumn, 2);
        model.dispose();
        model = instantiateTextModel(instantiationService, 'a<?', 'fooLang');
        await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext).then(result => {
            assert.strictEqual(result.suggestions.length, 1);
            assert.strictEqual(result.suggestions[0].range.insert.startColumn, 2);
        });
        const completions3 = await asCompletionModel(model, new Position(1, 4), provider);
        assert.strictEqual(completions3.items.length, 1);
        assert.strictEqual(completions3.items[0].completion.range.insert.startColumn, 2);
        model.dispose();
    });
    test('No user snippets in suggestions, when inside the code, #30508', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], '', 'foo', '', '<foo>$0</foo>', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, '<head>\n\t\n>/head>', 'fooLang'));
        await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext).then(result => {
            assert.strictEqual(result.suggestions.length, 1);
        });
        const completions = await asCompletionModel(model, new Position(1, 1), provider);
        assert.strictEqual(completions.items.length, 1);
        await provider.provideCompletionItems(model, new Position(2, 2), defaultCompletionContext).then(result => {
            assert.strictEqual(result.suggestions.length, 1);
        });
        const completions2 = await asCompletionModel(model, new Position(2, 2), provider);
        assert.strictEqual(completions2.items.length, 1);
    });
    test('SnippetSuggest - ensure extension snippets come last ', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'second', 'second', '', 'second', '', 3 /* SnippetSource.Extension */, generateUuid()), new Snippet(false, ['fooLang'], 'first', 'first', '', 'first', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, '', 'fooLang'));
        await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext).then(result => {
            assert.strictEqual(result.suggestions.length, 2);
            const [first, second] = result.suggestions;
            assert.deepStrictEqual(first.label, {
                label: 'first',
                description: 'first'
            });
            assert.deepStrictEqual(second.label, {
                label: 'second',
                description: 'second'
            });
        });
        const completions = await asCompletionModel(model, new Position(1, 1), provider);
        assert.strictEqual(completions.items.length, 2);
        const [first, second] = completions.items;
        assert.deepStrictEqual(first.completion.label, {
            label: 'first',
            description: 'first'
        });
        assert.deepStrictEqual(second.completion.label, {
            label: 'second',
            description: 'second'
        });
    });
    test('Dash in snippets prefix broken #53945', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'p-a', 'p-a', '', 'second', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'p-', 'fooLang'));
        let result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext);
        let completions = await asCompletionModel(model, new Position(1, 2), provider);
        assert.strictEqual(result.suggestions.length, 1);
        assert.strictEqual(completions.items.length, 1);
        result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
        completions = await asCompletionModel(model, new Position(1, 3), provider);
        assert.strictEqual(result.suggestions.length, 1);
        assert.strictEqual(completions.items.length, 1);
        result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
        completions = await asCompletionModel(model, new Position(1, 3), provider);
        assert.strictEqual(result.suggestions.length, 1);
        assert.strictEqual(completions.items.length, 1);
    });
    test('No snippets suggestion on long lines beyond character 100 #58807', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'bug', 'bug', '', 'second', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea b', 'fooLang'));
        const result = await provider.provideCompletionItems(model, new Position(1, 158), defaultCompletionContext);
        const completions = await asCompletionModel(model, new Position(1, 158), provider);
        assert.strictEqual(result.suggestions.length, 1);
        assert.strictEqual(completions.items.length, 1);
    });
    test('Type colon will trigger snippet #60746', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'bug', 'bug', '', 'second', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, ':', 'fooLang'));
        const result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 0);
        const completions = await asCompletionModel(model, new Position(1, 2), provider);
        assert.strictEqual(completions.items.length, 0);
    });
    test('substring of prefix can\'t trigger snippet #60737', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'mytemplate', 'mytemplate', '', 'second', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'template', 'fooLang'));
        const result = await provider.provideCompletionItems(model, new Position(1, 9), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        assert.deepStrictEqual(result.suggestions[0].label, {
            label: 'mytemplate',
            description: 'mytemplate'
        });
        const completions = await asCompletionModel(model, new Position(1, 9), provider);
        assert.strictEqual(completions.items.length, 0);
    });
    test('No snippets suggestion beyond character 100 if not at end of line #60247', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'bug', 'bug', '', 'second', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea b text_after_b', 'fooLang'));
        const result = await provider.provideCompletionItems(model, new Position(1, 158), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        const completions = await asCompletionModel(model, new Position(1, 158), provider);
        assert.strictEqual(completions.items.length, 1);
    });
    test('issue #61296: VS code freezes when editing CSS fi`le with emoji', async function () {
        const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
        disposables.add(languageConfigurationService.register('fooLang', {
            wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w\-?]+%?|[@#!.])/g
        }));
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'bug', '-a-bug', '', 'second', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, languageConfigurationService);
        const model = disposables.add(instantiateTextModel(instantiationService, '.🐷-a-b', 'fooLang'));
        const result = await provider.provideCompletionItems(model, new Position(1, 8), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        const completions = await asCompletionModel(model, new Position(1, 8), provider);
        assert.strictEqual(completions.items.length, 1);
    });
    test('No snippets shown when triggering completions at whitespace on line that already has text #62335', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'bug', 'bug', '', 'second', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, 'a ', 'fooLang'));
        const result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        const completions = await asCompletionModel(model, new Position(1, 3), provider);
        assert.strictEqual(completions.items.length, 1);
    });
    test('Snippet prefix with special chars and numbers does not work #62906', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'noblockwdelay', '<<', '', '<= #dly"', '', 1 /* SnippetSource.User */, generateUuid()), new Snippet(false, ['fooLang'], 'noblockwdelay', '11', '', 'eleven', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        let model = instantiateTextModel(instantiationService, ' <', 'fooLang');
        let result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        let [first] = result.suggestions;
        assert.strictEqual(first.range.insert.startColumn, 2);
        let completions = await asCompletionModel(model, new Position(1, 3), provider);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editStart.column, 2);
        model.dispose();
        model = instantiateTextModel(instantiationService, '1', 'fooLang');
        result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext);
        completions = await asCompletionModel(model, new Position(1, 2), provider);
        assert.strictEqual(result.suggestions.length, 1);
        [first] = result.suggestions;
        assert.strictEqual(first.range.insert.startColumn, 1);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editStart.column, 1);
        model.dispose();
    });
    test('Snippet replace range', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'notWordTest', 'not word', '', 'not word snippet', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        let model = instantiateTextModel(instantiationService, 'not wordFoo bar', 'fooLang');
        let result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        let [first] = result.suggestions;
        assert.strictEqual(first.range.insert.endColumn, 3);
        assert.strictEqual(first.range.replace.endColumn, 9);
        let completions = await asCompletionModel(model, new Position(1, 3), provider);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editInsertEnd.column, 3);
        assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);
        model.dispose();
        model = instantiateTextModel(instantiationService, 'not woFoo bar', 'fooLang');
        result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        [first] = result.suggestions;
        assert.strictEqual(first.range.insert.endColumn, 3);
        assert.strictEqual(first.range.replace.endColumn, 3);
        completions = await asCompletionModel(model, new Position(1, 3), provider);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editInsertEnd.column, 3);
        assert.strictEqual(completions.items[0].editReplaceEnd.column, 3);
        model.dispose();
        model = instantiateTextModel(instantiationService, 'not word', 'fooLang');
        result = await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext);
        assert.strictEqual(result.suggestions.length, 1);
        [first] = result.suggestions;
        assert.strictEqual(first.range.insert.endColumn, 1);
        assert.strictEqual(first.range.replace.endColumn, 9);
        completions = await asCompletionModel(model, new Position(1, 1), provider);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editInsertEnd.column, 1);
        assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);
        model.dispose();
    });
    test('Snippet replace-range incorrect #108894', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'eng', 'eng', '', '<span></span>', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, 'filler e KEEP ng filler', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 9), defaultCompletionContext);
        const completions = await asCompletionModel(model, new Position(1, 9), provider);
        assert.strictEqual(result.suggestions.length, 1);
        const [first] = result.suggestions;
        assert.strictEqual(first.range.insert.endColumn, 9);
        assert.strictEqual(first.range.replace.endColumn, 9);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editInsertEnd.column, 9);
        assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);
        model.dispose();
    });
    test('Snippet will replace auto-closing pair if specified in prefix', async function () {
        const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
        disposables.add(languageConfigurationService.register('fooLang', {
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ]
        }));
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'PSCustomObject', '[PSCustomObject]', '', '[PSCustomObject] @{ Key = Value }', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, languageConfigurationService);
        const model = instantiateTextModel(instantiationService, '[psc]', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 5), defaultCompletionContext);
        const completions = await asCompletionModel(model, new Position(1, 5), provider);
        assert.strictEqual(result.suggestions.length, 1);
        const [first] = result.suggestions;
        assert.strictEqual(first.range.insert.endColumn, 5);
        // This is 6 because it should eat the `]` at the end of the text even if cursor is before it
        assert.strictEqual(first.range.replace.endColumn, 6);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editInsertEnd.column, 5);
        assert.strictEqual(completions.items[0].editReplaceEnd.column, 6);
        model.dispose();
    });
    test('Leading whitespace in snippet prefix #123860', async function () {
        snippetService = new SimpleSnippetService([new Snippet(false, ['fooLang'], 'cite-name', ' cite', '', '~\\cite{$CLIPBOARD}', '', 1 /* SnippetSource.User */, generateUuid())]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, ' ci', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext);
        const completions = await asCompletionModel(model, new Position(1, 4), provider);
        assert.strictEqual(result.suggestions.length, 1);
        const [first] = result.suggestions;
        assert.strictEqual(first.label.label, ' cite');
        assert.strictEqual(first.range.insert.startColumn, 1);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].textLabel, ' cite');
        assert.strictEqual(completions.items[0].editStart.column, 1);
        model.dispose();
    });
    test('still show suggestions in string when disable string suggestion #136611', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'aaa', 'aaa', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], 'bbb', 'bbb', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            // new Snippet(['fooLang'], '\'ccc', '\'ccc', '', 'value', '', SnippetSource.User, generateUuid())
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, '\'\'', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: 1 /* CompletionTriggerKind.TriggerCharacter */, triggerCharacter: '\'' });
        assert.strictEqual(result.suggestions.length, 0);
        model.dispose();
    });
    test('still show suggestions in string when disable string suggestion #136611 (part 2)', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'aaa', 'aaa', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], 'bbb', 'bbb', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], '\'ccc', '\'ccc', '', 'value', '', 1 /* SnippetSource.User */, generateUuid())
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, '\'\'', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: 1 /* CompletionTriggerKind.TriggerCharacter */, triggerCharacter: '\'' });
        assert.strictEqual(result.suggestions.length, 1);
        const completions = await asCompletionModel(model, new Position(1, 2), provider, { triggerKind: 1 /* CompletionTriggerKind.TriggerCharacter */, triggerCharacter: '\'' });
        assert.strictEqual(completions.items.length, 1);
        model.dispose();
    });
    test('Snippet suggestions are too eager #138707 (word)', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'tys', 'tys', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], 'hell_or_tell', 'hell_or_tell', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], '^y', '^y', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, '\'hellot\'', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 8), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(result.suggestions.length, 1);
        assert.strictEqual(result.suggestions[0].label.label, 'hell_or_tell');
        const completions = await asCompletionModel(model, new Position(1, 8), provider, { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].textLabel, 'hell_or_tell');
        model.dispose();
    });
    test('Snippet suggestions are too eager #138707 (no word)', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'tys', 'tys', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], 't', 't', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], '^y', '^y', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, ')*&^', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 5), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(result.suggestions.length, 1);
        assert.strictEqual(result.suggestions[0].label.label, '^y');
        const completions = await asCompletionModel(model, new Position(1, 5), provider, { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].textLabel, '^y');
        model.dispose();
    });
    test('Snippet suggestions are too eager #138707 (word/word)', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'async arrow function', 'async arrow function', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], 'foobarrrrrr', 'foobarrrrrr', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, 'foobar', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 7), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(result.suggestions.length, 1);
        assert.strictEqual(result.suggestions[0].label.label, 'foobarrrrrr');
        const completions = await asCompletionModel(model, new Position(1, 7), provider, { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].textLabel, 'foobarrrrrr');
        model.dispose();
    });
    test('Strange and useless autosuggestion #region/#endregion PHP #140039', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'reg', '#region', '', 'value', '', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, 'function abc(w)', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 15), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(result.suggestions.length, 0);
        model.dispose();
    });
    test.skip('Snippets disappear with . key #145960', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'div', 'div', '', 'div', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], 'div.', 'div.', '', 'div.', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], 'div#', 'div#', '', 'div#', '', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = instantiateTextModel(instantiationService, 'di', 'fooLang');
        const result = await provider.provideCompletionItems(model, new Position(1, 3), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(result.suggestions.length, 3);
        model.applyEdits([EditOperation.insert(new Position(1, 3), '.')]);
        assert.strictEqual(model.getValue(), 'di.');
        const result2 = await provider.provideCompletionItems(model, new Position(1, 4), { triggerKind: 1 /* CompletionTriggerKind.TriggerCharacter */, triggerCharacter: '.' });
        assert.strictEqual(result2.suggestions.length, 1);
        assert.strictEqual(result2.suggestions[0].insertText, 'div.');
        model.dispose();
    });
    test('Hyphen in snippet prefix de-indents snippet #139016', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'foo', 'Foo- Bar', '', 'Foo', '', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const model = disposables.add(instantiateTextModel(instantiationService, '    bar', 'fooLang'));
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const result = await provider.provideCompletionItems(model, new Position(1, 8), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
        assert.strictEqual(result.suggestions.length, 1);
        const first = result.suggestions[0];
        assert.strictEqual(first.range.insert.startColumn, 5);
        const completions = await asCompletionModel(model, new Position(1, 8), provider);
        assert.strictEqual(completions.items.length, 1);
        assert.strictEqual(completions.items[0].editStart.column, 5);
    });
    test('Autocomplete suggests based on the last letter of a word and it depends on the typing speed #191070', async function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], '/whiletrue', '/whiletrue', '', 'one', '', 1 /* SnippetSource.User */, generateUuid()),
            new Snippet(false, ['fooLang'], '/sc not expanding', '/sc not expanding', '', 'two', '', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
        const model = disposables.add(instantiateTextModel(instantiationService, '', 'fooLang'));
        { // PREFIX: w
            model.setValue('w');
            const result1 = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
            assert.strictEqual(result1.suggestions[0].insertText, 'one');
            assert.strictEqual(result1.suggestions.length, 1);
        }
        { // PREFIX: where
            model.setValue('where');
            const result2 = await provider.provideCompletionItems(model, new Position(1, 6), { triggerKind: 0 /* CompletionTriggerKind.Invoke */ });
            assert.strictEqual(result2.suggestions[0].insertText, 'one'); // /whiletrue matches where (WHilEtRuE)
            assert.strictEqual(result2.suggestions.length, 1);
        }
    });
    test('getSnippetsSync - include pattern', function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'TestSnippet', 'test', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid(), ['**/*.test.ts']),
            new Snippet(false, ['fooLang'], 'SpecSnippet', 'spec', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid(), ['**/*.spec.ts']),
            new Snippet(false, ['fooLang'], 'AllSnippet', 'all', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        // Test file should only get TestSnippet and AllSnippet
        let snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.test.ts'));
        assert.strictEqual(snippets.length, 2);
        assert.ok(snippets.some(s => s.name === 'TestSnippet'));
        assert.ok(snippets.some(s => s.name === 'AllSnippet'));
        // Spec file should only get SpecSnippet and AllSnippet
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.spec.ts'));
        assert.strictEqual(snippets.length, 2);
        assert.ok(snippets.some(s => s.name === 'SpecSnippet'));
        assert.ok(snippets.some(s => s.name === 'AllSnippet'));
        // Regular file should only get AllSnippet
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.ts'));
        assert.strictEqual(snippets.length, 1);
        assert.strictEqual(snippets[0].name, 'AllSnippet');
        // Without URI, all snippets should be returned (backward compatibility)
        snippets = snippetService.getSnippetsSync('fooLang');
        assert.strictEqual(snippets.length, 3);
    });
    test('getSnippetsSync - exclude pattern', function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'ProdSnippet', 'prod', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid(), undefined, ['**/*.min.js', '**/dist/**']),
            new Snippet(false, ['fooLang'], 'AllSnippet', 'all', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid()),
        ]);
        // Regular .js file should get both snippets
        let snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.js'));
        assert.strictEqual(snippets.length, 2);
        // Minified file should only get AllSnippet (ProdSnippet is excluded)
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.min.js'));
        assert.strictEqual(snippets.length, 1);
        assert.strictEqual(snippets[0].name, 'AllSnippet');
        // File in dist folder should only get AllSnippet
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/dist/bundle.js'));
        assert.strictEqual(snippets.length, 1);
        assert.strictEqual(snippets[0].name, 'AllSnippet');
    });
    test('getSnippetsSync - include and exclude patterns together', function () {
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'TestSnippet', 'test', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid(), ['**/*.test.ts', '**/*.spec.ts'], ['**/*.perf.test.ts']),
        ]);
        // Regular test file should get the snippet
        let snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.test.ts'));
        assert.strictEqual(snippets.length, 1);
        // Spec file should get the snippet
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.spec.ts'));
        assert.strictEqual(snippets.length, 1);
        // Performance test file should NOT get the snippet (excluded)
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.perf.test.ts'));
        assert.strictEqual(snippets.length, 0);
        // Regular file should NOT get the snippet (not included)
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.ts'));
        assert.strictEqual(snippets.length, 0);
    });
    test('getSnippetsSync - filename-only patterns (no path separator)', function () {
        // Patterns without '/' should match on filename only (like files.associations)
        snippetService = new SimpleSnippetService([
            new Snippet(false, ['fooLang'], 'TestSnippet', 'test', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid(), ['*.test.ts']),
            new Snippet(false, ['fooLang'], 'ConfigSnippet', 'config', '', 'snippet', 'test', 1 /* SnippetSource.User */, generateUuid(), ['config.json']),
        ]);
        // *.test.ts should match any file ending in .test.ts regardless of path
        let snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/src/foo.test.ts'));
        assert.strictEqual(snippets.length, 1);
        assert.strictEqual(snippets[0].name, 'TestSnippet');
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/other/deep/path/bar.test.ts'));
        assert.strictEqual(snippets.length, 1);
        assert.strictEqual(snippets[0].name, 'TestSnippet');
        // config.json should match filename exactly
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/config.json'));
        assert.strictEqual(snippets.length, 1);
        assert.strictEqual(snippets[0].name, 'ConfigSnippet');
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/deep/nested/path/config.json'));
        assert.strictEqual(snippets.length, 1);
        assert.strictEqual(snippets[0].name, 'ConfigSnippet');
        // myconfig.json should NOT match config.json pattern
        snippets = snippetService.getSnippetsSync('fooLang', URI.file('/project/myconfig.json'));
        assert.strictEqual(snippets.length, 0);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHNTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zbmlwcGV0cy90ZXN0L2Jyb3dzZXIvc25pcHBldHNTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBcUIseUJBQXlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRyxPQUFPLEVBQWEsUUFBUSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDcEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFL0csT0FBTyxFQUFFLE9BQU8sRUFBaUIsTUFBTSwrQkFBK0IsQ0FBQztBQUV2RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDL0gsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRW5GLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUM3RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLEdBQUcsRUFB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