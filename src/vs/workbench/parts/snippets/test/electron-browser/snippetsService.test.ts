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
import { Model } from 'vs/editor/common/model/model';
import { ISnippetsService, Snippet } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';

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

	setup(function () {
		modeService = new ModeServiceImpl();
		snippetService = new SimpleSnippetService([new Snippet(
			'barTest',
			'bar',
			'',
			'barCodeSnippet',
			''
		), new Snippet(
			'bazzTest',
			'bazz',
			'',
			'bazzCodeSnippet',
			''
		)]);
	});


	test('snippet completions - simple', function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = Model.createFromString('', undefined, modeService.getLanguageIdentifier('fooLang'));

		return provider.provideCompletionItems(model, new Position(1, 1)).then(result => {
			assert.equal(result.incomplete, undefined);
			assert.equal(result.suggestions.length, 2);
		});
	});

	test('snippet completions - with prefix', function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = Model.createFromString('bar', undefined, modeService.getLanguageIdentifier('fooLang'));

		return provider.provideCompletionItems(model, new Position(1, 4)).then(result => {
			assert.equal(result.incomplete, undefined);
			assert.equal(result.suggestions.length, 1);
			assert.equal(result.suggestions[0].label, 'bar');
			assert.equal(result.suggestions[0].insertText, 'barCodeSnippet');
		});
	});

	test('Cannot use "<?php" as user snippet prefix anymore, #26275', function () {
		snippetService = new SimpleSnippetService([new Snippet(
			'',
			'<?php',
			'',
			'insert me',
			''
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = Model.createFromString('\t<?php', undefined, modeService.getLanguageIdentifier('fooLang'));
		return provider.provideCompletionItems(model, new Position(1, 7)).then(result => {
			assert.equal(result.suggestions.length, 1);
			model.dispose();

			model = Model.createFromString('\t<?', undefined, modeService.getLanguageIdentifier('fooLang'));
			return provider.provideCompletionItems(model, new Position(1, 4));
		}).then(result => {
			assert.equal(result.suggestions.length, 1);
			model.dispose();

			model = Model.createFromString('a<?', undefined, modeService.getLanguageIdentifier('fooLang'));
			return provider.provideCompletionItems(model, new Position(1, 4));
		}).then(result => {

			assert.equal(result.suggestions.length, 0);
			model.dispose();
		});
	});

	test('No user snippets in suggestions, when inside the code, #30508', function () {

		snippetService = new SimpleSnippetService([new Snippet(
			'',
			'foo',
			'',
			'<foo>$0</foo>',
			''
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = Model.createFromString('<head>\n\t\n>/head>', undefined, modeService.getLanguageIdentifier('fooLang'));
		return provider.provideCompletionItems(model, new Position(1, 1)).then(result => {
			assert.equal(result.suggestions.length, 1);
			return provider.provideCompletionItems(model, new Position(2, 2));
		}).then(result => {
			assert.equal(result.suggestions.length, 1);
		});
	});

	test('SnippetSuggest - ensure extension snippets come last ', function () {
		snippetService = new SimpleSnippetService([new Snippet(
			'second',
			'second',
			'',
			'second',
			'',
			true
		), new Snippet(
			'first',
			'first',
			'',
			'first',
			'',
			false
		)]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = Model.createFromString('', undefined, modeService.getLanguageIdentifier('fooLang'));
		return provider.provideCompletionItems(model, new Position(1, 1)).then(result => {
			assert.equal(result.suggestions.length, 2);
			let [first, second] = result.suggestions;
			assert.equal(first.label, 'first');
			assert.equal(second.label, 'second');
		});
	});
});
