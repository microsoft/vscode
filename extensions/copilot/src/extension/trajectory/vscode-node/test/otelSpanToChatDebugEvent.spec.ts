/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { GenAiAttr, GenAiOperationName } from '../../../../platform/otel/common/genAiAttributes';
import type { ICompletedSpanData, SpanStatusCode } from '../../../../platform/otel/common/otelService';
import { completedSpanToDebugEvent } from '../otelSpanToChatDebugEvent';

function makeSpan(overrides: Partial<ICompletedSpanData> & { attributes?: Record<string, string | number | boolean | string[]> }): ICompletedSpanData {
	return {
		name: overrides.name ?? 'test-span',
		spanId: overrides.spanId ?? 'span-1',
		traceId: overrides.traceId ?? 'trace-1',
		parentSpanId: overrides.parentSpanId,
		startTime: overrides.startTime ?? 1000,
		endTime: overrides.endTime ?? 2000,
		status: overrides.status ?? { code: 1 as SpanStatusCode },
		attributes: overrides.attributes ?? {},
		events: overrides.events ?? [],
	};
}

describe('completedSpanToDebugEvent - invoke_agent identification', () => {
	it('returns undefined for top-level invoke_agent (no parentSpanId)', () => {
		const span = makeSpan({
			name: 'invoke_agent copilotcli',
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT },
		});
		expect(completedSpanToDebugEvent(span)).toBeUndefined();
	});

	it('skips SDK wrapper invoke_agent with no agent name', () => {
		const span = makeSpan({
			name: 'invoke_agent',
			parentSpanId: 'parent-1',
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT },
		});
		expect(completedSpanToDebugEvent(span)).toBeUndefined();
	});

	it('skips invoke_agent with whitespace-only name after prefix strip', () => {
		const span = makeSpan({
			name: 'invoke_agent  ',
			parentSpanId: 'parent-1',
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT },
		});
		expect(completedSpanToDebugEvent(span)).toBeUndefined();
	});

	it('attempts to create subagent event for invoke_agent with agent name attribute', () => {
		const span = makeSpan({
			name: 'invoke_agent task',
			parentSpanId: 'parent-1',
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
				[GenAiAttr.AGENT_NAME]: 'task',
			},
		});
		// In test env, vscode API constructors are not available, so this throws.
		// The test verifies it does NOT return undefined (i.e., it enters the subagent path).
		expect(() => completedSpanToDebugEvent(span)).toThrow();
	});

	it('attempts to create subagent event for invoke_agent with name in span name only', () => {
		const span = makeSpan({
			name: 'invoke_agent explore',
			parentSpanId: 'parent-1',
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT },
		});
		expect(() => completedSpanToDebugEvent(span)).toThrow();
	});

	it('returns undefined for unknown operation name', () => {
		const span = makeSpan({
			attributes: { [GenAiAttr.OPERATION_NAME]: 'custom_op' },
		});
		expect(completedSpanToDebugEvent(span)).toBeUndefined();
	});

	it('returns undefined for span with no operation name', () => {
		const span = makeSpan({ attributes: {} });
		expect(completedSpanToDebugEvent(span)).toBeUndefined();
	});
});
