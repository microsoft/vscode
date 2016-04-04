/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Range} from 'vs/editor/common/core/range';
import {CodeSnippet, ExternalSnippetType} from 'vs/editor/contrib/snippet/common/snippet';

suite('Editor Contrib - Snippets', () => {

	test('bug #17541:[snippets] Support default text in mirrors', () => {

		var external = [
			'begin{${1:enumerate}}',
			'\t$0',
			'end{$1}'
		].join('\n');

		var internal = CodeSnippet.convertExternalSnippet(external, ExternalSnippetType.TextMateSnippet);

		assert.equal(internal, [
			'begin\\{{{1:enumerate}}\\}',
			'\t{{}}',
			'end\\{{{1:}}\\}'
		].join('\n'));

		var snippet = new CodeSnippet(internal);

		assert.deepEqual(snippet.lines, [
			'begin{enumerate}',
			'\t',
			'end{enumerate}'
		]);
		assert.equal(snippet.placeHolders.length, 2);
		assert.equal(snippet.placeHolders[0].id, '1');
		assert.equal(snippet.placeHolders[0].occurences.length, 2);
		assert.deepEqual(snippet.placeHolders[0].occurences[0], new Range(1, 7, 1, 16));
		assert.deepEqual(snippet.placeHolders[0].occurences[1], new Range(3, 5, 3, 14));
		assert.equal(snippet.placeHolders[1].id, '');
		assert.equal(snippet.placeHolders[1].occurences.length, 1);
		assert.deepEqual(snippet.placeHolders[1].occurences[0], new Range(2, 2, 2, 2));
	});

	test('bug #17487:[snippets] four backslashes are required to get one backslash in the inserted text', () => {

		var external = [
			'\\begin{${1:enumerate}}',
			'\t$0',
			'\\end{$1}'
		].join('\n');

		var internal = CodeSnippet.convertExternalSnippet(external, ExternalSnippetType.TextMateSnippet);

		assert.equal(internal, [
			'\\begin\\{{{1:enumerate}}\\}',
			'\t{{}}',
			'\\end\\{{{1:}}\\}'
		].join('\n'));

		var snippet = new CodeSnippet(internal);

		assert.deepEqual(snippet.lines, [
			'\\begin{enumerate}',
			'\t',
			'\\end{enumerate}'
		]);
		assert.equal(snippet.placeHolders.length, 2);
		assert.equal(snippet.placeHolders[0].id, '1');
		assert.equal(snippet.placeHolders[0].occurences.length, 2);
		assert.deepEqual(snippet.placeHolders[0].occurences[0], new Range(1, 8, 1, 17));
		assert.deepEqual(snippet.placeHolders[0].occurences[1], new Range(3, 6, 3, 15));
		assert.equal(snippet.placeHolders[1].id, '');
		assert.equal(snippet.placeHolders[1].occurences.length, 1);
		assert.deepEqual(snippet.placeHolders[1].occurences[0], new Range(2, 2, 2, 2));
	});

	test('issue #3552: Snippet Converted Not Working for literal Dollar Sign', () => {

		let external = '\n\\$scope.\\$broadcast(\'scroll.infiniteScrollComplete\');\n';
		let internal = CodeSnippet.convertExternalSnippet(external, ExternalSnippetType.TextMateSnippet);

		assert.equal(internal, '\n$scope.$broadcast(\'scroll.infiniteScrollComplete\');\n');
	});
});

