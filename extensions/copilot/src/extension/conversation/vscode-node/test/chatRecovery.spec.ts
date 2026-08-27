/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { ChatRequest, ChatRequestTurn2, LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { URI } from '../../../../util/vs/base/common/uri';
import { IResultMetadata } from '../../../prompt/common/conversation';
import { ToolName } from '../../../tools/common/toolNames';
import { arePromptsSimilar, didLastTestRunFail, isChatRecoveryAttempt, wasLastPlanReviewRejected } from '../chatRecovery';

const changedTestFile = URI.file('/workspace/new.test.ts');

function metadataWithTestRuns(...runs: { failedCount: number; file?: string }[]): Partial<IResultMetadata> {
	const toolCallResults: NonNullable<IResultMetadata['toolCallResults']> = {};
	const toolCallRounds = runs.map(({ failedCount, file = changedTestFile.fsPath }, index) => {
		const callId = `test-call-${index}`;
		toolCallResults[callId] = new LanguageModelToolResult([
			new LanguageModelTextPart(`<summary passed=1 failed=${failedCount} />`)
		]);
		return {
			id: `round-${index}`,
			response: '',
			toolInputRetry: 0,
			toolCalls: [{ id: callId, name: ToolName.CoreRunTest, arguments: JSON.stringify({ files: [file] }) }]
		};
	});

	return { toolCallRounds, toolCallResults };
}

function metadataWithPlanReviews(...results: string[]): Partial<IResultMetadata> {
	const toolCallResults: NonNullable<IResultMetadata['toolCallResults']> = {};
	const toolCallRounds = results.map((result, index) => {
		const callId = `plan-review-${index}`;
		toolCallResults[callId] = new LanguageModelToolResult([new LanguageModelTextPart(result)]);
		return {
			id: `round-${index}`,
			response: '',
			toolInputRetry: 0,
			toolCalls: [{ id: callId, name: ToolName.CoreReviewPlan, arguments: '{}' }]
		};
	});

	return { toolCallRounds, toolCallResults };
}

function chatRequest(overrides: Partial<ChatRequest>): ChatRequest {
	return {
		prompt: 'new request',
		attempt: 0,
		model: { id: 'model' },
		...overrides,
	} as ChatRequest;
}

suite('Chat recovery', () => {
	test('compares normalized prompts', () => {
		expect(arePromptsSimilar(' Fix  the\nerror ', 'fix the error')).toBe(true);
		expect(arePromptsSimilar('Fix the parser error', 'Explain the parser architecture')).toBe(false);
	});

	test('does not treat empty attachment-only prompts as repeats', () => {
		expect(arePromptsSimilar('', '')).toBe(false);
		expect(arePromptsSimilar('  \n', 'Fix the error')).toBe(false);
	});

	test('detects a failed last test run', () => {
		expect(didLastTestRunFail(metadataWithTestRuns({ failedCount: 0 }, { failedCount: 2 }), [changedTestFile])).toBe(true);
	});

	test('ignores an earlier failure after tests pass', () => {
		expect(didLastTestRunFail(metadataWithTestRuns({ failedCount: 2 }, { failedCount: 0 }), [changedTestFile])).toBe(false);
	});

	test('ignores test runs for unchanged files', () => {
		expect(didLastTestRunFail(metadataWithTestRuns({ failedCount: 2, file: URI.file('/workspace/other.test.ts').fsPath }), [changedTestFile])).toBe(false);
	});

	test('detects rejection from the last plan review', () => {
		expect([
			wasLastPlanReviewRejected(metadataWithPlanReviews('{"rejected":true}')),
			wasLastPlanReviewRejected(metadataWithPlanReviews('{"rejected":true}', '{"rejected":false}')),
			wasLastPlanReviewRejected(metadataWithPlanReviews('not json')),
		]).toEqual([true, false, false]);
	});

	test('requires more than one recovery signal', () => {
		const previousRequest = { prompt: 'previous request', modelId: 'model' } as ChatRequestTurn2;
		expect([
			isChatRecoveryAttempt(previousRequest, undefined, chatRequest({ attempt: 1 })),
			isChatRecoveryAttempt(previousRequest, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
		]).toEqual([false, true]);
	});
});
