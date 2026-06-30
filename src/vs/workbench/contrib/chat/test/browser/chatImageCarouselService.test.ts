/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { URI } from '../../../../../base/common/uri.js';
import { buildCollectionArgs, buildSingleImageArgs, ChatImageCarouselService, collectCarouselSections, createCachingReadFile, findClickedImageIndex, ICarouselCollectionArgs, ICarouselSection } from '../../browser/chatImageCarouselService.js';
import { IChatToolInvocationSerialized } from '../../common/chatService/chatService.js';
import { ChatResponseResource } from '../../common/model/chatModel.js';
import { IImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel } from '../../common/model/chatViewModel.js';
import { ToolDataSource } from '../../common/tools/languageModelToolsService.js';
import type { ICommandService } from '../../../../../platform/commands/common/commands.js';
import type { IFileService } from '../../../../../platform/files/common/files.js';
import type { IChatWidgetService } from '../../browser/chat.js';
import type { ImageCarouselEditorInput } from '../../../imageCarousel/browser/imageCarouselEditorInput.js';
import type { IImageCarouselCollection } from '../../../imageCarousel/browser/imageCarouselTypes.js';

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
				id: URI.from({ scheme: 'data', path: 'img-1/cat.png' }).toString(),
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

	suite('createCachingReadFile', () => {

		test('reads each URI once and serves repeats from the cache', async () => {
			const cache = new Map<string, Uint8Array>();
			const calls: string[] = [];
			const readFile = createCachingReadFile(async uri => {
				calls.push(uri.toString());
				return new Uint8Array([calls.length]);
			}, cache);

			const a = URI.file('/a.png');
			const b = URI.file('/b.png');
			const first = await readFile(a);
			const firstAgain = await readFile(a);
			const second = await readFile(b);

			assert.deepStrictEqual(
				{ calls, first: [...first], firstAgain: [...firstAgain], second: [...second] },
				{ calls: [a.toString(), b.toString()], first: [1], firstAgain: [1], second: [2] }
			);
		});
	});

	suite('live refresh', () => {

		/** A little past the carousel's 300ms refresh debounce, so the scheduled refresh has fired. */
		const REFRESH_DELAY_PADDED = 400;

		function imageIdFor(varId: string): string {
			return URI.from({ scheme: 'data', path: `${varId}/cat.png` }).toString();
		}

		function requestWithImage(requestId: string, imageVarId: string): IChatRequestViewModel {
			return makeRequest(requestId, [makeImageVariableEntry({ id: imageVarId, value: new Uint8Array([1, 2, 3]) })], `req ${requestId}`);
		}

		function imageIdsOf(collection: IImageCarouselCollection | undefined): string[] {
			return collection?.sections.flatMap(section => section.images.map(image => image.id)) ?? [];
		}

		test('streams newly added images into the open carousel, dedups text-only changes, and stops after dispose', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const disposables = new DisposableStore();
			const onDidChange = disposables.add(new Emitter<void>());
			const onWillDispose = disposables.add(new Emitter<void>());

			// Mutable chat session: starts with one image, grows as the agent streams.
			const items: IChatRequestViewModel[] = [requestWithImage('req-1', 'img-1')];
			const viewModel = {
				getItems: () => items,
				onDidChange: onDidChange.event,
				sessionResource: URI.parse('chat-session://test/session'),
			} as unknown as IChatViewModel;

			// Stand-in carousel input recording every pushed collection.
			let disposed = false;
			const updates: IImageCarouselCollection[] = [];
			const input = {
				updateCollection: (collection: IImageCarouselCollection) => updates.push(collection),
				isDisposed: () => disposed,
				onWillDispose: onWillDispose.event,
			} as unknown as ImageCarouselEditorInput;

			const chatWidgetService = { lastFocusedWidget: { viewModel } } as unknown as IChatWidgetService;
			const commandService = { executeCommand: async () => input } as unknown as ICommandService;
			const fileService = { readFile: async () => ({ value: { buffer: new Uint8Array() } }) } as unknown as IFileService;

			const service = disposables.add(new ChatImageCarouselService(chatWidgetService, commandService, fileService));

			try {
				await service.openCarouselAtResource(URI.parse(imageIdFor('img-1')));
				const afterOpen = updates.length;

				// Two more screenshots arrive while the carousel is open.
				items.push(requestWithImage('req-2', 'img-2'), requestWithImage('req-3', 'img-3'));
				onDidChange.fire();
				await timeout(REFRESH_DELAY_PADDED);
				const afterImagesAdded = updates.length;
				const refreshedImageIds = imageIdsOf(updates.at(-1));

				// A text-only streaming delta (no new images) must not push another update.
				onDidChange.fire();
				await timeout(REFRESH_DELAY_PADDED);
				const afterTextOnly = updates.length;

				// Once the carousel closes the live refresh is torn down.
				disposed = true;
				onWillDispose.fire();
				items.push(requestWithImage('req-4', 'img-4'));
				onDidChange.fire();
				await timeout(REFRESH_DELAY_PADDED);
				const afterDispose = updates.length;

				assert.deepStrictEqual(
					{ afterOpen, afterImagesAdded, afterTextOnly, afterDispose, refreshedImageIds },
					{
						afterOpen: 0,
						afterImagesAdded: 1,
						afterTextOnly: 1,
						afterDispose: 1,
						refreshedImageIds: [imageIdFor('img-1'), imageIdFor('img-2'), imageIdFor('img-3')],
					}
				);
			} finally {
				disposables.dispose();
			}
		}));

		test('serves multiple chats from the one service, opening each on its first image and live-refreshing only the active carousel', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const disposables = new DisposableStore();

			// Two chat sessions, each with its own change signal and a distinct
			// sessionResource (so their carousel collection ids differ).
			const onDidChangeA = disposables.add(new Emitter<void>());
			const onDidChangeB = disposables.add(new Emitter<void>());
			const itemsA: IChatRequestViewModel[] = [requestWithImage('reqA-1', 'imgA-1')];
			const itemsB: IChatRequestViewModel[] = [requestWithImage('reqB-1', 'imgB-1')];
			const vmA = { getItems: () => itemsA, onDidChange: onDidChangeA.event, sessionResource: URI.parse('chat-session://test/a') } as unknown as IChatViewModel;
			const vmB = { getItems: () => itemsB, onDidChange: onDidChangeB.event, sessionResource: URI.parse('chat-session://test/b') } as unknown as IChatViewModel;

			const onWillDisposeA = disposables.add(new Emitter<void>());
			const onWillDisposeB = disposables.add(new Emitter<void>());
			const updatesA: IImageCarouselCollection[] = [];
			const updatesB: IImageCarouselCollection[] = [];
			const inputA = { updateCollection: (c: IImageCarouselCollection) => updatesA.push(c), isDisposed: () => false, onWillDispose: onWillDisposeA.event } as unknown as ImageCarouselEditorInput;
			const inputB = { updateCollection: (c: IImageCarouselCollection) => updatesB.push(c), isDisposed: () => false, onWillDispose: onWillDisposeB.event } as unknown as ImageCarouselEditorInput;

			// The same singleton service handles both chats; the focused widget switches between opens.
			const widget = { viewModel: vmA };
			const chatWidgetService = { lastFocusedWidget: widget } as unknown as IChatWidgetService;

			// Record the args each open passes to the command and hand back the matching input.
			const openArgs: unknown[] = [];
			const inputsToReturn: ImageCarouselEditorInput[] = [inputA, inputB];
			const commandService = {
				executeCommand: async (_id: string, args: unknown) => {
					openArgs.push(args);
					return inputsToReturn.shift();
				},
			} as unknown as ICommandService;
			const fileService = { readFile: async () => ({ value: { buffer: new Uint8Array() } }) } as unknown as IFileService;

			const service = disposables.add(new ChatImageCarouselService(chatWidgetService, commandService, fileService));

			const openedImageIds = (args: unknown): string[] => {
				const collection = (args as ICarouselCollectionArgs | undefined)?.collection;
				return collection ? collection.sections.flatMap(section => section.images.map(image => image.id)) : [];
			};

			try {
				// Chat A: clicking the first screenshot opens the real collection (not the single-image fallback).
				await service.openCarouselAtResource(URI.parse(imageIdFor('imgA-1')));

				// More screenshots stream into chat A.
				itemsA.push(requestWithImage('reqA-2', 'imgA-2'));
				onDidChangeA.fire();
				await timeout(REFRESH_DELAY_PADDED);

				// New chat B opens its own carousel on its first screenshot; A's live refresh is swapped out.
				widget.viewModel = vmB;
				await service.openCarouselAtResource(URI.parse(imageIdFor('imgB-1')));

				// A keeps streaming, but its carousel must no longer update (refresh torn down).
				itemsA.push(requestWithImage('reqA-3', 'imgA-3'));
				onDidChangeA.fire();
				await timeout(REFRESH_DELAY_PADDED);

				// B streams and its carousel refreshes.
				itemsB.push(requestWithImage('reqB-2', 'imgB-2'));
				onDidChangeB.fire();
				await timeout(REFRESH_DELAY_PADDED);

				assert.deepStrictEqual(
					{
						openAImageIds: openedImageIds(openArgs[0]),
						openBImageIds: openedImageIds(openArgs[1]),
						inputAUpdates: updatesA.map(imageIdsOf),
						inputBUpdates: updatesB.map(imageIdsOf),
					},
					{
						openAImageIds: [imageIdFor('imgA-1')],
						openBImageIds: [imageIdFor('imgB-1')],
						inputAUpdates: [[imageIdFor('imgA-1'), imageIdFor('imgA-2')]],
						inputBUpdates: [[imageIdFor('imgB-1'), imageIdFor('imgB-2')]],
					}
				);
			} finally {
				disposables.dispose();
			}
		}));
	});

});
