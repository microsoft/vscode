/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { SnippetCompletion, SnippetCompletionProvider } from '../../browser/snippetCompletionProvider.js';
import { IPosition, Position } from '../../../../../editor/common/core/position.js';
import { createModelServices, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ISnippetsService } from '../../browser/snippets.js';
import { Snippet, SnippetSource } from '../../browser/snippetsFile.js';
import { CompletionContext, CompletionItemLabel, CompletionItemRanges, CompletionTriggerKind, EncodedTokenizationResult, TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { NullState } from '../../../../../editor/common/languages/nullTokenize.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { TestLanguageConfigurationService } from '../../../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { EditOperation } from '../../../../../editor/common/core/editOperation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { CompletionModel } from '../../../../../editor/contrib/suggest/browser/completionModel.js';
import { CompletionItem } from '../../../../../editor/contrib/suggest/browser/suggest.js';
import { WordDistance } from '../../../../../editor/contrib/suggest/browser/wordDistance.js';
import { EditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { URI } from '../../../../../base/common/uri.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';

class SimpleSnippetService implements ISnippetsService {
	declare readonly _serviceBrand: undefined;
	constructor(readonly snippets: Snippet[]) { }
	getSnippets(languageId?: string, resourceUri?: URI) {
		return Promise.resolve(this.getSnippetsSync(languageId!, resourceUri));
	}
	getSnippetsSync(languageId?: string, resourceUri?: URI): Snippet[] {
		// Filter snippets based on resourceUri if provided
		if (resourceUri) {
			return this.snippets.filter(snippet => snippet.isFileIncluded(resourceUri));
		}
		return this.snippets;
	}
	getSnippetFiles(): any {
		throw new Error();
	}
	isEnabled(): boolean {
		throw new Error();
	}
	updateEnablement(): void {
		throw new Error();
	}
	updateUsageTimestamp(snippet: Snippet): void {
		throw new Error();
	}
}

suite('SnippetsService', function () {
	const defaultCompletionContext: CompletionContext = { triggerKind: CompletionTriggerKind.Invoke };

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageService: ILanguageService;
	let snippetService: ISnippetsService;

	setup(function () {
		disposables = new DisposableStore();
		instantiationService = createModelServices(disposables);
		languageService = instantiationService.get(ILanguageService);
		disposables.add(languageService.registerLanguage({
			id: 'fooLang',
			extensions: ['.fooLang',]
		}));
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'barTest',
			'bar',
			'',
			'barCodeSnippet',
			'',
			SnippetSource.User,
			generateUuid()
		), new Snippet(
			false,
			['fooLang'],
			'bazzTest',
			'bazz',
			'',
			'bazzCodeSnippet',
			'',
			SnippetSource.User,
			generateUuid()
		)]);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function asCompletionModel(model: ITextModel, position: IPosition, provider: SnippetCompletionProvider, context: CompletionContext = defaultCompletionContext) {

		const list = await provider.provideCompletionItems(model, Position.lift(position), context);

		const result = new CompletionModel(list.suggestions.map(s => {
			return new CompletionItem(position, s, list, provider);
		}),
			position.column,
			{ characterCountDelta: 0, leadingLineContent: model.getLineContent(position.lineNumber).substring(0, position.column - 1) },
			WordDistance.None, EditorOptions.suggest.defaultValue, EditorOptions.snippetSuggestions.defaultValue, undefined
		);

		return result;
	}

	test('snippet completions - simple', async function () {

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = disposables.add(instantiateTextModel(instantiationService, '', 'fooLang'));

		await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext)!.then(result => {
			assert.strictEqual(result.incomplete, undefined);
			assert.strictEqual(result.suggestions.length, 2);
		});

		const completions = await asCompletionModel(model, new Position(1, 1), provider);
		assert.strictEqual(completions.items.length, 2);
	});

	test('snippet completions - simple 2', async function () {

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = disposables.add(instantiateTextModel(instantiationService, 'hello ', 'fooLang'));

		await provider.provideCompletionItems(model, new Position(1, 6) /* hello| */, defaultCompletionContext)!.then(result => {
			assert.strictEqual(result.incomplete, undefined);
			assert.strictEqual(result.suggestions.length, 0);
		});

		await provider.provideCompletionItems(model, new Position(1, 7) /* hello |*/, defaultCompletionContext)!.then(result => {
			assert.strictEqual(result.incomplete, undefined);
			assert.strictEqual(result.suggestions.length, 2);
		});

		const completions1 = await asCompletionModel(model, new Position(1, 6)/* hello| */, provider);
		assert.strictEqual(completions1.items.length, 0);

		const completions2 = await asCompletionModel(model, new Position(1, 7)/* hello |*/, provider);
		assert.strictEqual(completions2.items.length, 2);
	});

	test('snippet completions - with prefix', async function () {

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = disposables.add(instantiateTextModel(instantiationService, 'bar', 'fooLang'));

		await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext)!.then(result => {
			assert.strictEqual(result.incomplete, undefined);
			assert.strictEqual(result.suggestions.length, 1);
			assert.deepStrictEqual(result.suggestions[0].label, {
				label: 'bar',
				description: 'barTest'
			});
			assert.strictEqual((result.suggestions[0].range as CompletionItemRanges).insert.startColumn, 1);
			assert.strictEqual(result.suggestions[0].insertText, 'barCodeSnippet');
		});

		const completions = await asCompletionModel(model, new Position(1, 4), provider);
		assert.strictEqual(completions.items.length, 1);
		assert.deepStrictEqual(completions.items[0].completion.label, {
			label: 'bar',
			description: 'barTest'
		});
		assert.strictEqual((completions.items[0].completion.range as CompletionItemRanges).insert.startColumn, 1);
		assert.strictEqual(completions.items[0].completion.insertText, 'barCodeSnippet');
	});

	test('snippet completions - with different prefixes', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'barTest',
			'bar',
			'',
			's1',
			'',
			SnippetSource.User,
			generateUuid()
		), new Snippet(
			false,
			['fooLang'],
			'name',
			'bar-bar',
			'',
			's2',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = disposables.add(instantiateTextModel(instantiationService, 'bar-bar', 'fooLang'));

		{
			await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext)!.then(result => {
				assert.strictEqual(result.incomplete, undefined);
				assert.strictEqual(result.suggestions.length, 2);
				assert.deepStrictEqual(result.suggestions[0].label, {
					label: 'bar',
					description: 'barTest'
				});
				assert.strictEqual(result.suggestions[0].insertText, 's1');
				assert.strictEqual((result.suggestions[0].range as CompletionItemRanges).insert.startColumn, 1);
				assert.deepStrictEqual(result.suggestions[1].label, {
					label: 'bar-bar',
					description: 'name'
				});
				assert.strictEqual(result.suggestions[1].insertText, 's2');
				assert.strictEqual((result.suggestions[1].range as CompletionItemRanges).insert.startColumn, 1);
			});

			const completions = await asCompletionModel(model, new Position(1, 3), provider);
			assert.strictEqual(completions.items.length, 2);
			assert.deepStrictEqual(completions.items[0].completion.label, {
				label: 'bar',
				description: 'barTest'
			});
			assert.strictEqual(completions.items[0].completion.insertText, 's1');
			assert.strictEqual((completions.items[0].completion.range as CompletionItemRanges).insert.startColumn, 1);
			assert.deepStrictEqual(completions.items[1].completion.label, {
				label: 'bar-bar',
				description: 'name'
			});
			assert.strictEqual(completions.items[1].completion.insertText, 's2');
			assert.strictEqual((completions.items[1].completion.range as CompletionItemRanges).insert.startColumn, 1);
		}

		{
			await provider.provideCompletionItems(model, new Position(1, 5), defaultCompletionContext)!.then(result => {
				assert.strictEqual(result.incomplete, undefined);
				assert.strictEqual(result.suggestions.length, 2);

				const [first, second] = result.suggestions;

				assert.deepStrictEqual(first.label, {
					label: 'bar',
					description: 'barTest'
				});
				assert.strictEqual(first.insertText, 's1');
				assert.strictEqual((first.range as CompletionItemRanges).insert.startColumn, 5);

				assert.deepStrictEqual(second.label, {
					label: 'bar-bar',
					description: 'name'
				});
				assert.strictEqual(second.insertText, 's2');
				assert.strictEqual((second.range as CompletionItemRanges).insert.startColumn, 1);
			});

			const completions = await asCompletionModel(model, new Position(1, 5), provider);
			assert.strictEqual(completions.items.length, 2);

			const [first, second] = completions.items.map(i => i.completion);

			assert.deepStrictEqual(first.label, {
				label: 'bar-bar',
				description: 'name'
			});
			assert.strictEqual(first.insertText, 's2');
			assert.strictEqual((first.range as CompletionItemRanges).insert.startColumn, 1);

			assert.deepStrictEqual(second.label, {
				label: 'bar',
				description: 'barTest'
			});
			assert.strictEqual(second.insertText, 's1');
			assert.strictEqual((second.range as CompletionItemRanges).insert.startColumn, 5);
		}

		{
			await provider.provideCompletionItems(model, new Position(1, 6), defaultCompletionContext)!.then(result => {
				assert.strictEqual(result.incomplete, undefined);
				assert.strictEqual(result.suggestions.length, 2);
				assert.deepStrictEqual(result.suggestions[0].label, {
					label: 'bar',
					description: 'barTest'
				});
				assert.strictEqual(result.suggestions[0].insertText, 's1');
				assert.strictEqual((result.suggestions[0].range as CompletionItemRanges).insert.startColumn, 5);
				assert.deepStrictEqual(result.suggestions[1].label, {
					label: 'bar-bar',
					description: 'name'
				});
				assert.strictEqual(result.suggestions[1].insertText, 's2');
				assert.strictEqual((result.suggestions[1].range as CompletionItemRanges).insert.startColumn, 1);
			});

			const completions = await asCompletionModel(model, new Position(1, 6), provider);
			assert.strictEqual(completions.items.length, 2);
			assert.deepStrictEqual(completions.items[0].completion.label, {
				label: 'bar-bar',
				description: 'name'
			});
			assert.strictEqual(completions.items[0].completion.insertText, 's2');
			assert.strictEqual((completions.items[0].completion.range as CompletionItemRanges).insert.startColumn, 1);
			assert.deepStrictEqual(completions.items[1].completion.label, {
				label: 'bar',
				description: 'barTest'
			});
			assert.strictEqual(completions.items[1].completion.insertText, 's1');
			assert.strictEqual((completions.items[1].completion.range as CompletionItemRanges).insert.startColumn, 5);
		}
	});

	test('Cannot use "<?php" as user snippet prefix anymore, #26275', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'',
			'<?php',
			'',
			'insert me',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		let model = instantiateTextModel(instantiationService, '\t<?php', 'fooLang');
		await provider.provideCompletionItems(model, new Position(1, 7), defaultCompletionContext)!.then(result => {
			assert.strictEqual(result.suggestions.length, 1);
		});
		const completions1 = await asCompletionModel(model, new Position(1, 7), provider);
		assert.strictEqual(completions1.items.length, 1);

		model.dispose();
		model = instantiateTextModel(instantiationService, '\t<?', 'fooLang');
		await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext).then(result => {
			assert.strictEqual(result.suggestions.length, 1);
			assert.strictEqual((result.suggestions[0].range as CompletionItemRanges).insert.startColumn, 2);
		});
		const completions2 = await asCompletionModel(model, new Position(1, 4), provider);
		assert.strictEqual(completions2.items.length, 1);
		assert.strictEqual((completions2.items[0].completion.range as CompletionItemRanges).insert.startColumn, 2);

		model.dispose();
		model = instantiateTextModel(instantiationService, 'a<?', 'fooLang');
		await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext)!.then(result => {
			assert.strictEqual(result.suggestions.length, 1);
			assert.strictEqual((result.suggestions[0].range as CompletionItemRanges).insert.startColumn, 2);
		});
		const completions3 = await asCompletionModel(model, new Position(1, 4), provider);
		assert.strictEqual(completions3.items.length, 1);
		assert.strictEqual((completions3.items[0].completion.range as CompletionItemRanges).insert.startColumn, 2);
		model.dispose();
	});

	test('No user snippets in suggestions, when inside the code, #30508', async function () {

		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'',
			'foo',
			'',
			'<foo>$0</foo>',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = disposables.add(instantiateTextModel(instantiationService, '<head>\n\t\n>/head>', 'fooLang'));
		await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext)!.then(result => {
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
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'second',
			'second',
			'',
			'second',
			'',
			SnippetSource.Extension,
			generateUuid()
		), new Snippet(
			false,
			['fooLang'],
			'first',
			'first',
			'',
			'first',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = disposables.add(instantiateTextModel(instantiationService, '', 'fooLang'));
		await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext)!.then(result => {
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
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'p-a',
			'p-a',
			'',
			'second',
			'',
			SnippetSource.User,
			generateUuid()
		)]);
		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = disposables.add(instantiateTextModel(instantiationService, 'p-', 'fooLang'));

		let result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext)!;
		let completions = await asCompletionModel(model, new Position(1, 2), provider);
		assert.strictEqual(result.suggestions.length, 1);
		assert.strictEqual(completions.items.length, 1);

		result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext)!;
		completions = await asCompletionModel(model, new Position(1, 3), provider);
		assert.strictEqual(result.suggestions.length, 1);
		assert.strictEqual(completions.items.length, 1);

		result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext)!;
		completions = await asCompletionModel(model, new Position(1, 3), provider);
		assert.strictEqual(result.suggestions.length, 1);
		assert.strictEqual(completions.items.length, 1);
	});

	test('No snippets suggestion on long lines beyond character 100 #58807', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'bug',
			'bug',
			'',
			'second',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = disposables.add(instantiateTextModel(instantiationService, 'Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea b', 'fooLang'));
		const result = await provider.provideCompletionItems(model, new Position(1, 158), defaultCompletionContext)!;
		const completions = await asCompletionModel(model, new Position(1, 158), provider);

		assert.strictEqual(result.suggestions.length, 1);
		assert.strictEqual(completions.items.length, 1);
	});

	test('Type colon will trigger snippet #60746', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'bug',
			'bug',
			'',
			'second',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = disposables.add(instantiateTextModel(instantiationService, ':', 'fooLang'));
		const result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext)!;
		assert.strictEqual(result.suggestions.length, 0);

		const completions = await asCompletionModel(model, new Position(1, 2), provider);
		assert.strictEqual(completions.items.length, 0);
	});

	test('substring of prefix can\'t trigger snippet #60737', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'mytemplate',
			'mytemplate',
			'',
			'second',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

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
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'bug',
			'bug',
			'',
			'second',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = disposables.add(instantiateTextModel(instantiationService, 'Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea b text_after_b', 'fooLang'));

		const result = await provider.provideCompletionItems(model, new Position(1, 158), defaultCompletionContext)!;
		assert.strictEqual(result.suggestions.length, 1);

		const completions = await asCompletionModel(model, new Position(1, 158), provider);
		assert.strictEqual(completions.items.length, 1);
	});

	test('Typing on a very long line does not look up the word at every column #350738', async function () {
		snippetService = new SimpleSnippetService(['bar', '<<'].map(prefix => new Snippet(false, ['fooLang'], prefix, prefix, '', prefix, '', SnippetSource.User, generateUuid())));
		const config = instantiationService.get(ILanguageConfigurationService);
		const wordPattern = /[a-z]+/g;
		disposables.add(config.register('fooLang', { wordPattern }));
		const provider = new SnippetCompletionProvider(languageService, snippetService, config);
		const model = disposables.add(instantiateTextModel(instantiationService, '', 'fooLang'));
		const exec = spy(wordPattern, 'exec');
		try {
			const measure = async (repeats: number) => {
				const line = '{"a":1},'.repeat(repeats) + 'ba <';
				model.setValue(line);
				exec.resetHistory();
				const startColumns = async (column: number) => (await provider.provideCompletionItems(model, new Position(1, column), defaultCompletionContext))
					.suggestions.map(s => [(s.label as CompletionItemLabel).label, (s.range as CompletionItemRanges).insert.startColumn - line.length]);
				const ranges = [await startColumns(line.length - 1), await startColumns(line.length + 1)];
				assert.deepStrictEqual(ranges, [[['bar', -3]], [['<<', 0]]]);
				return exec.callCount;
			};
			const shorter = await measure(1000);
			assert.ok(shorter > 0);
			assert.strictEqual(await measure(10_000), shorter);
		} finally {
			exec.restore();
		}
	});

	test('Skipping anchors beyond the longest snippet prefix does not change suggestions #350738', async function () {
		disposables.add(languageService.registerLanguage({ id: 'cssLikeLang' }));
		const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
		disposables.add(languageConfigurationService.register('cssLikeLang', {
			wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w\-?]+%?|[@#!.])/g
		}));

		const prefixes = ['bar', 'oo.b', '<<', 'p-a', '-a-bug', '#region', ' leading', '{}'];
		const lines = ['xzoo.b yy', 'foo.bar ba', 'x<< a <', 'zp-a p-', 'x-a-b .-a-bu', '##region #reg', 'a  leading lea', 'x{} {'];
		const createSnippet = (prefix: string) => new Snippet(false, ['fooLang'], prefix, prefix, '', prefix, '', SnippetSource.User, generateUuid());
		const mismatches: string[] = [];
		for (const languageId of ['fooLang', 'cssLikeLang']) {
			for (const line of lines) {
				const model = disposables.add(instantiateTextModel(instantiationService, line, languageId));
				for (const prefix of prefixes) {
					const provider = new SnippetCompletionProvider(languageService, new SimpleSnippetService([createSnippet(prefix)]), languageConfigurationService);
					const fullLineProvider = new SnippetCompletionProvider(languageService, new SimpleSnippetService([createSnippet(prefix), createSnippet(`~${line}~`)]), languageConfigurationService);
					for (let column = 1; column <= line.length + 1; column++) {
						const ranges = async (provider: SnippetCompletionProvider) => JSON.stringify((await provider.provideCompletionItems(model, new Position(1, column), defaultCompletionContext))
							.suggestions.filter(s => (s.label as CompletionItemLabel).label === prefix).map(s => s.range));
						const actual = await ranges(provider);
						const expected = await ranges(fullLineProvider);
						if (actual !== expected) {
							mismatches.push(`${languageId} '${line}' column ${column} prefix '${prefix}': ${actual} !== ${expected}`);
						}
					}
				}
			}
		}
		assert.deepStrictEqual(mismatches, []);
	});

	test('bounded snippet acceptance preserves adjacent, interior and clipped word anchors', async function () {
		const config = instantiationService.get(ILanguageConfigurationService);
		for (const { text, prefix, start, wordPattern } of [
			{ text: 'foo.12.b', prefix: '12.b', start: 5 },
			{ text: 'xzoo.b', prefix: 'oo.b', start: 5 },
			{ text: ':'.repeat(600) + 'a', prefix: ':'.repeat(600) + 'abc', start: 1 },
			{ text: 'a'.repeat(2000), prefix: 'a'.repeat(800), start: 1506 },
			{ text: ':'.repeat(2000) + '\'a\'xx$', prefix: 'x$', start: 2005, wordPattern: /'[^']+'(?=x)|\w+/g },
		]) {
			disposables.add(config.register('fooLang', { wordPattern }));
			const snippet = new Snippet(false, [], prefix, prefix, '', prefix, '', SnippetSource.User, generateUuid());
			const provider = new SnippetCompletionProvider(languageService, new SimpleSnippetService([snippet]), config);
			const model = disposables.add(instantiateTextModel(instantiationService, text, 'fooLang'));
			const { suggestions } = await provider.provideCompletionItems(model, new Position(1, text.length + 1), defaultCompletionContext);
			const [item] = suggestions;
			const { replace } = item.range as CompletionItemRanges;
			model.applyEdits([{ range: replace, text: item.insertText }]);
			assert.deepStrictEqual([replace.startColumn, model.getValue()], [start, text.slice(0, start - 1) + prefix]);
		}
	});

	test('bounded snippet matching uses the triggering line while snippets load', async function () {
		const deferred = new DeferredPromise<Snippet[]>();
		const service = new class extends SimpleSnippetService {
			override getSnippets(): Promise<Snippet[]> { return deferred.p; }
		}([]);
		const provider = new SnippetCompletionProvider(languageService, service, instantiationService.get(ILanguageConfigurationService));
		const number = disposables.add(instantiateTextModel(instantiationService, '1.', 'fooLang'));
		const name = disposables.add(instantiateTextModel(instantiationService, 'xx:foo.ba', 'fooLang'));
		const first = provider.provideCompletionItems(number, new Position(1, 3), defaultCompletionContext);
		const second = provider.provideCompletionItems(name, new Position(1, 10), defaultCompletionContext);
		const cts = disposables.add(new CancellationTokenSource());
		const canceled = provider.provideCompletionItems(name, new Position(1, 10), defaultCompletionContext, cts.token);
		cts.cancel();
		number.applyEdits([EditOperation.insert(new Position(1, 3), '2')]);
		name.setValue('xxxxxxxxx');
		await deferred.complete(['region', 'foo.bar'].map(prefix => new Snippet(false, [], prefix, prefix, '', prefix, '', SnippetSource.User, generateUuid())));
		const ranges = (await Promise.all([first, second, canceled])).map(list => list.suggestions.map(item => [item.insertText, (item.range as CompletionItemRanges).insert.startColumn]));
		assert.deepStrictEqual(ranges, [[['foo.bar', 2]], [['foo.bar', 4]], []]);
	});

	test('bounded snippet matching uses the word pattern on each side of a language boundary', async function () {
		const config = instantiationService.get(ILanguageConfigurationService);
		const inner = 'snippetInner';
		disposables.add(languageService.registerLanguage({ id: inner }));
		disposables.add(config.register(inner, { wordPattern: /[a-z:]+/g }));
		const outerId = languageService.languageIdCodec.encodeLanguageId('fooLang');
		const innerId = languageService.languageIdCodec.encodeLanguageId(inner);
		disposables.add(TokenizationRegistry.register('fooLang', {
			getInitialState: () => NullState,
			tokenize: () => { throw new Error('Unencoded tokenization not supported'); },
			tokenizeEncoded: (_line, _hasEOL, state) => new EncodedTokenizationResult(new Uint32Array([0, outerId, 4, innerId, 13, outerId]), [], state)
		}));
		const snippets = new SimpleSnippetService([':three!z', 'two:three!z'].map(prefix => new Snippet(false, [], prefix, prefix, '', prefix, '', SnippetSource.User, generateUuid())));
		const provider = new SnippetCompletionProvider(languageService, snippets, config);
		const model = disposables.add(instantiateTextModel(instantiationService, 'one:two:three!z;', 'fooLang'));
		model.tokenization.forceTokenization(1);
		const requests = [5, 14, 16].map(column => provider.provideCompletionItems(model, new Position(1, column), defaultCompletionContext));
		model.applyEdits([EditOperation.insert(new Position(1, 1), 'shift')]);
		const ranges = (await Promise.all(requests)).map(list => list.suggestions.map(item => {
			const { insert, replace } = item.range as CompletionItemRanges;
			return [item.insertText, insert.startColumn, insert.endColumn, replace.endColumn];
		}));
		assert.deepStrictEqual(ranges, [
			[['two:three!z', 5, 5, 16]],
			[['two:three!z', 5, 14, 16]],
			[[':three!z', 14, 16, 16], ['two:three!z', 5, 16, 16]]
		]);
	});

	test('issue #61296: VS code freezes when editing CSS fi`le with emoji', async function () {
		const languageConfigurationService = disposables.add(new TestLanguageConfigurationService());
		disposables.add(languageConfigurationService.register('fooLang', {
			wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w\-?]+%?|[@#!.])/g
		}));

		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'bug',
			'-a-bug',
			'',
			'second',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, languageConfigurationService);

		const model = disposables.add(instantiateTextModel(instantiationService, '.🐷-a-b', 'fooLang'));

		const result = await provider.provideCompletionItems(model, new Position(1, 8), defaultCompletionContext)!;
		assert.strictEqual(result.suggestions.length, 1);

		const completions = await asCompletionModel(model, new Position(1, 8), provider);
		assert.strictEqual(completions.items.length, 1);
	});

	test('No snippets shown when triggering completions at whitespace on line that already has text #62335', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'bug',
			'bug',
			'',
			'second',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = disposables.add(instantiateTextModel(instantiationService, 'a ', 'fooLang'));

		const result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext)!;
		assert.strictEqual(result.suggestions.length, 1);

		const completions = await asCompletionModel(model, new Position(1, 3), provider);
		assert.strictEqual(completions.items.length, 1);
	});

	test('Snippet prefix with special chars and numbers does not work #62906', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'noblockwdelay',
			'<<',
			'',
			'<= #dly"',
			'',
			SnippetSource.User,
			generateUuid()
		), new Snippet(
			false,
			['fooLang'],
			'noblockwdelay',
			'11',
			'',
			'eleven',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		let model = instantiateTextModel(instantiationService, ' <', 'fooLang');

		let result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext)!;
		assert.strictEqual(result.suggestions.length, 1);
		let [first] = result.suggestions;
		assert.strictEqual((first.range as CompletionItemRanges).insert.startColumn, 2);

		let completions = await asCompletionModel(model, new Position(1, 3), provider);
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].editStart.column, 2);

		model.dispose();
		model = instantiateTextModel(instantiationService, '1', 'fooLang');
		result = await provider.provideCompletionItems(model, new Position(1, 2), defaultCompletionContext)!;
		completions = await asCompletionModel(model, new Position(1, 2), provider);

		assert.strictEqual(result.suggestions.length, 1);
		[first] = result.suggestions;
		assert.strictEqual((first.range as CompletionItemRanges).insert.startColumn, 1);
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].editStart.column, 1);

		model.dispose();
	});

	test('Snippet replace range', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'notWordTest',
			'not word',
			'',
			'not word snippet',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		let model = instantiateTextModel(instantiationService, 'not wordFoo bar', 'fooLang');

		let result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext)!;
		assert.strictEqual(result.suggestions.length, 1);
		let [first] = result.suggestions;
		assert.strictEqual((first.range as CompletionItemRanges).insert.endColumn, 3);
		assert.strictEqual((first.range as CompletionItemRanges).replace.endColumn, 9);

		let completions = await asCompletionModel(model, new Position(1, 3), provider);
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].editInsertEnd.column, 3);
		assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);

		model.dispose();
		model = instantiateTextModel(instantiationService, 'not woFoo bar', 'fooLang');
		result = await provider.provideCompletionItems(model, new Position(1, 3), defaultCompletionContext)!;

		assert.strictEqual(result.suggestions.length, 1);
		[first] = result.suggestions;
		assert.strictEqual((first.range as CompletionItemRanges).insert.endColumn, 3);
		assert.strictEqual((first.range as CompletionItemRanges).replace.endColumn, 3);

		completions = await asCompletionModel(model, new Position(1, 3), provider);
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].editInsertEnd.column, 3);
		assert.strictEqual(completions.items[0].editReplaceEnd.column, 3);

		model.dispose();
		model = instantiateTextModel(instantiationService, 'not word', 'fooLang');
		result = await provider.provideCompletionItems(model, new Position(1, 1), defaultCompletionContext)!;

		assert.strictEqual(result.suggestions.length, 1);
		[first] = result.suggestions;
		assert.strictEqual((first.range as CompletionItemRanges).insert.endColumn, 1);
		assert.strictEqual((first.range as CompletionItemRanges).replace.endColumn, 9);

		completions = await asCompletionModel(model, new Position(1, 1), provider);
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].editInsertEnd.column, 1);
		assert.strictEqual(completions.items[0].editReplaceEnd.column, 9);

		model.dispose();
	});

	test('Snippet replace-range incorrect #108894', async function () {

		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'eng',
			'eng',
			'',
			'<span></span>',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = instantiateTextModel(instantiationService, 'filler e KEEP ng filler', 'fooLang');
		const result = await provider.provideCompletionItems(model, new Position(1, 9), defaultCompletionContext)!;
		const completions = await asCompletionModel(model, new Position(1, 9), provider);

		assert.strictEqual(result.suggestions.length, 1);
		const [first] = result.suggestions;
		assert.strictEqual((first.range as CompletionItemRanges).insert.endColumn, 9);
		assert.strictEqual((first.range as CompletionItemRanges).replace.endColumn, 9);

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

		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'PSCustomObject',
			'[PSCustomObject]',
			'',
			'[PSCustomObject] @{ Key = Value }',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, languageConfigurationService);

		const model = instantiateTextModel(instantiationService, '[psc]', 'fooLang');
		const result = await provider.provideCompletionItems(model, new Position(1, 5), defaultCompletionContext)!;
		const completions = await asCompletionModel(model, new Position(1, 5), provider);

		assert.strictEqual(result.suggestions.length, 1);
		const [first] = result.suggestions;
		assert.strictEqual((first.range as CompletionItemRanges).insert.endColumn, 5);
		// This is 6 because it should eat the `]` at the end of the text even if cursor is before it
		assert.strictEqual((first.range as CompletionItemRanges).replace.endColumn, 6);

		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].editInsertEnd.column, 5);
		assert.strictEqual(completions.items[0].editReplaceEnd.column, 6);

		model.dispose();
	});

	test('Leading whitespace in snippet prefix #123860', async function () {

		snippetService = new SimpleSnippetService([new Snippet(
			false,
			['fooLang'],
			'cite-name',
			' cite',
			'',
			'~\\cite{$CLIPBOARD}',
			'',
			SnippetSource.User,
			generateUuid()
		)]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = instantiateTextModel(instantiationService, ' ci', 'fooLang');
		const result = await provider.provideCompletionItems(model, new Position(1, 4), defaultCompletionContext)!;
		const completions = await asCompletionModel(model, new Position(1, 4), provider);

		assert.strictEqual(result.suggestions.length, 1);
		const [first] = result.suggestions;
		assert.strictEqual((<CompletionItemLabel>first.label).label, ' cite');
		assert.strictEqual((<CompletionItemRanges>first.range).insert.startColumn, 1);

		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].textLabel, ' cite');
		assert.strictEqual(completions.items[0].editStart.column, 1);

		model.dispose();
	});

	test('still show suggestions in string when disable string suggestion #136611', async function () {

		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'aaa', 'aaa', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], 'bbb', 'bbb', '', 'value', '', SnippetSource.User, generateUuid()),
			// new Snippet(['fooLang'], '\'ccc', '\'ccc', '', 'value', '', SnippetSource.User, generateUuid())
		]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = instantiateTextModel(instantiationService, '\'\'', 'fooLang');
		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 2),
			{ triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '\'' }
		)!;

		assert.strictEqual(result.suggestions.length, 0);
		model.dispose();

	});

	test('still show suggestions in string when disable string suggestion #136611 (part 2)', async function () {

		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'aaa', 'aaa', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], 'bbb', 'bbb', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], '\'ccc', '\'ccc', '', 'value', '', SnippetSource.User, generateUuid())
		]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));

		const model = instantiateTextModel(instantiationService, '\'\'', 'fooLang');

		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 2),
			{ triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '\'' }
		)!;

		assert.strictEqual(result.suggestions.length, 1);

		const completions = await asCompletionModel(model, new Position(1, 2), provider, { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '\'' });
		assert.strictEqual(completions.items.length, 1);

		model.dispose();
	});

	test('Snippet suggestions are too eager #138707 (word)', async function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'tys', 'tys', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], 'hell_or_tell', 'hell_or_tell', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], '^y', '^y', '', 'value', '', SnippetSource.User, generateUuid()),
		]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = instantiateTextModel(instantiationService, '\'hellot\'', 'fooLang');

		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 8),
			{ triggerKind: CompletionTriggerKind.Invoke }
		)!;

		assert.strictEqual(result.suggestions.length, 1);
		assert.strictEqual((<SnippetCompletion>result.suggestions[0]).label.label, 'hell_or_tell');

		const completions = await asCompletionModel(model, new Position(1, 8), provider, { triggerKind: CompletionTriggerKind.Invoke });
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].textLabel, 'hell_or_tell');

		model.dispose();
	});

	test('Snippet suggestions are too eager #138707 (no word)', async function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'tys', 'tys', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], 't', 't', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], '^y', '^y', '', 'value', '', SnippetSource.User, generateUuid()),
		]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = instantiateTextModel(instantiationService, ')*&^', 'fooLang');

		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 5),
			{ triggerKind: CompletionTriggerKind.Invoke }
		)!;

		assert.strictEqual(result.suggestions.length, 1);
		assert.strictEqual((<SnippetCompletion>result.suggestions[0]).label.label, '^y');


		const completions = await asCompletionModel(model, new Position(1, 5), provider, { triggerKind: CompletionTriggerKind.Invoke });
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].textLabel, '^y');

		model.dispose();
	});

	test('Snippet suggestions are too eager #138707 (word/word)', async function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'async arrow function', 'async arrow function', '', 'value', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], 'foobarrrrrr', 'foobarrrrrr', '', 'value', '', SnippetSource.User, generateUuid()),
		]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = instantiateTextModel(instantiationService, 'foobar', 'fooLang');

		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 7),
			{ triggerKind: CompletionTriggerKind.Invoke }
		)!;

		assert.strictEqual(result.suggestions.length, 1);
		assert.strictEqual((<SnippetCompletion>result.suggestions[0]).label.label, 'foobarrrrrr');

		const completions = await asCompletionModel(model, new Position(1, 7), provider, { triggerKind: CompletionTriggerKind.Invoke });
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].textLabel, 'foobarrrrrr');
		model.dispose();
	});

	test('Strange and useless autosuggestion #region/#endregion PHP #140039', async function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'reg', '#region', '', 'value', '', SnippetSource.User, generateUuid()),
		]);


		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = instantiateTextModel(instantiationService, 'function abc(w)', 'fooLang');
		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 15),
			{ triggerKind: CompletionTriggerKind.Invoke }
		)!;

		assert.strictEqual(result.suggestions.length, 0);
		model.dispose();
	});

	test.skip('Snippets disappear with . key #145960', async function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'div', 'div', '', 'div', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], 'div.', 'div.', '', 'div.', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], 'div#', 'div#', '', 'div#', '', SnippetSource.User, generateUuid()),
		]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = instantiateTextModel(instantiationService, 'di', 'fooLang');
		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 3),
			{ triggerKind: CompletionTriggerKind.Invoke }
		)!;

		assert.strictEqual(result.suggestions.length, 3);


		model.applyEdits([EditOperation.insert(new Position(1, 3), '.')]);
		assert.strictEqual(model.getValue(), 'di.');
		const result2 = await provider.provideCompletionItems(
			model,
			new Position(1, 4),
			{ triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '.' }
		)!;

		assert.strictEqual(result2.suggestions.length, 1);
		assert.strictEqual(result2.suggestions[0].insertText, 'div.');

		model.dispose();
	});

	test('Hyphen in snippet prefix de-indents snippet #139016', async function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'foo', 'Foo- Bar', '', 'Foo', '', SnippetSource.User, generateUuid()),
		]);
		const model = disposables.add(instantiateTextModel(instantiationService, '    bar', 'fooLang'));
		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const result = await provider.provideCompletionItems(
			model,
			new Position(1, 8),
			{ triggerKind: CompletionTriggerKind.Invoke }
		);

		assert.strictEqual(result.suggestions.length, 1);
		const first = result.suggestions[0];
		assert.strictEqual((<CompletionItemRanges>first.range).insert.startColumn, 5);

		const completions = await asCompletionModel(model, new Position(1, 8), provider);
		assert.strictEqual(completions.items.length, 1);
		assert.strictEqual(completions.items[0].editStart.column, 5);
	});

	test('Autocomplete suggests based on the last letter of a word and it depends on the typing speed #191070', async function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], '/whiletrue', '/whiletrue', '', 'one', '', SnippetSource.User, generateUuid()),
			new Snippet(false, ['fooLang'], '/sc not expanding', '/sc not expanding', '', 'two', '', SnippetSource.User, generateUuid()),
		]);

		const provider = new SnippetCompletionProvider(languageService, snippetService, disposables.add(new TestLanguageConfigurationService()));
		const model = disposables.add(instantiateTextModel(instantiationService, '', 'fooLang'));

		{ // PREFIX: w
			model.setValue('w');
			const result1 = await provider.provideCompletionItems(
				model,
				new Position(1, 2),
				{ triggerKind: CompletionTriggerKind.Invoke }
			);
			assert.strictEqual(result1.suggestions[0].insertText, 'one');
			assert.strictEqual(result1.suggestions.length, 1);
		}

		{ // PREFIX: where
			model.setValue('where');
			const result2 = await provider.provideCompletionItems(
				model,
				new Position(1, 6),
				{ triggerKind: CompletionTriggerKind.Invoke }
			);
			assert.strictEqual(result2.suggestions[0].insertText, 'one'); // /whiletrue matches where (WHilEtRuE)
			assert.strictEqual(result2.suggestions.length, 1);
		}
	});

	test('getSnippetsSync - include pattern', function () {
		snippetService = new SimpleSnippetService([
			new Snippet(false, ['fooLang'], 'TestSnippet', 'test', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['**/*.test.ts']),
			new Snippet(false, ['fooLang'], 'SpecSnippet', 'spec', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['**/*.spec.ts']),
			new Snippet(false, ['fooLang'], 'AllSnippet', 'all', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
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
			new Snippet(false, ['fooLang'], 'ProdSnippet', 'prod', '', 'snippet', 'test', SnippetSource.User, generateUuid(), undefined, ['**/*.min.js', '**/dist/**']),
			new Snippet(false, ['fooLang'], 'AllSnippet', 'all', '', 'snippet', 'test', SnippetSource.User, generateUuid()),
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
			new Snippet(false, ['fooLang'], 'TestSnippet', 'test', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['**/*.test.ts', '**/*.spec.ts'], ['**/*.perf.test.ts']),
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
			new Snippet(false, ['fooLang'], 'TestSnippet', 'test', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['*.test.ts']),
			new Snippet(false, ['fooLang'], 'ConfigSnippet', 'config', '', 'snippet', 'test', SnippetSource.User, generateUuid(), ['config.json']),
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
