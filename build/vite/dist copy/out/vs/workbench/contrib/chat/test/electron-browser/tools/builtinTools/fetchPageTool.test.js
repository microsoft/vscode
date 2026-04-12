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
import { testWorkspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { FetchWebPageTool } from '../../../../electron-browser/builtInTools/fetchPageTool.js';
import { TestContextService, TestFileService } from '../../../../../../test/common/workbenchTestServices.js';
import { MockTrustedDomainService } from '../../../../../url/test/browser/mockTrustedDomainService.js';
import { InternalFetchWebPageToolId } from '../../../../common/tools/builtinTools/tools.js';
import { MockChatService } from '../../../common/chatService/mockChatService.js';
import { upcastDeepPartial } from '../../../../../../../base/test/common/mock.js';
import { LocalChatSessionUri } from '../../../../common/model/chatUri.js';
class TestWebContentExtractorService {
    constructor(uriToContentMap) {
        this.uriToContentMap = uriToContentMap;
    }
    async extract(uris) {
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
    constructor(uriToContentMap) {
        super();
        this.uriToContentMap = uriToContentMap;
    }
    async readFile(resource, options) {
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
            locked: false,
            executable: false
        };
    }
    async stat(resource) {
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
        const webContentMap = new ResourceMap([
            [URI.parse('https://example.com'), 'HTTPS content'],
            [URI.parse('http://example.com'), 'HTTP content']
        ]);
        const fileContentMap = new ResourceMap([
            [URI.parse('test://static/resource/50'), 'MCP resource content'],
            [URI.parse('mcp-resource://746573742D736572766572/custom/hello/world.txt'), 'Custom MCP content']
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(webContentMap), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const testUrls = [
            'https://example.com',
            'http://example.com',
            'test://static/resource/50',
            'mcp-resource://746573742D736572766572/custom/hello/world.txt',
            'file:///path/to/nonexistent',
            'ftp://example.com',
            'invalid-url'
        ];
        const result = await tool.invoke({ callId: 'test-call-1', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
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
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(new ResourceMap()), new MockTrustedDomainService([]), new MockChatService(), new TestContextService());
        // Test empty array
        const emptyResult = await tool.invoke({ callId: 'test-call-2', toolId: 'fetch-page', parameters: { urls: [] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
        assert.strictEqual(emptyResult.content.length, 1, 'Empty array should return single message');
        assert.strictEqual(emptyResult.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');
        // Test undefined
        const undefinedResult = await tool.invoke({ callId: 'test-call-3', toolId: 'fetch-page', parameters: {}, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
        assert.strictEqual(undefinedResult.content.length, 1, 'Undefined URLs should return single message');
        assert.strictEqual(undefinedResult.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');
        // Test array with invalid URLs
        const invalidResult = await tool.invoke({ callId: 'test-call-4', toolId: 'fetch-page', parameters: { urls: ['', ' ', 'invalid-scheme-that-fileservice-cannot-handle://test'] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
        assert.strictEqual(invalidResult.content.length, 3, 'Should have result for each invalid URL');
        assert.strictEqual(invalidResult.content[0].value, 'Invalid URL', 'Empty string should be invalid');
        assert.strictEqual(invalidResult.content[1].value, 'Invalid URL', 'Space-only string should be invalid');
        assert.strictEqual(invalidResult.content[2].value, 'Invalid URL', 'Unhandleable scheme should be invalid');
    });
    test('should provide correct past tense messages for mixed valid/invalid URLs', async () => {
        const webContentMap = new ResourceMap([
            [URI.parse('https://valid.com'), 'Valid content']
        ]);
        const fileContentMap = new ResourceMap([
            [URI.parse('test://valid/resource'), 'Valid MCP content']
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(webContentMap), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const preparation = await tool.prepareToolInvocation({ parameters: { urls: ['https://valid.com', 'test://valid/resource', 'invalid://invalid'] }, toolCallId: 'test-call-1', chatSessionResource: undefined }, CancellationToken.None);
        assert.ok(preparation, 'Should return prepared invocation');
        assert.ok(preparation.pastTenseMessage, 'Should have past tense message');
        const messageText = typeof preparation.pastTenseMessage === 'string' ? preparation.pastTenseMessage : preparation.pastTenseMessage.value;
        assert.ok(messageText.includes('Fetched'), 'Should mention fetched resources');
        assert.ok(messageText.includes('invalid://invalid'), 'Should mention invalid URL');
    });
    test('should not show confirmation dialog for file URIs inside the workspace', async () => {
        // Use a workspace rooted at /workspaceRoot
        const workspaceRoot = URI.file('/workspaceRoot');
        const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
        const fileContentMap = new ResourceMap([
            [URI.file('/workspaceRoot/plan.md'), 'Plan content'],
            [URI.file('/workspaceRoot/subdir/notes.txt'), 'Notes content'],
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService([]), new MockChatService(), workspaceContextService);
        // File inside workspace - should NOT trigger confirmation
        const preparation = await tool.prepareToolInvocation({ parameters: { urls: [URI.file('/workspaceRoot/plan.md').toString()] }, toolCallId: 'test-file-in-ws', chatSessionResource: undefined }, CancellationToken.None);
        assert.ok(preparation, 'Should return prepared invocation');
        assert.strictEqual(preparation.confirmationMessages?.title, undefined, 'File inside workspace should not show confirmation dialog');
        assert.strictEqual(preparation.confirmationMessages?.confirmResults, false, 'File inside workspace should not require post-confirmation');
    });
    test('should show confirmation dialog for file URIs outside the workspace', async () => {
        // Use a workspace rooted at /workspaceRoot
        const workspaceRoot = URI.file('/workspaceRoot');
        const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
        const fileContentMap = new ResourceMap([
            [URI.file('/tmp/external-plan.md'), 'External plan content'],
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService([]), new MockChatService(), workspaceContextService);
        // File outside workspace - should still trigger confirmation
        const preparation = await tool.prepareToolInvocation({ parameters: { urls: [URI.file('/tmp/external-plan.md').toString()] }, toolCallId: 'test-file-outside-ws', chatSessionResource: undefined }, CancellationToken.None);
        assert.ok(preparation, 'Should return prepared invocation');
        assert.ok(preparation.confirmationMessages?.title, 'File outside workspace should show confirmation dialog');
        assert.strictEqual(preparation.confirmationMessages?.confirmResults, true, 'File outside workspace should require post-confirmation');
    });
    test('workspace file mixed with untrusted web URI: only web URI triggers confirmation', async () => {
        const workspaceRoot = URI.file('/workspaceRoot');
        const workspaceContextService = new TestContextService(testWorkspace(workspaceRoot));
        const webContentMap = new ResourceMap([
            [URI.parse('https://example.com'), 'Web content']
        ]);
        const fileContentMap = new ResourceMap([
            [URI.file('/workspaceRoot/plan.md'), 'Plan content']
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(webContentMap), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService([]), // No trusted domains
        new MockChatService(), workspaceContextService);
        // Mix: one untrusted web URI + one workspace file URI
        const preparation = await tool.prepareToolInvocation({
            parameters: { urls: ['https://example.com', URI.file('/workspaceRoot/plan.md').toString()] },
            toolCallId: 'test-mixed',
            chatSessionResource: undefined
        }, CancellationToken.None);
        assert.ok(preparation, 'Should return prepared invocation');
        // Confirmation should only be for the web URI
        assert.ok(preparation.confirmationMessages?.title, 'Should show confirmation for untrusted web URI');
        // The confirmation message should mention only the web URI, not the workspace file
        const msgValue = typeof preparation.confirmationMessages?.message === 'string'
            ? preparation.confirmationMessages.message
            : preparation.confirmationMessages?.message?.value ?? '';
        assert.ok(!msgValue.includes('/workspaceRoot/'), 'Confirmation message should not mention workspace file');
        assert.ok(msgValue.includes('example.com'), 'Confirmation message should mention web URI');
    });
    test('should approve when all URLs were mentioned in chat', async () => {
        const webContentMap = new ResourceMap([
            [URI.parse('https://valid.com'), 'Valid content']
        ]);
        const fileContentMap = new ResourceMap([
            [URI.parse('test://valid/resource'), 'Valid MCP content']
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(webContentMap), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), upcastDeepPartial({
            getSession: () => {
                return {
                    getRequests: () => [{
                            message: {
                                text: 'fetch https://example.com'
                            }
                        }],
                };
            },
        }), new TestContextService());
        const preparation1 = await tool.prepareToolInvocation({ parameters: { urls: ['https://example.com'] }, toolCallId: 'test-call-2', chatSessionResource: LocalChatSessionUri.forSession('a') }, CancellationToken.None);
        assert.ok(preparation1, 'Should return prepared invocation');
        assert.strictEqual(preparation1.confirmationMessages?.title, undefined);
        const preparation2 = await tool.prepareToolInvocation({ parameters: { urls: ['https://other.com'] }, toolCallId: 'test-call-3', chatSessionResource: LocalChatSessionUri.forSession('a') }, CancellationToken.None);
        assert.ok(preparation2, 'Should return prepared invocation');
        assert.ok(preparation2.confirmationMessages?.title);
    });
    test('should return message for binary files indicating they are not supported', async () => {
        // Create binary content (a simple PNG-like header with null bytes)
        const binaryContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
        const binaryBuffer = VSBuffer.wrap(binaryContent);
        const fileContentMap = new ResourceMap([
            [URI.parse('file:///path/to/binary.dat'), binaryBuffer],
            [URI.parse('file:///path/to/text.txt'), 'This is text content']
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const result = await tool.invoke({
            callId: 'test-call-binary',
            toolId: 'fetch-page',
            parameters: { urls: ['file:///path/to/binary.dat', 'file:///path/to/text.txt'] },
            context: undefined
        }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
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
        const fileContentMap = new ResourceMap([
            [URI.parse('file:///path/to/image.png'), binaryBuffer]
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const result = await tool.invoke({
            callId: 'test-png-support',
            toolId: 'fetch-page',
            parameters: { urls: ['file:///path/to/image.png'] },
            context: undefined
        }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
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
        const fileContentMap = new ResourceMap([
            [URI.parse('file:///data.json'), jsonData], // Should be detected as text
            [URI.parse('file:///binary.dat'), VSBuffer.wrap(realBinaryData)] // Should be detected as binary
        ]);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const result = await tool.invoke({
            callId: 'test-distinguish',
            toolId: 'fetch-page',
            parameters: { urls: ['file:///data.json', 'file:///binary.dat'] },
            context: undefined
        }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
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
        const fileContentMap = new ResourceMap();
        fileContentMap.set(URI.parse('file:///image.png'), pngData);
        fileContentMap.set(URI.parse('file:///photo.jpg'), jpegData);
        fileContentMap.set(URI.parse('file:///animation.gif'), gifData);
        fileContentMap.set(URI.parse('file:///modern.webp'), webpData);
        fileContentMap.set(URI.parse('file:///bitmap.bmp'), bmpData);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const result = await tool.invoke({
            callId: 'test-images',
            toolId: 'fetch-page',
            parameters: { urls: ['file:///image.png', 'file:///photo.jpg', 'file:///animation.gif', 'file:///modern.webp', 'file:///bitmap.bmp'] },
            context: undefined
        }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
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
        const fileContentMap = new ResourceMap();
        fileContentMap.set(URI.parse('file:///text.txt'), textData);
        fileContentMap.set(URI.parse('file:///image.png'), imageData);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const result = await tool.invoke({
            callId: 'test-mixed',
            toolId: 'fetch-page',
            parameters: { urls: ['file:///text.txt', 'file:///image.png'] },
            context: undefined
        }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
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
        const fileContentMap = new ResourceMap();
        fileContentMap.set(URI.parse('file:///image.PNG'), imageData);
        fileContentMap.set(URI.parse('file:///photo.JPEG'), imageData);
        const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
        const result = await tool.invoke({
            callId: 'test-case',
            toolId: 'fetch-page',
            parameters: { urls: ['file:///image.PNG', 'file:///photo.JPEG'] },
            context: undefined
        }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
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
            const webContentMap = new ResourceMap([
                [URI.parse('https://success1.com'), 'Content 1'],
                [URI.parse('https://success2.com'), 'Content 2']
            ]);
            const fileContentMap = new ResourceMap([
                [URI.parse('file:///success.txt'), 'File content'],
                [URI.parse('mcp-resource://server/file.txt'), 'MCP content']
            ]);
            const tool = new FetchWebPageTool(new TestWebContentExtractorService(webContentMap), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const testUrls = [
                'https://success1.com', // index 0 - should be in toolResultDetails
                'invalid-url', // index 1 - should NOT be in toolResultDetails
                'file:///success.txt', // index 2 - should be in toolResultDetails
                'https://success2.com', // index 3 - should be in toolResultDetails
                'file:///nonexistent.txt', // index 4 - should NOT be in toolResultDetails
                'mcp-resource://server/file.txt' // index 5 - should be in toolResultDetails
            ];
            const result = await tool.invoke({ callId: 'test-details', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            // Verify toolResultDetails contains exactly the successful URIs
            assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
            assert.strictEqual(result.toolResultDetails.length, 4, 'Should have 4 successful URIs');
            // Check that all entries are URI objects
            const uriDetails = result.toolResultDetails;
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
            const webContentMap = new ResourceMap([
                [URI.parse('https://success.com'), 'Success content']
                // https://failure.com not in map - will throw error
            ]);
            const tool = new FetchWebPageTool(new TestWebContentExtractorService(webContentMap), new ExtendedTestFileService(new ResourceMap()), new MockTrustedDomainService([]), new MockChatService(), new TestContextService());
            const testUrls = [
                'https://success.com', // Should succeed
                'https://failure.com' // Should fail (not in content map)
            ];
            try {
                await tool.invoke({ callId: 'test-web-failure', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
                // If the web extractor throws, it should be handled gracefully
                // But in this test setup, the TestWebContentExtractorService throws for missing content
                assert.fail('Expected test web content extractor to throw for missing URI');
            }
            catch (error) {
                // This is expected behavior with the current test setup
                // The TestWebContentExtractorService throws when content is not found
                assert.ok(error.message.includes('No content configured for URI'), 'Should throw for unconfigured URI');
            }
        });
        test('should exclude failed file reads from toolResultDetails', async () => {
            const fileContentMap = new ResourceMap([
                [URI.parse('file:///existing.txt'), 'File exists']
                // file:///missing.txt not in map - will throw error
            ]);
            const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const testUrls = [
                'file:///existing.txt', // Should succeed
                'file:///missing.txt' // Should fail (not in file map)
            ];
            const result = await tool.invoke({ callId: 'test-file-failure', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            // Verify only successful file URI is in toolResultDetails
            assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
            assert.strictEqual(result.toolResultDetails.length, 1, 'Should have only 1 successful URI');
            const uriDetails = result.toolResultDetails;
            assert.strictEqual(uriDetails[0].toString(), 'file:///existing.txt', 'Should contain only the successful file URI');
            // Verify content reflects both attempts
            assert.strictEqual(result.content.length, 2, 'Should have results for both input URLs');
            assert.strictEqual(result.content[0].value, 'File exists', 'First file should have content');
            assert.strictEqual(result.content[1].value, 'Invalid URL', 'Second file should be marked invalid');
        });
        test('should handle mixed success and failure scenarios', async () => {
            const webContentMap = new ResourceMap([
                [URI.parse('https://web-success.com'), 'Web success']
            ]);
            const fileContentMap = new ResourceMap([
                [URI.parse('file:///file-success.txt'), 'File success'],
                [URI.parse('mcp-resource://good/file.txt'), VSBuffer.fromString('MCP binary content')]
            ]);
            const tool = new FetchWebPageTool(new TestWebContentExtractorService(webContentMap), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const testUrls = [
                'invalid-scheme://bad', // Invalid URI
                'https://web-success.com', // Web success
                'file:///file-missing.txt', // File failure
                'file:///file-success.txt', // File success
                'completely-invalid-url', // Invalid URL format
                'mcp-resource://good/file.txt' // MCP success
            ];
            const result = await tool.invoke({ callId: 'test-mixed', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            // Should have 3 successful URIs: web-success, file-success, mcp-success
            assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
            assert.strictEqual(result.toolResultDetails.length, 3, 'Should have 3 successful URIs');
            const uriDetails = result.toolResultDetails;
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
            const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), // Empty - all web requests fail
            new ExtendedTestFileService(new ResourceMap()), // Empty - all file ,
            new MockTrustedDomainService([]), new MockChatService(), new TestContextService());
            const testUrls = [
                'https://nonexistent.com',
                'file:///missing.txt',
                'invalid-url',
                'bad://scheme'
            ];
            try {
                const result = await tool.invoke({ callId: 'test-all-fail', toolId: 'fetch-page', parameters: { urls: testUrls }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
                // If web extractor doesn't throw, check the results
                assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
                assert.strictEqual(result.toolResultDetails.length, 0, 'Should have no successful URIs');
                assert.strictEqual(result.content.length, 4, 'Should have results for all input URLs');
                assert.ok(result.content.every(content => content.value === 'Invalid URL'), 'All content should be marked as invalid');
            }
            catch (error) {
                // Expected with TestWebContentExtractorService when no content is configured
                assert.ok(error.message.includes('No content configured for URI'), 'Should throw for unconfigured URI');
            }
        });
        test('should handle empty URL array', async () => {
            const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(new ResourceMap()), new MockTrustedDomainService([]), new MockChatService(), new TestContextService());
            const result = await tool.invoke({ callId: 'test-empty', toolId: 'fetch-page', parameters: { urls: [] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            assert.strictEqual(result.content.length, 1, 'Should have one content item for empty URLs');
            assert.strictEqual(result.content[0].value, 'No valid URLs provided.', 'Should indicate no valid URLs');
            assert.ok(!result.toolResultDetails, 'toolResultDetails should not be present for empty URLs');
        });
        test('should handle image files in toolResultDetails', async () => {
            const imageBuffer = VSBuffer.fromString('fake-png-data');
            const fileContentMap = new ResourceMap([
                [URI.parse('file:///image.png'), imageBuffer],
                [URI.parse('file:///document.txt'), 'Text content']
            ]);
            const tool = new FetchWebPageTool(new TestWebContentExtractorService(new ResourceMap()), new ExtendedTestFileService(fileContentMap), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const result = await tool.invoke({ callId: 'test-images', toolId: 'fetch-page', parameters: { urls: ['file:///image.png', 'file:///document.txt'] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            // Both files should be successful and in toolResultDetails
            assert.ok(Array.isArray(result.toolResultDetails), 'toolResultDetails should be an array');
            assert.strictEqual(result.toolResultDetails.length, 2, 'Should have 2 successful file URIs');
            const uriDetails = result.toolResultDetails;
            assert.strictEqual(uriDetails[0].toString(), 'file:///image.png', 'Should include image file');
            assert.strictEqual(uriDetails[1].toString(), 'file:///document.txt', 'Should include text file');
            // Check content types
            assert.strictEqual(result.content[0].kind, 'data', 'Image should be data part');
            assert.strictEqual(result.content[1].kind, 'text', 'Text file should be text part');
        });
        test('confirmResults is false when all web contents are errors or redirects', async () => {
            const webContentMap = new ResourceMap();
            const tool = new FetchWebPageTool(new class extends TestWebContentExtractorService {
                constructor() {
                    super(webContentMap);
                }
                async extract(uris) {
                    return uris.map(() => ({ status: 'error', error: 'Failed to fetch' }));
                }
            }(), new ExtendedTestFileService(new ResourceMap()), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const result = await tool.invoke({ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://example.com'] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            assert.strictEqual(result.confirmResults, false, 'confirmResults should be false when all results are errors');
        });
        test('confirmResults is false when all web contents are redirects', async () => {
            const webContentMap = new ResourceMap();
            const tool = new FetchWebPageTool(new class extends TestWebContentExtractorService {
                constructor() {
                    super(webContentMap);
                }
                async extract(uris) {
                    return uris.map(() => ({ status: 'redirect', toURI: URI.parse('https://redirected.com') }));
                }
            }(), new ExtendedTestFileService(new ResourceMap()), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const result = await tool.invoke({ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://example.com'] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            assert.strictEqual(result.confirmResults, false, 'confirmResults should be false when all results are redirects');
        });
        test('confirmResults is undefined when at least one web content succeeds', async () => {
            const webContentMap = new ResourceMap([
                [URI.parse('https://success.com'), 'Success content']
            ]);
            const tool = new FetchWebPageTool(new class extends TestWebContentExtractorService {
                constructor() {
                    super(webContentMap);
                }
                async extract(uris) {
                    return [
                        { status: 'ok', result: 'Success content' },
                        { status: 'error', error: 'Failed' }
                    ];
                }
            }(), new ExtendedTestFileService(new ResourceMap()), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const result = await tool.invoke({ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://success.com', 'https://error.com'] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            assert.strictEqual(result.confirmResults, undefined, 'confirmResults should be undefined when at least one result succeeds');
        });
        test('redirect result provides correct message with new URL', async () => {
            const redirectURI = URI.parse('https://redirected.com/page');
            const tool = new FetchWebPageTool(new class extends TestWebContentExtractorService {
                constructor() {
                    super(new ResourceMap());
                }
                async extract(uris) {
                    return [{ status: 'redirect', toURI: redirectURI }];
                }
            }(), new ExtendedTestFileService(new ResourceMap()), new MockTrustedDomainService(), new MockChatService(), new TestContextService());
            const result = await tool.invoke({ callId: 'test-call', toolId: 'fetch-page', parameters: { urls: ['https://example.com'] }, context: undefined }, () => Promise.resolve(0), { report: () => { } }, CancellationToken.None);
            assert.strictEqual(result.content.length, 1);
            assert.strictEqual(result.content[0].kind, 'text');
            if (result.content[0].kind === 'text') {
                assert.ok(result.content[0].value.includes(redirectURI.toString(true)), 'Redirect message should include target URL');
                assert.ok(result.content[0].value.includes(InternalFetchWebPageToolId), 'Redirect message should suggest using tool again');
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmV0Y2hQYWdlVG9vbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvdG9vbHMvYnVpbHRpblRvb2xzL2ZldGNoUGFnZVRvb2wudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUd6RyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDckcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDOUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUVsRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUxRSxNQUFNLDhCQUE4QjtJQUduQyxZQUFvQixlQUFvQztRQUFw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