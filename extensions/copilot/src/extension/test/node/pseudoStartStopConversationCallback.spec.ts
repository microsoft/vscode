/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { ChatVulnerability } from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { IResponseDelta } from '../../../platform/networking/common/fetch';
import { createPlatformServices } from '../../../platform/test/node/services';
import { SpyChatResponseStream } from '../../../util/common/test/mockChatResponseStream';
import { AsyncIterableSource } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseMarkdownPart, ChatResponseMarkdownWithVulnerabilitiesPart } from '../../../vscodeTypes';
import { PseudoStopStartResponseProcessor } from '../../prompt/node/pseudoStartStopConversationCallback';


suite('Post Report Conversation Callback', () => {
	const postReportFn = (deltas: IResponseDelta[]) => {
		return ['<processed>', ...deltas.map(d => d.text), '</processed>'];
	};
	const annotations = [{ id: 123, details: { type: 'type', description: 'description' } }, { id: 456, details: { type: 'type2', description: 'description2' } }];

	let instaService: IInstantiationService;

	beforeEach(() => {
		const accessor = createPlatformServices().createTestingAccessor();
		instaService = accessor.get(IInstantiationService);
	});

	test('Simple post-report', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const stream = new SpyChatResponseStream();
		const testObj = instaService.createInstance(PseudoStopStartResponseProcessor,
			[{
				start: 'end',
				stop: 'start'
			}],
			postReportFn);

		responseSource.emitOne({ delta: { text: 'one' } });
		responseSource.emitOne({ delta: { text: ' start ' } });
		responseSource.emitOne({ delta: { text: 'two' } });
		responseSource.emitOne({ delta: { text: ' end' } });
		responseSource.resolve();

		await testObj.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);

		assert.deepStrictEqual(
			stream.items.map(p => (p as ChatResponseMarkdownPart).value.value),
			['one', ' ', '<processed>', ' ', 'two', ' ', '</processed>']);
	});

	test('Partial stop word with extra text before', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const stream = new SpyChatResponseStream();
		const testObj = instaService.createInstance(PseudoStopStartResponseProcessor,
			[{
				start: 'end',
				stop: 'start'
			}],
			postReportFn);

		responseSource.emitOne({ delta: { text: 'one sta' } });
		responseSource.emitOne({ delta: { text: 'rt' } });
		responseSource.emitOne({ delta: { text: ' two end' } });
		responseSource.resolve();

		await testObj.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);
		assert.deepStrictEqual(
			stream.items.map(p => (p as ChatResponseMarkdownPart).value.value),
			['one ', '<processed>', ' two ', '</processed>']
		);
	});

	test('Partial stop word with extra text after', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const stream = new SpyChatResponseStream();
		const testObj = instaService.createInstance(PseudoStopStartResponseProcessor,
			[{
				start: 'end',
				stop: 'start'
			}],
			postReportFn);

		responseSource.emitOne({ delta: { text: 'one ', codeVulnAnnotations: annotations } });
		responseSource.emitOne({ delta: { text: 'sta' } });
		responseSource.emitOne({ delta: { text: 'rt two' } });
		responseSource.emitOne({ delta: { text: ' end' } });
		responseSource.resolve();

		await testObj.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);
		assert.deepStrictEqual((stream.items[0] as ChatResponseMarkdownWithVulnerabilitiesPart).vulnerabilities, annotations.map(a => ({ title: a.details.type, description: a.details.description } satisfies ChatVulnerability)));

		assert.deepStrictEqual(
			stream.items.map(p => (p as ChatResponseMarkdownPart).value.value),
			['one ', '<processed>', ' two', ' ', '</processed>']);
	});

	test('no second stop word', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const stream = new SpyChatResponseStream();
		const testObj = instaService.createInstance(PseudoStopStartResponseProcessor,
			[{
				start: 'end',
				stop: 'start'
			}],
			postReportFn,
		);

		responseSource.emitOne({ delta: { text: 'one' } });
		responseSource.emitOne({ delta: { text: ' start ' } });
		responseSource.emitOne({ delta: { text: 'two' } });
		responseSource.emitOne({ delta: { text: ' ' } });
		responseSource.resolve();

		await testObj.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);
		assert.deepStrictEqual(
			stream.items.map(p => (p as ChatResponseMarkdownPart).value.value),
			['one', ' ']);
	});

	test('Text on same line as start', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const stream = new SpyChatResponseStream();
		const testObj = instaService.createInstance(PseudoStopStartResponseProcessor,
			[
				{
					start: 'end',
					stop: 'start'
				}
			],
			postReportFn);

		responseSource.emitOne({ delta: { text: 'this is test text\n\n' } });
		responseSource.emitOne({ delta: { text: 'eeep start\n\n' } });
		responseSource.emitOne({ delta: { text: 'test test test test 123456' } });
		responseSource.emitOne({ delta: { text: 'end\n\nhello' } });
		responseSource.resolve();

		await testObj.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);
		assert.deepStrictEqual(
			stream.items.map(p => (p as ChatResponseMarkdownPart).value.value),
			['this is test text\n\n', 'eeep ', '<processed>', '\n\n', 'test test test test 123456', '</processed>', '\n\nhello']);
	});


	test('Start word without a stop word', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();

		const stream = new SpyChatResponseStream();
		const testObj = instaService.createInstance(PseudoStopStartResponseProcessor,
			[{
				start: '[RESPONSE END]',
				stop: '[RESPONSE START]'
			}],
			postReportFn);


		responseSource.emitOne({ delta: { text: `I'm sorry, but as an AI programming assistant, I'm here to provide assistance with software development topics, specifically related to Visual Studio Code. I'm not equipped to provide a definition of a computer. [RESPONSE END]` } });
		responseSource.resolve();

		await testObj.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);
		assert.strictEqual((stream.items[0] as ChatResponseMarkdownPart).value.value, `I'm sorry, but as an AI programming assistant, I'm here to provide assistance with software development topics, specifically related to Visual Studio Code. I'm not equipped to provide a definition of a computer. [RESPONSE END]`);
	});

	afterEach(() => sinon.restore());
});
