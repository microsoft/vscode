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
import { ISnippetsService, ISnippet } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { TPromise } from 'vs/base/common/winjs.base';

class SimpleSnippetService implements ISnippetsService {
	_serviceBrand: any;
	constructor(readonly snippets: ISnippet[]) {
	}
	getSnippets() {
		return TPromise.as(this.getSnippetsSync());
	}
	getSnippetsSync(): ISnippet[] {
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
		snippetService = new SimpleSnippetService([{
			prefix: 'bar',
			codeSnippet: 'barCodeSnippet',
			name: 'barTest',
			description: '',
			source: ''
		}, {
			prefix: 'bazz',
			codeSnippet: 'bazzCodeSnippet',
			name: 'bazzTest',
			description: '',
			source: ''
		}]);
	});


	test('snippet completions - simple', async function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = Model.createFromString('', undefined, modeService.getLanguageIdentifier('fooLang'));

		const result = await provider.provideCompletionItems(model, new Position(1, 1));

		assert.equal(result.incomplete, undefined);
		assert.equal(result.suggestions.length, 2);
	});

	test('snippet completions - with prefix', async function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = Model.createFromString('bar', undefined, modeService.getLanguageIdentifier('fooLang'));

		const result = await provider.provideCompletionItems(model, new Position(1, 4));

		assert.equal(result.incomplete, undefined);
		assert.equal(result.suggestions.length, 1);
		assert.equal(result.suggestions[0].label, 'bar');
		assert.equal(result.suggestions[0].insertText, 'barCodeSnippet');
	});

	test('Cannot use "<?php" as user snippet prefix anymore, #26275', async function () {
		snippetService = new SimpleSnippetService([{
			prefix: '<?php',
			codeSnippet: 'insert me',
			name: '',
			description: '',
			source: ''
		}]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = Model.createFromString('\t<?php', undefined, modeService.getLanguageIdentifier('fooLang'));
		let result = await provider.provideCompletionItems(model, new Position(1, 7));
		assert.equal(result.suggestions.length, 1);
		model.dispose();

		model = Model.createFromString('\t<?', undefined, modeService.getLanguageIdentifier('fooLang'));
		result = await provider.provideCompletionItems(model, new Position(1, 4));
		assert.equal(result.suggestions.length, 1);
		model.dispose();

		model = Model.createFromString('a<?', undefined, modeService.getLanguageIdentifier('fooLang'));
		result = await provider.provideCompletionItems(model, new Position(1, 4));
		assert.equal(result.suggestions.length, 0);
		model.dispose();
	});

	test('No user snippets in suggestions, when inside the code, #30508', async function () {

		snippetService = new SimpleSnippetService([{
			prefix: 'foo',
			codeSnippet: '<foo>$0</foo>',
			name: '',
			description: '',
			source: ''
		}]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = Model.createFromString('<head>\n\t\n>/head>', undefined, modeService.getLanguageIdentifier('fooLang'));
		let result = await provider.provideCompletionItems(model, new Position(1, 1));
		assert.equal(result.suggestions.length, 1);

		result = await provider.provideCompletionItems(model, new Position(2, 2));
		assert.equal(result.suggestions.length, 1);
	});

	test('SnippetSuggest - ensure extension snippets come last ', async function () {
		snippetService = new SimpleSnippetService([{
			prefix: 'second',
			codeSnippet: 'second',
			name: 'second',
			description: '',
			source: '',
			isFromExtension: true
		}, {
			prefix: 'first',
			codeSnippet: 'first',
			name: 'first',
			description: '',
			source: '',
			isFromExtension: false
		}]);

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = Model.createFromString('', undefined, modeService.getLanguageIdentifier('fooLang'));
		let result = await provider.provideCompletionItems(model, new Position(1, 1));
		assert.equal(result.suggestions.length, 2);

		let [first, second] = result.suggestions;
		assert.equal(first.label, 'first');
		assert.equal(second.label, 'second');
	});
});
