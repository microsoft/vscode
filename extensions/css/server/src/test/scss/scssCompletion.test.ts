/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';

import {SCSSParser} from '../../parser/scssParser';
import {SCSSCompletion} from '../../services/scssCompletion';
import {TextDocument, Position} from 'vscode-languageserver';
import {assertCompletion, ItemDescription} from '../css/completion.test';

suite('SCSS - Completions', () => {

	let testCompletionFor = function (value: string, stringBefore: string, expected: { count?: number, items?: ItemDescription[] }): Thenable<void> {
		let idx = stringBefore ? value.indexOf(stringBefore) + stringBefore.length : 0;

		let completionProvider = new SCSSCompletion();

		let document = TextDocument.create('test://test/test.scss', 'scss', 0, value);
		let position = Position.create(0, idx);
		let jsonDoc = new SCSSParser().parseStylesheet(document);
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
			testCompletionFor('$i: 0; body { width: ', 'width: ', {
				items: [
					{ label: '$i' }
				]
			}),
			testCompletionFor('@for $i from 1 through 3 { .item-#{$i} { width: 2em * $i; } }', '.item-#{', {
				items: [
					{ label: '$i' }
				]
			}),
			testCompletionFor('.foo { background-color: d', 'background-color: d', {
				items: [
					{ label: 'darken' },
					{ label: 'desaturate' }
				]
			}),
			testCompletionFor('@function foo($x, $y) { @return $x + $y; } .foo { background-color: f', 'background-color: f', {
				items: [
					{ label: 'foo' }
				]
			}),
			testCompletionFor('.foo { di span { } ', 'di', {
				items: [
					{ label: 'display' },
					{ label: 'div' }
				]
			}),
			testCompletionFor('.foo { .', '{ .', {
				items: [
					{ label: '.foo' }
				]
			}),
			// issue #250
			testCompletionFor('.foo { display: block;', 'block;', {
				count: 0
			}),
		]).then(() => testDone(), (error) => testDone(error));

	});
});
