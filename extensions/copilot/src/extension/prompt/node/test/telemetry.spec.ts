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
import { createTelemetryWithId, getModeNameForTelemetry, sendConversationalMessageTelemetry } from '../telemetry';

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
});
