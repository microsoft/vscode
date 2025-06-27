/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
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

class TestFileService implements IFileService {
	_serviceBrand: undefined;

	constructor(private uriToContentMap: Map<string, string>) { }

	async readFile(resource: URI): Promise<IFileContent> {
		const content = this.uriToContentMap.get(resource.toString());
		if (content === undefined) {
			throw new Error(`File not found: ${resource.toString()}`);
		}
		return {
			resource,
			value: VSBuffer.fromString(content),
			name: '',
			size: content.length,
			etag: '',
			mtime: 0,
			ctime: 0,
			readonly: false,
			locked: false
		};
	}

	// Stub implementations for other IFileService methods (not used in tests)
	onDidChangeFileSystemProviderRegistrations = undefined as any;
	onDidChangeFileSystemProviderCapabilities = undefined as any;
	onWillActivateFileSystemProvider = undefined as any;
	registerProvider = undefined as any;
	getProvider = undefined as any;
	activateProvider = undefined as any;
	canHandleResource = undefined as any;
	hasProvider = undefined as any;
	hasCapability = undefined as any;
	listCapabilities = undefined as any;
	onDidFilesChange = undefined as any;
	onDidRunOperation = undefined as any;
	resolve = undefined as any;
	resolveAll = undefined as any;
	stat = undefined as any;
	exists = undefined as any;
	readFileStream = undefined as any;
	writeFile = undefined as any;
	move = undefined as any;
	copy = undefined as any;
	createFile = undefined as any;
	createFolder = undefined as any;
	del = undefined as any;
	watch = undefined as any;
	dispose = undefined as any;
}

suite('FetchWebPageTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should handle http/https via web content extractor and other schemes via file service', async () => {
		const webContentMap = new Map([
			['https://example.com', 'HTTPS content'],
			['http://example.com', 'HTTP content']
		]);

		const fileContentMap = new Map([
			['test://static/resource/50', 'MCP resource content'],
			['mcp-resource://746573742D736572766572/custom/hello/world.txt', 'Custom MCP content']
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(webContentMap),
			new TestFileService(fileContentMap)
		);

		const testUrls = [
			'https://example.com',
			'http://example.com',
			'test://static/resource/50',
			'mcp-resource://746573742D736572766572/custom/hello/world.txt',
			'file:///path/to/nonexistent',
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

		// HTTP and HTTPS URLs should have their content from web extractor
		assert.strictEqual(result.content[0].value, 'HTTPS content', 'HTTPS URL should return content');
		assert.strictEqual(result.content[1].value, 'HTTP content', 'HTTP URL should return content');

		// MCP resources should have their content from file service
		assert.strictEqual(result.content[2].value, 'MCP resource content', 'test:// URL should return content from file service');
		assert.strictEqual(result.content[3].value, 'Custom MCP content', 'mcp-resource:// URL should return content from file service');

		// Nonexistent file should be marked as invalid
		assert.strictEqual(result.content[4].value, 'Invalid URL', 'Nonexistent file should be invalid');

		// Unsupported scheme (ftp) should be marked as invalid since file service can't handle it
		assert.strictEqual(result.content[5].value, 'Invalid URL', 'ftp:// URL should be invalid');

		// Invalid URL should be marked as invalid
		assert.strictEqual(result.content[6].value, 'Invalid URL', 'Invalid URL should be invalid');

		// All successfully fetched URLs should be in toolResultDetails
		assert.strictEqual(result.toolResultDetails?.length, 4, 'Should have 4 valid URLs in toolResultDetails');
	});

	test('should handle empty and undefined URLs', async () => {
		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new Map()),
			new TestFileService(new Map())
		);

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
			{ parameters: { urls: ['', ' ', 'invalid-scheme-that-fileservice-cannot-handle://test'] } },
			() => 0,
			() => { },
			CancellationToken.None
		);
		assert.strictEqual(invalidResult.content.length, 3, 'Should have result for each invalid URL');
		assert.strictEqual(invalidResult.content[0].value, 'Invalid URL', 'Empty string should be invalid');
		assert.strictEqual(invalidResult.content[1].value, 'Invalid URL', 'Space-only string should be invalid');
		assert.strictEqual(invalidResult.content[2].value, 'Invalid URL', 'Unhandleable scheme should be invalid');
	});

	test('should provide correct past tense messages for mixed valid/invalid URLs', async () => {
		const webContentMap = new Map([
			['https://valid.com', 'Valid content']
		]);

		const fileContentMap = new Map([
			['test://valid/resource', 'Valid MCP content']
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(webContentMap),
			new TestFileService(fileContentMap)
		);

		const preparation = await tool.prepareToolInvocation(
			{ parameters: { urls: ['https://valid.com', 'test://valid/resource', 'invalid://invalid'] } },
			CancellationToken.None
		);

		assert.ok(preparation, 'Should return prepared invocation');
		assert.ok(preparation.pastTenseMessage.value.includes('Fetched'), 'Should mention fetched resources');
		assert.ok(preparation.pastTenseMessage.value.includes('invalid://invalid'), 'Should mention invalid URL');
	});
});