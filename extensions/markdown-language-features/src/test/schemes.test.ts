/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { isOfScheme, Schemes } from '../util/schemes';

suite('isOfScheme', () => {
	test('Should detect file: scheme for regular file paths', () => {
		assert.strictEqual(isOfScheme(Schemes.file, 'file:///usr/home/test.txt'), true);
	});

	test('Should detect file: scheme for UNC file paths', () => {
		assert.strictEqual(isOfScheme(Schemes.file, 'file:////server/share/file.txt'), true);
	});

	test('Should detect file: scheme case-insensitively', () => {
		assert.strictEqual(isOfScheme(Schemes.file, 'FILE:///usr/home/test.txt'), false);
	});

	test('Should not detect file: scheme for http links', () => {
		assert.strictEqual(isOfScheme(Schemes.file, 'http://example.com/file.txt'), false);
	});

	test('Should not detect file: scheme for https links', () => {
		assert.strictEqual(isOfScheme(Schemes.file, 'https://example.com/file.txt'), false);
	});

	test('Should not detect file: scheme for relative paths', () => {
		assert.strictEqual(isOfScheme(Schemes.file, './relative/path.txt'), false);
	});

	test('Should detect http: scheme', () => {
		assert.strictEqual(isOfScheme(Schemes.http, 'http://example.com'), true);
	});

	test('Should detect https: scheme', () => {
		assert.strictEqual(isOfScheme(Schemes.https, 'https://example.com'), true);
	});
});
