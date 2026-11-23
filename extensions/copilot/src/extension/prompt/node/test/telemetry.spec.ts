/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { afterEach, expect, suite, test, vi } from 'vitest';
import type { ChatRequestModeInstructions } from 'vscode';
import { gunzipSync, gzipSync } from 'zlib';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import * as telemetry from '../../../../platform/telemetry/common/telemetry';
import { SpyingTelemetryService } from '../../../../platform/telemetry/node/spyingTelemetryService';
import { createTelemetryWithId, formatModelMessageTextForTelemetry, getModeNameForTelemetry, sendConversationalMessageTelemetry } from '../telemetry';

suite('getModeNameForTelemetry', () => {
	function modeInstructions(props: Partial<ChatRequestModeInstructions>): ChatRequestModeInstructions {
		return { name: 'Mode', content: '', ...props } as ChatRequestModeInstructions;
	}

	test('returns undefined when no mode instructions are present', () => {
		assert.strictEqual(getModeNameForTelemetry(undefined), undefined);
	});

	test('returns lowercased name for built-in modes', () => {
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Agent', isBuiltin: true })), 'agent');
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Ask', isBuiltin: true })), 'ask');
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Edit', isBuiltin: true })), 'edit');
	});

	test('reports the Plan custom-provider agent under its own name', () => {
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'Plan', isBuiltin: false })), 'plan');
	});

	test('reports other custom agents as custom', () => {
		assert.strictEqual(getModeNameForTelemetry(modeInstructions({ name: 'my-agent', isBuiltin: false })), 'custom');
	});
});

