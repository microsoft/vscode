/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { Event } from '../../../../util/vs/base/common/event';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, StdAttr } from '../genAiAttributes';
import { emitAgentTurnEvent, emitEditFeedbackEvent, emitEditSurvivalEvent, emitInferenceDetailsEvent, emitSessionStartEvent, emitToolCallEvent } from '../genAiEvents';
import { resolveOTelConfig } from '../otelConfig';
import type { IOTelService } from '../otelService';

function createMockOTel(captureContent = false): IOTelService & { emitLogRecord: ReturnType<typeof vi.fn> } {
	const config = resolveOTelConfig({
		env: captureContent ? { 'COPILOT_OTEL_ENABLED': 'true', 'COPILOT_OTEL_CAPTURE_CONTENT': 'true' } : { 'COPILOT_OTEL_ENABLED': 'true' },
		extensionVersion: '1.0.0',
		sessionId: 'test',
	});
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

describe('emitInferenceDetailsEvent', () => {
	it('emits event with standard attributes', () => {
		const otel = createMockOTel();
		emitInferenceDetailsEvent(otel,
			{ model: 'gpt-4o', temperature: 0.7, maxTokens: 4096 },
			{ id: 'resp-1', model: 'gpt-4o', finishReasons: ['stop'], inputTokens: 100, outputTokens: 50 },
		);

		expect(otel.emitLogRecord).toHaveBeenCalledOnce();
		const [body, attrs] = otel.emitLogRecord.mock.calls[0];
		expect(body).toContain('gpt-4o');
		expect(attrs['event.name']).toBe('gen_ai.client.inference.operation.details');
		expect(attrs[GenAiAttr.OPERATION_NAME]).toBe(GenAiOperationName.CHAT);
		expect(attrs[GenAiAttr.REQUEST_MODEL]).toBe('gpt-4o');
		expect(attrs[GenAiAttr.RESPONSE_MODEL]).toBe('gpt-4o');
		expect(attrs[GenAiAttr.RESPONSE_ID]).toBe('resp-1');
		expect(attrs[GenAiAttr.USAGE_INPUT_TOKENS]).toBe(100);
		expect(attrs[GenAiAttr.USAGE_OUTPUT_TOKENS]).toBe(50);
		expect(attrs[GenAiAttr.REQUEST_TEMPERATURE]).toBe(0.7);
		expect(attrs[GenAiAttr.REQUEST_MAX_TOKENS]).toBe(4096);
	});

	it('does not include content attributes when captureContent is false', () => {
		const otel = createMockOTel(false);
		emitInferenceDetailsEvent(otel,
			{ model: 'gpt-4o', messages: [{ role: 'user', text: 'secret' }] },
			{ id: 'resp-1' },
		);

		const attrs = otel.emitLogRecord.mock.calls[0][1];
		expect(attrs).not.toHaveProperty(GenAiAttr.INPUT_MESSAGES);
		expect(attrs).not.toHaveProperty(GenAiAttr.SYSTEM_INSTRUCTIONS);
		expect(attrs).not.toHaveProperty(GenAiAttr.TOOL_DEFINITIONS);
	});

	it('includes content attributes when captureContent is true', () => {
		const otel = createMockOTel(true);
		const messages = [{ role: 'user', content: 'hello' }];
		const systemMsg = 'You are helpful';
		const tools = [{ name: 'readFile' }];

		emitInferenceDetailsEvent(otel,
			{ model: 'gpt-4o', messages, systemMessage: systemMsg, tools },
			undefined,
		);

		const attrs = otel.emitLogRecord.mock.calls[0][1];
		// Messages should be normalized to OTel GenAI format
		expect(attrs[GenAiAttr.INPUT_MESSAGES]).toBe(JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: 'hello' }] }]));
		// System instructions should be wrapped in OTel format
		expect(attrs[GenAiAttr.SYSTEM_INSTRUCTIONS]).toBe(JSON.stringify([{ type: 'text', content: 'You are helpful' }]));
		expect(attrs[GenAiAttr.TOOL_DEFINITIONS]).toBe(JSON.stringify(tools));
	});

	it('includes error.type when error is provided', () => {
		const otel = createMockOTel();
		emitInferenceDetailsEvent(otel,
			{ model: 'gpt-4o' },
			undefined,
			{ type: 'TimeoutError', message: 'request timed out' },
		);

		const attrs = otel.emitLogRecord.mock.calls[0][1];
		expect(attrs[StdAttr.ERROR_TYPE]).toBe('TimeoutError');
	});

	it('handles undefined response', () => {
		const otel = createMockOTel();
		emitInferenceDetailsEvent(otel, { model: 'gpt-4o' }, undefined);

		const attrs = otel.emitLogRecord.mock.calls[0][1];
		expect(attrs).not.toHaveProperty(GenAiAttr.RESPONSE_MODEL);
		expect(attrs).not.toHaveProperty(GenAiAttr.RESPONSE_ID);
	});
});

