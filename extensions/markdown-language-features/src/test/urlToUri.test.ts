/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import 'mocha';
import { Uri } from 'vscode';
import { rawHttpUriFromHref, urlToUri } from '../util/url';

suite('urlToUri', () => {
	test('Absolute File', () => {
		strictEqual(
			urlToUri('file:///root/test.txt', Uri.parse('file:///usr/home/'))?.toString(),
			Uri.parse('file:///root/test.txt').toString()
		);
	});

	test('Relative File', () => {
		strictEqual(
			urlToUri('./file.ext', Uri.parse('file:///usr/home/'))?.toString(),
			Uri.parse('file:///usr/home/file.ext').toString()
		);
	});

	test('Http Basic', () => {
		strictEqual(
			urlToUri('http://example.org?q=10&f', Uri.parse('file:///usr/home/'))?.toString(),
			Uri.parse('http://example.org?q=10&f').toString()
		);
	});

	test('Http Encoded Chars', () => {
		strictEqual(
			urlToUri('http://example.org/%C3%A4', Uri.parse('file:///usr/home/'))?.toString(),
			Uri.parse('http://example.org/%C3%A4').toString()
		);
	});
});

suite('rawHttpUriFromHref', () => {
	test('Basic http url', () => {
		const uri = rawHttpUriFromHref('http://example.org/path?q=1');
		strictEqual(uri.toString(true), 'http://example.org/path?q=1');
	});

	// Regression test for https://github.com/microsoft/vscode/issues/45515
	test('Preserves %2F in path', () => {
		const href = 'https://firebasestorage.googleapis.com/v0/b/test/o/products%2FzVNZ%2FBetterave.jpg?alt=media&token=abc';
		const uri = rawHttpUriFromHref(href);
		strictEqual(uri.toString(true), href);
	});

	test('Preserves %2D in text fragment', () => {
		const href = 'https://ffmpeg.org/ffmpeg-all.html#:~:text=%2Dversion';
		const uri = rawHttpUriFromHref(href);
		strictEqual(uri.toString(true), href);
	});

	test('Preserves %23 and %20 in query string', () => {
		const href = 'https://ffmpeg.org/ffmpeg-all.html?test=a%23b%20c#:~:text=%2Dversion';
		const uri = rawHttpUriFromHref(href);
		strictEqual(uri.toString(true), href);
	});

	test('Handles url without explicit path', () => {
		const uri = rawHttpUriFromHref('https://example.com');
		strictEqual(uri.scheme, 'https');
		strictEqual(uri.authority, 'example.com');
	});

	test('Falls back gracefully for invalid input', () => {
		// Must not throw for a value that is not a valid URL
		const uri = rawHttpUriFromHref('not-a-url');
		strictEqual(typeof uri, 'object');
	});
});
