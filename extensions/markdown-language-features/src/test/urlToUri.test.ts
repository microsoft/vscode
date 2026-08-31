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

	test('UNC file path', () => {
		deepStrictEqual(
			urlToUri('file:////server/share/file.txt', Uri.parse('file:///usr/home/')),
			Uri.parse('file:////server/share/file.txt')
		);
	});

	test('UNC file path with host only', () => {
		deepStrictEqual(
			urlToUri('file:////server/share/folder/readme.md', Uri.parse('file:///usr/home/')),
			Uri.parse('file:////server/share/folder/readme.md')
		);
	});
});
