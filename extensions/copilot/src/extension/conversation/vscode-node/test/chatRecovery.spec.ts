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
import { arePromptsSimilar, didLastTestRunFail, getChatRecoveryAttempt, wasLastPlanReviewRejected } from '../chatRecovery';

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

function metadataWithChangedFile(uri: vscode.Uri, metadata: Partial<IResultMetadata> = {}, state = WorkingSetEntryState.Undecided): Partial<IResultMetadata> {
	return { ...metadata, ...new PreviousEditCodeStep([{
		document: { uri, languageId: 'typescript', version: 1, text: '' },
		state,
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
			getChatRecoveryAttempt(previousRequest, undefined, chatRequest({ attempt: 1 })),
			getChatRecoveryAttempt(previousRequest, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			getChatRecoveryAttempt({ ...previousRequest, modelId: 'other-model' }, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			getChatRecoveryAttempt({ ...previousRequest, permissionLevel: 'autopilot' }, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
		]).toEqual([
			undefined,
			undefined,
			{ modelId: 'model', scoringVersion: '2', totalScore: 1, requestRetried: true, requestEdited: true, requestChangedModel: true },
			{ modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestRetried: true, requestEdited: true, requestReducedPermissions: true },
		]);
	});

	test('detects reduced permission levels', () => {
		const previousResponse = chatResponse(undefined, true);
		const request = (permissionLevel?: string) => chatRequest({ permissionLevel });
		const previousRequest = (permissionLevel?: string) => ({ prompt: 'previous request', modelId: 'model', permissionLevel }) as ChatRequestTurn2;

		expect({
			autopilotToAutoApprove: getChatRecoveryAttempt(previousRequest('autopilot'), previousResponse, request('autoApprove')),
			autoApproveToAssisted: getChatRecoveryAttempt(previousRequest('autoApprove'), previousResponse, request('assisted')),
			assistedToDefault: getChatRecoveryAttempt(previousRequest('assisted'), previousResponse, request()),
			unchanged: getChatRecoveryAttempt(previousRequest('assisted'), previousResponse, request('assisted')),
			increased: getChatRecoveryAttempt(previousRequest('assisted'), previousResponse, request('autoApprove')),
			unknownPrevious: getChatRecoveryAttempt(previousRequest('unknown'), previousResponse, request()),
			unknownCurrent: getChatRecoveryAttempt(previousRequest('autoApprove'), previousResponse, request('unknown')),
		}).toEqual({
			autopilotToAutoApprove: { modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestReducedPermissions: true, lastResponseErrored: true },
			autoApproveToAssisted: { modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestReducedPermissions: true, lastResponseErrored: true },
			assistedToDefault: { modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestReducedPermissions: true, lastResponseErrored: true },
			unchanged: undefined,
			increased: undefined,
			unknownPrevious: undefined,
			unknownCurrent: undefined,
		});
	});

	test('detects changes to the selected model identifier', () => {
		const previousRequest = { prompt: 'previous request', modelId: 'copilot/model-a' } as ChatRequestTurn2;
		const previousResponse = chatResponse(undefined, true);

		expect({
			unchanged: getChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ modelId: 'copilot/model-a' })),
			changed: getChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ modelId: 'copilot/model-b' })),
		}).toEqual({
			unchanged: { modelId: 'model', scoringVersion: '2', totalScore: 0.75, lastResponseErrored: true },
			changed: { modelId: 'model', scoringVersion: '2', totalScore: 1, requestChangedModel: true, lastResponseErrored: true },
		});
	});

	test('excludes requests that are not user-driven recovery attempts', () => {
		const previousRequest = { prompt: 'previous request', modelId: 'model' } as ChatRequestTurn2;
		const previousResponse = chatResponse(undefined, true);

		expect({
			noHistory: getChatRecoveryAttempt(undefined, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			autopilot: getChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ attempt: 1, permissionLevel: 'autopilot' })),
			subagent: getChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ attempt: 1, subAgentInvocationId: 'subagent-id' })),
			systemInitiated: getChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ attempt: 1, isSystemInitiated: true })),
		}).toEqual({ noHistory: undefined, autopilot: undefined, subagent: undefined, systemInitiated: undefined });
	});

	test('detects recovery signals from the request and previous response', () => {
		const previousRequest = { prompt: 'fix the parser error', modelId: 'model' } as ChatRequestTurn2;
		const retry = { attempt: 1 };
		const noWorkspaceSignals = { getDiagnostics: () => [], hasMergeConflicts: () => false };

		expect({
			editedRequest: getChatRecoveryAttempt(previousRequest, chatResponse(undefined, true), chatRequest({ editedRequestId: 'request-id' })),
			changedModel: getChatRecoveryAttempt({ ...previousRequest, modelId: 'other-model' }, chatResponse(undefined, true), chatRequest({})),
			turnedOffAutopilot: getChatRecoveryAttempt({ ...previousRequest, permissionLevel: 'autopilot' }, chatResponse(undefined, true), chatRequest({})),
			repeatedRequest: getChatRecoveryAttempt(previousRequest, chatResponse(undefined, true), chatRequest({ prompt: 'Fix  the parser error' })),
			responseError: getChatRecoveryAttempt(previousRequest, chatResponse(undefined, true), chatRequest(retry)),
			failedTests: getChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedTestFile, metadataWithTestRuns({ failedCount: 1 }))), chatRequest(retry), noWorkspaceSignals),
			rejectedPlan: getChatRecoveryAttempt(previousRequest, chatResponse(metadataWithPlanReviews('{"rejected":true}')), chatRequest(retry)),
		}).toEqual({
			editedRequest: { modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestEdited: true, lastResponseErrored: true },
			changedModel: { modelId: 'model', scoringVersion: '2', totalScore: 1, requestChangedModel: true, lastResponseErrored: true },
			turnedOffAutopilot: { modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestReducedPermissions: true, lastResponseErrored: true },
			repeatedRequest: { modelId: 'model', scoringVersion: '2', totalScore: 1, lastRequestRepeated: true, lastResponseErrored: true },
			responseError: { modelId: 'model', scoringVersion: '2', totalScore: 1, requestRetried: true, lastResponseErrored: true },
			failedTests: { modelId: 'model', scoringVersion: '2', totalScore: 1, requestRetried: true, documentGeneratedTestsFail: true },
			rejectedPlan: { modelId: 'model', scoringVersion: '2', totalScore: 1, requestRetried: true, planReviewRejected: true },
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
			userRejected: getChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedDocument, {}, WorkingSetEntryState.Rejected)), chatRequest({ attempt: 1 }), noWorkspaceSignals),
			userModified: getChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedDocument)), chatRequest({ attempt: 1, editedRequestId: 'request-id', editedFileEvents: [{ uri: changedDocument, eventKind: ChatRequestEditedFileEventKind.UserModification }] }), noWorkspaceSignals),
			generatedProblems: getChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedDocument)), chatRequest({ attempt: 1, editedRequestId: 'request-id' }), diagnosticSignals),
			mergeConflicts: getChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(conflictDocument)), chatRequest({ attempt: 1 }), conflictSignals),
		}).toEqual({
			userRejected: { modelId: 'model', scoringVersion: '2', totalScore: 1, requestRetried: true, documentUserRejected: true },
			userModified: { modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestRetried: true, requestEdited: true, documentUserModified: true },
			generatedProblems: { modelId: 'model', scoringVersion: '2', totalScore: 1.25, requestRetried: true, requestEdited: true, documentGeneratedProblems: true },
			mergeConflicts: { modelId: 'model', scoringVersion: '2', totalScore: 1, requestRetried: true, documentHasMergeConflicts: true },
		});
	});
});
