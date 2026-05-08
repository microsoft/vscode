/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, GenAiProviderName } from '../genAiAttributes';
import { SpanKind, SpanStatusCode } from '../otelService';
import { CapturingOTelService } from './capturingOTelService';

/**
 * Tests the two-phase span lifecycle used in chatMLFetcher:
 * 1. _doFetch creates a span, returns it alongside the result
 * 2. fetchMany enriches it with token usage and response data, then ends it
 *
 * This pattern is unique because the span is created in one method
 * and ended in another — testing lifecycle correctness.
 */
describe('chatMLFetcher Span Lifecycle', () => {
	it('span is created with model and conversation ID in _doFetch phase', () => {
		const otel = new CapturingOTelService();

		// Phase 1: _doFetch creates the span
		const span = otel.startSpan('chat gpt-4o', {
			kind: SpanKind.CLIENT,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT,
				[GenAiAttr.PROVIDER_NAME]: GenAiProviderName.GITHUB,
				[GenAiAttr.REQUEST_MODEL]: 'gpt-4o',
				[GenAiAttr.CONVERSATION_ID]: 'req-abc',
				[GenAiAttr.REQUEST_MAX_TOKENS]: 2048,
				[CopilotChatAttr.MAX_PROMPT_TOKENS]: 128000,
			},
		});

		const s = otel.spans[0];
		expect(s.name).toBe('chat gpt-4o');
		expect(s.kind).toBe(SpanKind.CLIENT);
		expect(s.attributes[GenAiAttr.REQUEST_MODEL]).toBe('gpt-4o');
		expect(s.attributes[GenAiAttr.CONVERSATION_ID]).toBe('req-abc');
		expect(s.ended).toBe(false);

		// Phase 2: fetchMany enriches with response data
		span.setAttributes({
			[GenAiAttr.USAGE_INPUT_TOKENS]: 1500,
			[GenAiAttr.USAGE_OUTPUT_TOKENS]: 250,
			[GenAiAttr.RESPONSE_MODEL]: 'gpt-4o-2024-08-06',
			[GenAiAttr.RESPONSE_ID]: 'chatcmpl-xyz',
			[GenAiAttr.RESPONSE_FINISH_REASONS]: ['stop'],
			[CopilotChatAttr.TIME_TO_FIRST_TOKEN]: 450,
		});
		span.setStatus(SpanStatusCode.OK);
		span.end();

		expect(s.attributes[GenAiAttr.USAGE_INPUT_TOKENS]).toBe(1500);
		expect(s.attributes[GenAiAttr.RESPONSE_MODEL]).toBe('gpt-4o-2024-08-06');
		expect(s.statusCode).toBe(SpanStatusCode.OK);
		expect(s.ended).toBe(true);
	});

	it('span is ended on error path (not leaked)', () => {
		const otel = new CapturingOTelService();

		// Phase 1: span created
		const span = otel.startSpan('chat gpt-4o', {
			kind: SpanKind.CLIENT,
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT },
		});

		// Phase 2: error occurs — fetchMany Error path
		span.setStatus(SpanStatusCode.ERROR, 'Connection reset');
		span.setAttribute('error.type', 'FetchError');
		span.recordException(new Error('Connection reset'));
		span.end();

		const s = otel.spans[0];
		expect(s.statusCode).toBe(SpanStatusCode.ERROR);
		expect(s.ended).toBe(true);
		expect(s.exceptions).toHaveLength(1);
	});

	it('operation duration metric is recorded in _doFetch finally block', () => {
		const otel = new CapturingOTelService();

		// Simulate the finally block in _doFetch
		const durationSec = 3.5;
		otel.recordMetric('gen_ai.client.operation.duration', durationSec, {
			[GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT,
			[GenAiAttr.PROVIDER_NAME]: GenAiProviderName.GITHUB,
			[GenAiAttr.REQUEST_MODEL]: 'gpt-4o',
		});

		expect(otel.metrics).toHaveLength(1);
		expect(otel.metrics[0].name).toBe('gen_ai.client.operation.duration');
		expect(otel.metrics[0].value).toBe(3.5);
	});

	it('debug name attribute is set after span is returned to fetchMany', () => {
		const otel = new CapturingOTelService();

		const span = otel.startSpan('chat gpt-4o', {
			kind: SpanKind.CLIENT,
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.CHAT },
		});

		// fetchMany adds debug name after receiving the span from _doFetch
		span.setAttribute(GenAiAttr.AGENT_NAME, 'agentMode');
		span.end();

		expect(otel.spans[0].attributes[GenAiAttr.AGENT_NAME]).toBe('agentMode');
	});
});
