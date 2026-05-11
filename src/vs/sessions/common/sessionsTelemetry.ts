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
	| 'openInVSCode'
	| 'openForwardedPort';

export type SessionsInteractionSource = 'menu' | 'actionWidget';

type SessionsInteractionEvent = {
	button: string;
	source?: string;
};

type SessionsInteractionClassification = {
	owner: 'osortega';
	comment: 'Tracks user interactions with buttons in the Agents window';
	button: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the button that was clicked' };
	source?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The UI surface that triggered the interaction (menu or actionWidget)' };
};

/**
 * Log a titlebar button interaction in the Agents window.
 */
export function logSessionsInteraction(telemetryService: ITelemetryService, button: SessionsInteractionButton, source?: SessionsInteractionSource): void {
	telemetryService.publicLog2<SessionsInteractionEvent, SessionsInteractionClassification>('vscodeAgents.interaction', source ? { button, source } : { button });
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

// --- Tunnel agent host connect ---

export type TunnelConnectErrorCategory =
	| 'relayConnectionFailed'
	| 'auth'
	| 'authExpired'
	| 'network'
	| 'other';

export type TunnelConnectFailureReason =
	| 'hostOffline'
	| 'maxAttemptsReached'
	| 'auth'
	| 'authExpired';

type TunnelConnectAttemptEvent = {
	isReconnect: boolean;
	attempt: number;
	durationMs: number;
	success: boolean;
	errorCategory: string;
};

type TunnelConnectAttemptClassification = {
	owner: 'osortega';
	comment: 'Tracks individual agent-host tunnel connect attempts for performance and reliability.';
	isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether this attempt was part of a reconnect cycle (true) or an initial connect (false).' };
	attempt: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Attempt number within the current connect session (1-based).' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of this individual attempt in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this individual attempt succeeded.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Category of error when the attempt failed (relayConnectionFailed, auth, authExpired, network, other); empty on success.' };
};

export function logTunnelConnectAttempt(telemetryService: ITelemetryService, data: { isReconnect: boolean; attempt: number; durationMs: number; success: boolean; errorCategory?: TunnelConnectErrorCategory }): void {
	telemetryService.publicLog2<TunnelConnectAttemptEvent, TunnelConnectAttemptClassification>('vscodeAgents.tunnelConnect/attempt', {
		isReconnect: data.isReconnect,
		attempt: data.attempt,
		durationMs: data.durationMs,
		success: data.success,
		errorCategory: data.errorCategory ?? '',
	});
}

type TunnelConnectResolvedEvent = {
	isReconnect: boolean;
	totalAttempts: number;
	totalDurationMs: number;
	success: boolean;
	failureReason: string;
};

type TunnelConnectResolvedClassification = {
	owner: 'osortega';
	comment: 'Tracks overall agent-host tunnel connect session outcomes for reliability.';
	isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the resolved session was a reconnect cycle (true) or an initial connect (false).' };
	totalAttempts: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total number of attempts made before resolution.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total elapsed time from session start to resolution in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the connect session ultimately succeeded.' };
	failureReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Reason the session terminated without connecting (hostOffline, maxAttemptsReached, auth, authExpired); empty on success.' };
};

export function logTunnelConnectResolved(telemetryService: ITelemetryService, data: { isReconnect: boolean; totalAttempts: number; totalDurationMs: number; success: boolean; failureReason?: TunnelConnectFailureReason }): void {
	telemetryService.publicLog2<TunnelConnectResolvedEvent, TunnelConnectResolvedClassification>('vscodeAgents.tunnelConnect/resolved', {
		isReconnect: data.isReconnect,
		totalAttempts: data.totalAttempts,
		totalDurationMs: data.totalDurationMs,
		success: data.success,
		failureReason: data.failureReason ?? '',
	});
}

// --- Socket lifecycle telemetry ---

export type SocketCloseTrigger =
	| 'server'
	| 'sendOnDeadSocket'
	| 'visibility'
	| 'offline'
	| 'malformedFrames'
	| 'disposed'
	| 'error';

type SocketCloseEvent = {
	closeCode: number;
	wasClean: boolean;
	lifetimeMs: number;
	messagesSent: number;
	messagesReceived: number;
	messagesDropped: number;
	trigger: string;
};

type SocketCloseClassification = {
	owner: 'osortega';
	comment: 'Tracks WebSocket close events for agent host connections to measure connection reliability.';
	closeCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'WebSocket close code.' };
	wasClean: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the close was clean.' };
	lifetimeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How long the socket was alive in milliseconds.' };
	messagesSent: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total messages sent.' };
	messagesReceived: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total messages received.' };
	messagesDropped: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total messages dropped due to non-OPEN socket.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'What triggered the close (server, sendOnDeadSocket, visibility, offline, malformedFrames, disposed, error).' };
};

export function logSocketClose(telemetryService: ITelemetryService, data: { closeCode: number; wasClean: boolean; lifetimeMs: number; messagesSent: number; messagesReceived: number; messagesDropped: number; trigger: SocketCloseTrigger }): void {
	telemetryService.publicLog2<SocketCloseEvent, SocketCloseClassification>('vscodeAgents.socket/close', data);
}

// --- Send dropped telemetry ---

type SendDroppedEvent = {
	readyState: number;
	timeSinceLastReceiveMs: number;
	timeSinceLastSendMs: number;
};

type SendDroppedClassification = {
	owner: 'osortega';
	comment: 'Tracks when a message is silently dropped due to a non-OPEN WebSocket, indicating a zombie socket.';
	readyState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'WebSocket readyState at drop time (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED).' };
	timeSinceLastReceiveMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds since last received message.' };
	timeSinceLastSendMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds since last sent message.' };
};

export function logSendDropped(telemetryService: ITelemetryService, data: { readyState: number; timeSinceLastReceiveMs: number; timeSinceLastSendMs: number }): void {
	telemetryService.publicLog2<SendDroppedEvent, SendDroppedClassification>('vscodeAgents.socket/sendDropped', data);
}

// --- Visibility resumed telemetry ---

type VisibilityResumedEvent = {
	hiddenDurationMs: number;
	socketAlive: boolean;
	forceClosed: boolean;
};

type VisibilityResumedClassification = {
	owner: 'osortega';
	comment: 'Tracks tab visibility resume events to measure zombie socket detection effectiveness.';
	hiddenDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How long the tab was hidden in milliseconds.' };
	socketAlive: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the socket was alive after zombie detection check.' };
	forceClosed: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the socket was force-closed on resume.' };
};

export function logVisibilityResumed(telemetryService: ITelemetryService, data: { hiddenDurationMs: number; socketAlive: boolean; forceClosed: boolean }): void {
	telemetryService.publicLog2<VisibilityResumedEvent, VisibilityResumedClassification>('vscodeAgents.socket/visibilityResumed', data);
}

// --- Terminal recovery telemetry ---

type TerminalRecoveryEvent = {
	recoveredCount: number;
	totalCount: number;
};

type TerminalRecoveryClassification = {
	owner: 'osortega';
	comment: 'Tracks terminal reconnection outcomes after agent host disconnect.';
	recoveredCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of terminals successfully reconnected.' };
	totalCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total number of active terminals at reconnect time.' };
};

export function logTerminalRecovery(telemetryService: ITelemetryService, data: { recoveredCount: number; totalCount: number }): void {
	telemetryService.publicLog2<TerminalRecoveryEvent, TerminalRecoveryClassification>('vscodeAgents.terminal/recovery', data);
}
