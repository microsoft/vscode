/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { buildCollectionArgs, buildSingleImageArgs, collectCarouselSections, findClickedImageIndex, ICarouselSection } from '../../browser/chatImageCarouselService.js';
import { IChatToolInvocationSerialized } from '../../common/chatService/chatService.js';
import { ChatResponseResource } from '../../common/model/chatModel.js';
import { IImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { ToolDataSource } from '../../common/tools/languageModelToolsService.js';

suite('ChatImageCarouselService helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function makeRequest(id: string, variables: IChatRequestViewModel['variables'], messageText: string = 'Request'): IChatRequestViewModel {
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
			shouldBeBlocked: undefined!,
			timestamp: 0,
		} as unknown as IChatRequestViewModel;
	}

	function makeResponse(requestId: string, id: string = 'resp-1', responseValue: IChatResponseViewModel['response']['value'] = []): IChatResponseViewModel {
		return {
			id,
			requestId,
			sessionResource: URI.parse('chat-session://test/session'),
			response: { value: responseValue },
			session: { getItems: () => [] },
			setVote: () => { },
		} as unknown as IChatResponseViewModel;
	}

	function makeImageVariableEntry(overrides: Partial<IImageVariableEntry> & Pick<IImageVariableEntry, 'value'>): IImageVariableEntry {
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

	function makeImage(id: string, name: string = 'img.png', mimeType: string = 'image/png'): { id: string; name: string; mimeType: string; data: Uint8Array } {
		return { id, name, mimeType, data: new Uint8Array([1, 2, 3]) };
	}

	function makeSections(...imageCounts: number[]): ICarouselSection[] {
		return imageCounts.map((count, sectionIdx) => ({
			title: `Section ${sectionIdx}`,
			images: Array.from({ length: count }, (_, imgIdx) =>
				makeImage(URI.file(`/image_s${sectionIdx}_i${imgIdx}.png`).toString(), `image_s${sectionIdx}_i${imgIdx}.png`)
			),
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
			const sections: ICarouselSection[] = [{
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
			const sections: ICarouselSection[] = [
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
			const sections: ICarouselSection[] = [{
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

			const result = await collectCarouselSections([request, response], async uri => VSBuffer.fromString(`data-for-${uri.path}`).buffer);

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
				} as unknown as IChatToolInvocationSerialized,
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
