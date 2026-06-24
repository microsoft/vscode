/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { ChatToolInvocationStreamData, ChatVulnerability } from 'vscode';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { IResponseDelta } from '../../../platform/networking/common/fetch';
import { createPlatformServices } from '../../../platform/test/node/services';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { SpyChatResponseStream } from '../../../util/common/test/mockChatResponseStream';
import { AsyncIterableSource } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
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

suite('Tool stream throttling', () => {
	let clock: sinon.SinonFakeTimers;
	let updateCalls: { toolCallId: string; streamData: ChatToolInvocationStreamData }[];
	let stream: ChatResponseStreamImpl;

	beforeEach(() => {
		clock = sinon.useFakeTimers({ now: 1000, toFake: ['Date'] });
		updateCalls = [];
		stream = new ChatResponseStreamImpl(
			() => { },
			() => { },
			undefined,
			undefined,
			(toolCallId, streamData) => updateCalls.push({ toolCallId, streamData }),
		);
	});

	afterEach(() => {
		clock.restore();
		sinon.restore();
	});

	test('first update is emitted immediately', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const processor = new PseudoStopStartResponseProcessor([], undefined);

		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":1}' }] } });
		responseSource.resolve();

		await processor.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);

		assert.strictEqual(updateCalls.length, 1);
		assert.strictEqual(updateCalls[0].toolCallId, 'tool1');
	});

	test('rapid updates within throttle window are throttled', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const processor = new PseudoStopStartResponseProcessor([], undefined);

		// First update goes through immediately
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":1}' }] } });
		// These arrive within the 100ms throttle window — should be buffered
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":2}' }] } });
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":3}' }] } });
		responseSource.resolve();

		await processor.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);

		// 1 immediate + 1 flush of the last buffered update = 2 total
		assert.strictEqual(updateCalls.length, 2);
		assert.strictEqual(updateCalls[0].toolCallId, 'tool1');
		assert.deepStrictEqual(updateCalls[1].streamData.partialInput, { a: 3 });
	});

	test('update after throttle window elapses is emitted immediately', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const processor = new PseudoStopStartResponseProcessor([], undefined);

		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":1}' }] } });
		clock.tick(100);
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":2}' }] } });
		responseSource.resolve();

		await processor.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);

		// Both emitted immediately (no pending flush needed)
		assert.strictEqual(updateCalls.length, 2);
		assert.deepStrictEqual(updateCalls[0].streamData.partialInput, { a: 1 });
		assert.deepStrictEqual(updateCalls[1].streamData.partialInput, { a: 2 });
	});

	test('different tool IDs are throttled independently', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const processor = new PseudoStopStartResponseProcessor([], undefined);

		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":1}' }] } });
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool2', name: 'myTool', arguments: '{"b":1}' }] } });
		// These are within the throttle window for their respective tools
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":2}' }] } });
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool2', name: 'myTool', arguments: '{"b":2}' }] } });
		responseSource.resolve();

		await processor.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);

		// 2 immediate (one per tool) + 2 flushed (one per tool) = 4
		assert.strictEqual(updateCalls.length, 4);
	});

	test('pending updates are not flushed on cancellation', async () => {
		const cts = new CancellationTokenSource();
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const processor = new PseudoStopStartResponseProcessor([], undefined);

		// Start processing, then emit items so the for-await loop consumes them
		const promise = processor.doProcessResponse(responseSource.asyncIterable, stream, cts.token);

		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":1}' }] } });
		await new Promise(r => setTimeout(r, 0));
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":2}' }] } });
		await new Promise(r => setTimeout(r, 0));

		// Cancel after items are processed but before stream ends
		cts.cancel();
		responseSource.resolve();

		await promise;

		// Only the first immediate update — buffered update should NOT be flushed
		assert.strictEqual(updateCalls.length, 1);
		assert.strictEqual(updateCalls[0].toolCallId, 'tool1');
	});

	test('retry clears pending throttle state', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const clearCalls: number[] = [];
		const clearStream = new ChatResponseStreamImpl(
			() => { },
			() => clearCalls.push(1),
			undefined,
			undefined,
			(toolCallId, streamData) => updateCalls.push({ toolCallId, streamData }),
		);
		const processor = new PseudoStopStartResponseProcessor([], undefined);

		// Buffer a pending update
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":1}' }] } });
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":2}' }] } });
		// Retry clears everything
		responseSource.emitOne({ delta: { text: '', retryReason: 'network_error' } });
		// New update after retry should go through immediately
		clock.tick(100);
		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: 'myTool', arguments: '{"a":3}' }] } });
		responseSource.resolve();

		await processor.doProcessResponse(responseSource.asyncIterable, clearStream, CancellationToken.None);

		// 1 immediate before retry + 1 immediate after retry = 2
		// The buffered {"a":2} should have been cleared by retry, not flushed
		assert.strictEqual(updateCalls.length, 2);
		assert.deepStrictEqual(updateCalls[0].streamData.partialInput, { a: 1 });
		assert.deepStrictEqual(updateCalls[1].streamData.partialInput, { a: 3 });
	});

	test('updates without name are skipped', async () => {
		const responseSource = new AsyncIterableSource<IResponsePart>();
		const processor = new PseudoStopStartResponseProcessor([], undefined);

		responseSource.emitOne({ delta: { text: '', copilotToolCallStreamUpdates: [{ id: 'tool1', name: undefined as any, arguments: '{"a":1}' }] } });
		responseSource.resolve();

		await processor.doProcessResponse(responseSource.asyncIterable, stream, CancellationToken.None);

		assert.strictEqual(updateCalls.length, 0);
	});
});
