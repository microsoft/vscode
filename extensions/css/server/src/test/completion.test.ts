/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Parser} from '../parser/cssParser';
import {CSSCompletion} from '../services/cssCompletion';

import {CompletionList, TextDocument, TextEdit, Position, CompletionItemKind} from 'vscode-languageserver';
import {applyEdits} from './textEditSupport';

suite('CSS - Completion', () => {

	interface ItemDescription {
		label: string;
		documentation?: string;
		kind?: CompletionItemKind;
		resultText?: string;
	}

	let assertCompletion = function (completions: CompletionList, expected: ItemDescription, document?: TextDocument) {
		let matches = completions.items.filter(completion => {
			return completion.label === expected.label;
		});
		assert.equal(matches.length, 1, expected.label + " should only existing once: Actual: " + completions.items.map(c => c.label).join(', '));
		if (expected.documentation) {
			assert.equal(matches[0].documentation, expected.documentation);
		}
		if (expected.kind) {
			assert.equal(matches[0].kind, expected.kind);
		}
		if (document && expected.resultText) {
			assert.equal(applyEdits(document, [matches[0].textEdit]), expected.resultText);
		}
	};

	let testCompletionFor = function (value: string, stringBefore: string, expected: { count?: number, items?: ItemDescription[] }): Thenable<CompletionList> {
		let idx = stringBefore ? value.indexOf(stringBefore) + stringBefore.length : 0;

		let completionProvider = new CSSCompletion();

		let document = TextDocument.create('test://test/test.css', 'css', 0, value);
		let position = Position.create(0, idx);
		let jsonDoc = new Parser().parseStylesheet(document);
		let list = completionProvider.doComplete(document, position, jsonDoc);
		if (expected.count) {
			assert.equal(list.items, expected.count);
		}
		if (expected.items) {
			for (let item of expected.items) {
				assertCompletion(list, item, document);
			}
		}
		return Promise.resolve(null);
	};

	test('sylesheet', function (testDone): any {
		Promise.all([
			testCompletionFor(' ', null, {
				items: [
					{ label: '@import' },
					{ label: '@keyframes' },
					{ label: 'div' }
				]
			}),
			testCompletionFor(' body {', null, {
				items: [
					{ label: '@import' },
					{ label: '@keyframes' },
					{ label: 'html' }
				]
			}),
			testCompletionFor('@import url("something.css");', '@', {
				count: 0
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
	test('properties', function (testDone): any {
		Promise.all([
			testCompletionFor('body {', '{', {
				items: [
					{ label: 'display' },
					{ label: 'background' }
				]
			}),
			testCompletionFor('body { ver', 'ver', {
				items: [
					{ label: 'vertical-align' }
				]
			}),
			testCompletionFor('body { vertical-align', 'vertical-ali', {
				items: [
					{ label: 'vertical-align' }
				]
			}),
			testCompletionFor('body { vertical-align', 'vertical-align', {
				items: [
					{ label: 'vertical-align' }
				]
			}),
			testCompletionFor('body { vertical-align: bottom;}', 'vertical-align', {
				items: [
					{ label: 'vertical-align' }
				]
			}),
			testCompletionFor('body { trans ', 'trans', {
				items: [
					{ label: 'transition' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
	test('values', function (testDone): any {
		Promise.all([
			testCompletionFor('body { vertical-align: bottom;}', 'vertical-align:', {
				items: [
					{ label: 'bottom' },
					{ label: '0cm' }
				]
			}),
			testCompletionFor('body { vertical-align: bottom;}', 'vertical-align: ', {
				items: [
					{ label: 'bottom' },
					{ label: '0cm' }
				]
			}),
			testCompletionFor('body { vertical-align: bott', 'bott', {
				items: [
					{ label: 'bottom' }
				]
			}),
			testCompletionFor('body { vertical-align: bottom }', 'bott', {
				items: [
					{ label: 'bottom' }
				]
			}),
			testCompletionFor('body { vertical-align: bottom }', 'bottom', {
				items: [
					{ label: 'bottom' }
				]
			}),
			testCompletionFor('body { vertical-align: bottom; }', 'bottom', {
				items: [
					{ label: 'bottom' }
				]
			}),
			testCompletionFor('body { vertical-align: bottom; }', 'bottom;', {
				count: 0
			}),
			testCompletionFor('body { vertical-align: bottom; }', 'bottom; ', {
				items: [
					{ label: 'display' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
	test('units', function (testDone): any {
		Promise.all([
			testCompletionFor('body { vertical-align: 9 }', '9', {
				items: [
					{ label: '9cm' }
				]
			}),
			testCompletionFor('body { vertical-align: 1.2 }', '1.2', {
				items: [
					{ label: '1.2em' }
				]
			}),
			testCompletionFor('body { vertical-align: 10 }', '1', {
				items: [
					{ label: '1cm' }
				]
			}),
			testCompletionFor('body { vertical-align: 10c }', '10c', {
				items: [
					{ label: '10cm' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
	test('unknown', function (testDone): any {
		Promise.all([
			testCompletionFor('body { notexisting: ;}', 'notexisting: ', {
				count: 0
			}),
			testCompletionFor('.foo { unknown: foo; } .bar { unknown: }', '.bar { unknown:', {
				items: [
					{ label: 'foo', kind: CompletionItemKind.Value }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
	test('colors', function (testDone): any {
		Promise.all([
			testCompletionFor('body { border-right: ', 'right: ', {
				items: [
					{ label: 'cyan' },
					{ label: 'dotted' },
					{ label: '0em' }
				]
			}),
			testCompletionFor('body { border-right: cyan dotted 2em ', 'cyan', {
				items: [
					{ label: 'cyan' },
					{ label: 'darkcyan' }
				]
			}),
			testCompletionFor('body { border-right: dotted 2em ', '2em ', {
				items: [
					{ label: 'cyan' }
				]
			}),
			testCompletionFor('.foo { background-color: #123456; } .bar { background-color: }', '.bar { background-color:', {
				items: [
					{ label: '#123456', kind: CompletionItemKind.Color }
				]
			}),
			testCompletionFor('.foo { background-color: r', 'background-color: r', {
				items: [
					{ label: 'rgb', kind: CompletionItemKind.Function },
					{ label: 'rgba', kind: CompletionItemKind.Function },
					{ label: 'red', kind: CompletionItemKind.Color }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
});

