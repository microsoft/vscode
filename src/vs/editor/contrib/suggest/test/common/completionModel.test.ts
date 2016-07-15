/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {ISuggestResult2} from 'vs/editor/contrib/suggest/common/suggest';
import {CompletionModel, CompletionItemComparator} from 'vs/editor/contrib/suggest/common/completionModel';


const mixedSuggestions = <ISuggestResult2>{
	currentWord: '',
	incomplete: false,
	support: undefined,
	suggestions: [{
		type: 'snippet',
		label: 'zzz',
		codeSnippet: 'zzz'
	}, {
		type: 'snippet',
		label: 'aaa',
		codeSnippet: 'aaa'
	}, {
		type: 'property',
		label: 'fff',
		codeSnippet: 'fff'
	}]
};


suite('CompletionModel', function() {

	test('sort - normal', function() {
		const model = new CompletionModel([mixedSuggestions], '', CompletionItemComparator.defaultComparator, false);
		assert.equal(model.items.length, 3);

		const [one, two, three] = model.items;
		assert.equal(one.suggestion.label, 'aaa');
		assert.equal(two.suggestion.label, 'fff');
		assert.equal(three.suggestion.label, 'zzz');
	});

	test('sort - snippet up', function() {
		const model = new CompletionModel([mixedSuggestions], '', CompletionItemComparator.snippetUpComparator, false);
		assert.equal(model.items.length, 3);

		const [one, two, three] = model.items;
		assert.equal(one.suggestion.label, 'aaa');
		assert.equal(two.suggestion.label, 'zzz');
		assert.equal(three.suggestion.label, 'fff');
	});

	test('sort - snippet down', function() {
		const model = new CompletionModel([mixedSuggestions], '', CompletionItemComparator.snippetDownComparator, false);
		assert.equal(model.items.length, 3);

		const [one, two, three] = model.items;
		assert.equal(one.suggestion.label, 'fff');
		assert.equal(two.suggestion.label, 'aaa');
		assert.equal(three.suggestion.label, 'zzz');
	});

	test('ignore snippets', function() {

		const model = new CompletionModel([mixedSuggestions], '', CompletionItemComparator.defaultComparator, true);
		assert.equal(model.items.length, 1);

		const [one] = model.items;
		assert.equal(one.suggestion.label, 'fff');
	});
});