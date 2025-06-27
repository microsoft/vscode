/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { FetchWebPageTool } from '../../electron-browser/tools/fetchPageTool.js';

class TestWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	constructor(private uriToContentMap: Map<string, string>) { }

	async extract(uris: URI[]): Promise<string[]> {
		return uris.map(uri => {
			const content = this.uriToContentMap.get(uri.toString());
			if (content === undefined) {
				throw new Error(`No content configured for URI: ${uri.toString()}`);
			}
			return content;
		});
	}
}

suite('FetchWebPageTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should only accept http and https URLs', async () => {
		const uriToContentMap = new Map([
			['https://example.com', 'HTTPS content'],
			['http://example.com', 'HTTP content']
		]);

		const tool = new FetchWebPageTool(new TestWebContentExtractorService(uriToContentMap));

		const testUrls = [
			'https://example.com',
			'http://example.com',
			'test://static/resource/50',
			'mcp-resource://746573742D736572766572/custom/hello/world.txt',
			'file:///path/to/file',
			'ftp://example.com',
			'invalid-url'
		];

		const result = await tool.invoke(
			{ parameters: { urls: testUrls } },
			() => 0,
			() => { },
			CancellationToken.None
		);

		// Should have 7 results (one for each input URL)
		assert.strictEqual(result.content.length, 7, 'Should have result for each input URL');

		// HTTP and HTTPS URLs should have their content
		assert.strictEqual(result.content[0].value, 'HTTPS content', 'HTTPS URL should return content');
		assert.strictEqual(result.content[1].value, 'HTTP content', 'HTTP URL should return content');

		// All other schemes should be marked as invalid
		assert.strictEqual(result.content[2].value, 'Invalid URL', 'test:// URL should be invalid');
		assert.strictEqual(result.content[3].value, 'Invalid URL', 'mcp-resource:// URL should be invalid');
		assert.strictEqual(result.content[4].value, 'Invalid URL', 'file:// URL should be invalid');
		assert.strictEqual(result.content[5].value, 'Invalid URL', 'ftp:// URL should be invalid');
		assert.strictEqual(result.content[6].value, 'Invalid URL', 'Invalid URL should be invalid');

		// Only HTTP and HTTPS URLs should be in toolResultDetails
		assert.strictEqual(result.toolResultDetails?.length, 2, 'Should have 2 valid URLs in toolResultDetails');
	});

	test('should handle empty and undefined URLs', async () => {
		const tool = new FetchWebPageTool(new TestWebContentExtractorService(new Map()));

		// Test empty array
		const emptyResult = await tool.invoke(
			{ parameters: { urls: [] } },
			() => 0,
			() => { },
			CancellationToken.None
		);
		assert.strictEqual(emptyResult.content.length, 1, 'Empty array should return single message');
		assert.strictEqual(emptyResult.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');

		// Test undefined
		const undefinedResult = await tool.invoke(
			{ parameters: {} },
			() => 0,
			() => { },
			CancellationToken.None
		);
		assert.strictEqual(undefinedResult.content.length, 1, 'Undefined URLs should return single message');
		assert.strictEqual(undefinedResult.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');

		// Test array with invalid URLs
		const invalidResult = await tool.invoke(
			{ parameters: { urls: ['', ' ', 'invalid-scheme://test'] } },
			() => 0,
			() => { },
			CancellationToken.None
		);
		assert.strictEqual(invalidResult.content.length, 3, 'Should have result for each invalid URL');
		assert.strictEqual(invalidResult.content[0].value, 'Invalid URL', 'Empty string should be invalid');
		assert.strictEqual(invalidResult.content[1].value, 'Invalid URL', 'Space-only string should be invalid');
		assert.strictEqual(invalidResult.content[2].value, 'Invalid URL', 'Invalid scheme should be invalid');
	});

	test('should provide correct past tense messages for mixed valid/invalid URLs', async () => {
		const uriToContentMap = new Map([
			['https://valid.com', 'Valid content']
		]);

		const tool = new FetchWebPageTool(new TestWebContentExtractorService(uriToContentMap));

		const preparation = await tool.prepareToolInvocation(
			{ parameters: { urls: ['https://valid.com', 'test://invalid'] } },
			CancellationToken.None
		);

		assert.ok(preparation, 'Should return prepared invocation');
		assert.ok(preparation.pastTenseMessage.value.includes('Fetched web page'), 'Should mention fetched web page');
		assert.ok(preparation.pastTenseMessage.value.includes('test://invalid'), 'Should mention invalid URL');
	});
});