/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import { ChatRequest, ChatRequestEditedFileEventKind, ChatRequestTurn2, ChatResponseTurn, LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { URI } from '../../../../util/vs/base/common/uri';
import { PreviousEditCodeStep } from '../../../intents/node/editCodeStep';
import { IResultMetadata } from '../../../prompt/common/conversation';
import { WorkingSetEntryState } from '../../../prompt/common/intents';
import { ToolName } from '../../../tools/common/toolNames';
import { arePromptsSimilar, didLastTestRunFail, getChatRecoveryAttemptScore, wasLastPlanReviewRejected } from '../chatRecovery';

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

function chatResponse(metadata?: Partial<IResultMetadata>, hasError = false): ChatResponseTurn {
	return {
		result: {
			metadata,
			errorDetails: hasError ? { message: 'Previous request failed' } : undefined,
		}
	} as ChatResponseTurn;
}

function metadataWithChangedFile(uri: vscode.Uri, metadata: Partial<IResultMetadata> = {}): Partial<IResultMetadata> {
	return { ...metadata, ...new PreviousEditCodeStep([{
		document: { uri, languageId: 'typescript', version: 1, text: '' },
		state: WorkingSetEntryState.Undecided,
	}], 'request', 'response', []).toChatResultMetaData() };
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

	test('requires the normalized recovery score to reach the threshold', () => {
		const previousRequest = { prompt: 'previous request', modelId: 'model' } as ChatRequestTurn2;
		expect([
			getChatRecoveryAttemptScore(previousRequest, undefined, chatRequest({ attempt: 1 })),
			getChatRecoveryAttemptScore(previousRequest, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			getChatRecoveryAttemptScore({ ...previousRequest, modelId: 'other-model' }, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			getChatRecoveryAttemptScore({ ...previousRequest, permissionLevel: 'autopilot' }, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
		]).toEqual([
			undefined,
			undefined,
			{ score: 1, signals: ['requestRetried', 'requestEdited', 'requestChangedModel'] },
			{ score: 1.25, signals: ['requestRetried', 'requestEdited', 'requestTurnedOffAutopilot'] },
		]);
	});

	test('excludes requests that are not user-driven recovery attempts', () => {
		const previousRequest = { prompt: 'previous request', modelId: 'model' } as ChatRequestTurn2;
		const previousResponse = chatResponse(undefined, true);

		expect({
			noHistory: getChatRecoveryAttemptScore(undefined, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			autopilot: getChatRecoveryAttemptScore(previousRequest, previousResponse, chatRequest({ attempt: 1, permissionLevel: 'autopilot' })),
			subagent: getChatRecoveryAttemptScore(previousRequest, previousResponse, chatRequest({ attempt: 1, subAgentInvocationId: 'subagent-id' })),
			systemInitiated: getChatRecoveryAttemptScore(previousRequest, previousResponse, chatRequest({ attempt: 1, isSystemInitiated: true })),
		}).toEqual({ noHistory: undefined, autopilot: undefined, subagent: undefined, systemInitiated: undefined });
	});

	test('detects recovery signals from the request and previous response', () => {
		const previousRequest = { prompt: 'fix the parser error', modelId: 'model' } as ChatRequestTurn2;
		const retry = { attempt: 1 };
		const noWorkspaceSignals = { getDiagnostics: () => [], hasMergeConflicts: () => false };

		expect({
			editedRequest: getChatRecoveryAttemptScore(previousRequest, chatResponse(undefined, true), chatRequest({ editedRequestId: 'request-id' })),
			changedModel: getChatRecoveryAttemptScore({ ...previousRequest, modelId: 'other-model' }, chatResponse(undefined, true), chatRequest({})),
			turnedOffAutopilot: getChatRecoveryAttemptScore({ ...previousRequest, permissionLevel: 'autopilot' }, chatResponse(undefined, true), chatRequest({})),
			repeatedRequest: getChatRecoveryAttemptScore(previousRequest, chatResponse(undefined, true), chatRequest({ prompt: 'Fix  the parser error' })),
			responseError: getChatRecoveryAttemptScore(previousRequest, chatResponse(undefined, true), chatRequest(retry)),
			failedTests: getChatRecoveryAttemptScore(previousRequest, chatResponse(metadataWithChangedFile(changedTestFile, metadataWithTestRuns({ failedCount: 1 }))), chatRequest(retry), noWorkspaceSignals),
			rejectedPlan: getChatRecoveryAttemptScore(previousRequest, chatResponse(metadataWithPlanReviews('{"rejected":true}')), chatRequest(retry)),
		}).toEqual({
			editedRequest: { score: 1.25, signals: ['requestEdited', 'lastResponseErrored'] },
			changedModel: { score: 1, signals: ['requestChangedModel', 'lastResponseErrored'] },
			turnedOffAutopilot: { score: 1.25, signals: ['requestTurnedOffAutopilot', 'lastResponseErrored'] },
			repeatedRequest: { score: 1, signals: ['lastRequestRepeated', 'lastResponseErrored'] },
			responseError: { score: 1, signals: ['requestRetried', 'lastResponseErrored'] },
			failedTests: { score: 1, signals: ['requestRetried', 'documentGeneratedTestsFail'] },
			rejectedPlan: { score: 1, signals: ['requestRetried', 'planReviewRejected'] },
		});
	});

	test('detects recovery signals from changed files', () => {
		const changedDocument = URI.file('/workspace/changed.ts');
		const conflictDocument = URI.file('/workspace/conflict.ts');
		const noWorkspaceSignals = { getDiagnostics: () => [], hasMergeConflicts: () => false };
		const diagnosticSignals = {
			getDiagnostics: (uri: vscode.Uri) => uri.toString() === changedDocument.toString() ? [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Generated error', vscode.DiagnosticSeverity.Error)] : [],
			hasMergeConflicts: () => false,
		};
		const conflictSignals = { getDiagnostics: () => [], hasMergeConflicts: (uri: vscode.Uri) => uri.toString() === conflictDocument.toString() };
		const previousRequest = { prompt: 'previous request', modelId: 'model' } as ChatRequestTurn2;

		expect({
			userRejected: getChatRecoveryAttemptScore(previousRequest, chatResponse(metadataWithChangedFile(changedDocument)), chatRequest({ attempt: 1, editedFileEvents: [{ uri: changedDocument, eventKind: ChatRequestEditedFileEventKind.Undo }] }), noWorkspaceSignals),
			userModified: getChatRecoveryAttemptScore(previousRequest, chatResponse(metadataWithChangedFile(changedDocument)), chatRequest({ attempt: 1, editedRequestId: 'request-id', editedFileEvents: [{ uri: changedDocument, eventKind: ChatRequestEditedFileEventKind.UserModification }] }), noWorkspaceSignals),
			generatedProblems: getChatRecoveryAttemptScore(previousRequest, chatResponse(metadataWithChangedFile(changedDocument)), chatRequest({ attempt: 1, editedRequestId: 'request-id' }), diagnosticSignals),
			mergeConflicts: getChatRecoveryAttemptScore(previousRequest, chatResponse(metadataWithChangedFile(conflictDocument)), chatRequest({ attempt: 1 }), conflictSignals),
		}).toEqual({
			userRejected: { score: 1, signals: ['requestRetried', 'documentUserRejected'] },
			userModified: { score: 1.25, signals: ['requestRetried', 'requestEdited', 'documentUserModified'] },
			generatedProblems: { score: 1.25, signals: ['requestRetried', 'requestEdited', 'documentGeneratedProblems'] },
			mergeConflicts: { score: 1, signals: ['requestRetried', 'documentHasMergeConflicts'] },
		});
	});
});
