/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import 'mocha';
import { Uri } from 'vscode';
import { urlToUri } from '../util/url';

suite('urlToUri', () => {
	test('Absolute File', () => {
		deepStrictEqual(
			urlToUri('file:///root/test.txt', Uri.parse('file:///usr/home/')),
			Uri.parse('file:///root/test.txt')
		);
	});

	test('Relative File', () => {
		deepStrictEqual(
			urlToUri('./file.ext', Uri.parse('file:///usr/home/')),
			Uri.parse('file:///usr/home/file.ext')
		);
	});

	test('Http Basic', () => {
		deepStrictEqual(
			urlToUri('http://example.org?q=10&f', Uri.parse('file:///usr/home/')),
			Uri.parse('http://example.org?q=10&f')
		);
	});

	test('Http Encoded Chars', () => {
		deepStrictEqual(
			urlToUri('http://example.org/%C3%A4', Uri.parse('file:///usr/home/')),
			Uri.parse('http://example.org/%C3%A4')
		);
	});
});