suite('sendConversationalMessageTelemetry', () => {
	const multiplexProperties = telemetry.multiplexProperties;
	const largeMessage = Array.from({ length: 1000 }, (_, index) => createHash('sha256').update(String(index)).digest('hex')).join('\n');
	const gzipBase64 = async (value: string) => gzipSync(Buffer.from(value, 'utf8')).toString('base64');

	afterEach(() => {
		vi.restoreAllMocks();
	});

	for (const [location, prefix] of [
		[ChatLocation.Panel, 'conversation'],
		[ChatLocation.Editor, 'inlineConversation'],
	] as const) {
		suite(prefix, () => {
			test.each([
				{ name: 'absent text', text: undefined },
				{ name: 'empty text', text: '' },
				{ name: 'short text', text: 'hello' },
				{ name: 'at the property limit', text: 'x'.repeat(8192) },
				{ name: 'above the property limit', text: 'x'.repeat(8193) },
				{ name: 'Unicode across the property limit', text: 'x'.repeat(8191) + '\u{1F600}\u4F60\u597D' },
				{ name: 'multiple compressed chunks', text: largeMessage },
			])('preserves $name on both restricted destinations', async ({ text }) => {
				vi.spyOn(telemetry, 'multiplexProperties').mockImplementation(properties => multiplexProperties(properties, gzipBase64));
				const service = new SpyingTelemetryService();
				const standard = vi.spyOn(service, 'sendGHTelemetryEvent');
				const enhanced = vi.spyOn(service, 'sendEnhancedGHTelemetryEvent');
				const internal = vi.spyOn(service, 'sendInternalMSFTTelemetryEvent');
				const base = createTelemetryWithId().extendedBy({ conversationId: 'conversation', source: 'user' }, { promptTokenLen: 10 });
				const properties = { headerRequestId: 'request', turnIndex: '1' };
				const measurements = { messageCharLen: text?.length ?? 0 };

				const result = sendConversationalMessageTelemetry(service, undefined, location, text, properties, measurements, base);

				assert.deepStrictEqual({
					returnedProperties: result.properties,
					returnedMeasurements: result.measurements,
					standardCalls: standard.mock.calls,
				}, {
					returnedProperties: { ...base.raw.properties, ...properties },
					returnedMeasurements: { ...base.raw.measurements, ...measurements },
					standardCalls: [[`${prefix}.message`, { ...base.raw.properties, ...properties }, { ...base.raw.measurements, ...measurements }]],
				});

				await vi.waitFor(() => expect(internal).toHaveBeenCalledTimes(1));

				const expectedProperties: telemetry.TelemetryProperties = { ...base.raw.properties, ...properties };
				if (text) {
					expectedProperties.messageText = text.slice(0, 8192);
					const compressed = await gzipBase64(text);
					for (let offset = 0, index = 1; offset < compressed.length; offset += 8192, index++) {
						expectedProperties[index === 1 ? 'messageTextChunk' : `messageTextChunk_${index}`] = compressed.slice(offset, offset + 8192);
					}
				}
				const expectedCalls = [[`${prefix}.messageText`, expectedProperties, base.raw.measurements]];
				assert.deepStrictEqual({ enhanced: enhanced.mock.calls, internal: internal.mock.calls }, {
					enhanced: expectedCalls,
					internal: expectedCalls,
				});

				const emittedProperties = enhanced.mock.calls[0][1]!;
				const chunks: string[] = [];
				for (let index = 1; ; index++) {
					const chunk = emittedProperties[index === 1 ? 'messageTextChunk' : `messageTextChunk_${index}`];
					if (chunk === undefined) {
						break;
					}
					assert.strictEqual(typeof chunk, 'string');
					chunks.push(String(chunk));
				}
				const reconstructed = chunks.length
					? gunzipSync(Buffer.from(chunks.join(''), 'base64')).toString('utf8')
					: emittedProperties.messageText;
				assert.deepStrictEqual({
					reconstructed,
					boundedChunks: chunks.every(chunk => chunk.length <= 8192),
					multipleChunks: chunks.length > 1,
				}, {
					reconstructed: text || undefined,
					boundedChunks: true,
					multipleChunks: text === largeMessage,
				});
			});
		});
	}

	test('reports compression failures without sending incomplete restricted events', async () => {
		const error = new Error('compression failed');
		vi.spyOn(telemetry, 'multiplexProperties').mockRejectedValue(error);
		const service = new SpyingTelemetryService();
		const exception = vi.spyOn(service, 'sendGHTelemetryException');
		const enhanced = vi.spyOn(service, 'sendEnhancedGHTelemetryEvent');
		const internal = vi.spyOn(service, 'sendInternalMSFTTelemetryEvent');

		sendConversationalMessageTelemetry(service, undefined, ChatLocation.Panel, largeMessage, {}, {}, createTelemetryWithId());

		await vi.waitFor(() => expect(exception).toHaveBeenCalledTimes(1));
		assert.deepStrictEqual({ exceptions: exception.mock.calls, enhanced: enhanced.mock.calls, internal: internal.mock.calls }, {
			exceptions: [[error, 'sendConversationalMessageTelemetry']],
			enhanced: [],
			internal: [],
		});
	});

	test('formats model conversation.messageText as structured JSON and separates inline reasoning tags', async () => {
		vi.spyOn(telemetry, 'multiplexProperties').mockImplementation(properties => multiplexProperties(properties, gzipBase64));
		const service = new SpyingTelemetryService();
		const enhanced = vi.spyOn(service, 'sendEnhancedGHTelemetryEvent');
		const raw = '<think>The user wants to rename the function.</think>I renamed `getUser` to `fetchUser`.';

		sendConversationalMessageTelemetry(
			service,
			undefined,
			ChatLocation.Panel,
			raw,
			{ source: 'model', headerRequestId: 'request', turnIndex: '1' },
			{ messageCharLen: raw.length },
			createTelemetryWithId()
		);

		await vi.waitFor(() => expect(enhanced).toHaveBeenCalledTimes(1));
		const emitted = enhanced.mock.calls[0][1]!;
		assert.strictEqual(typeof emitted.messageText, 'string');
		assert.deepStrictEqual(JSON.parse(String(emitted.messageText)), {
			role: 'assistant',
			content: 'I renamed `getUser` to `fetchUser`.',
			reasoning_text: 'The user wants to rename the function.',
		});
	});

	test('skips restricted conversation.messageText preparation when restricted telemetry is inactive', async () => {
		const multiplexSpy = vi.spyOn(telemetry, 'multiplexProperties');
		const service = new SpyingTelemetryService();
		Object.defineProperty(service, 'isRestrictedTelemetryActive', { value: false });
		const standard = vi.spyOn(service, 'sendGHTelemetryEvent');
		const enhanced = vi.spyOn(service, 'sendEnhancedGHTelemetryEvent');
		const internal = vi.spyOn(service, 'sendInternalMSFTTelemetryEvent');

		sendConversationalMessageTelemetry(
			service,
			undefined,
			ChatLocation.Panel,
			'<think>reasoning</think>answer',
			{ source: 'model', headerRequestId: 'request', turnIndex: '1' },
			{ messageCharLen: 30 },
			createTelemetryWithId()
		);

		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual({
			standardCount: standard.mock.calls.length,
			multiplexCount: multiplexSpy.mock.calls.length,
			enhancedCount: enhanced.mock.calls.length,
			internalCount: internal.mock.calls.length,
		}, {
			standardCount: 1,
			multiplexCount: 0,
			enhancedCount: 0,
			internalCount: 0,
		});
	});
});

