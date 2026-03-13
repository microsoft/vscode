/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatProgressResponseContent } from '../../common/model/chatModel.js';
import { IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { IChatContentInlineReference, IChatToolInvocationSerialized, IToolResultOutputDetailsSerialized } from '../../common/chatService/chatService.js';
import { IToolResultInputOutputDetails } from '../../common/tools/languageModelToolsService.js';
import { extractImagesFromChatResponse } from '../../common/chatImageExtraction.js';

function makeToolInvocation(overrides: Partial<IChatToolInvocationSerialized> = {}): IChatToolInvocationSerialized {
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

function makeInlineReference(uri: URI, name?: string): IChatContentInlineReference {
	return {
		kind: 'inlineReference',
		inlineReference: uri,
		name,
	};
}

function makeResponse(items: ReadonlyArray<IChatProgressResponseContent>, opts: {
	sessionResource?: URI;
	requestId?: string;
	id?: string;
	requestMessageText?: string;
	noMatchingRequest?: boolean;
} = {}): IChatResponseViewModel {
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
	} as unknown as IChatResponseViewModel;
}

const fakeReadFile = (uri: URI) => Promise.resolve(VSBuffer.fromString(`data-for-${uri.path}`));

suite('extractImagesFromChatResponse', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns empty images when response has no items', async () => {
		const response = makeResponse([]);
		const result = await extractImagesFromChatResponse(response);
		assert.deepStrictEqual(result, {
			id: response.sessionResource.toString() + '_' + response.id,
			title: 'Show me images',
			images: [],
		});
	});

	test('uses default title when no matching request is found', async () => {
		const response = makeResponse([], { noMatchingRequest: true });
		const result = await extractImagesFromChatResponse(response);
		assert.strictEqual(result.title, 'Images');
	});

	test('extracts image from tool invocation with IToolResultOutputDetails', async () => {
		const resultDetails: IToolResultOutputDetailsSerialized = {
			output: { type: 'data', mimeType: 'image/png', base64Data: 'AQID' },
		};
		const toolInvocation = makeToolInvocation({
			toolCallId: 'call_img',
			toolId: 'screenshot-tool',
			pastTenseMessage: 'Took a screenshot',
			resultDetails,
		});

		const response = makeResponse([toolInvocation]);
		const result = await extractImagesFromChatResponse(response);

		assert.strictEqual(result.images.length, 1);
		assert.strictEqual(result.images[0].id, 'call_img_0');
		assert.strictEqual(result.images[0].mimeType, 'image/png');
		assert.ok(result.images[0].source.includes('screenshot-tool'));
		assert.strictEqual(result.images[0].caption, 'Took a screenshot');
	});

	test('extracts multiple images from tool invocation with IToolResultInputOutputDetails', async () => {
		const resultDetails: IToolResultInputOutputDetails = {
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
		const result = await extractImagesFromChatResponse(response);

		assert.strictEqual(result.images.length, 2);
		assert.strictEqual(result.images[0].id, 'call_multi_0');
		assert.strictEqual(result.images[0].mimeType, 'image/png');
		assert.strictEqual(result.images[1].id, 'call_multi_2');
		assert.strictEqual(result.images[1].mimeType, 'image/jpeg');
	});

	test('skips tool invocations without image results', async () => {
		const resultDetails: IToolResultOutputDetailsSerialized = {
			output: { type: 'data', mimeType: 'text/plain', base64Data: 'aGVsbG8=' },
		};
		const toolInvocation = makeToolInvocation({ resultDetails });

		const response = makeResponse([toolInvocation]);
		const result = await extractImagesFromChatResponse(response);
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
		const inlineRef: IChatContentInlineReference = {
			kind: 'inlineReference',
			inlineReference: { uri: imageUri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } },
		};

		const response = makeResponse([inlineRef]);
		const result = await extractImagesFromChatResponse(response, fakeReadFile);

		assert.strictEqual(result.images.length, 1);
		assert.strictEqual(result.images[0].uri.toString(), imageUri.toString());
	});

	test('skips inline references without readFile callback', async () => {
		const imageUri = URI.file('/photos/cat.png');
		const inlineRef = makeInlineReference(imageUri);

		const response = makeResponse([inlineRef]);
		const result = await extractImagesFromChatResponse(response);
		assert.strictEqual(result.images.length, 0);
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
			} satisfies IToolResultOutputDetailsSerialized,
		});

		const inlineRef = makeInlineReference(URI.file('/middle.png'), 'middle.png');

		const toolInvocation2 = makeToolInvocation({
			toolCallId: 'call_last',
			toolId: 'tool-2',
			resultDetails: {
				output: { type: 'data', mimeType: 'image/jpeg', base64Data: 'BAUG' },
			} satisfies IToolResultOutputDetailsSerialized,
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
		const result = await extractImagesFromChatResponse(response);
		assert.strictEqual(result.id, sessionResource.toString() + '_response-42');
	});
});
