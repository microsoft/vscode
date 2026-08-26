/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { computeLevenshteinDistance } from '../../../util/vs/base/common/diff/diff';
import { isEqual } from '../../../util/vs/base/common/resources';
import { ChatRequestTurn, ChatRequestTurn2, ChatResponseTurn } from '../../../vscodeTypes';
import { PreviousEditCodeStep } from '../../intents/node/editCodeStep';
import { WorkingSetEntryState } from '../../prompt/common/intents';

export function arePromptsSimilar(previousPrompt: string, currentPrompt: string): boolean {
	const normalizedPreviousPrompt = previousPrompt.toLowerCase();
	const normalizedCurrentPrompt = currentPrompt.toLowerCase();
	const maximumLength = Math.max(normalizedPreviousPrompt.length, normalizedCurrentPrompt.length);
	const similarity = maximumLength === 0
		? 1
		: 1 - computeLevenshteinDistance(normalizedPreviousPrompt, normalizedCurrentPrompt) / maximumLength;

	return similarity >= 0.8;
}

/**
 * Determines whether the current chat request is an attempt to recover from a previous failed request.
 */
export function isChatRecoveryAttempt(request: vscode.ChatRequest, context: vscode.ChatContext): boolean {
	// Autopilot can revise its own trajectory without the user attempting a recovery.
	if (request.permissionLevel === 'autopilot') {
		return false;
	}

	const sentRequests = context.history.filter((turn): turn is ChatRequestTurn2 => turn instanceof ChatRequestTurn);
	const previousRequest = sentRequests.at(-1);
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

	const sentResponses = context.history.filter((turn): turn is ChatResponseTurn => turn instanceof ChatResponseTurn);
	const previousResponse = sentResponses.at(-1);
	const editStep = previousResponse ? PreviousEditCodeStep.fromChatResultMetaData(previousResponse.result) : undefined;
	const changedFiles = editStep?.workingSet.filter(entry => entry.state !== WorkingSetEntryState.Initial) ?? [];
	// All files were rejected or modified, which strongly suggests that the previous request was not successful.
	const allFilesRejected = changedFiles.length > 0 && changedFiles.every(entry =>
		request.editedFileEvents?.some(event =>
			event.eventKind !== vscode.ChatRequestEditedFileEventKind.Keep && isEqual(event.uri, entry.document.uri)
		) === true
	);
	if (allFilesRejected) {
		return true;
	}
	// Files have bad diagnostics
	const someFilesHaveBadDiagnostics = changedFiles.some(entry =>
		vscode.languages.getDiagnostics(entry.document.uri).some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
	);
	if (someFilesHaveBadDiagnostics) {
		return true;
	}
	return false;
}
