/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { SnippetSuggestProvider } from 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import { Position } from 'vs/editor/common/core/position';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ISnippetsService } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { Snippet } from 'vs/workbench/parts/snippets/electron-browser/snippetsFile';
import { SuggestContext, SuggestTriggerKind } from 'vs/editor/common/modes';

class SimpleSnippetService implements ISnippetsService {
	_serviceBrand: any;
	constructor(readonly snippets: Snippet[]) {
	}
	getSnippets() {
		return Promise.resolve(this.getSnippetsSync());
	}
	getSnippetsSync(): Snippet[] {
		return this.snippets;
	}
	getSnippetFiles(): any {
		throw new Error();
	}
}

suite('SnippetsService', function () {

	suiteSetup(function () {
		ModesRegistry.registerLanguage({
			id: 'fooLang',
			extensions: ['.fooLang',]
		});
	});

	let modeService: ModeServiceImpl;
	let snippetService: ISnippetsService;
	let suggestContext: SuggestContext = { triggerKind: SuggestTriggerKind.Invoke };

	setup(function () {
		modeService = new ModeServiceImpl();
		snippetService = new SimpleSnippetService([new Snippet(
			['fooLang'],
			'barTest',
			'bar',
			'',
			'barCodeSnippet',
			''
		), new Snippet(
			['fooLang'],
			'bazzTest',
			'bazz',
			'',
			'bazzCodeSnippet',
			''
		)]);
	});


	test('snippet completions - simple', function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = TextModel.createFromString('', undefined, modeService.getLanguageIdentifier('fooLang'));

		return provider.provideCompletionItems(model, new Position(1, 1), suggestContext).then(result => {
			assert.equal(result.incomplete, undefined);
			assert.equal(result.suggestions.length, 2);
		});
	});

	test('snippet completions - with prefix', function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = TextModel.createFromString('bar', undefined, modeService.getLanguageIdentifier('fooLang'));

		return provider.provideCompletionItems(model, new Position(1, 4), suggestContext).then(result => {
			assert.equal(result.incomplete, undefined);
			assert.equal(result.suggestions.length, 1);
			assert.equal(result.suggestions[0].label, 'bar');
			assert.equal(result.suggestions[0].overwriteBefore, 3);
			assert.equal(result.suggestions[0].insertText, 'barCodeSnippet');
		});
	});

	test('snippet completions - with different prefixes', async function () {

		snippetService = new SimpleSnippetService([new Snippet(
			['fooLang'],
			'barTest',
			'bar',
			'',
			's1',
			''
		), new Snippet(
			['fooLang'],
			'name',
			'bar-bar',
			'',
			's2',
			''
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = TextModel.createFromString('bar-bar', undefined, modeService.getLanguageIdentifier('fooLang'));

		await provider.provideCompletionItems(model, new Position(1, 3), suggestContext).then(result => {
			assert.equal(result.incomplete, undefined);
			assert.equal(result.suggestions.length, 2);
			assert.equal(result.suggestions[0].label, 'bar');
			assert.equal(result.suggestions[0].insertText, 's1');
			assert.equal(result.suggestions[0].overwriteBefore, 2);
			assert.equal(result.suggestions[1].label, 'bar-bar');
			assert.equal(result.suggestions[1].insertText, 's2');
			assert.equal(result.suggestions[1].overwriteBefore, 2);
		});

		await provider.provideCompletionItems(model, new Position(1, 5), suggestContext).then(result => {
			assert.equal(result.incomplete, undefined);
			assert.equal(result.suggestions.length, 1);
			assert.equal(result.suggestions[0].label, 'bar-bar');
			assert.equal(result.suggestions[0].insertText, 's2');
			assert.equal(result.suggestions[0].overwriteBefore, 4);
		});

		await provider.provideCompletionItems(model, new Position(1, 6), suggestContext).then(result => {
			assert.equal(result.incomplete, undefined);
			assert.equal(result.suggestions.length, 2);
			assert.equal(result.suggestions[0].label, 'bar');
			assert.equal(result.suggestions[0].insertText, 's1');
			assert.equal(result.suggestions[0].overwriteBefore, 1);
			assert.equal(result.suggestions[1].label, 'bar-bar');
			assert.equal(result.suggestions[1].insertText, 's2');
			assert.equal(result.suggestions[1].overwriteBefore, 5);
		});
	});

	test('Cannot use "<?php" as user snippet prefix anymore, #26275', function () {
		snippetService = new SimpleSnippetService([new Snippet(
			['fooLang'],
			'',
			'<?php',
			'',
			'insert me',
			''
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = TextModel.createFromString('\t<?php', undefined, modeService.getLanguageIdentifier('fooLang'));
		return provider.provideCompletionItems(model, new Position(1, 7), suggestContext).then(result => {
			assert.equal(result.suggestions.length, 1);
			model.dispose();

			model = TextModel.createFromString('\t<?', undefined, modeService.getLanguageIdentifier('fooLang'));
			return provider.provideCompletionItems(model, new Position(1, 4), suggestContext);
		}).then(result => {
			assert.equal(result.suggestions.length, 1);
			assert.equal(result.suggestions[0].overwriteBefore, 2);
			model.dispose();

			model = TextModel.createFromString('a<?', undefined, modeService.getLanguageIdentifier('fooLang'));
			return provider.provideCompletionItems(model, new Position(1, 4), suggestContext);
		}).then(result => {
			assert.equal(result.suggestions.length, 1);
			assert.equal(result.suggestions[0].overwriteBefore, 2);
			model.dispose();
		});
	});

	test('No user snippets in suggestions, when inside the code, #30508', function () {

		snippetService = new SimpleSnippetService([new Snippet(
			['fooLang'],
			'',
			'foo',
			'',
			'<foo>$0</foo>',
			''
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = TextModel.createFromString('<head>\n\t\n>/head>', undefined, modeService.getLanguageIdentifier('fooLang'));
		return provider.provideCompletionItems(model, new Position(1, 1), suggestContext).then(result => {
			assert.equal(result.suggestions.length, 1);
			return provider.provideCompletionItems(model, new Position(2, 2), suggestContext);
		}).then(result => {
			assert.equal(result.suggestions.length, 1);
		});
	});

	test('SnippetSuggest - ensure extension snippets come last ', function () {
		snippetService = new SimpleSnippetService([new Snippet(
			['fooLang'],
			'second',
			'second',
			'',
			'second',
			'',
			true
		), new Snippet(
			['fooLang'],
			'first',
			'first',
			'',
			'first',
			'',
			false
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = TextModel.createFromString('', undefined, modeService.getLanguageIdentifier('fooLang'));
		return provider.provideCompletionItems(model, new Position(1, 1), suggestContext).then(result => {
			assert.equal(result.suggestions.length, 2);
			let [first, second] = result.suggestions;
			assert.equal(first.label, 'first');
			assert.equal(second.label, 'second');
		});
	});

	test('Dash in snippets prefix broken #53945', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			['fooLang'],
			'p-a',
			'p-a',
			'',
			'second',
			''
		)]);
		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = TextModel.createFromString('p-', undefined, modeService.getLanguageIdentifier('fooLang'));

		let result = await provider.provideCompletionItems(model, new Position(1, 2), suggestContext);
		assert.equal(result.suggestions.length, 1);

		result = await provider.provideCompletionItems(model, new Position(1, 3), suggestContext);
		assert.equal(result.suggestions.length, 1);

		result = await provider.provideCompletionItems(model, new Position(1, 3), { triggerCharacter: '-', triggerKind: SuggestTriggerKind.TriggerCharacter });
		assert.equal(result.suggestions.length, 1);
	});

	test('No snippets suggestion on long lines beyond character 100 #58807', async function () {
		snippetService = new SimpleSnippetService([new Snippet(
			['fooLang'],
			'bug',
			'bug',
			'',
			'second',
			''
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = TextModel.createFromString('Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea Thisisaverylonglinegoingwithmore100bcharactersandthismakesintellisensebecomea b', undefined, modeService.getLanguageIdentifier('fooLang'));
		let result = await provider.provideCompletionItems(model, new Position(1, 158), suggestContext);

		assert.equal(result.suggestions.length, 1);
	});
});
