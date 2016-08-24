/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Range} from 'vs/editor/common/core/range';
import {CodeSnippet} from 'vs/editor/contrib/snippet/common/snippet';

suite('Editor Contrib - Snippets', () => {

	function assertInternalAndTextmate(internal: string, textmate: string, callback: (snippet: CodeSnippet) => any) {

		callback(CodeSnippet.fromInternal(internal));
		callback(CodeSnippet.fromTextmate(textmate));
	}

	test('Support tab stop order', () => {

		assertInternalAndTextmate(
			'finished:{{}}, second:{{2:name}}, first:{{1:}}, third:{{3:}}',
			'finished:$0, second:${2:name}, first:$1, third:$3',
			snippet => {
				assert.deepEqual(snippet.lines, ['finished:, second:name, first:, third:']);
				assert.equal(snippet.placeHolders.length, 4);
				assert.equal(snippet.placeHolders[0].id, '1');
				assert.equal(snippet.placeHolders[0].value, '');
				assert.equal(snippet.placeHolders[1].id, '2');
				assert.equal(snippet.placeHolders[1].value, 'name');
				assert.equal(snippet.placeHolders[2].id, '3');
				assert.equal(snippet.placeHolders[2].value, '');
				assert.equal(snippet.placeHolders[3].id, '');
				assert.equal(snippet.placeHolders[3].value, '');
				assert.equal(snippet.finishPlaceHolderIndex, 3);
			});
	});

	test('Support tab stop order with implicit finish', () => {

		assertInternalAndTextmate(
			't2:{{2:}}, t1:{{1:}}',
			't2:$2, t1:$1',
			snippet => {
				assert.deepEqual(snippet.lines, ['t2:, t1:']);
				assert.equal(snippet.placeHolders.length, 2);
				assert.equal(snippet.placeHolders[0].id, '1');
				assert.equal(snippet.placeHolders[0].value, '');
				assert.equal(snippet.placeHolders[1].id, '2');
				assert.equal(snippet.placeHolders[1].value, '');
				assert.equal(snippet.finishPlaceHolderIndex, 1);
			});
	});

	test('Support tab stop order with no finish', () => {

		assertInternalAndTextmate(
			't2:{{2:second}}, t3:{{3:last}}, t1:{{1:first}}',
			't2:${2:second}, t3:${3:last}, t1:${1:first}',
			snippet => {
				assert.deepEqual(snippet.lines, ['t2:second, t3:last, t1:first']);
				assert.equal(snippet.placeHolders.length, 3);
				assert.equal(snippet.placeHolders[0].id, '1');
				assert.equal(snippet.placeHolders[0].value, 'first');
				assert.equal(snippet.placeHolders[1].id, '2');
				assert.equal(snippet.placeHolders[1].value, 'second');
				assert.equal(snippet.placeHolders[2].id, '3');
				assert.equal(snippet.placeHolders[2].value, 'last');
				assert.equal(snippet.finishPlaceHolderIndex, -1);
			});
	});

	test('Support tab stop order wich does not affect named variable id\'s', () => {

		assertInternalAndTextmate(
			'{{first}}-{{2:}}-{{second}}-{{1:}}',
			'${first}-${2}-${second}-${1}',
			snippet => {
				assert.deepEqual(snippet.lines, ['first--second-']);
				assert.equal(snippet.placeHolders.length, 4);
				assert.equal(snippet.placeHolders[0].id, 'first');
				assert.equal(snippet.placeHolders[1].id, 'second');
				assert.equal(snippet.placeHolders[2].id, '1');
				assert.equal(snippet.placeHolders[3].id, '2');
			}
		);
	});

	test('nested placeholder', () => {
		let snippet = CodeSnippet.fromTextmate([
			'<div${1: id="${2:some_id}"}>',
			'\t$0',
			'</div>'
		].join('\n'));

		assert.equal(snippet.placeHolders.length, 3);
		assert.equal(snippet.finishPlaceHolderIndex, 2);
		let [first, second, third] = snippet.placeHolders;

		assert.equal(third.id, 0);
		assert.equal(third.occurences.length, 1);
		assert.deepEqual(third.occurences[0], new Range(2, 2, 2, 2));

		assert.equal(second.id, 2);
		assert.equal(second.occurences.length, 1);
		assert.deepEqual(second.occurences[0], new Range(1, 10, 1, 17));

		assert.equal(first.id, '1');
		assert.equal(first.occurences.length, 1);
		assert.deepEqual(first.occurences[0], new Range(1, 5, 1, 18));
	});

	test('bug #17541:[snippets] Support default text in mirrors', () => {

		var external = [
			'begin{${1:enumerate}}',
			'\t$0',
			'end{$1}'
		].join('\n');

		var internal = [
			'begin\\{{{1:enumerate}}\\}',
			'\t{{}}',
			'end\\{{{1:}}\\}'
		].join('\n');

		assertInternalAndTextmate(internal, external, snippet => {
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
	});

	test('bug #17487:[snippets] four backslashes are required to get one backslash in the inserted text', () => {

		var external = [
			'\\begin{${1:enumerate}}',
			'\t$0',
			'\\end{$1}'
		].join('\n');

		var internal = [
			'\\begin\\{{{1:enumerate}}\\}',
			'\t{{}}',
			'\\end\\{{{1:}}\\}'
		].join('\n');

		assertInternalAndTextmate(internal, external, snippet => {
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
	});

	test('issue #3552: Snippet Converted Not Working for literal Dollar Sign', () => {

		let external = '\n\\$scope.\\$broadcast(\'scroll.infiniteScrollComplete\');\n';
		let snippet = CodeSnippet.fromTextmate(external);
		assert.equal(snippet.placeHolders.length, 0);
		assert.deepEqual(snippet.lines, ['', '$scope.$broadcast(\'scroll.infiniteScrollComplete\');', '']);
	});
});

