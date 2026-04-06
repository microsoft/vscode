/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';

// --- Titlebar button interactions ---

export type SessionsInteractionButton =
	| 'newSession'
	| 'runPrimaryTask'
	| 'addTask'
	| 'generateNewTask'
	| 'openTerminal'
	| 'openInVSCode';

type SessionsInteractionEvent = {
	button: string;
};

type SessionsInteractionClassification = {
	owner: 'osortega';
	comment: 'Tracks user interactions with buttons in the Agents window';
	button: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the button that was clicked' };
};

/**
 * Log a titlebar button interaction in the Agents window.
 */
export function logSessionsInteraction(telemetryService: ITelemetryService, button: SessionsInteractionButton): void {
	telemetryService.publicLog2<SessionsInteractionEvent, SessionsInteractionClassification>('vscodeAgents.interaction', { button });
}

// --- Changes panel interactions ---

type ChangesViewTogglePanelEvent = {
	visible: boolean;
};

type ChangesViewTogglePanelClassification = {
	owner: 'osortega';
	comment: 'Tracks when the user toggles the Changes panel open or closed.';
	visible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the Changes panel is now visible.' };
};

export function logChangesViewToggle(telemetryService: ITelemetryService, visible: boolean): void {
	telemetryService.publicLog2<ChangesViewTogglePanelEvent, ChangesViewTogglePanelClassification>('vscodeAgents.changesView/togglePanel', { visible });
}

type ChangesViewVersionModeChangeEvent = {
	mode: string;
};

type ChangesViewVersionModeChangeClassification = {
	owner: 'osortega';
	comment: 'Tracks when the user switches the version mode in the Changes panel (Branch Changes, All Changes, Last Turn).';
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The version mode selected by the user.' };
};

export function logChangesViewVersionModeChange(telemetryService: ITelemetryService, mode: string): void {
	telemetryService.publicLog2<ChangesViewVersionModeChangeEvent, ChangesViewVersionModeChangeClassification>('vscodeAgents.changesView/versionModeChange', { mode });
}

type ChangesViewFileSelectEvent = {
	changeType: string;
};

type ChangesViewFileSelectClassification = {
	owner: 'osortega';
	comment: 'Tracks when the user selects a changed file in the Changes panel.';
	changeType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The type of change (added, modified, deleted).' };
};

export function logChangesViewFileSelect(telemetryService: ITelemetryService, changeType: string): void {
	telemetryService.publicLog2<ChangesViewFileSelectEvent, ChangesViewFileSelectClassification>('vscodeAgents.changesView/fileSelect', { changeType });
}

type ChangesViewViewModeChangeEvent = {
	mode: string;
};

type ChangesViewViewModeChangeClassification = {
	owner: 'osortega';
	comment: 'Tracks when the user switches between list and tree view modes in the Changes panel.';
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The view mode selected by the user (list or tree).' };
};

export function logChangesViewViewModeChange(telemetryService: ITelemetryService, mode: string): void {
	telemetryService.publicLog2<ChangesViewViewModeChangeEvent, ChangesViewViewModeChangeClassification>('vscodeAgents.changesView/viewModeChange', { mode });
}

type ChangesViewReviewCommentAddedEvent = {
	hasExistingFeedback: boolean;
	hasSuggestion: boolean;
	isFromPRReview: boolean;
};

type ChangesViewReviewCommentAddedClassification = {
	owner: 'osortega';
	comment: 'Tracks when a user adds a review comment (feedback) to a file in the Changes panel.';
	hasExistingFeedback: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether there was already feedback on this file.' };
	hasSuggestion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the feedback includes a code suggestion.' };
	isFromPRReview: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the feedback was converted from a PR review comment.' };
};

export function logChangesViewReviewCommentAdded(telemetryService: ITelemetryService, data: { hasExistingFeedback: boolean; hasSuggestion: boolean; isFromPRReview: boolean }): void {
	telemetryService.publicLog2<ChangesViewReviewCommentAddedEvent, ChangesViewReviewCommentAddedClassification>('vscodeAgents.changesView/reviewCommentAdded', data);
}