suite('formatModelMessageTextForTelemetry', () => {
	test('handles plain text, closed tags, unclosed tags, multiple blocks, and fenced code blocks', () => {
		assert.deepStrictEqual({
			plain: JSON.parse(formatModelMessageTextForTelemetry('Just an answer.')),
			closedThink: JSON.parse(formatModelMessageTextForTelemetry('<think>Find all call sites.</think>I renamed `getUser` to `fetchUser`.')),
			unclosedThinking: JSON.parse(formatModelMessageTextForTelemetry('<thinking>Let me check the config file to find the port setting.')),
			unclosedThink: JSON.parse(formatModelMessageTextForTelemetry('<think>Checking tests next')),
			closedAnalysis: JSON.parse(formatModelMessageTextForTelemetry('<analysis>Compare the two branches.</analysis>Use branch A.')),
			unclosedAnalysis: JSON.parse(formatModelMessageTextForTelemetry('<analysis>Inspecting symbol references before editing')),
			multipleBlocks: JSON.parse(formatModelMessageTextForTelemetry('<think>First thought</think>Part 1 <thinking>Second thought</thinking>Part 2 <analysis>Third thought</analysis>Part 3')),
			fencedCodeIgnored: JSON.parse(formatModelMessageTextForTelemetry('Example:\n```xml\n<think>not reasoning</think>\n<analysis>also not reasoning</analysis>\n```\nDone.')),
			indentedFenceAfterReasoning: JSON.parse(formatModelMessageTextForTelemetry('<think>Plan</think>\n  ```xml\n  <think>literal code</think>\n  ```')),
			wireReasoning: JSON.parse(formatModelMessageTextForTelemetry('Answer', 'Wire thought')),
			wireAndInline: JSON.parse(formatModelMessageTextForTelemetry('<think>Inline thought</think>Answer', 'Wire thought')),
		}, {
			plain: { role: 'assistant', content: 'Just an answer.' },
			closedThink: { role: 'assistant', content: 'I renamed `getUser` to `fetchUser`.', reasoning_text: 'Find all call sites.' },
			unclosedThinking: { role: 'assistant', content: '', reasoning_text: 'Let me check the config file to find the port setting.' },
			unclosedThink: { role: 'assistant', content: '', reasoning_text: 'Checking tests next' },
			closedAnalysis: { role: 'assistant', content: 'Use branch A.', reasoning_text: 'Compare the two branches.' },
			unclosedAnalysis: { role: 'assistant', content: '', reasoning_text: 'Inspecting symbol references before editing' },
			multipleBlocks: { role: 'assistant', content: 'Part 1 Part 2 Part 3', reasoning_text: 'First thought\n\nSecond thought\n\nThird thought' },
			fencedCodeIgnored: { role: 'assistant', content: 'Example:\n```xml\n<think>not reasoning</think>\n<analysis>also not reasoning</analysis>\n```\nDone.' },
			indentedFenceAfterReasoning: { role: 'assistant', content: '  ```xml\n  <think>literal code</think>\n  ```', reasoning_text: 'Plan' },
			wireReasoning: { role: 'assistant', content: 'Answer', reasoning_text: 'Wire thought' },
			wireAndInline: { role: 'assistant', content: 'Answer', reasoning_text: 'Wire thought\n\nInline thought' },
		});
	});
});
