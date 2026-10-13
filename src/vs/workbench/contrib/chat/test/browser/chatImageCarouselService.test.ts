/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { buildCollectionArgs, buildSingleImageArgs, ChatImageCarouselService, collectCarouselSections, findClickedImageIndex, ICarouselSection } from '../../browser/chatImageCarouselService.js';
import { IChatToolInvocationSerialized } from '../../common/chatService/chatService.js';
import { ChatResponseResource } from '../../common/model/chatModel.js';
import { IImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { ToolDataSource } from '../../common/tools/languageModelToolsService.js';

suite('ChatImageCarouselService helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

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

	function makeGeneratedImageTool(uri: URI): IChatToolInvocationSerialized {
		return {
			kind: 'toolInvocationSerialized',
			toolCallId: 'generated',
			toolId: 'image_generation',
			toolSpecificData: { kind: 'generatedImage' },
			invocationMessage: 'Generating images',
			pastTenseMessage: 'Generated images',
			originMessage: undefined,
			presentation: undefined,
			isComplete: true,
			isConfirmed: true,
			source: ToolDataSource.Internal,
			resultDetails: {
				input: '',
				output: [
					{ type: 'embed', value: 'AQID', mimeType: 'image/png' },
					{ type: 'ref', uri, mimeType: 'image/png' },
				],
			},
		};
	}

	suite('findClickedImageIndex', () => {

		test('matches embedded generated images independently of gallery display names', () => {
			const sessionResource = URI.parse('chat-session://test/session');
			const sections: ICarouselSection[] = [{
				title: 'Images',
				images: [
					makeImage(ChatResponseResource.createUri(sessionResource, 'first-tool', 0, 'file.png').toString()),
					makeImage(ChatResponseResource.createUri(sessionResource, 'second-tool', 2, 'file.png').toString()),
				],
			}];
			const clicked = ChatResponseResource.createUri(sessionResource, 'second-tool', 2, 'generated-image-2.png');

			assert.strictEqual(findClickedImageIndex(sections, clicked), 1);
		});

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

		test('prefers the current input section when the same URI appeared earlier', () => {
			const repeatedUri = URI.file('/repeated.png');
			const sections: ICarouselSection[] = [
				{ title: 'History', images: [{ id: repeatedUri.toString(), name: 'historical.png', mimeType: 'image/png', data: new Uint8Array([1]) }] },
				{ title: 'Current Input', images: [{ id: repeatedUri.toString(), name: 'current.png', mimeType: 'image/png', data: new Uint8Array([1]) }] },
			];

			assert.strictEqual(findClickedImageIndex(sections, repeatedUri, new Uint8Array([1]), 1), 1);
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

		test('decodes percent-encoded filename for display', () => {
			const uri = URI.file('/path/to/Element%20Screenshot.png');
			const data = new Uint8Array([1, 2, 3]);
			assert.deepStrictEqual(buildSingleImageArgs(uri, data), {
				name: 'Element Screenshot.png',
				mimeType: 'image/png',
				data,
				title: 'Element Screenshot.png',
			});
		});
	});

	suite('collectCarouselSections', () => {

		test('combines attached and generated images across turns, including URI-backed attachments', async () => {
			const generatedUri = URI.parse('vscode-agent-host://remote/generated-images/image?version=1');
			const attachmentUri = URI.file('/attached.png');
			const firstRequest = makeRequest('req-1', [makeImageVariableEntry({ value: new Uint8Array([4, 5, 6]) })], 'Generate images');
			const firstResponse = makeResponse('req-1', 'response-1', [makeGeneratedImageTool(generatedUri)]);
			const secondRequest = makeRequest('req-2', [makeImageVariableEntry({ value: attachmentUri })], 'Another image');
			const result = await collectCarouselSections([firstRequest, firstResponse, secondRequest], async () => {
				throw new Error('Referenced images should be loaded lazily');
			});

			assert.deepStrictEqual(result.map(section => ({
				title: section.title,
				images: section.images.map(image => ({ id: image.id, uri: image.uri, data: image.data && [...image.data] })),
			})), [{
				title: 'Generate images',
				images: [
					{ id: URI.from({ scheme: 'data', path: 'img-1/cat.png' }).toString(), uri: undefined, data: [4, 5, 6] },
					{ id: ChatResponseResource.createUri(firstResponse.sessionResource, 'generated', 0, 'generated-image-e38b1aae6592.png').toString(), uri: undefined, data: [1, 2, 3] },
					{ id: generatedUri.toString(), uri: generatedUri, data: undefined },
				],
			}, {
				title: 'Another image',
				images: [{ id: attachmentUri.toString(), uri: attachmentUri, data: undefined }],
			}]);
		});

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
				data: result[0].images[0].data && [...result[0].images[0].data],
			}, {
				id: URI.from({ scheme: 'data', path: 'img-1/cat.png' }).toString(),
				name: 'cat.png',
				mimeType: 'image/png',
				data: [1, 2, 3],
			});
		});

		test('collects all current input image attachments', async () => {
			const attachments = [
				makeImageVariableEntry({ id: 'img-1', name: 'first.png', value: new Uint8Array([1]) }),
				makeImageVariableEntry({ id: 'img-2', name: 'second.png', value: new Uint8Array([2]) }),
				makeImageVariableEntry({ id: 'img-3', name: 'third.png', value: new Uint8Array([3]) }),
			];

			const result = await collectCarouselSections([], async () => new Uint8Array(), { text: '', attachments });

			assert.deepStrictEqual(result.map(section => ({
				...section,
				images: section.images.map(image => ({ ...image, data: image.data && [...image.data] })),
			})), [{
				title: 'Current Input',
				images: [
					{ id: 'data:img-1/first.png', name: 'first.png', mimeType: 'image/png', data: [1], caption: undefined },
					{ id: 'data:img-2/second.png', name: 'second.png', mimeType: 'image/png', data: [2], caption: undefined },
					{ id: 'data:img-3/third.png', name: 'third.png', mimeType: 'image/png', data: [3], caption: undefined },
				],
			}]);
		});

		test('collects request attachment images restored as plain objects', async () => {
			const request = makeRequest('req-1', [
				makeImageVariableEntry({ value: { 0: 4, 1: 5, 2: 6 } }),
			], 'Pending request');

			const result = await collectCarouselSections([request], async () => new Uint8Array());

			assert.deepStrictEqual(result[0].images[0].data && [...result[0].images[0].data], [4, 5, 6]);
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
			assert.strictEqual(result[0].images[0].caption, 'Took screenshot');
		});

		test('strips markdown from tool invocation message captions', async () => {
			const imageUri = URI.file('/screenshots/homepage.png');
			const request = makeRequest('req-1', [], 'Take a screenshot');
			const response = makeResponse('req-1', 'resp-1', [
				{
					kind: 'toolInvocationSerialized',
					toolId: 'view_image',
					toolCallId: 'tool-call-1',
					invocationMessage: 'Viewing image',
					originMessage: undefined,
					pastTenseMessage: { value: 'Viewed image [](file:///screenshots/homepage.png)', isTrusted: false, uris: { '0': imageUri.toJSON() } },
					presentation: undefined,
					resultDetails: undefined,
					isConfirmed: { type: 0 },
					isComplete: true,
					source: ToolDataSource.Internal,
					generatedTitle: undefined,
					isAttachedToThinking: false,
				} as unknown as IChatToolInvocationSerialized,
			]);

			const result = await collectCarouselSections([request, response], async () => new Uint8Array([1, 2, 3]));

			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].images.length, 1);
			assert.strictEqual(result[0].images[0].caption, 'Viewed image homepage.png');
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

	suite('opening a conversation carousel', () => {
		test('uses the originating chat and retains additional artifact images without duplicating generated images', async () => {
			const sessionResource = URI.parse('chat-session://test/session');
			const generatedUri = URI.file('/generated.png');
			const artifactUri = URI.file('/artifact.png');
			const request = makeRequest('req-1', [makeImageVariableEntry({ value: new Uint8Array([1, 2, 3]) })]);
			const response = makeResponse('req-1', 'response-1', [makeGeneratedImageTool(generatedUri)]);
			const widget = upcastDeepPartial<IChatWidget>({
				viewModel: { sessionResource, getItems: () => [request, response] },
				attachmentModel: { attachments: [] },
				getInput: () => '',
			});
			const executeCommand = sinon.stub().resolves();
			const getWidgetBySessionResource = sinon.stub().returns(widget);
			const service = new ChatImageCarouselService(
				upcastPartial<IChatWidgetService>({
					lastFocusedWidget: upcastDeepPartial<IChatWidget>({ viewModel: { getItems: () => [] } }),
					getWidgetBySessionResource,
				}),
				upcastPartial<ICommandService>({ executeCommand }),
				upcastPartial<IFileService>({ readFile: async () => { throw new Error('Images should load lazily'); } }),
			);
			const clicked = ChatResponseResource.createUri(sessionResource, 'generated', 0, 'generated-image-1.png');
			await service.openCarouselAtResource(clicked, undefined, {
				sessionResource,
				additionalImages: [{ uri: clicked, mimeType: 'image/png' }, { uri: generatedUri, mimeType: 'image/png' }, { uri: artifactUri, mimeType: 'image/png' }],
			});

			const sections = await collectCarouselSections([request, response], async () => new Uint8Array());
			sections.push({ title: 'Artifact Images', images: [{ id: artifactUri.toString(), name: 'artifact.png', mimeType: 'image/png', uri: artifactUri }] });
			assert.deepStrictEqual({
				requestedChats: getWidgetBySessionResource.args,
				commands: executeCommand.args,
			}, {
				requestedChats: [[sessionResource]],
				commands: [['workbench.action.chat.openImageInCarousel', buildCollectionArgs(sections, 1, sessionResource)]],
			});
		});

		test('keeps the artifact gallery when its chat widget is not available', async () => {
			const sessionResource = URI.parse('chat-session://test/session');
			const uri = URI.file('/artifact.png');
			const executeCommand = sinon.stub().resolves();
			const service = new ChatImageCarouselService(
				upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: () => undefined }),
				upcastPartial<ICommandService>({ executeCommand }),
				upcastPartial<IFileService>({ readFile: async () => { throw new Error('Images should load lazily'); } }),
			);
			await service.openCarouselAtResource(uri, undefined, { sessionResource, additionalImages: [{ uri, mimeType: 'image/png' }] });

			assert.deepStrictEqual(executeCommand.args, [['workbench.action.chat.openImageInCarousel', buildCollectionArgs([
				{ title: 'Artifact Images', images: [{ id: uri.toString(), name: 'artifact.png', mimeType: 'image/png', uri }] },
			], 0, sessionResource)]]);
		});
	});

});
