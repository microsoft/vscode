/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { guessMimeTypes, registerTextMime } from 'vs/base/common/mime';

function register(pattern: string, mime: string, user?: boolean): void {
	registerTextMime(mime, { pattern: pattern, userConfigured: user });
}

suite('Mime', () => {
	test('Dynamically Register Text Mime', () => {
		var guess = guessMimeTypes('foo.monaco');
		assert.deepEqual(guess, ['application/unknown']);

		register('.monaco', 'text/monaco');
		guess = guessMimeTypes('foo.monaco');
		assert.deepEqual(guess, ['text/monaco', 'text/plain']);

		guess = guessMimeTypes('.monaco');
		assert.deepEqual(guess, ['text/monaco', 'text/plain']);

		register('Codefile', 'text/code');
		guess = guessMimeTypes('Codefile');
		assert.deepEqual(guess, ['text/code', 'text/plain']);

		guess = guessMimeTypes('foo.Codefile');
		assert.deepEqual(guess, ['application/unknown']);

		register('Docker*', 'text/docker');
		guess = guessMimeTypes('Docker-debug');
		assert.deepEqual(guess, ['text/docker', 'text/plain']);

		guess = guessMimeTypes('docker-PROD');
		assert.deepEqual(guess, ['text/docker', 'text/plain']);

		registerTextMime('text/nice-regex', { firstLineRegExp: /RegexesAreNice/ });
		guess = guessMimeTypes('Randomfile.noregistration', 'RegexesAreNice');
		assert.deepEqual(guess, ['text/nice-regex', 'text/plain']);

		guess = guessMimeTypes('Randomfile.noregistration', 'RegexesAreNiceee');
		assert.deepEqual(guess, ['application/unknown']);

		guess = guessMimeTypes('Codefile', 'RegexesAreNice');
		assert.deepEqual(guess, ['text/nice-regex', 'text/plain']);
	});

	test('Mimes Priority', () => {
		register('.monaco', 'text/monaco');
		registerTextMime('text/foobar', { firstLineRegExp: /foobar/ });

		var guess = guessMimeTypes('foo.monaco');
		assert.deepEqual(guess, ['text/monaco', 'text/plain']);

		guess = guessMimeTypes('foo.monaco', 'foobar');
		assert.deepEqual(guess, ['text/foobar', 'text/plain']);

		register('dockerfile', 'text/winner');
		register('dockerfile*', 'text/looser');
		guess = guessMimeTypes('dockerfile');
		assert.deepEqual(guess, ['text/winner', 'text/plain']);
	});

	test('Specificity priority 1', () => {
		register('.monaco2', 'text/monaco2');
		register('specific.monaco2', 'text/specific-monaco2');

		assert.deepEqual(guessMimeTypes('specific.monaco2'), ['text/specific-monaco2', 'text/plain']);
		assert.deepEqual(guessMimeTypes('foo.monaco2'), ['text/monaco2', 'text/plain']);
	});

	test('Specificity priority 2', () => {
		register('specific.monaco3', 'text/specific-monaco3');
		register('.monaco3', 'text/monaco3');

		assert.deepEqual(guessMimeTypes('specific.monaco3'), ['text/specific-monaco3', 'text/plain']);
		assert.deepEqual(guessMimeTypes('foo.monaco3'), ['text/monaco3', 'text/plain']);
	});

	test('Mimes Priority - Longest Extension wins', () => {
		register('.monaco', 'text/monaco');
		register('.monaco.xml', 'text/monaco-xml');
		register('.monaco.xml.build', 'text/monaco-xml-build');

		var guess = guessMimeTypes('foo.monaco');
		assert.deepEqual(guess, ['text/monaco', 'text/plain']);

		guess = guessMimeTypes('foo.monaco.xml');
		assert.deepEqual(guess, ['text/monaco-xml', 'text/plain']);

		guess = guessMimeTypes('foo.monaco.xml.build');
		assert.deepEqual(guess, ['text/monaco-xml-build', 'text/plain']);
	});

	test('Mimes Priority - User configured wins', () => {
		register('.monaco.xml', 'text/monaco', true);
		register('.monaco.xml', 'text/monaco-xml');

		var guess = guessMimeTypes('foo.monaco.xml');
		assert.deepEqual(guess, ['text/monaco', 'text/plain']);
	});
});
