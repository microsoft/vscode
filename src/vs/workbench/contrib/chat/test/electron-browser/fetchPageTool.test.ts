/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IReadFileOptions } from '../../../../../platform/files/common/files.js';
import { IWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { FetchWebPageTool } from '../../electron-browser/tools/fetchPageTool.js';
import { TestFileService } from '../../../../test/browser/workbenchTestServices.js';

class TestWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	constructor(private uriToContentMap: ResourceMap<string>) { }

	async extract(uris: URI[]): Promise<string[]> {
		return uris.map(uri => {
			const content = this.uriToContentMap.get(uri);
			if (content === undefined) {
				throw new Error(`No content configured for URI: ${uri.toString()}`);
			}
			return content;
		});
	}
}

class ExtendedTestFileService extends TestFileService {
	constructor(private uriToContentMap: ResourceMap<string | VSBuffer>) {
		super();
	}

	override async readFile(resource: URI, options?: IReadFileOptions | undefined): Promise<IFileContent> {
		const content = this.uriToContentMap.get(resource);
		if (content === undefined) {
			throw new Error(`File not found: ${resource.toString()}`);
		}

		const buffer = typeof content === 'string' ? VSBuffer.fromString(content) : content;
		return {
			resource,
			value: buffer,
			name: '',
			size: buffer.byteLength,
			etag: '',
			mtime: 0,
			ctime: 0,
			readonly: false,
			locked: false
		};
	}

	override async stat(resource: URI) {
		// Check if the resource exists in our map
		if (!this.uriToContentMap.has(resource)) {
			throw new Error(`File not found: ${resource.toString()}`);
		}

		return super.stat(resource);
	}
}