describe('emitSessionStartEvent', () => {
	it('emits session start with required attributes', () => {
		const otel = createMockOTel();
		emitSessionStartEvent(otel, 'sess-123', 'gpt-4o', 'copilot');

		expect(otel.emitLogRecord).toHaveBeenCalledWith('copilot_chat.session.start', {
			'event.name': 'copilot_chat.session.start',
			'session.id': 'sess-123',
			[GenAiAttr.REQUEST_MODEL]: 'gpt-4o',
			[GenAiAttr.AGENT_NAME]: 'copilot',
		});
	});
});

describe('emitToolCallEvent', () => {
	it('emits success tool call event', () => {
		const otel = createMockOTel();
		emitToolCallEvent(otel, 'readFile', 150, true);

		const [body, attrs] = otel.emitLogRecord.mock.calls[0];
		expect(body).toContain('readFile');
		expect(attrs['event.name']).toBe('copilot_chat.tool.call');
		expect(attrs[GenAiAttr.TOOL_NAME]).toBe('readFile');
		expect(attrs['duration_ms']).toBe(150);
		expect(attrs['success']).toBe(true);
		expect(attrs).not.toHaveProperty(StdAttr.ERROR_TYPE);
	});

	it('includes error type on failure', () => {
		const otel = createMockOTel();
		emitToolCallEvent(otel, 'runCommand', 5000, false, 'TimeoutError');

		const attrs = otel.emitLogRecord.mock.calls[0][1];
		expect(attrs['success']).toBe(false);
		expect(attrs[StdAttr.ERROR_TYPE]).toBe('TimeoutError');
	});
});

describe('emitAgentTurnEvent', () => {
	it('emits turn event with all attributes', () => {
		const otel = createMockOTel();
		emitAgentTurnEvent(otel, 3, 500, 200, 2);

		const [body, attrs] = otel.emitLogRecord.mock.calls[0];
		expect(body).toContain('3');
		expect(attrs['event.name']).toBe('copilot_chat.agent.turn');
		expect(attrs['turn.index']).toBe(3);
		expect(attrs[GenAiAttr.USAGE_INPUT_TOKENS]).toBe(500);
		expect(attrs[GenAiAttr.USAGE_OUTPUT_TOKENS]).toBe(200);
		expect(attrs['tool_call_count']).toBe(2);
	});
});

describe('emitEditFeedbackEvent', () => {
	it('includes workspace metadata when provided', () => {
		const otel = createMockOTel();
		emitEditFeedbackEvent(otel, 'accepted', 'typescript', 'copilot', 'req-1', 'agent', false, false, {
			headBranchName: 'main',
			headCommitHash: 'abc123',
			remoteUrl: 'github.com/org/repo',
			fileRelativePath: 'src/app.ts',
		});

		const attrs = otel.emitLogRecord.mock.calls[0][1];
		expect(attrs[CopilotChatAttr.REPO_HEAD_BRANCH_NAME]).toBe('main');
		expect(attrs[CopilotChatAttr.REPO_HEAD_COMMIT_HASH]).toBe('abc123');
		expect(attrs[CopilotChatAttr.REPO_REMOTE_URL]).toBe('github.com/org/repo');
		expect(attrs[CopilotChatAttr.FILE_RELATIVE_PATH]).toBe('src/app.ts');
	});
});

describe('emitEditSurvivalEvent', () => {
	it('includes workspace metadata alongside survival data', () => {
		const otel = createMockOTel();
		emitEditSurvivalEvent(otel, 'apply_patch', 0.95, 0.88, 30000, false, 'req-1', {
			headBranchName: 'feature/x',
			headCommitHash: 'deadbeef',
		});

		const attrs = otel.emitLogRecord.mock.calls[0][1];
		expect(attrs['event.name']).toBe('copilot_chat.edit.survival');
		expect(attrs['survival_rate_four_gram']).toBe(0.95);
		expect(attrs[CopilotChatAttr.REPO_HEAD_BRANCH_NAME]).toBe('feature/x');
		expect(attrs[CopilotChatAttr.REPO_HEAD_COMMIT_HASH]).toBe('deadbeef');
	});
});
