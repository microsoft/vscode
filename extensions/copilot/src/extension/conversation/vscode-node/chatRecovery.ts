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

interface IChatRecoveryEnvironment {
	readonly getDiagnostics: (uri: vscode.Uri) => readonly vscode.Diagnostic[];
	readonly hasMergeConflicts: (uri: vscode.Uri) => boolean;
}

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
	RequestTurnedOffAutopilot = 'requestTurnedOffAutopilot',
	PlanReviewRejected = 'planReviewRejected',
}

const chatRecoverySignalRules = {
	[ChatRecoverySignal.DocumentUserRejected]: { weight: 0.75 },
	[ChatRecoverySignal.DocumentUserModified]: { weight: 0.5 },
	[ChatRecoverySignal.DocumentHasMergeConflicts]: { weight: 0.75 },
	[ChatRecoverySignal.DocumentGeneratedProblems]: { weight: 0.5 },
	[ChatRecoverySignal.DocumentGeneratedTestsFail]: { weight: 0.75 },
	[ChatRecoverySignal.LastRequestRepeated]: { weight: 0.25 },
	[ChatRecoverySignal.LastResponseErrored]: { weight: 0.75 },
	[ChatRecoverySignal.RequestRetried]: { weight: 0.25 },
	[ChatRecoverySignal.RequestEdited]: { weight: 0.5 },
	[ChatRecoverySignal.RequestChangedModel]: { weight: 0.25 },
	[ChatRecoverySignal.RequestTurnedOffAutopilot]: { weight: 0.5 },
	[ChatRecoverySignal.PlanReviewRejected]: { weight: 0.75 },
} satisfies Record<ChatRecoverySignal, { readonly weight: number }>;

type ChatRecoverySignalProperties = Partial<Record<ChatRecoverySignal, true>>;

export type ChatRecoveryAttempt = ChatRecoverySignalProperties & {
	readonly modelId: string;
	readonly scoringVersion: string;
	readonly totalScore: string;
};

const chatRecoveryScoreThreshold = 1;
const chatRecoveryScoringVersion = '1';

function addSignal(signalProperties: ChatRecoverySignalProperties, signal: ChatRecoverySignal): number {
	if (!chatRecoverySignalRules[signal]) {
		return 0;
	}
	if (signalProperties[signal]) {
		return 0;
	}
	signalProperties[signal] = true;
	return chatRecoverySignalRules[signal].weight;
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
export function getChatRecoveryAttempt(previousRequest: ChatRequestTurn2 | undefined, previousResponse: ChatResponseTurn | undefined, request: vscode.ChatRequest, environment?: IChatRecoveryEnvironment): ChatRecoveryAttempt | undefined {
	if ((!previousRequest && !previousResponse) || request.permissionLevel === 'autopilot' || request.subAgentInvocationId || request.isSystemInitiated) {
		return undefined;
	}

	const signalProperties: ChatRecoverySignalProperties = {};
	let totalScore = 0;

	if (request.attempt > 0) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.RequestRetried);
	}
	if (request.editedRequestId) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.RequestEdited);
	}
	if (previousRequest?.modelId && previousRequest.modelId !== request.model.id) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.RequestChangedModel);
	}
	if (previousRequest?.permissionLevel === 'autopilot' && request.permissionLevel !== 'autopilot') {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.RequestTurnedOffAutopilot);
	}
	if (previousRequest && arePromptsSimilar(previousRequest.prompt, request.prompt)) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.LastRequestRepeated);
	}
	if (previousResponse?.result.errorDetails) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.LastResponseErrored);
	}

	const editStep = previousResponse ? PreviousEditCodeStep.fromChatResultMetaData(previousResponse.result) : undefined;
	const changedFiles = editStep?.workingSet.filter(entry => entry.state !== WorkingSetEntryState.Initial) ?? [];
	const documentUserRejected = changedFiles.some(entry =>
		request.editedFileEvents?.some(event =>
			event.eventKind === vscode.ChatRequestEditedFileEventKind.Undo && isEqual(event.uri, entry.document.uri)
		) === true
	);
	if (documentUserRejected) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.DocumentUserRejected);
	}
	const documentUserModified = changedFiles.some(entry =>
		request.editedFileEvents?.some(event =>
			event.eventKind === vscode.ChatRequestEditedFileEventKind.UserModification && isEqual(event.uri, entry.document.uri)
		) === true
	);
	if (documentUserModified) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.DocumentUserModified);
	}
	const documentGeneratedProblems = changedFiles.some(entry =>
		(environment?.getDiagnostics(entry.document.uri) ?? vscode.languages.getDiagnostics(entry.document.uri)).some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
	);
	if (documentGeneratedProblems) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.DocumentGeneratedProblems);
	}
	const documentHasMergeConflicts = changedFiles.some(entry => environment
		? environment.hasMergeConflicts(entry.document.uri)
		: vscode.workspace.textDocuments.some(document => isEqual(document.uri, entry.document.uri) && MergeConflictParser.scanDocument(document).length > 0));
	if (documentHasMergeConflicts) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.DocumentHasMergeConflicts);
	}
	if (didLastTestRunFail(previousResponse?.result.metadata, changedFiles.map(entry => entry.document.uri))) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.DocumentGeneratedTestsFail);
	}
	if (wasLastPlanReviewRejected(previousResponse?.result.metadata)) {
		totalScore += addSignal(signalProperties, ChatRecoverySignal.PlanReviewRejected);
	}

	if (totalScore < chatRecoveryScoreThreshold) {
		return undefined;
	}

	return {
		modelId: request.model.id,
		scoringVersion: chatRecoveryScoringVersion,
		totalScore: String(totalScore),
		...signalProperties,
	};
}
