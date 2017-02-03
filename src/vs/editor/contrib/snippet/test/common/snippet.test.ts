/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Range } from 'vs/editor/common/core/range';
import { CodeSnippet, ICodeSnippet, ISnippetVariableResolver } from 'vs/editor/contrib/snippet/common/snippet';

suite('Editor Contrib - Snippets', () => {

	function assertInternalAndTextmate(internal: string, textmate: string, callback: (snippet: ICodeSnippet) => any) {
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
				assert.equal(snippet.placeHolders.length, 3);
				assert.equal(snippet.placeHolders[0].id, '1');
				assert.equal(snippet.placeHolders[0].value, '');
				assert.equal(snippet.placeHolders[1].id, '2');
				assert.equal(snippet.placeHolders[1].value, '');
				assert.equal(snippet.finishPlaceHolderIndex, 2);
			});
	});

	test('Support tab stop order with no finish', () => {

		assertInternalAndTextmate(
			't2:{{2:second}}, t3:{{3:last}}, t1:{{1:first}}',
			't2:${2:second}, t3:${3:last}, t1:${1:first}',
			snippet => {
				assert.deepEqual(snippet.lines, ['t2:second, t3:last, t1:first']);
				assert.equal(snippet.placeHolders.length, 4);
				assert.equal(snippet.placeHolders[0].id, '1');
				assert.equal(snippet.placeHolders[0].value, 'first');
				assert.equal(snippet.placeHolders[1].id, '2');
				assert.equal(snippet.placeHolders[1].value, 'second');
				assert.equal(snippet.placeHolders[2].id, '3');
				assert.equal(snippet.placeHolders[2].value, 'last');
				assert.equal(snippet.finishPlaceHolderIndex, 3);
			});
	});

	test('Support tab stop order which does not affect named variable id\'s', () => {

		assertInternalAndTextmate(
			'{{first}}-{{2:}}-{{second}}-{{1:}}',
			'${first}-${2}-${second}-${1}',
			snippet => {
				assert.deepEqual(snippet.lines, ['first--second-']);
				assert.equal(snippet.placeHolders.length, 5);
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

	test('bug #7093: Snippet default value is only populated for first variable reference', () => {
		var internal = 'logger.error({ logContext: lc, errorContext: `{{1:err}}`, error: {{1:}} });';
		var external = 'logger.error({ logContext: lc, errorContext: `${1:err}`, error: $1 });';

		assertInternalAndTextmate(internal, external, snippet => {
			assert.equal(snippet.lines.length, 1);
			assert.equal(snippet.lines[0], 'logger.error({ logContext: lc, errorContext: `err`, error: err });');
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
		assert.equal(snippet.placeHolders.length, 1);
		assert.equal(snippet.finishPlaceHolderIndex, 0);
		assert.deepEqual(snippet.lines, ['', '$scope.$broadcast(\'scroll.infiniteScrollComplete\');', '']);
	});

	test('bind, adjust indentation', () => {

		// don't move placeholder at the beginning of the line
		let snippet = CodeSnippet.fromTextmate([
			'afterEach((done) => {',
			'\t${1}test${2}',
			'})'
		].join('\n'));

		// replace tab-stop with two spaces
		let boundSnippet = snippet.bind('', 0, 0, {
			normalizeIndentation(str: string): string {
				return str.replace(/\t/g, '  ');
			}
		});
		let [first, second] = boundSnippet.placeHolders;
		assert.equal(first.occurences.length, 1);
		assert.equal(first.occurences[0].startColumn, 3);
		assert.equal(second.occurences.length, 1);
		assert.equal(second.occurences[0].startColumn, 7);

		// keep tab-stop, identity
		boundSnippet = snippet.bind('', 0, 0, {
			normalizeIndentation(str: string): string {
				return str;
			}
		});
		[first, second] = boundSnippet.placeHolders;
		assert.equal(first.occurences.length, 1);
		assert.equal(first.occurences[0].startColumn, 2);
		assert.equal(second.occurences.length, 1);
		assert.equal(second.occurences[0].startColumn, 6);
	});


	test('issue #11890: Bad cursor position 1/2', () => {

		let snippet = CodeSnippet.fromTextmate([
			'afterEach((done) => {',
			'${1}\ttest${2}',
			'})'
		].join('\n'));

		let boundSnippet = snippet.bind('', 0, 0, {
			normalizeIndentation(str: string): string {
				return str.replace(/\t/g, '  ');
			}
		});

		assert.equal(boundSnippet.lines[1], '  test');
		assert.equal(boundSnippet.placeHolders.length, 3);
		assert.equal(boundSnippet.finishPlaceHolderIndex, 2);

		let [first, second] = boundSnippet.placeHolders;
		assert.equal(first.occurences.length, 1);
		assert.equal(first.occurences[0].startColumn, 1);
		assert.equal(second.occurences.length, 1);
		assert.equal(second.occurences[0].startColumn, 7);
	});

	test('issue #11890: Bad cursor position 2/2', () => {

		let snippet = CodeSnippet.fromTextmate('${1}\ttest');

		let boundSnippet = snippet.bind('abc abc abc prefix3', 0, 12, {
			normalizeIndentation(str: string): string {
				return str.replace(/\t/g, '  ');
			}
		});

		assert.equal(boundSnippet.lines[0], '\ttest');
		assert.equal(boundSnippet.placeHolders.length, 2);
		assert.equal(boundSnippet.finishPlaceHolderIndex, 1);

		let [first, second] = boundSnippet.placeHolders;
		assert.equal(first.occurences.length, 1);
		assert.equal(first.occurences[0].startColumn, 13);
		assert.equal(second.occurences.length, 1);
		assert.equal(second.occurences[0].startColumn, 18);
	});

	test('issue #17989: Bad selection', () => {

		let snippet = CodeSnippet.fromTextmate('${1:HoldMeTight}');

		let boundSnippet = snippet.bind('abc abc abc prefix3', 0, 12, {
			normalizeIndentation(str: string): string {
				return str.replace(/\t/g, '  ');
			}
		});

		assert.equal(boundSnippet.lines[0], 'HoldMeTight');
		assert.equal(boundSnippet.placeHolders.length, 2);
		assert.equal(boundSnippet.finishPlaceHolderIndex, 1);
		let [first, second] = boundSnippet.placeHolders;
		assert.equal(first.occurences.length, 1);
		assert.equal(first.occurences[0].startColumn, 13);

		assert.equal(second.occurences.length, 1);
		assert.equal(second.occurences[0].startColumn, 24);

	});

	test('variables, simple', () => {

		const resolver: ISnippetVariableResolver = {
			resolve(name) {
				return name.split('').reverse().join('');
			}
		};

		// simple
		let snippet = CodeSnippet.fromTextmate('$FOO', resolver);
		assert.equal(snippet.lines[0], 'OOF');
		assert.equal(snippet.placeHolders.length, 1);
		assert.equal(snippet.placeHolders[0].occurences[0].endColumn, 4);

		snippet = CodeSnippet.fromTextmate('${FOO:BAR}', resolver);
		assert.equal(snippet.lines[0], 'OOF');
		assert.equal(snippet.placeHolders.length, 1);
		assert.equal(snippet.placeHolders[0].occurences[0].endColumn, 4);

		// placeholder
		snippet = CodeSnippet.fromTextmate('${1:$FOO}bar$1', resolver);
		assert.equal(snippet.lines[0], 'OOFbarOOF');
		assert.equal(snippet.placeHolders.length, 2);
		assert.equal(snippet.placeHolders[0].occurences.length, 2);
		assert.equal(snippet.placeHolders[0].occurences[0].startColumn, 1);
		assert.equal(snippet.placeHolders[0].occurences[0].endColumn, 4);
		assert.equal(snippet.placeHolders[0].occurences[1].startColumn, 7);
		assert.equal(snippet.placeHolders[0].occurences[1].endColumn, 10);
		assert.equal(snippet.placeHolders[1].occurences.length, 1);

		snippet = CodeSnippet.fromTextmate('${1:${FOO:abc}}bar$1', resolver);
		assert.equal(snippet.lines[0], 'OOFbarOOF');
	});

	test('variables, evil resolver', () => {

		let snippet = CodeSnippet.fromTextmate('$FOO', { resolve(): string { throw new Error(); } });
		assert.equal(snippet.lines[0], 'FOO');
	});

	test('variables, default', () => {

		let snippet = CodeSnippet.fromTextmate('$FOO', { resolve(): string { return undefined; } });
		assert.equal(snippet.lines[0], 'FOO');

		snippet = CodeSnippet.fromTextmate('$FOO', { resolve(): string { return ''; } });
		assert.equal(snippet.lines[0], '');

		snippet = CodeSnippet.fromTextmate('${FOO:BAR}', { resolve(): string { return undefined; } });
		assert.equal(snippet.lines[0], 'BAR');

		snippet = CodeSnippet.fromTextmate('${FOO:BAR}', { resolve(): string { return ''; } });
		assert.equal(snippet.lines[0], 'BAR');
	});
});

