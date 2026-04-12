/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { buildCollectionArgs, buildSingleImageArgs, collectCarouselSections, findClickedImageIndex } from '../../browser/chatImageCarouselService.js';
import { ChatResponseResource } from '../../common/model/chatModel.js';
import { ToolDataSource } from '../../common/tools/languageModelToolsService.js';
suite('ChatImageCarouselService helpers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function makeRequest(id, variables, messageText = 'Request') {
        return {
            id,
            sessionResource: URI.parse('chat-session://test/session'),
            dataId: `data-${id}`,
            username: 'test-user',
            message: { text: messageText, parts: [] },
            messageText,
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
    function makeResponse(requestId, id = 'resp-1', responseValue = []) {
        return {
            id,
            requestId,
            sessionResource: URI.parse('chat-session://test/session'),
            response: { value: responseValue },
            session: { getItems: () => [] },
            setVote: () => { },
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
    function makeImage(id, name = 'img.png', mimeType = 'image/png') {
        return { id, name, mimeType, data: new Uint8Array([1, 2, 3]) };
    }
    function makeSections(...imageCounts) {
        return imageCounts.map((count, sectionIdx) => ({
            title: `Section ${sectionIdx}`,
            images: Array.from({ length: count }, (_, imgIdx) => makeImage(URI.file(`/image_s${sectionIdx}_i${imgIdx}.png`).toString(), `image_s${sectionIdx}_i${imgIdx}.png`)),
        }));
    }
    suite('findClickedImageIndex', () => {
        test('finds image by URI string match in first section', () => {
            const sections = makeSections(3);
            const targetUri = URI.parse(sections[0].images[1].id);
            assert.strictEqual(findClickedImageIndex(sections, targetUri), 1);
        });
        test('finds image by URI string match in second section', () => {
            const sections = makeSections(2, 3);
            const targetUri = URI.parse(sections[1].images[2].id);
            // globalOffset = 2 (first section) + 2 (third in second section) = 4
            assert.strictEqual(findClickedImageIndex(sections, targetUri), 4);
        });
        test('returns -1 when no match found', () => {
            const sections = makeSections(2, 2);
            const unknownUri = URI.file('/nonexistent.png');
            assert.strictEqual(findClickedImageIndex(sections, unknownUri), -1);
        });
        test('falls back to data buffer match', () => {
            const sections = [{
                    title: 'Section',
                    images: [
                        { id: 'custom-id-1', name: 'a.png', mimeType: 'image/png', data: new Uint8Array([10, 20]) },
                        { id: 'custom-id-2', name: 'b.png', mimeType: 'image/png', data: new Uint8Array([30, 40]) },
                    ],
                }];
            const unknownUri = URI.from({ scheme: 'data', path: 'b.png' });
            assert.strictEqual(findClickedImageIndex(sections, unknownUri, new Uint8Array([30, 40])), 1);
        });
        test('prefers a later exact URI match over an earlier image with identical data', () => {
            const firstUri = URI.parse('vscode-chat-response-resource://session/tool-call-1/0/file.png');
            const secondUri = URI.parse('vscode-chat-response-resource://session/tool-call-2/0/file.png');
            const identicalData = new Uint8Array([10, 20, 30]);
            const sections = [
                {
                    title: 'Earlier',
                    images: [
                        { id: firstUri.toString(), name: 'first.png', mimeType: 'image/png', data: identicalData },
                    ],
                },
                {
                    title: 'Later',
                    images: [
                        { id: secondUri.toString(), name: 'second.png', mimeType: 'image/png', data: identicalData },
                    ],
                },
            ];
            assert.strictEqual(findClickedImageIndex(sections, secondUri, identicalData), 1);
        });
        test('returns -1 for empty sections', () => {
            assert.strictEqual(findClickedImageIndex([], URI.file('/x.png')), -1);
        });
    });
    suite('buildCollectionArgs', () => {
        test('uses section title when single section', () => {
            const sections = makeSections(2);
            const result = buildCollectionArgs(sections, 0, URI.file('/session'));
            assert.deepStrictEqual(result, {
                collection: {
                    id: URI.file('/session').toString() + '_carousel',
                    title: 'Section 0',
                    sections,
                },
                startIndex: 0,
            });
        });
        test('uses generic title for multiple sections', () => {
            const sections = makeSections(1, 1);
            const result = buildCollectionArgs(sections, 1, URI.file('/session'));
            assert.strictEqual(result.collection.title, 'Conversation Images');
            assert.strictEqual(result.startIndex, 1);
        });
        test('falls back to default title when single section has empty title', () => {
            const sections = [{
                    title: '',
                    images: [makeImage(URI.file('/img.png').toString())],
                }];
            const result = buildCollectionArgs(sections, 0, URI.file('/session'));
            assert.strictEqual(result.collection.title, 'Conversation Images');
        });
    });
    suite('buildSingleImageArgs', () => {
        test('extracts name and mime from URI path', () => {
            const uri = URI.file('/path/to/photo.jpg');
            const data = new Uint8Array([1, 2, 3]);
            assert.deepStrictEqual(buildSingleImageArgs(uri, data), {
                name: 'photo.jpg',
                mimeType: 'image/jpg',
                data,
                title: 'photo.jpg',
            });
        });
        test('defaults mime to image/png for unknown extension', () => {
            const uri = URI.file('/path/to/file.xyz');
            const data = new Uint8Array([1]);
            assert.strictEqual(buildSingleImageArgs(uri, data).mimeType, 'image/png');
        });
    });
    suite('collectCarouselSections', () => {
        test('collects request attachment images for pending requests', async () => {
            const request = makeRequest('req-1', [
                makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) }),
            ], 'Pending request');
            const result = await collectCarouselSections([request], async () => new Uint8Array());
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].title, 'Pending request');
            assert.strictEqual(result[0].images.length, 1);
            assert.deepStrictEqual({
                id: result[0].images[0].id,
                name: result[0].images[0].name,
                mimeType: result[0].images[0].mimeType,
                data: [...result[0].images[0].data],
            }, {
                id: URI.from({ scheme: 'data', path: 'cat.png' }).toString(),
                name: 'cat.png',
                mimeType: 'image/png',
                data: [1, 2, 3],
            });
        });
        test('collects request attachment images restored as plain objects', async () => {
            const request = makeRequest('req-1', [
                makeImageVariableEntry({ value: { 0: 4, 1: 5, 2: 6 } }),
            ], 'Pending request');
            const result = await collectCarouselSections([request], async () => new Uint8Array());
            assert.deepStrictEqual([...result[0].images[0].data], [4, 5, 6]);
        });
        test('merges request images into matching response section', async () => {
            const request = makeRequest('req-1', [
                makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) }),
            ], 'Show me images');
            const response = makeResponse('req-1');
            const result = await collectCarouselSections([request, response], async (uri) => VSBuffer.fromString(`data-for-${uri.path}`).buffer);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].title, 'Show me images');
            assert.strictEqual(result[0].images.length, 1);
            assert.strictEqual(result[0].images[0].name, 'cat.png');
        });
        test('prefers paired request message text over extracted response title', async () => {
            const request = makeRequest('req-1', [
                makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) }),
            ], 'Request title wins');
            const response = makeResponse('req-1');
            const result = await collectCarouselSections([request, response], async () => new Uint8Array());
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].title, 'Request title wins');
        });
        test('does not duplicate request images when response exists', async () => {
            const request = makeRequest('req-1', [
                makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) }),
            ], 'Show me images');
            const response = makeResponse('req-1');
            const result = await collectCarouselSections([request, response], async () => new Uint8Array());
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].images.length, 1);
        });
        test('deduplicates consecutive images with the same URI', async () => {
            const uri = URI.file('/screenshot.png');
            const request = makeRequest('req-1', [
                makeImageVariableEntry({
                    value: new Uint8Array([1, 2, 3]),
                    references: [{ reference: uri, kind: 'reference' }],
                }),
                makeImageVariableEntry({
                    id: 'img-2',
                    value: new Uint8Array([1, 2, 3]),
                    references: [{ reference: uri, kind: 'reference' }],
                }),
            ], 'Two same images');
            const response = makeResponse('req-1');
            const result = await collectCarouselSections([request, response], async () => new Uint8Array());
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].images.length, 1);
        });
        test('keeps non-consecutive images with the same URI', async () => {
            const uri = URI.file('/screenshot.png');
            const otherUri = URI.file('/other.png');
            const request = makeRequest('req-1', [
                makeImageVariableEntry({
                    value: new Uint8Array([1, 2, 3]),
                    references: [{ reference: uri, kind: 'reference' }],
                }),
                makeImageVariableEntry({
                    id: 'img-2',
                    name: 'other.png',
                    value: new Uint8Array([4, 5, 6]),
                    references: [{ reference: otherUri, kind: 'reference' }],
                }),
                makeImageVariableEntry({
                    id: 'img-3',
                    value: new Uint8Array([1, 2, 3]),
                    references: [{ reference: uri, kind: 'reference' }],
                }),
            ], 'Non-consecutive duplicates');
            const response = makeResponse('req-1');
            const result = await collectCarouselSections([request, response], async () => new Uint8Array());
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].images.length, 3);
        });
        test('uses tool image URIs as carousel image ids', async () => {
            const request = makeRequest('req-1', [], 'Request with tool output image');
            const toolCallId = 'tool-call-1';
            const sessionResource = URI.parse('chat-session://test/session');
            const expectedUri = ChatResponseResource.createUri(sessionResource, toolCallId, 0, 'file.png').toString();
            const response = makeResponse('req-1', 'resp-1', [
                {
                    kind: 'toolInvocationSerialized',
                    toolId: 'test_tool',
                    toolCallId,
                    invocationMessage: 'Took screenshot',
                    originMessage: undefined,
                    pastTenseMessage: undefined,
                    presentation: undefined,
                    resultDetails: {
                        output: {
                            type: 'data',
                            mimeType: 'image/png',
                            base64Data: 'AQID'
                        }
                    },
                    isConfirmed: { type: 0 },
                    isComplete: true,
                    source: ToolDataSource.Internal,
                    generatedTitle: undefined,
                    isAttachedToThinking: false,
                },
            ]);
            const result = await collectCarouselSections([request, response], async () => new Uint8Array());
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].images.length, 1);
            assert.strictEqual(result[0].images[0].id, expectedUri);
        });
        test('image data is a plain Uint8Array usable by Blob constructor', async () => {
            const request = makeRequest('req-1', [
                makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) }),
            ], 'Screenshot request');
            const response = makeResponse('req-1');
            const result = await collectCarouselSections([request, response], async () => new Uint8Array());
            assert.strictEqual(result.length, 1);
            const data = result[0].images[0].data;
            // data must be a Uint8Array (not VSBuffer or ArrayBuffer) so that
            // new Blob([data]) in the carousel editor works correctly.
            assert.ok(data instanceof Uint8Array, 'image data should be Uint8Array');
            assert.deepStrictEqual([...data], [1, 2, 3]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9jaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsb0JBQW9CLEVBQUUsdUJBQXVCLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sMkNBQTJDLENBQUM7QUFFeEssT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFHdkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRWpGLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxHQUFHLEVBQUU7SUFDOUMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLFdBQVcsQ0FBQyxFQUFVLEVBQUUsU0FBNkMsRUFBRSxjQUFzQixTQUFTO1FBQzlHLE9BQU87WUFDTixFQUFFO1lBQ0YsZUFBZSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUM7WUFDekQsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQ3BCLFFBQVEsRUFBRSxXQUFXO1lBQ3JCLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUN6QyxXQUFXO1lBQ1gsT0FBTyxFQUFFLENBQUM7WUFDVixTQUFT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