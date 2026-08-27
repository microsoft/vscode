/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { computeLevenshteinDistance } from '../../../util/vs/base/common/diff/diff';
import { isEqual } from '../../../util/vs/base/common/resources';
import { ChatRequestTurn2, ChatResponseTurn, LanguageModelTextPart } from '../../../vscodeTypes';
import { MergeConflictParser } from '../../git/vscode/mergeConflictParser';
import { PreviousEditCodeStep } from '../../intents/node/editCodeStep';
import { IResultMetadata } from '../../prompt/common/conversation';
import { IToolCall, WorkingSetEntryState } from '../../prompt/common/intents';
import { getToolName, ToolName } from '../../tools/common/toolNames';

const testRunSummaryPattern = /<summary passed=\d+ failed=(?<failed>\d+) \/>/;

export enum ChatRecoverySignal {
	DocumentUserRejected = 'documentUserRejected',
	DocumentUserModified = 'documentUserModified',
	DocumentHasMergeConflicts = 'documentHasMergeConflicts',
	DocumentGeneratedProblems = 'documentGeneratedProblems',
	DocumentGeneratedTestsFail = 'documentGeneratedTestsFail',
	LastRequestRepeated = 'lastRequestRepeated',
	LastResponseErrored = 'lastResponseErrored',
	RequestRetried = 'requestRetried',
	RequestEdited = 'requestEdited',
	RequestChangedModel = 'requestChangedModel',
	PlanReviewRejected = 'planReviewRejected',
}

export function arePromptsSimilar(previousPrompt: string, currentPrompt: string): boolean {
	const normalizedPreviousPrompt = previousPrompt.trim().replace(/\s+/g, ' ').toLowerCase();
	const normalizedCurrentPrompt = currentPrompt.trim().replace(/\s+/g, ' ').toLowerCase();
	if (!normalizedPreviousPrompt || !normalizedCurrentPrompt) {
		return false;
	}
	if (normalizedPreviousPrompt === normalizedCurrentPrompt) {
		return true;
	}
	const maximumLength = Math.max(normalizedPreviousPrompt.length, normalizedCurrentPrompt.length);
	const similarity = 1 - computeLevenshteinDistance(normalizedPreviousPrompt, normalizedCurrentPrompt) / maximumLength;

	return similarity >= 0.8;
}

function testRunTargetsChangedFile(toolCall: IToolCall, changedFileUris: readonly vscode.Uri[]): boolean {
	if (getToolName(toolCall.name) !== ToolName.CoreRunTest) {
		return false;
	}
	try {
		const input = JSON.parse(toolCall.arguments) as { files?: string[] };
		return input.files?.some(file => changedFileUris.some(uri => isEqual(vscode.Uri.file(file), uri))) === true;
	} catch {
		return false;
	}
}

export function didLastTestRunFail(metadata: Partial<IResultMetadata> | undefined, changedFileUris: readonly vscode.Uri[]): boolean {
	const lastTestRun = metadata?.toolCallRounds
		?.flatMap(round => round.toolCalls)
		.filter(toolCall => testRunTargetsChangedFile(toolCall, changedFileUris))
		.at(-1);
	if (!lastTestRun) {
		return false;
	}
	const resultText = metadata?.toolCallResults?.[lastTestRun.id]?.content
		.flatMap(part => part instanceof LanguageModelTextPart ? [part.value] : [])
		.join('\n') ?? '';
	const failedCount = testRunSummaryPattern.exec(resultText)?.groups?.failed;
	return failedCount !== undefined && Number.parseInt(failedCount, 10) > 0;
}

export function wasLastPlanReviewRejected(metadata: Partial<IResultMetadata> | undefined): boolean {
	const lastPlanReview = metadata?.toolCallRounds
		?.flatMap(round => round.toolCalls)
		.filter(toolCall => getToolName(toolCall.name) === ToolName.CoreReviewPlan)
		.at(-1);
	if (!lastPlanReview) {
		return false;
	}
	const resultText = metadata?.toolCallResults?.[lastPlanReview.id]?.content
		.flatMap(part => part instanceof LanguageModelTextPart ? [part.value] : [])
		.join('') ?? '';
	try {
		const result = JSON.parse(resultText) as { rejected?: unknown };
		return result.rejected === true;
	} catch {
		return false;
	}
}

/**
 * Determines whether the current chat request is an attempt to recover from a previous failed request.
 */
export function isChatRecoveryAttempt(previousRequest: ChatRequestTurn2 | undefined, previousResponse: ChatResponseTurn | undefined, request: vscode.ChatRequest): boolean {
	if ((!previousRequest && !previousResponse) || request.permissionLevel === 'autopilot' || request.subAgentInvocationId || request.isSystemInitiated) {
		return false;
	}

	const signals: ChatRecoverySignal[] = [];
	if (request.attempt > 0) {
		signals.push(ChatRecoverySignal.RequestRetried);
	}
	if (request.editedRequestId) {
		signals.push(ChatRecoverySignal.RequestEdited);
	}
	if (previousRequest?.modelId && previousRequest.modelId !== request.model.id) {
		signals.push(ChatRecoverySignal.RequestChangedModel);
	}
	if (previousRequest && arePromptsSimilar(previousRequest.prompt, request.prompt)) {
		signals.push(ChatRecoverySignal.LastRequestRepeated);
	}
	if (previousResponse?.result.errorDetails) {
		signals.push(ChatRecoverySignal.LastResponseErrored);
	}

	const editStep = previousResponse ? PreviousEditCodeStep.fromChatResultMetaData(previousResponse.result) : undefined;
	const changedFiles = editStep?.workingSet.filter(entry => entry.state !== WorkingSetEntryState.Initial) ?? [];
	const documentUserRejected = changedFiles.some(entry =>
		request.editedFileEvents?.some(event =>
			event.eventKind === vscode.ChatRequestEditedFileEventKind.Undo && isEqual(event.uri, entry.document.uri)
		) === true
	);
	if (documentUserRejected) {
		signals.push(ChatRecoverySignal.DocumentUserRejected);
	}
	const documentUserModified = changedFiles.some(entry =>
		request.editedFileEvents?.some(event =>
			event.eventKind === vscode.ChatRequestEditedFileEventKind.UserModification && isEqual(event.uri, entry.document.uri)
		) === true
	);
	if (documentUserModified) {
		signals.push(ChatRecoverySignal.DocumentUserModified);
	}
	const documentGeneratedProblems = changedFiles.some(entry =>
		vscode.languages.getDiagnostics(entry.document.uri).some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
	);
	if (documentGeneratedProblems) {
		signals.push(ChatRecoverySignal.DocumentGeneratedProblems);
	}
	const documentHasMergeConflicts = changedFiles.some(entry => {
		const document = vscode.workspace.textDocuments.find(document => isEqual(document.uri, entry.document.uri));
		return document !== undefined && MergeConflictParser.scanDocument(document).length > 0;
	});
	if (documentHasMergeConflicts) {
		signals.push(ChatRecoverySignal.DocumentHasMergeConflicts);
	}
	if (didLastTestRunFail(previousResponse?.result.metadata, changedFiles.map(entry => entry.document.uri))) {
		signals.push(ChatRecoverySignal.DocumentGeneratedTestsFail);
	}
	if (wasLastPlanReviewRejected(previousResponse?.result.metadata)) {
		signals.push(ChatRecoverySignal.PlanReviewRejected);
	}

	return signals.length > 1;
}
