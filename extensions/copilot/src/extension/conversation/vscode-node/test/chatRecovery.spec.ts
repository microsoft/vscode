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

function textDocument(uri: vscode.Uri, content: string): vscode.TextDocument {
	const lines = content.split('\n');
	return {
		uri,
		lineCount: lines.length,
		getText: () => content,
		lineAt: line => {
			const text = lines[line];
			return {
				text,
				range: new vscode.Range(line, 0, line, text.length),
				rangeIncludingLineBreak: line < lines.length - 1 ? new vscode.Range(line, 0, line + 1, 0) : new vscode.Range(line, 0, line, text.length),
				firstNonWhitespaceCharacterIndex: text.search(/\S|$/),
				isEmptyOrWhitespace: text.trim().length === 0,
			};
		},
	} as vscode.TextDocument;
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
			isChatRecoveryAttempt(previousRequest, undefined, chatRequest({ attempt: 1 })),
			isChatRecoveryAttempt(previousRequest, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			isChatRecoveryAttempt({ ...previousRequest, modelId: 'other-model' }, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
		]).toEqual([false, false, true]);
	});

	test('excludes requests that are not user-driven recovery attempts', () => {
		const previousRequest = { prompt: 'previous request', modelId: 'model' } as ChatRequestTurn2;
		const previousResponse = chatResponse(undefined, true);

		expect({
			noHistory: isChatRecoveryAttempt(undefined, undefined, chatRequest({ attempt: 1, editedRequestId: 'request-id' })),
			autopilot: isChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ attempt: 1, permissionLevel: 'autopilot' })),
			subagent: isChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ attempt: 1, subAgentInvocationId: 'subagent-id' })),
			systemInitiated: isChatRecoveryAttempt(previousRequest, previousResponse, chatRequest({ attempt: 1, isSystemInitiated: true })),
		}).toEqual({
			noHistory: false,
			autopilot: false,
			subagent: false,
			systemInitiated: false,
		});
	});

	test('detects recovery signals from the request and previous response', () => {
		const previousRequest = { prompt: 'fix the parser error', modelId: 'model' } as ChatRequestTurn2;
		const retry = { attempt: 1 };
		const noWorkspaceSignals = { getDiagnostics: () => [], textDocuments: [] };

		expect({
			editedRequest: isChatRecoveryAttempt({ ...previousRequest, modelId: 'other-model' }, undefined, chatRequest({ ...retry, editedRequestId: 'request-id' })),
			changedModel: isChatRecoveryAttempt({ ...previousRequest, modelId: 'other-model' }, undefined, chatRequest({ ...retry, editedRequestId: 'request-id' })),
			repeatedRequest: isChatRecoveryAttempt(previousRequest, undefined, chatRequest({ ...retry, prompt: 'Fix  the parser error', editedRequestId: 'request-id' })),
			responseError: isChatRecoveryAttempt(previousRequest, chatResponse(undefined, true), chatRequest(retry)),
			failedTests: isChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedTestFile, metadataWithTestRuns({ failedCount: 1 }))), chatRequest(retry), noWorkspaceSignals),
			rejectedPlan: isChatRecoveryAttempt(previousRequest, chatResponse(metadataWithPlanReviews('{"rejected":true}')), chatRequest(retry)),
		}).toEqual({
			editedRequest: true,
			changedModel: true,
			repeatedRequest: true,
			responseError: true,
			failedTests: true,
			rejectedPlan: true,
		});
	});

	test('detects recovery signals from changed files', () => {
		const changedDocument = textDocument(URI.file('/workspace/changed.ts'), 'const value = 1;');
		const conflictDocument = textDocument(URI.file('/workspace/conflict.ts'), '<<<<<<< current\nconst value = 1;\n=======\nconst value = 2;\n>>>>>>> incoming');
		const noWorkspaceSignals = { getDiagnostics: () => [], textDocuments: [] };
		const diagnosticSignals = {
			getDiagnostics: (uri: vscode.Uri) => uri.toString() === changedDocument.uri.toString() ? [new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Generated error', vscode.DiagnosticSeverity.Error)] : [],
			textDocuments: [],
		};
		const conflictSignals = { getDiagnostics: () => [], textDocuments: [conflictDocument] };
		const previousRequest = { prompt: 'previous request', modelId: 'model' } as ChatRequestTurn2;

		expect({
			userRejected: isChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedDocument.uri)), chatRequest({ attempt: 1, editedFileEvents: [{ uri: changedDocument.uri, eventKind: ChatRequestEditedFileEventKind.Undo }] }), noWorkspaceSignals),
			userModified: isChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedDocument.uri)), chatRequest({ attempt: 1, editedRequestId: 'request-id', editedFileEvents: [{ uri: changedDocument.uri, eventKind: ChatRequestEditedFileEventKind.UserModification }] }), noWorkspaceSignals),
			generatedProblems: isChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(changedDocument.uri)), chatRequest({ attempt: 1, editedRequestId: 'request-id' }), diagnosticSignals),
			mergeConflicts: isChatRecoveryAttempt(previousRequest, chatResponse(metadataWithChangedFile(conflictDocument.uri)), chatRequest({ attempt: 1 }), conflictSignals),
		}).toEqual({
			userRejected: true,
			userModified: true,
			generatedProblems: true,
			mergeConflicts: true,
		});
	});
});
