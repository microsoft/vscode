/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { computeLevenshteinDistance } from '../../../util/vs/base/common/diff/diff';
import { isEqual } from '../../../util/vs/base/common/resources';
import { ChatRequestTurn2, ChatResponseTurn } from '../../../vscodeTypes';
import { MergeConflictParser } from '../../git/vscode/mergeConflictParser';
import { PreviousEditCodeStep } from '../../intents/node/editCodeStep';
import { WorkingSetEntryState } from '../../prompt/common/intents';

export function arePromptsSimilar(previousPrompt: string, currentPrompt: string): boolean {
	const normalizedPreviousPrompt = previousPrompt.trim().replace(/\s+/g, ' ').toLowerCase();
	const normalizedCurrentPrompt = currentPrompt.trim().replace(/\s+/g, ' ').toLowerCase();
	if (!normalizedPreviousPrompt || !normalizedCurrentPrompt) {
		return false;
	}
	const maximumLength = Math.max(normalizedPreviousPrompt.length, normalizedCurrentPrompt.length);
	const similarity = 1 - computeLevenshteinDistance(normalizedPreviousPrompt, normalizedCurrentPrompt) / maximumLength;

	return similarity >= 0.8;
}

/**
 * Determines whether the current chat request is an attempt to recover from a previous failed request.
 */
export function isChatRecoveryAttempt(previousRequest: ChatRequestTurn2 | undefined, previousResponse: ChatResponseTurn | undefined, request: vscode.ChatRequest): boolean {
	if ((!previousRequest && !previousResponse) || request.permissionLevel === 'autopilot' || request.subAgentInvocationId || request.isSystemInitiated) {
		return false;
	}
	// If the request is a rerun, it is a recovery attempt.
	if (request.attempt > 0) {
		return true;
	}
	// Editing and resubmitting a prompt strongly indicates that the prior request needed correction.
	if (request.editedRequestId) {
		return true;
	}
	// If the previous request was another model
	if (previousRequest?.modelId && previousRequest.modelId !== request.model.id) {
		return true;
	}
	// A substantially repeated prompt suggests that the previous response did not resolve it.
	if (previousRequest && arePromptsSimilar(previousRequest.prompt, request.prompt)) {
		return true;
	}
	// If the previous response had an error, it is likely that the user is attempting to recover from it.
	if (previousResponse?.result.errorDetails) {
		return true;
	}
	// If the previous response was not an expected error, it is likely that the user is attempting to recover from it.
	const previousFailure = previousResponse?.result.errorDetails?.isExpectedError === false;
	if (previousFailure) {
		return true;
	}
	const editStep = previousResponse ? PreviousEditCodeStep.fromChatResultMetaData(previousResponse.result) : undefined;
	const changedFiles = editStep?.workingSet.filter(entry => entry.state !== WorkingSetEntryState.Initial) ?? [];
	// All files were rejected or modified, which strongly suggests that the previous request was not successful.
	const allChangedFilesRejectedOrModified = changedFiles.length > 0 && changedFiles.every(entry =>
		request.editedFileEvents?.some(event =>
			(event.eventKind === vscode.ChatRequestEditedFileEventKind.Undo || event.eventKind === vscode.ChatRequestEditedFileEventKind.UserModification)
			&& isEqual(event.uri, entry.document.uri)
		) === true
	);
	if (allChangedFilesRejectedOrModified) {
		return true;
	}
	// Files have bad diagnostics
	const someFilesHaveBadDiagnostics = changedFiles.some(entry =>
		vscode.languages.getDiagnostics(entry.document.uri).some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
	);
	if (someFilesHaveBadDiagnostics) {
		return true;
	}
	// Files have merge conflicts
	const someFilesHaveMergeConflicts = changedFiles.some(entry => {
		const document = vscode.workspace.textDocuments.find(document => isEqual(document.uri, entry.document.uri));
		return document !== undefined && MergeConflictParser.scanDocument(document).length > 0;
	});
	if (someFilesHaveMergeConflicts) {
		return true;
	}
	return false;
}
