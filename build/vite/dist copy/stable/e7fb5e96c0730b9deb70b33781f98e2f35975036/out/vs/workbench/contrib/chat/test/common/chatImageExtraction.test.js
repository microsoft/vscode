/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractImagesFromChatRequest, extractImagesFromChatResponse, extractImagesFromToolInvocationMessages } from '../../common/chatImageExtraction.js';
function makeToolInvocation(overrides = {}) {
    return {
        kind: 'toolInvocationSerialized',
        toolCallId: 'call_1',
        toolId: 'test-tool',
        invocationMessage: 'Running tool',
        originMessage: undefined,
        pastTenseMessage: 'Ran tool',
        isConfirmed: true,
        isComplete: true,
        source: undefined,
        presentation: undefined,
        resultDetails: undefined,
        ...overrides,
    };
}
function makeInlineReference(uri, name) {
    return {
        kind: 'inlineReference',
        inlineReference: uri,
        name,
    };
}
function makeResponse(items, opts = {}) {
    const sessionResource = opts.sessionResource ?? URI.parse('chat-session://test/session');
    const requestId = opts.requestId ?? 'req-1';
    const responseId = opts.id ?? 'resp-1';
    const requestMessageText = opts.requestMessageText ?? 'Show me images';
    return {
        id: responseId,
        requestId,
        sessionResource,
        response: { value: items },
        session: {
            getItems: () => opts.noMatchingRequest ? [] : [{
                    id: requestId,
                    messageText: requestMessageText,
                    message: { parts: [], text: requestMessageText },
                }],
        },
    };
}
const fakeReadFile = (uri) => Promise.resolve(VSBuffer.fromString(`data-for-${uri.path}`));
function makeRequest(variables, opts = {}) {
    return {
        id: opts.id ?? 'req-1',
        sessionResource: URI.parse('chat-session://test/session'),
        dataId: 'data-1',
        username: 'test-user',
        message: { text: opts.messageText ?? 'Show me images', parts: [] },
        messageText: opts.messageText ?? 'Show me images',
        attempt: 0,
        variables,
        currentRenderedHeight: undefined,
        shouldBeRemovedOnSend: undefined,
        isComplete: true,
        isCompleteAddedRequest: true,
        slashCommand: undefined,
        agentOrSlashCommandDetected: false,
        shouldBeBlocked: undefined,
        timestamp: 0,
    };
}
function makeImageVariableEntry(overrides) {
    const { value, ...rest } = overrides;
    return {
        id: 'img-1',
        kind: 'image',
        name: 'cat.png',
        value,
        mimeType: 'image/png',
        ...rest,
    };
}
suite('extractImagesFromChatResponse', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('returns empty images when response has no items', async () => {
        const response = makeResponse([]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.deepStrictEqual(result, {
            id: response.sessionResource.toString() + '_' + response.id,
            title: 'Show me images',
            images: [],
        });
    });
    test('uses default title when no matching request is found', async () => {
        const response = makeResponse([], { noMatchingRequest: true });
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.title, 'Images');
    });
    test('extracts image from tool invocation with IToolResultOutputDetails', async () => {
        const resultDetails = {
            output: { type: 'data', mimeType: 'image/png', base64Data: 'AQID' },
        };
        const toolInvocation = makeToolInvocation({
            toolCallId: 'call_img',
            toolId: 'screenshot-tool',
            pastTenseMessage: 'Took a screenshot',
            resultDetails,
        });
        const response = makeResponse([toolInvocation]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 1);
        assert.strictEqual(result.images[0].id, 'call_img_0');
        assert.strictEqual(result.images[0].mimeType, 'image/png');
        assert.ok(result.images[0].source.includes('screenshot-tool'));
        assert.strictEqual(result.images[0].caption, 'Took a screenshot');
    });
    test('extracts multiple images from tool invocation with IToolResultInputOutputDetails', async () => {
        const resultDetails = {
            input: '',
            output: [
                { type: 'embed', mimeType: 'image/png', value: 'AQID', isText: false },
                { type: 'embed', mimeType: 'text/plain', value: 'text', isText: true },
                { type: 'embed', mimeType: 'image/jpeg', value: 'BAUG', isText: false },
            ],
        };
        const toolInvocation = makeToolInvocation({
            toolCallId: 'call_multi',
            toolId: 'multi-tool',
            pastTenseMessage: 'Generated images',
            resultDetails,
        });
        const response = makeResponse([toolInvocation]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 2);
        assert.strictEqual(result.images[0].id, 'call_multi_0');
        assert.strictEqual(result.images[0].mimeType, 'image/png');
        assert.strictEqual(result.images[1].id, 'call_multi_2');
        assert.strictEqual(result.images[1].mimeType, 'image/jpeg');
    });
    test('skips tool invocations without image results', async () => {
        const resultDetails = {
            output: { type: 'data', mimeType: 'text/plain', base64Data: 'aGVsbG8=' },
        };
        const toolInvocation = makeToolInvocation({ resultDetails });
        const response = makeResponse([toolInvocation]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 0);
    });
    test('extracts image from inline reference URI when readFile is provided', async () => {
        const imageUri = URI.file('/photos/cat.png');
        const inlineRef = makeInlineReference(imageUri, 'cat.png');
        const response = makeResponse([inlineRef]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 1);
        assert.strictEqual(result.images[0].uri.toString(), imageUri.toString());
        assert.strictEqual(result.images[0].name, 'cat.png');
        assert.strictEqual(result.images[0].mimeType, 'image/png');
        assert.strictEqual(result.images[0].source, 'File');
    });
    test('extracts image from inline reference Location', async () => {
        const imageUri = URI.file('/photos/dog.jpg');
        const inlineRef = {
            kind: 'inlineReference',
            inlineReference: { uri: imageUri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } },
        };
        const response = makeResponse([inlineRef]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 1);
        assert.strictEqual(result.images[0].uri.toString(), imageUri.toString());
    });
    test('skips non-image inline references', async () => {
        const codeUri = URI.file('/src/main.ts');
        const inlineRef = makeInlineReference(codeUri);
        const response = makeResponse([inlineRef]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 0);
    });
    test('uses filename from URI path when name is not provided', async () => {
        const imageUri = URI.file('/assets/banner.gif');
        const inlineRef = makeInlineReference(imageUri);
        const response = makeResponse([inlineRef]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 1);
        assert.strictEqual(result.images[0].name, 'banner.gif');
    });
    test('preserves interleaved order of tool and inline reference images', async () => {
        const toolInvocation = makeToolInvocation({
            toolCallId: 'call_first',
            toolId: 'tool-1',
            resultDetails: {
                output: { type: 'data', mimeType: 'image/png', base64Data: 'AQID' },
            },
        });
        const inlineRef = makeInlineReference(URI.file('/middle.png'), 'middle.png');
        const toolInvocation2 = makeToolInvocation({
            toolCallId: 'call_last',
            toolId: 'tool-2',
            resultDetails: {
                output: { type: 'data', mimeType: 'image/jpeg', base64Data: 'BAUG' },
            },
        });
        const response = makeResponse([toolInvocation, inlineRef, toolInvocation2]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 3);
        assert.strictEqual(result.images[0].id, 'call_first_0');
        assert.strictEqual(result.images[1].name, 'middle.png');
        assert.strictEqual(result.images[2].id, 'call_last_0');
    });
    test('collection id combines sessionResource and response id', async () => {
        const sessionResource = URI.parse('chat-session://test/my-session');
        const response = makeResponse([], { sessionResource, id: 'response-42' });
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.id, sessionResource.toString() + '_response-42');
    });
    test('skips inline reference when readFile fails', async () => {
        const imageUri = URI.file('/photos/missing.png');
        const inlineRef = makeInlineReference(imageUri, 'missing.png');
        const failingReadFile = (_uri) => Promise.reject(new Error('File not found'));
        const response = makeResponse([inlineRef]);
        const result = await extractImagesFromChatResponse(response, failingReadFile);
        assert.strictEqual(result.images.length, 0);
    });
    test('extracts images from tool invocation message URIs', async () => {
        const imageUri = URI.file('/screenshots/result.png');
        const toolInvocation = makeToolInvocation({
            toolCallId: 'call_msg',
            toolId: 'screenshot-tool',
            pastTenseMessage: { value: 'Took a screenshot', isTrusted: false, uris: { '0': imageUri.toJSON() } },
        });
        const response = makeResponse([toolInvocation]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 1);
        assert.strictEqual(result.images[0].uri.toString(), imageUri.toString());
        assert.strictEqual(result.images[0].name, 'result.png');
        assert.strictEqual(result.images[0].mimeType, 'image/png');
        assert.strictEqual(result.images[0].caption, 'Took a screenshot');
    });
    test('combines output details images and message URI images', async () => {
        const imageUri = URI.file('/screenshots/msg-image.jpg');
        const resultDetails = {
            output: { type: 'data', mimeType: 'image/png', base64Data: 'AQID' },
        };
        const toolInvocation = makeToolInvocation({
            toolCallId: 'call_both',
            toolId: 'combo-tool',
            pastTenseMessage: { value: 'Ran combo tool', isTrusted: false, uris: { '0': imageUri.toJSON() } },
            resultDetails,
        });
        const response = makeResponse([toolInvocation]);
        const result = await extractImagesFromChatResponse(response, fakeReadFile);
        assert.strictEqual(result.images.length, 2);
        assert.strictEqual(result.images[0].id, 'call_both_0');
        assert.strictEqual(result.images[1].uri.toString(), imageUri.toString());
    });
});
suite('extractImagesFromToolInvocationMessages', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('returns empty when message is undefined', async () => {
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: undefined,
            invocationMessage: undefined,
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.deepStrictEqual(result, []);
    });
    test('returns empty when message is a string', async () => {
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: 'some string message',
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.deepStrictEqual(result, []);
    });
    test('returns empty when message has no uris', async () => {
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: { value: 'No URIs here', isTrusted: false },
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.deepStrictEqual(result, []);
    });
    test('returns empty when message uris are empty', async () => {
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: { value: 'Empty URIs', isTrusted: false, uris: {} },
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.deepStrictEqual(result, []);
    });
    test('skips non-image URIs', async () => {
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: { value: 'Code file', isTrusted: false, uris: { '0': URI.file('/src/main.ts').toJSON() } },
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.deepStrictEqual(result, []);
    });
    test('extracts image from message URI', async () => {
        const imageUri = URI.file('/screenshots/capture.png');
        const toolInvocation = makeToolInvocation({
            toolCallId: 'call_uri',
            toolId: 'screenshot-tool',
            pastTenseMessage: { value: 'Captured screenshot', isTrusted: false, uris: { '0': imageUri.toJSON() } },
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].uri.toString(), imageUri.toString());
        assert.strictEqual(result[0].name, 'capture.png');
        assert.strictEqual(result[0].mimeType, 'image/png');
        assert.strictEqual(result[0].caption, 'Captured screenshot');
        assert.ok(result[0].source.includes('screenshot-tool'));
    });
    test('extracts multiple images from message URIs', async () => {
        const uri1 = URI.file('/img/a.png');
        const uri2 = URI.file('/img/b.jpg');
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: {
                value: 'Generated images',
                isTrusted: false,
                uris: { '0': uri1.toJSON(), '1': uri2.toJSON() },
            },
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].mimeType, 'image/png');
        assert.strictEqual(result[1].mimeType, 'image/jpg');
    });
    test('continues when readFile fails for one URI', async () => {
        const goodUri = URI.file('/img/good.png');
        const badUri = URI.file('/img/bad.png');
        const failingReadFile = (uri) => {
            if (uri.path.includes('bad')) {
                return Promise.reject(new Error('File not found'));
            }
            return Promise.resolve(VSBuffer.fromString('image-data'));
        };
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: {
                value: 'Mixed results',
                isTrusted: false,
                uris: { '0': badUri.toJSON(), '1': goodUri.toJSON() },
            },
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, failingReadFile);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].uri.toString(), goodUri.toString());
    });
    test('falls back to invocationMessage when pastTenseMessage is undefined', async () => {
        const imageUri = URI.file('/img/fallback.png');
        const toolInvocation = makeToolInvocation({
            pastTenseMessage: undefined,
            invocationMessage: { value: 'Running tool', isTrusted: false, uris: { '0': imageUri.toJSON() } },
        });
        const result = await extractImagesFromToolInvocationMessages(toolInvocation, fakeReadFile);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].caption, 'Running tool');
    });
});
suite('extractImagesFromChatRequest', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('extracts image attachment from Uint8Array', () => {
        const request = makeRequest([
            makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) }),
        ]);
        const result = extractImagesFromChatRequest(request);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].name, 'cat.png');
        assert.strictEqual(result[0].mimeType, 'image/png');
        assert.deepStrictEqual([...result[0].data.buffer], [1, 2, 3]);
    });
    test('extracts image attachment from ArrayBuffer', () => {
        const request = makeRequest([
            makeImageVariableEntry({ value: new Uint8Array([4, 5, 6]).buffer }),
        ]);
        const result = extractImagesFromChatRequest(request);
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual([...result[0].data.buffer], [4, 5, 6]);
    });
    test('extracts restored image attachment from plain object bytes', () => {
        const request = makeRequest([
            makeImageVariableEntry({ value: { 0: 7, 1: 8, 2: 9 } }),
        ]);
        const result = extractImagesFromChatRequest(request);
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual([...result[0].data.buffer], [7, 8, 9]);
    });
    test('extracts restored image attachment from reordered plain object bytes', () => {
        const request = makeRequest([
            makeImageVariableEntry({ value: { 2: 9, 0: 7, 1: 8 } }),
        ]);
        const result = extractImagesFromChatRequest(request);
        assert.strictEqual(result.length, 1);
        assert.deepStrictEqual([...result[0].data.buffer], [7, 8, 9]);
    });
    test('uses attachment resource URI when available', () => {
        const uri = URI.file('/tmp/cat.png');
        const request = makeRequest([
            makeImageVariableEntry({ value: new Uint8Array([1]), references: [{ kind: 'reference', reference: uri }] }),
        ]);
        const result = extractImagesFromChatRequest(request);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].uri.toString(), uri.toString());
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEltYWdlRXh0cmFjdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9jaGF0SW1hZ2VFeHRyYWN0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFNbkcsT0FBTyxFQUFFLDRCQUE0QixFQUFFLDZCQUE2QixFQUFFLHVDQUF1QyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFM0osU0FBUyxrQkFBa0IsQ0FBQyxZQUFvRCxFQUFFO0lBQ2pGLE9BQU87UUFDTixJQUFJLEVBQUUsMEJBQTBCO1FBQ2hDLFVBQVUsRUFBRSxRQUFRO1FBQ3BCLE1BQU0sRUFBRSxXQUFXO1FBQ25CLGlCQUFpQixFQUFFLGNBQWM7UUFDakMsYUFBYSxFQUFFLFNBQVM7UUFDeEIsZ0JBQWdCLEVBQUUsVUFBVTtRQUM1QixXQUFXLEVBQUUsSUFBSTtRQUNqQixVQUFVLEVBQUUsSUFBSTtRQUNoQixNQUFNLEVBQUUsU0FBUztRQUNqQixZQUFZLEVBQUUsU0FBUztRQUN2QixhQUFhLEVBQUUsU0FBUztRQUN4QixHQUFHLFNBQVM7S0FDWixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsR0FBUSxFQUFFLElBQWE7SUFDbkQsT0FBTztRQUNOLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsZUFBZSxFQUFFLEdBQUc7UUFDcEIsSUFBSTtLQUNKLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FB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