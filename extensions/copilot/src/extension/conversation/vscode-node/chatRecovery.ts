/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { computeLevenshteinDistance } from '../../../util/vs/base/common/diff/diff';
import { isEqual } from '../../../util/vs/base/common/resources';
import { ChatRequestTurn2, ChatResponseTextEditPart, ChatResponseTurn, LanguageModelTextPart } from '../../../vscodeTypes';
import { MergeConflictParser } from '../../git/vscode/mergeConflictParser';
import { PreviousEditCodeStep } from '../../intents/node/editCodeStep';
import { IResultMetadata } from '../../prompt/common/conversation';
import { IToolCall, WorkingSetEntryState } from '../../prompt/common/intents';
import { getToolName, ToolName } from '../../tools/common/toolNames';

interface IChatRecoveryEnvironment {
	readonly getDiagnostics: (uri: vscode.Uri) => readonly vscode.Diagnostic[];
	readonly hasMergeConflicts: (uri: vscode.Uri) => boolean;
}

type ChatRecoveryResponseTurn = Pick<ChatResponseTurn, 'result'> & {
	readonly response: ReadonlyArray<ChatResponseTurn['response'][number] | ChatResponseTextEditPart>;
};

enum ChatRecoverySignal {
	RequestRetried = 'requestRetried',
	RequestEdited = 'requestEdited',
	RequestChangedModel = 'requestChangedModel',
	RequestReducedPermissions = 'requestReducedPermissions',
	LastRequestRepeated = 'lastRequestRepeated',
	LastResponseErrored = 'lastResponseErrored',
	DocumentUserDeleted = 'documentUserDeleted',
	DocumentUserRejected = 'documentUserRejected',
	DocumentUserModified = 'documentUserModified',
	DocumentGeneratedProblems = 'documentGeneratedProblems',
	DocumentHasMergeConflicts = 'documentHasMergeConflicts',
	DocumentGeneratedTestsFail = 'documentGeneratedTestsFail',
	PlanReviewRejected = 'planReviewRejected',
}

enum ChatPermissionLevel {
	Default = 'default',
	Assisted = 'assisted',
	AutoApprove = 'autoApprove',
	Autopilot = 'autopilot',
}

const chatRecoverySignalRules = {
	[ChatRecoverySignal.RequestRetried]: { weight: 0.25 },
	[ChatRecoverySignal.RequestEdited]: { weight: 0.5 },
	[ChatRecoverySignal.RequestChangedModel]: { weight: 0.25 },
	[ChatRecoverySignal.RequestReducedPermissions]: { weight: 0.5 },
	[ChatRecoverySignal.LastRequestRepeated]: { weight: 0.25 },
	[ChatRecoverySignal.LastResponseErrored]: { weight: 0.75 },
	[ChatRecoverySignal.DocumentUserDeleted]: { weight: 0.75 },
	[ChatRecoverySignal.DocumentUserRejected]: { weight: 0.75 },
	[ChatRecoverySignal.DocumentUserModified]: { weight: 0.5 },
	[ChatRecoverySignal.DocumentGeneratedProblems]: { weight: 0.5 },
	[ChatRecoverySignal.DocumentHasMergeConflicts]: { weight: 0.75 },
	[ChatRecoverySignal.DocumentGeneratedTestsFail]: { weight: 0.75 },
	[ChatRecoverySignal.PlanReviewRejected]: { weight: 0.75 },
} satisfies Record<ChatRecoverySignal, { readonly weight: number }>;

// Signal properties are sparse: an absent key means that the signal was not detected.
type ChatRecoverySignalProperties = Partial<Record<ChatRecoverySignal, true>>;

type ChatRecoveryAttempt = ChatRecoverySignalProperties & {
	readonly modelId: string;
	readonly scoringVersion: string;
	totalScore: number;
};

const testRunSummaryPattern = /<summary passed=\d+ failed=(?<failed>\d+) \/>/;
const chatRecoveryScoreThreshold = 0.2; // The minimum score required to consider a recovery attempt valid.
// Increment when changing signal weights, the threshold, or scoring semantics.
const chatRecoveryScoringVersion = '2';
const chatPermissionLevelRanks: Readonly<Partial<Record<string, number>>> = {
	[ChatPermissionLevel.Default]: 0,
	[ChatPermissionLevel.Assisted]: 1,
	[ChatPermissionLevel.AutoApprove]: 2,
	[ChatPermissionLevel.Autopilot]: 3,
} satisfies Record<ChatPermissionLevel, number>;

function addSignal(recoveryAttempt: ChatRecoveryAttempt, signal: ChatRecoverySignal): void {
	if (recoveryAttempt[signal]) {
		return;
	}
	recoveryAttempt[signal] = true;
	recoveryAttempt.totalScore += chatRecoverySignalRules[signal].weight;
}