suite('FetchWebPageTool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should handle http/https via web content extractor and other schemes via file service', async () => {
		const webContentMap = new ResourceMap<string>([
			[URI.parse('https://example.com'), 'HTTPS content'],
			[URI.parse('http://example.com'), 'HTTP content']
		]);

		const fileContentMap = new ResourceMap<string | VSBuffer>([
			[URI.parse('test://static/resource/50'), 'MCP resource content'],
			[URI.parse('mcp-resource://746573742D736572766572/custom/hello/world.txt'), 'Custom MCP content']
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(webContentMap),
			new ExtendedTestFileService(fileContentMap)
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
			{ callId: 'test-call-1', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined },
			() => Promise.resolve(0),
			{ report: () => { } },
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
		assert.strictEqual(Array.isArray(result.toolResultDetails) ? result.toolResultDetails.length : 0, 4, 'Should have 4 valid URLs in toolResultDetails');
	});

	test('should handle empty and undefined URLs', async () => {
		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(new ResourceMap<string | VSBuffer>())
		);

		// Test empty array
		const emptyResult = await tool.invoke(
			{ callId: 'test-call-2', toolId: 'fetch-page', parameters: { urls: [] }, context: undefined },
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);
		assert.strictEqual(emptyResult.content.length, 1, 'Empty array should return single message');
		assert.strictEqual(emptyResult.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');

		// Test undefined
		const undefinedResult = await tool.invoke(
			{ callId: 'test-call-3', toolId: 'fetch-page', parameters: {}, context: undefined },
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);
		assert.strictEqual(undefinedResult.content.length, 1, 'Undefined URLs should return single message');
		assert.strictEqual(undefinedResult.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');

		// Test array with invalid URLs
		const invalidResult = await tool.invoke(
			{ callId: 'test-call-4', toolId: 'fetch-page', parameters: { urls: ['', ' ', 'invalid-scheme-that-fileservice-cannot-handle://test'] }, context: undefined },
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);
		assert.strictEqual(invalidResult.content.length, 3, 'Should have result for each invalid URL');
		assert.strictEqual(invalidResult.content[0].value, 'Invalid URL', 'Empty string should be invalid');
		assert.strictEqual(invalidResult.content[1].value, 'Invalid URL', 'Space-only string should be invalid');
		assert.strictEqual(invalidResult.content[2].value, 'Invalid URL', 'Unhandleable scheme should be invalid');
	});

	test('should provide correct past tense messages for mixed valid/invalid URLs', async () => {
		const webContentMap = new ResourceMap<string>([
			[URI.parse('https://valid.com'), 'Valid content']
		]);

		const fileContentMap = new ResourceMap<string | VSBuffer>([
			[URI.parse('test://valid/resource'), 'Valid MCP content']
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(webContentMap),
			new ExtendedTestFileService(fileContentMap)
		);

		const preparation = await tool.prepareToolInvocation(
			{ parameters: { urls: ['https://valid.com', 'test://valid/resource', 'invalid://invalid'] } },
			CancellationToken.None
		);

		assert.ok(preparation, 'Should return prepared invocation');
		assert.ok(preparation.pastTenseMessage, 'Should have past tense message');
		const messageText = typeof preparation.pastTenseMessage === 'string' ? preparation.pastTenseMessage : preparation.pastTenseMessage!.value;
		assert.ok(messageText.includes('Fetched'), 'Should mention fetched resources');
		assert.ok(messageText.includes('invalid://invalid'), 'Should mention invalid URL');
	});

	test('should return message for binary files indicating they are not supported', async () => {
		// Create binary content (a simple PNG-like header with null bytes)
		const binaryContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
		const binaryBuffer = VSBuffer.wrap(binaryContent);

		const fileContentMap = new ResourceMap<string | VSBuffer>([
			[URI.parse('file:///path/to/image.png'), binaryBuffer],
			[URI.parse('file:///path/to/text.txt'), 'This is text content']
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(fileContentMap)
		);

		const result = await tool.invoke(
			{
				callId: 'test-call-binary',
				toolId: 'fetch-page',
				parameters: { urls: ['file:///path/to/image.png', 'file:///path/to/text.txt'] },
				context: undefined
			},
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);

		// Should have 2 results
		assert.strictEqual(result.content.length, 2, 'Should have 2 results');

		// First result should be a text part with binary not supported message
		assert.strictEqual(result.content[0].kind, 'text', 'Binary file should return text part');
		if (result.content[0].kind === 'text') {
			assert.strictEqual(result.content[0].value, 'Binary files are not supported at the moment.', 'Should return not supported message');
		}

		// Second result should be a text part for the text file
		assert.strictEqual(result.content[1].kind, 'text', 'Text file should return text part');
		if (result.content[1].kind === 'text') {
			assert.strictEqual(result.content[1].value, 'This is text content', 'Should return text content');
		}

		// Both files should be in toolResultDetails since they were successfully fetched
		assert.strictEqual(Array.isArray(result.toolResultDetails) ? result.toolResultDetails.length : 0, 2, 'Should have 2 valid URLs in toolResultDetails');
	});

	test('should correctly distinguish between binary and text content', async () => {
		// Create content that might be ambiguous
		const jsonData = '{"name": "test", "value": 123}';
		// Create definitely binary data - some random bytes with null bytes that don't follow UTF-16 pattern
		const realBinaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x0D, 0xFF, 0x00, 0xAB]); // More clearly binary

		const fileContentMap = new ResourceMap<string | VSBuffer>([
			[URI.parse('file:///data.json'), jsonData], // Should be detected as text
			[URI.parse('file:///binary.dat'), VSBuffer.wrap(realBinaryData)] // Should be detected as binary
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(fileContentMap)
		);

		const result = await tool.invoke(
			{
				callId: 'test-distinguish',
				toolId: 'fetch-page',
				parameters: { urls: ['file:///data.json', 'file:///binary.dat'] },
				context: undefined
			},
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);

		// JSON should be returned as text
		assert.strictEqual(result.content[0].kind, 'text', 'JSON should be detected as text');
		if (result.content[0].kind === 'text') {
			assert.strictEqual(result.content[0].value, jsonData, 'Should return JSON as text');
		}

		// Binary data should be returned as not supported message
		assert.strictEqual(result.content[1].kind, 'text', 'Binary content should return text part with message');
		if (result.content[1].kind === 'text') {
			assert.strictEqual(result.content[1].value, 'Binary files are not supported at the moment.', 'Should return not supported message');
		}
	});
});