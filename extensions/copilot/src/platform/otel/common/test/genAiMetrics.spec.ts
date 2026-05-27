/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { GenAiAttr, GenAiOperationName, GenAiProviderName, GenAiTokenType, StdAttr } from '../genAiAttributes';
import { GenAiMetrics } from '../genAiMetrics';
import { resolveOTelConfig } from '../otelConfig';
import type { IOTelService } from '../otelService';

function createMockOTelService(): IOTelService & { recordMetric: ReturnType<typeof vi.fn>; incrementCounter: ReturnType<typeof vi.fn> } {
	const config = resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' });
	return {
		_serviceBrand: undefined!,
		config,
		startSpan: vi.fn(),
		startActiveSpan: vi.fn(),
		getActiveTraceContext: vi.fn(),
		storeTraceContext: vi.fn(),
		getStoredTraceContext: vi.fn(),
		runWithTraceContext: vi.fn((_ctx: any, fn: any) => fn()),
		recordMetric: vi.fn(),
		incrementCounter: vi.fn(),
		emitLogRecord: vi.fn(),
		flush: vi.fn(),
		shutdown: vi.fn(),
		injectCompletedSpan: vi.fn(),
		onDidCompleteSpan: Event.None,
		onDidEmitSpanEvent: Event.None,
	};
}

describe('GenAiMetrics', () => {
	it('recordOperationDuration calls recordMetric with correct attributes', () => {
		const otel = createMockOTelService();

		GenAiMetrics.recordOperationDuration(otel, 1.5, {
			operationName: GenAiOperationName.CHAT,
			providerName: GenAiProviderName.OPENAI,
			requestModel: 'gpt-4o',
			responseModel: 'gpt-4o-2024-05-13',
			serverAddress: 'api.copilot.com',
			errorType: 'timeout',
		});

		expect(otel.recordMetric).toHaveBeenCalledWith('gen_ai.client.operation.duration', 1.5, {
			[GenAiAttr.OPERATION_NAME]: 'chat',
			[GenAiAttr.PROVIDER_NAME]: 'openai',
			[GenAiAttr.REQUEST_MODEL]: 'gpt-4o',
			[GenAiAttr.RESPONSE_MODEL]: 'gpt-4o-2024-05-13',
			[StdAttr.SERVER_ADDRESS]: 'api.copilot.com',
			[StdAttr.ERROR_TYPE]: 'timeout',
		});
	});

	it('recordTokenUsage calls recordMetric with token type', () => {
		const otel = createMockOTelService();

		GenAiMetrics.recordTokenUsage(otel, 1000, 'input', {
			operationName: GenAiOperationName.CHAT,
			providerName: GenAiProviderName.OPENAI,
			requestModel: 'gpt-4o',
		});

		expect(otel.recordMetric).toHaveBeenCalledWith('gen_ai.client.token.usage', 1000, {
			[GenAiAttr.OPERATION_NAME]: 'chat',
			[GenAiAttr.PROVIDER_NAME]: 'openai',
			[GenAiAttr.TOKEN_TYPE]: GenAiTokenType.INPUT,
			[GenAiAttr.REQUEST_MODEL]: 'gpt-4o',
		});
	});

	it('recordToolCallCount increments counter', () => {
		const otel = createMockOTelService();

		GenAiMetrics.recordToolCallCount(otel, 'readFile', true);

		expect(otel.incrementCounter).toHaveBeenCalledWith('copilot_chat.tool.call.count', 1, {
			[GenAiAttr.TOOL_NAME]: 'readFile',
			success: true,
		});
	});

	it('recordToolCallDuration records histogram', () => {
		const otel = createMockOTelService();

		GenAiMetrics.recordToolCallDuration(otel, 'runCommand', 500);

		expect(otel.recordMetric).toHaveBeenCalledWith('copilot_chat.tool.call.duration', 500, {
			[GenAiAttr.TOOL_NAME]: 'runCommand',
		});
	});

	it('recordAgentDuration records histogram', () => {
		const otel = createMockOTelService();

		GenAiMetrics.recordAgentDuration(otel, 'copilot', 15.2);

		expect(otel.recordMetric).toHaveBeenCalledWith('copilot_chat.agent.invocation.duration', 15.2, {
			[GenAiAttr.AGENT_NAME]: 'copilot',
		});
	});

	it('incrementSessionCount increments counter', () => {
		const otel = createMockOTelService();

		GenAiMetrics.incrementSessionCount(otel);

		expect(otel.incrementCounter).toHaveBeenCalledWith('copilot_chat.session.count');
	});

	it('omits optional attributes when not provided', () => {
		const otel = createMockOTelService();

		GenAiMetrics.recordOperationDuration(otel, 0.5, {
			operationName: GenAiOperationName.CHAT,
			providerName: GenAiProviderName.OPENAI,
			requestModel: 'gpt-4o',
		});

		const attrs = otel.recordMetric.mock.calls[0][2];
		expect(attrs).not.toHaveProperty(GenAiAttr.RESPONSE_MODEL);
		expect(attrs).not.toHaveProperty(StdAttr.SERVER_ADDRESS);
		expect(attrs).not.toHaveProperty(StdAttr.ERROR_TYPE);
	});
});