function didReducePermissions(previousPermissionLevel: string | undefined, currentPermissionLevel: string | undefined): boolean {
	const previousRank = chatPermissionLevelRanks[previousPermissionLevel ?? ChatPermissionLevel.Default];
	const currentRank = chatPermissionLevelRanks[currentPermissionLevel ?? ChatPermissionLevel.Default];
	return previousRank !== undefined && currentRank !== undefined && currentRank < previousRank;
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
	// Earlier failures no longer matter after a newer relevant test run passes.
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

function addRequestSignals(recoveryAttempt: ChatRecoveryAttempt, previousRequest: ChatRequestTurn2 | undefined, request: vscode.ChatRequest): void {
	if (request.attempt > 0) {
		addSignal(recoveryAttempt, ChatRecoverySignal.RequestRetried);
	}
	if (request.editedRequestId) {
		addSignal(recoveryAttempt, ChatRecoverySignal.RequestEdited);
	}
	if (previousRequest?.modelId && previousRequest.modelId !== (request.modelId ?? request.model.id)) {
		addSignal(recoveryAttempt, ChatRecoverySignal.RequestChangedModel);
	}
	if (didReducePermissions(previousRequest?.permissionLevel, request.permissionLevel)) {
		addSignal(recoveryAttempt, ChatRecoverySignal.RequestReducedPermissions);
	}
	if (previousRequest && arePromptsSimilar(previousRequest.prompt, request.prompt)) {
		addSignal(recoveryAttempt, ChatRecoverySignal.LastRequestRepeated);
	}
}

function getGeneratedFileUris(previousResponse: ChatRecoveryResponseTurn | undefined): vscode.Uri[] {
	const editStep = previousResponse ? PreviousEditCodeStep.fromChatResultMetaData(previousResponse.result) : undefined;
	const generatedFileUris = editStep?.workingSet
		.filter(entry => entry.state !== WorkingSetEntryState.Initial)
		.map(entry => entry.document.uri) ?? [];
	for (const part of previousResponse?.response ?? []) {
		if (part instanceof ChatResponseTextEditPart && !generatedFileUris.some(uri => isEqual(uri, part.uri))) {
			generatedFileUris.push(part.uri);
		}
	}
	return generatedFileUris;
}

function addResponseSignals(recoveryAttempt: ChatRecoveryAttempt, previousResponse: ChatRecoveryResponseTurn | undefined, request: vscode.ChatRequest, environment: IChatRecoveryEnvironment | undefined): void {
	if (previousResponse?.result.errorDetails) {
		addSignal(recoveryAttempt, ChatRecoverySignal.LastResponseErrored);
	}

	const editStep = previousResponse ? PreviousEditCodeStep.fromChatResultMetaData(previousResponse.result) : undefined;
	const generatedFileUris = getGeneratedFileUris(previousResponse);
	const documentUserDeleted = vscode.workspace?.textDocuments !== undefined && generatedFileUris.some(uri =>
		!vscode.workspace.textDocuments.some(document => isEqual(document.uri, uri))
	);
	if (documentUserDeleted) {
		addSignal(recoveryAttempt, ChatRecoverySignal.DocumentUserDeleted);
	}
	const documentUserRejected = editStep?.workingSet.some(entry => entry.state === WorkingSetEntryState.Rejected) === true || generatedFileUris.some(uri =>
		request.editedFileEvents?.some(event => event.eventKind === vscode.ChatRequestEditedFileEventKind.Undo && isEqual(event.uri, uri)) === true
	);
	if (documentUserRejected) {
		addSignal(recoveryAttempt, ChatRecoverySignal.DocumentUserRejected);
	}
	const documentUserModified = generatedFileUris.some(uri =>
		request.editedFileEvents?.some(event =>
			event.eventKind === vscode.ChatRequestEditedFileEventKind.UserModification && isEqual(event.uri, uri)
		) === true
	);
	if (documentUserModified) {
		addSignal(recoveryAttempt, ChatRecoverySignal.DocumentUserModified);
	}
	const documentGeneratedProblems = generatedFileUris.some(uri =>
		(environment?.getDiagnostics(uri) ?? vscode.languages.getDiagnostics(uri)).some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
	);
	if (documentGeneratedProblems) {
		addSignal(recoveryAttempt, ChatRecoverySignal.DocumentGeneratedProblems);
	}
	const documentHasMergeConflicts = generatedFileUris.some(uri => environment
		? environment.hasMergeConflicts(uri)
		: vscode.workspace.textDocuments.some(document => isEqual(document.uri, uri) && MergeConflictParser.scanDocument(document).length > 0));
	if (documentHasMergeConflicts) {
		addSignal(recoveryAttempt, ChatRecoverySignal.DocumentHasMergeConflicts);
	}
	if (didLastTestRunFail(previousResponse?.result.metadata, generatedFileUris)) {
		addSignal(recoveryAttempt, ChatRecoverySignal.DocumentGeneratedTestsFail);
	}
	if (wasLastPlanReviewRejected(previousResponse?.result.metadata)) {
		addSignal(recoveryAttempt, ChatRecoverySignal.PlanReviewRejected);
	}
}

/**
 * Detects and scores attempts to recover from a previous failed request.
 * Returns recovery details only when the score reaches the recovery threshold.
 */
export function getChatRecoveryAttempt(previousRequest: ChatRequestTurn2 | undefined, previousResponse: ChatRecoveryResponseTurn | undefined, request: vscode.ChatRequest, environment?: IChatRecoveryEnvironment): ChatRecoveryAttempt | undefined {
	if ((!previousRequest && !previousResponse) || request.permissionLevel === 'autopilot' || request.subAgentInvocationId || request.isSystemInitiated) {
		return undefined;
	}

	const recoveryAttempt: ChatRecoveryAttempt = {
		modelId: request.model.id,
		scoringVersion: chatRecoveryScoringVersion,
		totalScore: 0,
	};
	addRequestSignals(recoveryAttempt, previousRequest, request);
	addResponseSignals(recoveryAttempt, previousResponse, request, environment);

	if (recoveryAttempt.totalScore < chatRecoveryScoreThreshold) {
		return undefined;
	}

	return recoveryAttempt;
}
