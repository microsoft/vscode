/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test, vi } from 'vitest';
import { TelemetryData } from '../../../telemetry/common/telemetryData';
import { SpyingTelemetryService } from '../../../telemetry/node/spyingTelemetryService';
import { TelemetryMessage, withMessageContentMetadata } from '../../common/messageTelemetry';
import { sendEngineMessagesTelemetry } from '../../node/chatStream';

suite('Message content telemetry', () => {
	test('preserves native thinking and redacted blocks without exposing them as answers', () => {
		const message = {
			role: 'assistant',
			content: [
				{ type: 'thinking', thinking: 'Consider the options', signature: 'signed-state' },
				{ type: 'redacted_thinking', data: 'opaque-state' },
				{ type: 'text', text: 'The answer' },
			],
		};
		const original = structuredClone(message);
		expect(withMessageContentMetadata(message)).toEqual({
			...message,
			content_metadata: [
				{ path: '/content/0/thinking', purpose: 'reasoning', visibility: 'unknown', format: 'text' },
				{ path: '/content/0/signature', purpose: 'reasoning', visibility: 'opaque', format: 'opaque' },
				{ path: '/content/1/data', purpose: 'reasoning', visibility: 'opaque', format: 'opaque' },
				{ path: '/content/2/text', purpose: 'assistant_response', visibility: 'unknown', format: 'text' },
			],
		});
		expect(message).toEqual(original);
	});

	test('preserves and classifies separate reasoning fields', () => {
		const message = { role: 'assistant', content: 'Answer', reasoning_text: 'Reasoning', reasoning_opaque: 'opaque' };
		expect(withMessageContentMetadata(message)).toEqual({
			...message,
			content_metadata: [
				{ path: '/content', purpose: 'assistant_response', visibility: 'unknown', format: 'text' },
				{ path: '/reasoning_text', purpose: 'reasoning', visibility: 'unknown', format: 'text' },
				{ path: '/reasoning_opaque', purpose: 'reasoning', visibility: 'opaque', format: 'opaque' },
			],
		});

	});

	test('classifies native reasoning content separately from its summary', () => {
		const message: TelemetryMessage = {
			role: 'assistant', type: 'reasoning',
			content: [{ type: 'reasoning_text', text: 'Detailed reasoning' }],
			summary: [{ type: 'summary_text', text: 'Summary' }],
		};
		expect(withMessageContentMetadata(message)).toEqual({
			...message,
			content_metadata: [
				{ path: '/content/0/text', purpose: 'reasoning', visibility: 'unknown', format: 'text' },
				{ path: '/summary/0/text', purpose: 'reasoning_summary', visibility: 'unknown', format: 'text' },
			],
		});
	});

	test.each([
		{ message: { role: 'system', content: 'Context' }, purpose: 'context', visibility: 'model_only' },
		{ message: { role: 'assistant', content: 'Answer', phase: 'final_answer' }, purpose: 'answer', visibility: 'user_visible' },
		{ message: { role: 'assistant', content: 'Progress', phase: 'commentary' }, purpose: 'assistant_response', visibility: 'unknown' },
		{ message: { role: 'user', content: 'Question' }, purpose: 'prompt', visibility: 'unknown' },
		{ message: { role: 'tool', content: 'Result' }, purpose: 'tool_result', visibility: 'unknown' },
	])('classifies $purpose only from structural provenance', ({ message, purpose, visibility }) => {
		expect(withMessageContentMetadata(message)).toEqual({
			...message,
			content_metadata: [{ path: '/content', purpose, visibility, format: 'text' }],
		});
	});

	test.each(['{summary: Example summary text', '{"summary":"Missing closing brace"', 'Reasoning summary:', 'Text with "quotes"\n and \\slashes'])('preserves arbitrary text verbatim: %s', content => {
		const message = { role: 'assistant', content };
		expect(JSON.parse(JSON.stringify(withMessageContentMetadata(message)))).toEqual({
			...message,
			content_metadata: [{ path: '/content', purpose: 'assistant_response', visibility: 'unknown', format: 'text' }],
		});
	});

	test('classifies native compaction as an opaque conversation summary', () => {
		const message = { role: 'assistant', type: 'compaction', content: '', encrypted_content: 'compact-state' };
		expect(withMessageContentMetadata(message)).toEqual({
			...message,
			content_metadata: [
				{ path: '/content', purpose: 'conversation_summary', visibility: 'unknown', format: 'text' },
				{ path: '/encrypted_content', purpose: 'conversation_summary', visibility: 'opaque', format: 'opaque' },
			],
		});
	});

	test.each([null, undefined])('classifies tool calls with %s content', content => {
		const message = { role: 'assistant', content, tool_calls: [{ id: 'call', function: { name: 'read_file', arguments: '{}' } }] };
		expect(withMessageContentMetadata(message)).toEqual({
			...message,
			content_metadata: [{ path: '/tool_calls', purpose: 'tool_call', visibility: 'model_only', format: 'json' }],
		});
	});

	test('emits distinct reasoning-only messages and removes their content from length telemetry', async () => {
		const service = new SpyingTelemetryService();
		const enhanced = vi.spyOn(service, 'sendEnhancedGHTelemetryEvent');
		const internal = vi.spyOn(service, 'sendInternalMSFTTelemetryEvent');
		const messages: TelemetryMessage[] = [
			{ role: 'assistant', type: 'reasoning', content: [{ type: 'reasoning_text', text: 'First reasoning' }], summary: [{ type: 'summary_text', text: 'First summary' }], encrypted_content: 'first' },
			{ role: 'assistant', type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Second reasoning' }], summary: [{ type: 'summary_text', text: 'Second summary' }], encrypted_content: 'second' },
		];
		sendEngineMessagesTelemetry(service, messages, TelemetryData.createAndMarkAsIssued({
			conversationId: 'reasoning-test',
			headerRequestId: 'reasoning-request',
			modelCallId: 'reasoning-call',
		}), true);

		await vi.waitFor(() => expect(service.getEvents().telemetryServiceEvents.filter(event => event.eventName === 'engine.messages')).toHaveLength(1));
		const engine = enhanced.mock.calls.find(([name]) => name === 'engine.messages')!;
		const individual = internal.mock.calls.filter(([name]) => name === 'model.message.added');
		const lengths = enhanced.mock.calls.find(([name]) => name === 'engine.messages.length')!;
		expect({
			engine: JSON.parse(String(engine[1]?.messagesJson)),
			individual: individual.map(([, properties]) => JSON.parse(String(properties?.messageJson))),
			uniqueMessages: new Set(individual.map(([, properties]) => properties?.messageUuid)).size,
			lengths: JSON.parse(String(lengths[1]?.messagesJson)),
		}).toEqual({
			engine: messages.map(withMessageContentMetadata),
			individual: messages.map(withMessageContentMetadata),
			uniqueMessages: 2,
			lengths: messages.map((message, index) => ({
				...message,
				content: ['First reasoning'.length, 'Second reasoning'.length][index],
				encrypted_content: message.encrypted_content!.length,
				summary: message.summary!.map(part => ({ ...part, text: part.text.length })),
			})),
		});
	});
});
