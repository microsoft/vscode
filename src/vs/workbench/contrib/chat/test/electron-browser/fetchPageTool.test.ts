/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { FetchWebPageTool } from '../../electron-browser/tools/fetchPageTool.js';

suite('FetchWebPageTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let tool: FetchWebPageTool;

	setup(() => {
		tool = new FetchWebPageTool(new NullWebContentExtractorService());
	});

	test('should only accept http and https URLs', async () => {
		const testUrls = [
			'https://example.com',
			'http://example.com',
			'test://static/resource/50',
			'mcp-resource://746573742D736572766572/custom/hello/world.txt',
			'file:///path/to/file',
			'ftp://example.com',
			'invalid-url'
		];

		// Use the private _parseUris method via any cast to test the internal logic
		const parseUris = (tool as any)._parseUris.bind(tool);
		const results = parseUris(testUrls);

		// Only HTTP and HTTPS URLs should be considered valid
		assert.strictEqual(results.get('https://example.com') !== undefined, true, 'HTTPS URLs should be valid');
		assert.strictEqual(results.get('http://example.com') !== undefined, true, 'HTTP URLs should be valid');
		
		// All other schemes should be considered invalid
		assert.strictEqual(results.get('test://static/resource/50'), undefined, 'test:// URLs should be invalid');
		assert.strictEqual(results.get('mcp-resource://746573742D736572766572/custom/hello/world.txt'), undefined, 'mcp-resource:// URLs should be invalid');
		assert.strictEqual(results.get('file:///path/to/file'), undefined, 'file:// URLs should be invalid');
		assert.strictEqual(results.get('ftp://example.com'), undefined, 'ftp:// URLs should be invalid');
		assert.strictEqual(results.get('invalid-url'), undefined, 'Invalid URLs should be invalid');
	});

	test('should handle empty and undefined URLs', async () => {
		const parseUris = (tool as any)._parseUris.bind(tool);
		
		// Test empty array
		const emptyResults = parseUris([]);
		assert.strictEqual(emptyResults.size, 0, 'Empty array should result in empty map');

		// Test undefined
		const undefinedResults = parseUris(undefined);
		assert.strictEqual(undefinedResults.size, 0, 'Undefined should result in empty map');

		// Test array with empty strings
		const emptyStringResults = parseUris(['', ' ']);
		assert.strictEqual(emptyStringResults.get(''), undefined, 'Empty string should be invalid');
		assert.strictEqual(emptyStringResults.get(' '), undefined, 'Space-only string should be invalid');
	});
});