/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { SnippetsService, ISnippet, SnippetSuggestProvider } from 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import { Position } from 'vs/editor/common/core/position';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { Model } from 'vs/editor/common/model/model';

suite('SnippetsService', function () {

	suiteSetup(function () {
		ModesRegistry.registerLanguage({
			id: 'fooLang',
			extensions: ['.fooLang',]
		});
	});

	let modeService: ModeServiceImpl;
	let snippetService: SnippetsService;

	setup(function () {
		modeService = new ModeServiceImpl();
		snippetService = new SnippetsService(modeService);

		snippetService.registerSnippets(modeService.getLanguageIdentifier('fooLang').id, <ISnippet[]>[{
			prefix: 'bar',
			codeSnippet: 'barCodeSnippet',
			name: 'barTest',
			description: ''
		}, {
			prefix: 'bazz',
			codeSnippet: 'bazzCodeSnippet',
			name: 'bazzTest',
			description: ''
		}], 'fooFile.json');
	});

	test('snippet completions - simple', function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = Model.createFromString('', undefined, modeService.getLanguageIdentifier('fooLang'));

		const result = provider.provideCompletionItems(model, new Position(1, 1));

		assert.equal(result.incomplete, undefined);
		assert.equal(result.suggestions.length, 2);
	});

	test('snippet completions - with prefix', function () {

		const provider = new SnippetSuggestProvider(modeService, snippetService);
		const model = Model.createFromString('bar', undefined, modeService.getLanguageIdentifier('fooLang'));

		const result = provider.provideCompletionItems(model, new Position(1, 4));

		assert.equal(result.incomplete, undefined);
		assert.equal(result.suggestions.length, 1);
		assert.equal(result.suggestions[0].label, 'bar');
		assert.equal(result.suggestions[0].insertText, 'barCodeSnippet');
	});

	test('Cannot use "<?php" as user snippet prefix anymore, #26275', function () {
		snippetService.registerSnippets(modeService.getLanguageIdentifier('fooLang').id, <ISnippet[]>[{
			prefix: '<?php',
			codeSnippet: 'insert me',
			name: '',
			description: ''
		}], 'barFile.json');

		const provider = new SnippetSuggestProvider(modeService, snippetService);

		let model = Model.createFromString('\t<?php', undefined, modeService.getLanguageIdentifier('fooLang'));
		let result = provider.provideCompletionItems(model, new Position(1, 7));
		assert.equal(result.suggestions.length, 1);
		model.dispose();

		model = Model.createFromString('\t<?', undefined, modeService.getLanguageIdentifier('fooLang'));
		result = provider.provideCompletionItems(model, new Position(1, 4));
		assert.equal(result.suggestions.length, 1);
		model.dispose();

		model = Model.createFromString('a<?', undefined, modeService.getLanguageIdentifier('fooLang'));
		result = provider.provideCompletionItems(model, new Position(1, 4));
		assert.equal(result.suggestions.length, 0);
		model.dispose();
	});
});
