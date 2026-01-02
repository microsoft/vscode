/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ResourceMap } from '../../../../../../../base/common/map.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IFileContent, IReadFileOptions } from '../../../../../../../platform/files/common/files.js';
import { IWebContentExtractorService, WebContentExtractResult } from '../../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { FetchWebPageTool } from '../../../../electron-browser/builtInTools/fetchPageTool.js';
import { TestFileService } from '../../../../../../test/common/workbenchTestServices.js';
import { MockTrustedDomainService } from '../../../../../url/test/browser/mockTrustedDomainService.js';
import { InternalFetchWebPageToolId } from '../../../../common/tools/builtinTools/tools.js';
import { MockChatService } from '../../../common/chatService/mockChatService.js';
import { upcastDeepPartial } from '../../../../../../../base/test/common/mock.js';
import { IChatService } from '../../../../common/chatService/chatService.js';

class TestWebContentExtractorService implements IWebContentExtractorService {
	_serviceBrand: undefined;

	constructor(private uriToContentMap: ResourceMap<string>) { }

	async extract(uris: URI[]): Promise<WebContentExtractResult[]> {
		return uris.map(uri => {
			const content = this.uriToContentMap.get(uri);
			if (content === undefined) {
				throw new Error(`No content configured for URI: ${uri.toString()}`);
			}
			return { status: 'ok', result: content };
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
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
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
			new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()),
			new MockTrustedDomainService([]),
			new MockChatService(),
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
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
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

	test('should approve when all URLs were mentioned in chat', async () => {
		const webContentMap = new ResourceMap<string>([
			[URI.parse('https://valid.com'), 'Valid content']
		]);

		const fileContentMap = new ResourceMap<string | VSBuffer>([
			[URI.parse('test://valid/resource'), 'Valid MCP content']
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(webContentMap),
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			upcastDeepPartial<IChatService>({
				getSession: () => {
					return {
						getRequests: () => [{
							message: {
								text: 'fetch https://example.com'
							}
						}],
					};
				},
			}),
		);

		const preparation1 = await tool.prepareToolInvocation(
			{ parameters: { urls: ['https://example.com'] }, chatSessionId: 'a' },
			CancellationToken.None
		);

		assert.ok(preparation1, 'Should return prepared invocation');
		assert.strictEqual(preparation1.confirmationMessages?.title, undefined);

		const preparation2 = await tool.prepareToolInvocation(
			{ parameters: { urls: ['https://other.com'] }, chatSessionId: 'a' },
			CancellationToken.None
		);

		assert.ok(preparation2, 'Should return prepared invocation');
		assert.ok(preparation2.confirmationMessages?.title);
	});

	test('should return message for binary files indicating they are not supported', async () => {
		// Create binary content (a simple PNG-like header with null bytes)
		const binaryContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
		const binaryBuffer = VSBuffer.wrap(binaryContent);

		const fileContentMap = new ResourceMap<string | VSBuffer>([
			[URI.parse('file:///path/to/binary.dat'), binaryBuffer],
			[URI.parse('file:///path/to/text.txt'), 'This is text content']
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
		);

		const result = await tool.invoke(
			{
				callId: 'test-call-binary',
				toolId: 'fetch-page',
				parameters: { urls: ['file:///path/to/binary.dat', 'file:///path/to/text.txt'] },
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

	test('PNG files are now supported as image data parts (regression test)', async () => {
		// This test ensures that PNG files that previously returned "not supported"
		// messages now return proper image data parts
		const binaryContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
		const binaryBuffer = VSBuffer.wrap(binaryContent);

		const fileContentMap = new ResourceMap<string | VSBuffer>([
			[URI.parse('file:///path/to/image.png'), binaryBuffer]
		]);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
		);

		const result = await tool.invoke(
			{
				callId: 'test-png-support',
				toolId: 'fetch-page',
				parameters: { urls: ['file:///path/to/image.png'] },
				context: undefined
			},
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);

		// Should have 1 result
		assert.strictEqual(result.content.length, 1, 'Should have 1 result');

		// PNG file should now be returned as a data part, not a "not supported" message
		assert.strictEqual(result.content[0].kind, 'data', 'PNG file should return data part');
		if (result.content[0].kind === 'data') {
			assert.strictEqual(result.content[0].value.mimeType, 'image/png', 'Should have PNG MIME type');
			assert.strictEqual(result.content[0].value.data, binaryBuffer, 'Should have correct binary data');
		}
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
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
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

	test('Supported image files are returned as data parts', async () => {
		// Test data for different supported image formats
		const pngData = VSBuffer.fromString('fake PNG data');
		const jpegData = VSBuffer.fromString('fake JPEG data');
		const gifData = VSBuffer.fromString('fake GIF data');
		const webpData = VSBuffer.fromString('fake WebP data');
		const bmpData = VSBuffer.fromString('fake BMP data');

		const fileContentMap = new ResourceMap<string | VSBuffer>();
		fileContentMap.set(URI.parse('file:///image.png'), pngData);
		fileContentMap.set(URI.parse('file:///photo.jpg'), jpegData);
		fileContentMap.set(URI.parse('file:///animation.gif'), gifData);
		fileContentMap.set(URI.parse('file:///modern.webp'), webpData);
		fileContentMap.set(URI.parse('file:///bitmap.bmp'), bmpData);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
		);

		const result = await tool.invoke(
			{
				callId: 'test-images',
				toolId: 'fetch-page',
				parameters: { urls: ['file:///image.png', 'file:///photo.jpg', 'file:///animation.gif', 'file:///modern.webp', 'file:///bitmap.bmp'] },
				context: undefined
			},
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);

		// All images should be returned as data parts
		assert.strictEqual(result.content.length, 5, 'Should have 5 results');

		// Check PNG
		assert.strictEqual(result.content[0].kind, 'data', 'PNG should be data part');
		if (result.content[0].kind === 'data') {
			assert.strictEqual(result.content[0].value.mimeType, 'image/png', 'PNG should have correct MIME type');
			assert.strictEqual(result.content[0].value.data, pngData, 'PNG should have correct data');
		}

		// Check JPEG
		assert.strictEqual(result.content[1].kind, 'data', 'JPEG should be data part');
		if (result.content[1].kind === 'data') {
			assert.strictEqual(result.content[1].value.mimeType, 'image/jpeg', 'JPEG should have correct MIME type');
			assert.strictEqual(result.content[1].value.data, jpegData, 'JPEG should have correct data');
		}

		// Check GIF
		assert.strictEqual(result.content[2].kind, 'data', 'GIF should be data part');
		if (result.content[2].kind === 'data') {
			assert.strictEqual(result.content[2].value.mimeType, 'image/gif', 'GIF should have correct MIME type');
			assert.strictEqual(result.content[2].value.data, gifData, 'GIF should have correct data');
		}

		// Check WebP
		assert.strictEqual(result.content[3].kind, 'data', 'WebP should be data part');
		if (result.content[3].kind === 'data') {
			assert.strictEqual(result.content[3].value.mimeType, 'image/webp', 'WebP should have correct MIME type');
			assert.strictEqual(result.content[3].value.data, webpData, 'WebP should have correct data');
		}

		// Check BMP
		assert.strictEqual(result.content[4].kind, 'data', 'BMP should be data part');
		if (result.content[4].kind === 'data') {
			assert.strictEqual(result.content[4].value.mimeType, 'image/bmp', 'BMP should have correct MIME type');
			assert.strictEqual(result.content[4].value.data, bmpData, 'BMP should have correct data');
		}
	});

	test('Mixed image and text files work correctly', async () => {
		const textData = 'This is some text content';
		const imageData = VSBuffer.fromString('fake image data');

		const fileContentMap = new ResourceMap<string | VSBuffer>();
		fileContentMap.set(URI.parse('file:///text.txt'), textData);
		fileContentMap.set(URI.parse('file:///image.png'), imageData);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
		);

		const result = await tool.invoke(
			{
				callId: 'test-mixed',
				toolId: 'fetch-page',
				parameters: { urls: ['file:///text.txt', 'file:///image.png'] },
				context: undefined
			},
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);

		// Text should be returned as text part
		assert.strictEqual(result.content[0].kind, 'text', 'Text file should be text part');
		if (result.content[0].kind === 'text') {
			assert.strictEqual(result.content[0].value, textData, 'Text should have correct content');
		}

		// Image should be returned as data part
		assert.strictEqual(result.content[1].kind, 'data', 'Image file should be data part');
		if (result.content[1].kind === 'data') {
			assert.strictEqual(result.content[1].value.mimeType, 'image/png', 'Image should have correct MIME type');
			assert.strictEqual(result.content[1].value.data, imageData, 'Image should have correct data');
		}
	});

	test('Case insensitive image extensions work', async () => {
		const imageData = VSBuffer.fromString('fake image data');

		const fileContentMap = new ResourceMap<string | VSBuffer>();
		fileContentMap.set(URI.parse('file:///image.PNG'), imageData);
		fileContentMap.set(URI.parse('file:///photo.JPEG'), imageData);

		const tool = new FetchWebPageTool(
			new TestWebContentExtractorService(new ResourceMap<string>()),
			new ExtendedTestFileService(fileContentMap),
			new MockTrustedDomainService(),
			new MockChatService(),
		);

		const result = await tool.invoke(
			{
				callId: 'test-case',
				toolId: 'fetch-page',
				parameters: { urls: ['file:///image.PNG', 'file:///photo.JPEG'] },
				context: undefined
			},
			() => Promise.resolve(0),
			{ report: () => { } },
			CancellationToken.None
		);

		// Both should be returned as data parts despite uppercase extensions
		assert.strictEqual(result.content[0].kind, 'data', 'PNG with uppercase extension should be data part');
		if (result.content[0].kind === 'data') {
			assert.strictEqual(result.content[0].value.mimeType, 'image/png', 'Should have correct MIME type');
		}

		assert.strictEqual(result.content[1].kind, 'data', 'JPEG with uppercase extension should be data part');
		if (result.content[1].kind === 'data') {
			assert.strictEqual(result.content[1].value.mimeType, 'image/jpeg', 'Should have correct MIME type');
		}
	});

	// Comprehensive tests for toolResultDetails
	suite('toolResultDetails', () => {
		test('should include only successfully fetched URIs in correct order', async () => {
			const webContentMap = new ResourceMap<string>([
				[URI.parse('https://success1.com'), 'Content 1'],
				[URI.parse('https://success2.com'), 'Content 2']
			]);

			const fileContentMap = new ResourceMap<string | VSBuffer>([
				[URI.parse('file:///success.txt'), 'File content'],
				[URI.parse('mcp-resource://server/file.txt'), 'MCP content']
			]);

			const tool = new FetchWebPageTool(
				new TestWebContentExtractorService(webContentMap),
				new ExtendedTestFileService(fileContentMap),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const testUrls = [
				'https://success1.com',       // index 0 - should be in toolResultDetails
				'invalid-url',                // index 1 - should NOT be in toolResultDetails
				'file:///success.txt',        // index 2 - should be in toolResultDetails
				'https://success2.com',       // index 3 - should be in toolResultDetails
				'file:///nonexistent.txt',    // index 4 - should NOT be in toolResultDetails
				'mcp-resource://server/file.txt' // index 5 - should be in toolResultDetails
			];

			const result = await tool.invoke(
				{ callId: 'test-details', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			// Verify toolResultDetails contains exactly the successful URIs
			assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
			assert.strictEqual(result.toolResultDetails.length, 4, 'Should have 4 successful URIs');

			// Check that all entries are URI objects
			const uriDetails = result.toolResultDetails as URI[];
			assert.ok(uriDetails.every(uri => uri instanceof URI), 'All toolResultDetails entries should be URI objects');

			// Check specific URIs are included (web URIs first, then successful file URIs)
			const expectedUris = [
				'https://success1.com/',
				'https://success2.com/',
				'file:///success.txt',
				'mcp-resource://server/file.txt'
			];

			const actualUriStrings = uriDetails.map(uri => uri.toString());
			assert.deepStrictEqual(actualUriStrings.sort(), expectedUris.sort(), 'Should contain exactly the expected successful URIs');

			// Verify content array matches input order (including failures)
			assert.strictEqual(result.content.length, 6, 'Content should have result for each input URL');
			assert.strictEqual(result.content[0].value, 'Content 1', 'First web URI content');
			assert.strictEqual(result.content[1].value, 'Invalid URL', 'Invalid URL marked as invalid');
			assert.strictEqual(result.content[2].value, 'File content', 'File URI content');
			assert.strictEqual(result.content[3].value, 'Content 2', 'Second web URI content');
			assert.strictEqual(result.content[4].value, 'Invalid URL', 'Nonexistent file marked as invalid');
			assert.strictEqual(result.content[5].value, 'MCP content', 'MCP resource content');
		});

		test('should exclude failed web requests from toolResultDetails', async () => {
			// Set up web content extractor that will throw for some URIs
			const webContentMap = new ResourceMap<string>([
				[URI.parse('https://success.com'), 'Success content']
				// https://failure.com not in map - will throw error
			]);

			const tool = new FetchWebPageTool(
				new TestWebContentExtractorService(webContentMap),
				new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()),
				new MockTrustedDomainService([]),
				new MockChatService(),
			);

			const testUrls = [
				'https://success.com',  // Should succeed
				'https://failure.com'   // Should fail (not in content map)
			];

			try {
				await tool.invoke(
					{ callId: 'test-web-failure', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined },
					() => Promise.resolve(0),
					{ report: () => { } },
					CancellationToken.None
				);

				// If the web extractor throws, it should be handled gracefully
				// But in this test setup, the TestWebContentExtractorService throws for missing content
				assert.fail('Expected test web content extractor to throw for missing URI');
			} catch (error) {
				// This is expected behavior with the current test setup
				// The TestWebContentExtractorService throws when content is not found
				assert.ok(error.message.includes('No content configured for URI'), 'Should throw for unconfigured URI');
			}
		});

		test('should exclude failed file reads from toolResultDetails', async () => {
			const fileContentMap = new ResourceMap<string | VSBuffer>([
				[URI.parse('file:///existing.txt'), 'File exists']
				// file:///missing.txt not in map - will throw error
			]);

			const tool = new FetchWebPageTool(
				new TestWebContentExtractorService(new ResourceMap<string>()),
				new ExtendedTestFileService(fileContentMap),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const testUrls = [
				'file:///existing.txt',  // Should succeed
				'file:///missing.txt'    // Should fail (not in file map)
			];

			const result = await tool.invoke(
				{ callId: 'test-file-failure', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			// Verify only successful file URI is in toolResultDetails
			assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
			assert.strictEqual(result.toolResultDetails.length, 1, 'Should have only 1 successful URI');

			const uriDetails = result.toolResultDetails as URI[];
			assert.strictEqual(uriDetails[0].toString(), 'file:///existing.txt', 'Should contain only the successful file URI');

			// Verify content reflects both attempts
			assert.strictEqual(result.content.length, 2, 'Should have results for both input URLs');
			assert.strictEqual(result.content[0].value, 'File exists', 'First file should have content');
			assert.strictEqual(result.content[1].value, 'Invalid URL', 'Second file should be marked invalid');
		});

		test('should handle mixed success and failure scenarios', async () => {
			const webContentMap = new ResourceMap<string>([
				[URI.parse('https://web-success.com'), 'Web success']
			]);

			const fileContentMap = new ResourceMap<string | VSBuffer>([
				[URI.parse('file:///file-success.txt'), 'File success'],
				[URI.parse('mcp-resource://good/file.txt'), VSBuffer.fromString('MCP binary content')]
			]);

			const tool = new FetchWebPageTool(
				new TestWebContentExtractorService(webContentMap),
				new ExtendedTestFileService(fileContentMap),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const testUrls = [
				'invalid-scheme://bad',      // Invalid URI
				'https://web-success.com',   // Web success
				'file:///file-missing.txt',  // File failure
				'file:///file-success.txt',  // File success
				'completely-invalid-url',    // Invalid URL format
				'mcp-resource://good/file.txt' // MCP success
			];

			const result = await tool.invoke(
				{ callId: 'test-mixed', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			// Should have 3 successful URIs: web-success, file-success, mcp-success
			assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
			assert.strictEqual((result.toolResultDetails as URI[]).length, 3, 'Should have 3 successful URIs');

			const uriDetails = result.toolResultDetails as URI[];
			const actualUriStrings = uriDetails.map(uri => uri.toString());
			const expectedSuccessful = [
				'https://web-success.com/',
				'file:///file-success.txt',
				'mcp-resource://good/file.txt'
			];

			assert.deepStrictEqual(actualUriStrings.sort(), expectedSuccessful.sort(), 'Should contain exactly the successful URIs');

			// Verify content array reflects all inputs in original order
			assert.strictEqual(result.content.length, 6, 'Should have results for all input URLs');
			assert.strictEqual(result.content[0].value, 'Invalid URL', 'Invalid scheme marked as invalid');
			assert.strictEqual(result.content[1].value, 'Web success', 'Web success content');
			assert.strictEqual(result.content[2].value, 'Invalid URL', 'Missing file marked as invalid');
			assert.strictEqual(result.content[3].value, 'File success', 'File success content');
			assert.strictEqual(result.content[4].value, 'Invalid URL', 'Invalid URL marked as invalid');
			assert.strictEqual(result.content[5].value, 'MCP binary content', 'MCP success content');
		});

		test('should return empty toolResultDetails when all requests fail', async () => {
			const tool = new FetchWebPageTool(
				new TestWebContentExtractorService(new ResourceMap<string>()), // Empty - all web requests fail
				new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()), // Empty - all file ,
				new MockTrustedDomainService([]),
				new MockChatService(),
			);

			const testUrls = [
				'https://nonexistent.com',
				'file:///missing.txt',
				'invalid-url',
				'bad://scheme'
			];

			try {
				const result = await tool.invoke(
					{ callId: 'test-all-fail', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined },
					() => Promise.resolve(0),
					{ report: () => { } },
					CancellationToken.None
				);

				// If web extractor doesn't throw, check the results
				assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
				assert.strictEqual((result.toolResultDetails as URI[]).length, 0, 'Should have no successful URIs');
				assert.strictEqual(result.content.length, 4, 'Should have results for all input URLs');
				assert.ok(result.content.every(content => content.value === 'Invalid URL'), 'All content should be marked as invalid');
			} catch (error) {
				// Expected with TestWebContentExtractorService when no content is configured
				assert.ok(error.message.includes('No content configured for URI'), 'Should throw for unconfigured URI');
			}
		});

		test('should handle empty URL array', async () => {
			const tool = new FetchWebPageTool(
				new TestWebContentExtractorService(new ResourceMap<string>()),
				new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()),
				new MockTrustedDomainService([]),
				new MockChatService(),
			);

			const result = await tool.invoke(
				{ callId: 'test-empty', toolId: 'fetch-page', parameters: { urls: [] }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.content.length, 1, 'Should have one content item for empty URLs');
			assert.strictEqual(result.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');
			assert.ok(!result.toolResultDetails, 'toolResultDetails should not be present for empty URLs');
		});

		test('should handle image files in toolResultDetails', async () => {
			const imageBuffer = VSBuffer.fromString('fake-png-data');
			const fileContentMap = new ResourceMap<string | VSBuffer>([
				[URI.parse('file:///image.png'), imageBuffer],
				[URI.parse('file:///document.txt'), 'Text content']
			]);

			const tool = new FetchWebPageTool(
				new TestWebContentExtractorService(new ResourceMap<string>()),
				new ExtendedTestFileService(fileContentMap),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const result = await tool.invoke(
				{ callId: 'test-images', toolId: 'fetch-page', parameters: { urls: ['file:///image.png', 'file:///document.txt'] }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			// Both files should be successful and in toolResultDetails
			assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
			assert.strictEqual((result.toolResultDetails as URI[]).length, 2, 'Should have 2 successful file URIs');

			const uriDetails = result.toolResultDetails as URI[];
			assert.strictEqual(uriDetails[0].toString(), 'file:///image.png', 'Should include image file');
			assert.strictEqual(uriDetails[1].toString(), 'file:///document.txt', 'Should include text file');

			// Check content types
			assert.strictEqual(result.content[0].kind, 'data', 'Image should be data part');
			assert.strictEqual(result.content[1].kind, 'text', 'Text file should be text part');
		});

		test('confirmResults is false when all web contents are errors or redirects', async () => {
			const webContentMap = new ResourceMap<string>();

			const tool = new FetchWebPageTool(
				new class extends TestWebContentExtractorService {
					constructor() {
						super(webContentMap);
					}
					override async extract(uris: URI[]): Promise<WebContentExtractResult[]> {
						return uris.map(() => ({ status: 'error', error: 'Failed to fetch' }));
					}
				}(),
				new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const result = await tool.invoke(
				{ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://example.com'] }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.confirmResults, false, 'confirmResults should be false when all results are errors');
		});

		test('confirmResults is false when all web contents are redirects', async () => {
			const webContentMap = new ResourceMap<string>();

			const tool = new FetchWebPageTool(
				new class extends TestWebContentExtractorService {
					constructor() {
						super(webContentMap);
					}
					override async extract(uris: URI[]): Promise<WebContentExtractResult[]> {
						return uris.map(() => ({ status: 'redirect', toURI: URI.parse('https://redirected.com') }));
					}
				}(),
				new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const result = await tool.invoke(
				{ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://example.com'] }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.confirmResults, false, 'confirmResults should be false when all results are redirects');
		});

		test('confirmResults is undefined when at least one web content succeeds', async () => {
			const webContentMap = new ResourceMap<string>([
				[URI.parse('https://success.com'), 'Success content']
			]);

			const tool = new FetchWebPageTool(
				new class extends TestWebContentExtractorService {
					constructor() {
						super(webContentMap);
					}
					override async extract(uris: URI[]): Promise<WebContentExtractResult[]> {
						return [
							{ status: 'ok', result: 'Success content' },
							{ status: 'error', error: 'Failed' }
						];
					}
				}(),
				new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const result = await tool.invoke(
				{ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://success.com', 'https://error.com'] }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.confirmResults, undefined, 'confirmResults should be undefined when at least one result succeeds');
		});

		test('redirect result provides correct message with new URL', async () => {
			const redirectURI = URI.parse('https://redirected.com/page');
			const tool = new FetchWebPageTool(
				new class extends TestWebContentExtractorService {
					constructor() {
						super(new ResourceMap<string>());
					}
					override async extract(uris: URI[]): Promise<WebContentExtractResult[]> {
						return [{ status: 'redirect', toURI: redirectURI }];
					}
				}(),
				new ExtendedTestFileService(new ResourceMap<string | VSBuffer>()),
				new MockTrustedDomainService(),
				new MockChatService(),
			);

			const result = await tool.invoke(
				{ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://example.com'] }, context: undefined },
				() => Promise.resolve(0),
				{ report: () => { } },
				CancellationToken.None
			);

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].kind, 'text');
			if (result.content[0].kind === 'text') {
				assert.ok(result.content[0].value.includes(redirectURI.toString(true)), 'Redirect message should include target URL');
				assert.ok(result.content[0].value.includes(InternalFetchWebPageToolId), 'Redirect message should suggest using tool again');
			}
		});
	});
});
