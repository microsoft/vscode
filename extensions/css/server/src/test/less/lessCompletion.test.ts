/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';

import {LESSParser} from '../../parser/lessParser';
import {LESSCompletion} from '../../services/lessCompletion';
import * as nodes from '../../parser/cssNodes';
import {TextDocument, Position} from 'vscode-languageserver';
import {assertCompletion, ItemDescription} from '../css/completion.test';

suite('LESS - Completions', () => {

	let testCompletionFor = function (value: string, stringBefore: string, expected: { count?: number, items?: ItemDescription[] }): Thenable<void> {
		let idx = stringBefore ? value.indexOf(stringBefore) + stringBefore.length : 0;

		let completionProvider = new LESSCompletion();

		let document = TextDocument.create('test://test/test.less', 'less', 0, value);
		let position = Position.create(0, idx);
		let jsonDoc = new LESSParser().parseStylesheet(document);
		return completionProvider.doComplete(document, position, jsonDoc).then(list => {
			if (expected.count) {
				assert.equal(list.items, expected.count);
			}
			if (expected.items) {
				for (let item of expected.items) {
					assertCompletion(list, item, document);
				}
			}
		});
	};

	test('sylesheet', function (testDone): any {
		Promise.all([
			testCompletionFor('body { ', '{ ', {
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
			testCompletionFor('body { word-break: ', ': ', {
				items: [
					{ label: 'keep-all' }
				]
			}),
			testCompletionFor('body { inner { vertical-align: }', ': ', {
				items: [
					{ label: 'bottom' }
				]
			}),
			testCompletionFor('@var1: 3; body { inner { vertical-align: }', 'align: ', {
				items: [
					{ label: '@var1' }
				]
			}),
			testCompletionFor('.foo { background-color: d', 'background-color: d', {
				items: [
					{ label: 'darken' },
					{ label: 'desaturate' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});
});
