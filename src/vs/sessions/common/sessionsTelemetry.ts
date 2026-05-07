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
	tunnelSessionId: string;
};

type TunnelConnectAttemptClassification = {
	owner: 'osortega';
	comment: 'Tracks individual agent-host tunnel connect attempts for performance and reliability.';
	isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether this attempt was part of a reconnect cycle (true) or an initial connect (false).' };
	attempt: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Attempt number within the current connect session (1-based).' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of this individual attempt in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this individual attempt succeeded.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Category of error when the attempt failed (relayConnectionFailed, auth, authExpired, network, other); empty on success.' };
	tunnelSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Stable identifier for the tunnel session, generated browser-side; used to join with vscode-dev tunnelRelay events. Empty when unavailable.' };
};

export function logTunnelConnectAttempt(telemetryService: ITelemetryService, data: { isReconnect: boolean; attempt: number; durationMs: number; success: boolean; errorCategory?: TunnelConnectErrorCategory; tunnelSessionId?: string }): void {
	telemetryService.publicLog2<TunnelConnectAttemptEvent, TunnelConnectAttemptClassification>('vscodeAgents.tunnelConnect/attempt', {
		isReconnect: data.isReconnect,
		attempt: data.attempt,
		durationMs: data.durationMs,
		success: data.success,
		errorCategory: data.errorCategory ?? '',
		tunnelSessionId: data.tunnelSessionId ?? '',
	});
}

type TunnelConnectResolvedEvent = {
	isReconnect: boolean;
	totalAttempts: number;
	totalDurationMs: number;
	success: boolean;
	failureReason: string;
	tunnelSessionId: string;
};

type TunnelConnectResolvedClassification = {
	owner: 'osortega';
	comment: 'Tracks overall agent-host tunnel connect session outcomes for reliability.';
	isReconnect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the resolved session was a reconnect cycle (true) or an initial connect (false).' };
	totalAttempts: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total number of attempts made before resolution.' };
	totalDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total elapsed time from session start to resolution in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the connect session ultimately succeeded.' };
	failureReason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Reason the session terminated without connecting (hostOffline, maxAttemptsReached, auth, authExpired); empty on success.' };
	tunnelSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Stable identifier for the tunnel session, generated browser-side; used to join with vscode-dev tunnelRelay events. Empty when unavailable.' };
};

export function logTunnelConnectResolved(telemetryService: ITelemetryService, data: { isReconnect: boolean; totalAttempts: number; totalDurationMs: number; success: boolean; failureReason?: TunnelConnectFailureReason; tunnelSessionId?: string }): void {
	telemetryService.publicLog2<TunnelConnectResolvedEvent, TunnelConnectResolvedClassification>('vscodeAgents.tunnelConnect/resolved', {
		isReconnect: data.isReconnect,
		totalAttempts: data.totalAttempts,
		totalDurationMs: data.totalDurationMs,
		success: data.success,
		failureReason: data.failureReason ?? '',
		tunnelSessionId: data.tunnelSessionId ?? '',
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
	tunnelSessionId: string;
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
	tunnelSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Stable identifier for the tunnel session, generated browser-side; used to join with vscode-dev tunnelRelay events. Empty when unavailable.' };
};

export function logSocketClose(telemetryService: ITelemetryService, data: { closeCode: number; wasClean: boolean; lifetimeMs: number; messagesSent: number; messagesReceived: number; messagesDropped: number; trigger: SocketCloseTrigger; tunnelSessionId?: string }): void {
	telemetryService.publicLog2<SocketCloseEvent, SocketCloseClassification>('vscodeAgents.socket/close', {
		closeCode: data.closeCode,
		wasClean: data.wasClean,
		lifetimeMs: data.lifetimeMs,
		messagesSent: data.messagesSent,
		messagesReceived: data.messagesReceived,
		messagesDropped: data.messagesDropped,
		trigger: data.trigger,
		tunnelSessionId: data.tunnelSessionId ?? '',
	});
}

// --- Send dropped telemetry ---

type SendDroppedEvent = {
	readyState: number;
	timeSinceLastReceiveMs: number;
	timeSinceLastSendMs: number;
	tunnelSessionId: string;
};

type SendDroppedClassification = {
	owner: 'osortega';
	comment: 'Tracks when a message is silently dropped due to a non-OPEN WebSocket, indicating a zombie socket.';
	readyState: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'WebSocket readyState at drop time (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED).' };
	timeSinceLastReceiveMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds since last received message.' };
	timeSinceLastSendMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds since last sent message.' };
	tunnelSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Stable identifier for the tunnel session, generated browser-side; used to join with vscode-dev tunnelRelay events. Empty when unavailable.' };
};

export function logSendDropped(telemetryService: ITelemetryService, data: { readyState: number; timeSinceLastReceiveMs: number; timeSinceLastSendMs: number; tunnelSessionId?: string }): void {
	telemetryService.publicLog2<SendDroppedEvent, SendDroppedClassification>('vscodeAgents.socket/sendDropped', {
		readyState: data.readyState,
		timeSinceLastReceiveMs: data.timeSinceLastReceiveMs,
		timeSinceLastSendMs: data.timeSinceLastSendMs,
		tunnelSessionId: data.tunnelSessionId ?? '',
	});
}

// --- Visibility resumed telemetry ---

type VisibilityResumedEvent = {
	hiddenDurationMs: number;
	socketAlive: boolean;
	forceClosed: boolean;
	tunnelSessionId: string;
};

type VisibilityResumedClassification = {
	owner: 'osortega';
	comment: 'Tracks tab visibility resume events to measure zombie socket detection effectiveness.';
	hiddenDurationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How long the tab was hidden in milliseconds.' };
	socketAlive: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the socket was alive after zombie detection check.' };
	forceClosed: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the socket was force-closed on resume.' };
	tunnelSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Stable identifier for the tunnel session, generated browser-side; used to join with vscode-dev tunnelRelay events. Empty when unavailable.' };
};

export function logVisibilityResumed(telemetryService: ITelemetryService, data: { hiddenDurationMs: number; socketAlive: boolean; forceClosed: boolean; tunnelSessionId?: string }): void {
	telemetryService.publicLog2<VisibilityResumedEvent, VisibilityResumedClassification>('vscodeAgents.socket/visibilityResumed', {
		hiddenDurationMs: data.hiddenDurationMs,
		socketAlive: data.socketAlive,
		forceClosed: data.forceClosed,
		tunnelSessionId: data.tunnelSessionId ?? '',
	});
}

// --- Terminal recovery telemetry ---

type TerminalRecoveryEvent = {
	recoveredCount: number;
	totalCount: number;
	tunnelSessionId: string;
};

type TerminalRecoveryClassification = {
	owner: 'osortega';
	comment: 'Tracks terminal reconnection outcomes after agent host disconnect.';
	recoveredCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of terminals successfully reconnected.' };
	totalCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total number of active terminals at reconnect time.' };
	tunnelSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Stable identifier for the tunnel session, generated browser-side; used to join with vscode-dev tunnelRelay events. Empty when unavailable.' };
};

export function logTerminalRecovery(telemetryService: ITelemetryService, data: { recoveredCount: number; totalCount: number; tunnelSessionId?: string }): void {
	telemetryService.publicLog2<TerminalRecoveryEvent, TerminalRecoveryClassification>('vscodeAgents.terminal/recovery', {
		recoveredCount: data.recoveredCount,
		totalCount: data.totalCount,
		tunnelSessionId: data.tunnelSessionId ?? '',
	});
}

// --- Session lifecycle (usage) ---

type SessionCreatedEvent = {
	providerId: string;
	sessionType: string;
	source: string;
	isWorkspace: boolean;
};

type SessionCreatedClassification = {
	owner: 'osortega';
	comment: 'Tracks Agents session creation events.';
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Identifier of the sessions provider that owns the session (e.g. local, remote-agent-host).' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Provider-defined session type identifier.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the session was created: newSession | addTask | generateNewTask | restored.' };
	isWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the session is a workspace agent session.' };
};

export function logSessionCreated(telemetryService: ITelemetryService, data: { providerId: string; sessionType: string; source: 'newSession' | 'addTask' | 'generateNewTask' | 'restored'; isWorkspace: boolean }): void {
	telemetryService.publicLog2<SessionCreatedEvent, SessionCreatedClassification>('vscodeAgents.session/created', data);
}

// --- Chat (usage + perf) ---

export type ChatMode = 'agent' | 'edit' | 'ask';

type ChatResponseReceivedEvent = {
	providerId: string;
	durationMs: number;
	success: boolean;
	errorCategory: string;
	toolCallCount: number;
	hadConfirmation: boolean;
	streamFirstChunkMs: number;
	streamTotalMs: number;
	toolRoundTripMs: number;
};

type ChatResponseReceivedClassification = {
	owner: 'osortega';
	comment: 'Tracks chat responses received in the Agents window. Never includes response content.';
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Identifier of the sessions provider.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total wall-clock duration from request send to final response in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the response completed successfully.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category when success is false; empty string on success.' };
	toolCallCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of tool calls executed during the response.' };
	hadConfirmation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the response required a user confirmation step.' };
	streamFirstChunkMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from request send to first streamed chunk.' };
	streamTotalMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total streaming duration in milliseconds.' };
	toolRoundTripMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total milliseconds spent waiting on tool calls during the response.' };
};

export function logChatResponseReceived(telemetryService: ITelemetryService, data: { providerId: string; durationMs: number; success: boolean; errorCategory?: string; toolCallCount: number; hadConfirmation: boolean; streamFirstChunkMs?: number; streamTotalMs?: number; toolRoundTripMs?: number }): void {
	telemetryService.publicLog2<ChatResponseReceivedEvent, ChatResponseReceivedClassification>('vscodeAgents.chat/responseReceived', {
		providerId: data.providerId,
		durationMs: data.durationMs,
		success: data.success,
		errorCategory: data.errorCategory ?? '',
		toolCallCount: data.toolCallCount,
		hadConfirmation: data.hadConfirmation,
		streamFirstChunkMs: data.streamFirstChunkMs ?? 0,
		streamTotalMs: data.streamTotalMs ?? 0,
		toolRoundTripMs: data.toolRoundTripMs ?? 0,
	});
}

// --- Feedback and Code Review (usage) ---

type AgentFeedbackSubmittedEvent = {
	rating: string;
	hasComment: boolean;
	surface: string;
};

type AgentFeedbackSubmittedClassification = {
	owner: 'osortega';
	comment: 'Tracks user-submitted agent feedback. Never includes the comment text.';
	rating: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Thumbs rating: up | down.' };
	hasComment: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the feedback included a free-form comment.' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'UI surface from which feedback was submitted.' };
};

export function logAgentFeedbackSubmitted(telemetryService: ITelemetryService, data: { rating: 'up' | 'down'; hasComment: boolean; surface: string }): void {
	telemetryService.publicLog2<AgentFeedbackSubmittedEvent, AgentFeedbackSubmittedClassification>('vscodeAgents.agentFeedback/submitted', data);
}

type CodeReviewCommentAddedEvent = {
	source: string;
	hasSuggestion: boolean;
};

type CodeReviewCommentAddedClassification = {
	owner: 'osortega';
	comment: 'Tracks code review comments added by the user.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the comment was added.' };
	hasSuggestion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the comment includes a code suggestion.' };
};

export function logCodeReviewCommentAdded(telemetryService: ITelemetryService, data: { source: string; hasSuggestion: boolean }): void {
	telemetryService.publicLog2<CodeReviewCommentAddedEvent, CodeReviewCommentAddedClassification>('vscodeAgents.codeReview/commentAdded', data);
}

// --- Browser view ---

type BrowserViewEvent = {
	source: string;
	isInternal: boolean;
};

type BrowserViewOpenedClassification = {
	owner: 'osortega';
	comment: 'Tracks when the Agents browser view is opened.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the browser view was opened.' };
	isInternal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the URL is internal (e.g. tunnel-hosted).' };
};

export function logBrowserViewOpened(telemetryService: ITelemetryService, data: { source: string; isInternal: boolean }): void {
	telemetryService.publicLog2<BrowserViewEvent, BrowserViewOpenedClassification>('vscodeAgents.browserView/opened', data);
}

type BrowserViewNavigatedClassification = {
	owner: 'osortega';
	comment: 'Tracks navigation events inside the Agents browser view. Never includes the URL.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the navigation was triggered.' };
	isInternal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the destination is internal (e.g. tunnel-hosted).' };
};

export function logBrowserViewNavigated(telemetryService: ITelemetryService, data: { source: string; isInternal: boolean }): void {
	telemetryService.publicLog2<BrowserViewEvent, BrowserViewNavigatedClassification>('vscodeAgents.browserView/navigated', data);
}

// --- File tree, working set, AI customization ---

type FileTreeViewOpenedEvent = {
	source: string;
};

type FileTreeViewOpenedClassification = {
	owner: 'osortega';
	comment: 'Tracks when the Agents file tree view is opened.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the file tree view was opened.' };
};

export function logFileTreeViewOpened(telemetryService: ITelemetryService, data: { source: string }): void {
	telemetryService.publicLog2<FileTreeViewOpenedEvent, FileTreeViewOpenedClassification>('vscodeAgents.fileTreeView/opened', data);
}

type WorkingSetItemAddedEvent = {
	kind: string;
	source: string;
};

type WorkingSetItemAddedClassification = {
	owner: 'osortega';
	comment: 'Tracks items added to the working set. Never includes the resource path.';
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum kind of working set item (file, symbol, selection, etc.).' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the item was added.' };
};

export function logWorkingSetItemAdded(telemetryService: ITelemetryService, data: { kind: string; source: string }): void {
	telemetryService.publicLog2<WorkingSetItemAddedEvent, WorkingSetItemAddedClassification>('vscodeAgents.workingSet/itemAdded', data);
}

type AiCustomizationTreeActionEvent = {
	action: string;
	kind: string;
};

type AiCustomizationTreeActionClassification = {
	owner: 'osortega';
	comment: 'Tracks user actions on the AI Customization tree view.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum action identifier (open, edit, delete, refresh, etc.).' };
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum kind of customization (instruction, prompt, agent, skill, hook, mcp, etc.).' };
};

export function logAiCustomizationTreeAction(telemetryService: ITelemetryService, data: { action: string; kind: string }): void {
	telemetryService.publicLog2<AiCustomizationTreeActionEvent, AiCustomizationTreeActionClassification>('vscodeAgents.aiCustomization/treeAction', data);
}

// --- Policy blocked ---

type PolicyBlockedShownEvent = {
	policyId: string;
	surface: string;
};

type PolicyBlockedShownClassification = {
	owner: 'osortega';
	comment: 'Tracks impressions of policy-blocked UI in the Agents window.';
	policyId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Identifier of the policy that blocked the action.' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum surface where the block was shown.' };
};

export function logPolicyBlockedShown(telemetryService: ITelemetryService, data: { policyId: string; surface: string }): void {
	telemetryService.publicLog2<PolicyBlockedShownEvent, PolicyBlockedShownClassification>('vscodeAgents.policyBlocked/shown', data);
}

// --- Apply commits to parent repo ---

type ApplyCommitsStartedEvent = {
	commitCount: number;
};

type ApplyCommitsStartedClassification = {
	owner: 'osortega';
	comment: 'Tracks when a user starts applying commits to the parent repo.';
	commitCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of commits to apply.' };
};

export function logApplyCommitsStarted(telemetryService: ITelemetryService, data: { commitCount: number }): void {
	telemetryService.publicLog2<ApplyCommitsStartedEvent, ApplyCommitsStartedClassification>('vscodeAgents.applyCommits/started', data);
}

type ApplyCommitsResolvedEvent = {
	commitCount: number;
	success: boolean;
	errorCategory: string;
};

type ApplyCommitsResolvedClassification = {
	owner: 'osortega';
	comment: 'Tracks the outcome of applying commits to the parent repo.';
	commitCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of commits in the operation.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the operation completed successfully.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category on failure; empty on success.' };
};

export function logApplyCommitsResolved(telemetryService: ITelemetryService, data: { commitCount: number; success: boolean; errorCategory?: string }): void {
	telemetryService.publicLog2<ApplyCommitsResolvedEvent, ApplyCommitsResolvedClassification>('vscodeAgents.applyCommits/resolved', {
		commitCount: data.commitCount,
		success: data.success,
		errorCategory: data.errorCategory ?? '',
	});
}

// --- GitHub integration, layout, openInVSCode ---

type GithubPRActionEvent = {
	action: string;
};

type GithubPRActionClassification = {
	owner: 'osortega';
	comment: 'Tracks GitHub pull request actions invoked from the Agents window.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum action: open | review | merge | close.' };
};

export function logGithubPRAction(telemetryService: ITelemetryService, data: { action: 'open' | 'review' | 'merge' | 'close' }): void {
	telemetryService.publicLog2<GithubPRActionEvent, GithubPRActionClassification>('vscodeAgents.github/prAction', data);
}

type LayoutModeChangeEvent = {
	mode: string;
	trigger: string;
};

type LayoutModeChangeClassification = {
	owner: 'osortega';
	comment: 'Tracks Agents window layout mode changes.';
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum layout mode: desktop | mobile | modal.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum trigger that caused the layout change.' };
};

export function logLayoutModeChange(telemetryService: ITelemetryService, data: { mode: 'desktop' | 'mobile' | 'modal'; trigger: string }): void {
	telemetryService.publicLog2<LayoutModeChangeEvent, LayoutModeChangeClassification>('vscodeAgents.layout/modeChange', data);
}

type OpenInVSCodeOutcomeEvent = {
	outcome: string;
};

type OpenInVSCodeOutcomeClassification = {
	owner: 'osortega';
	comment: 'Tracks the outcome of "Open in VS Code" actions from the Agents window.';
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum outcome: launched | fallback | failed.' };
};

export function logOpenInVSCodeOutcome(telemetryService: ITelemetryService, data: { outcome: 'launched' | 'fallback' | 'failed' }): void {
	telemetryService.publicLog2<OpenInVSCodeOutcomeEvent, OpenInVSCodeOutcomeClassification>('vscodeAgents.openInVSCode/outcome', data);
}

// --- Reliability (errors) ---

type SessionErrorEvent = {
	providerId: string;
	area: string;
	errorCategory: string;
	errorMessage: string;
};

type SessionErrorClassification = {
	owner: 'osortega';
	comment: 'Tracks session-level errors in the Agents window.';
	providerId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier of the sessions provider.' };
	area: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum area of the error: load | save | restore | send | cancel.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error message text. May contain stack-trace fragments.' };
};

export function logSessionError(telemetryService: ITelemetryService, data: { providerId: string; area: 'load' | 'save' | 'restore' | 'send' | 'cancel'; errorCategory: string; errorMessage: string }): void {
	telemetryService.publicLogError2<SessionErrorEvent, SessionErrorClassification>('vscodeAgents.session/error', data);
}

type ChatErrorEvent = {
	providerId: string;
	phase: string;
	errorCategory: string;
	errorMessage: string;
	durationMs: number;
};

type ChatErrorClassification = {
	owner: 'osortega';
	comment: 'Tracks chat-level errors in the Agents window.';
	providerId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier of the sessions provider.' };
	phase: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum phase: request | stream | tool.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error message text. May contain stack-trace fragments.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock duration up to the failure in milliseconds.' };
};

export function logChatError(telemetryService: ITelemetryService, data: { providerId: string; phase: 'request' | 'stream' | 'tool'; errorCategory: string; errorMessage: string; durationMs: number }): void {
	telemetryService.publicLogError2<ChatErrorEvent, ChatErrorClassification>('vscodeAgents.chat/error', data);
}

type TunnelHostConnectEvent = {
	success: boolean;
	errorCategory: string;
	durationMs: number;
};

type TunnelHostConnectClassification = {
	owner: 'osortega';
	comment: 'Tracks the outcome of local desktop tunnel-host connect operations.';
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the connect succeeded.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category on failure; empty on success.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock connect duration in milliseconds.' };
};

export function logTunnelHostConnect(telemetryService: ITelemetryService, data: { success: boolean; errorCategory?: string; durationMs: number }): void {
	telemetryService.publicLog2<TunnelHostConnectEvent, TunnelHostConnectClassification>('vscodeAgents.tunnelHost/connect', {
		success: data.success,
		errorCategory: data.errorCategory ?? '',
		durationMs: data.durationMs,
	});
}

type RemoteAgentHostConnectEvent = {
	providerId: string;
	success: boolean;
	errorCategory: string;
	durationMs: number;
};

type RemoteAgentHostConnectClassification = {
	owner: 'osortega';
	comment: 'Tracks the outcome of remote agent host connect operations (the higher-level service wiring above the tunnel layer).';
	providerId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier of the sessions provider.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the connect succeeded.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category on failure; empty on success.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock connect duration in milliseconds.' };
};

export function logRemoteAgentHostConnect(telemetryService: ITelemetryService, data: { providerId: string; success: boolean; errorCategory?: string; durationMs: number }): void {
	telemetryService.publicLog2<RemoteAgentHostConnectEvent, RemoteAgentHostConnectClassification>('vscodeAgents.remoteAgentHost/connect', {
		providerId: data.providerId,
		success: data.success,
		errorCategory: data.errorCategory ?? '',
		durationMs: data.durationMs,
	});
}

type TerminalRecoveryFailedEvent = {
	totalCount: number;
	recoveredCount: number;
	errorCategory: string;
};

type TerminalRecoveryFailedClassification = {
	owner: 'osortega';
	comment: 'Tracks terminal recovery sessions where one or more terminals failed to reconnect.';
	totalCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total number of active terminals at reconnect time.' };
	recoveredCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of terminals successfully reconnected.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category that caused the partial failure.' };
};

export function logTerminalRecoveryFailed(telemetryService: ITelemetryService, data: { totalCount: number; recoveredCount: number; errorCategory: string }): void {
	telemetryService.publicLog2<TerminalRecoveryFailedEvent, TerminalRecoveryFailedClassification>('vscodeAgents.terminal/recoveryFailed', data);
}

type AgentFeedbackSubmitFailedEvent = {
	errorCategory: string;
	errorMessage: string;
};

type AgentFeedbackSubmitFailedClassification = {
	owner: 'osortega';
	comment: 'Tracks failures while submitting agent feedback.';
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error message text. May contain stack-trace fragments.' };
};

export function logAgentFeedbackSubmitFailed(telemetryService: ITelemetryService, data: { errorCategory: string; errorMessage: string }): void {
	telemetryService.publicLogError2<AgentFeedbackSubmitFailedEvent, AgentFeedbackSubmitFailedClassification>('vscodeAgents.agentFeedback/submitFailed', data);
}

// --- Performance ---

type AgentsWindowTimeToReadyEvent = {
	durationMs: number;
	restoredSessions: number;
	route: string;
};

type AgentsWindowTimeToReadyClassification = {
	owner: 'osortega';
	comment: 'Tracks how long it takes to render the Agents window after workbench layout is ready.';
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from workbench layout ready to first paint of the sessions view.' };
	restoredSessions: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of sessions restored on window open.' };
	route: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Closed-enum route classification (e.g. fresh | restore | continueOn).' };
};

export function logAgentsWindowTimeToReady(telemetryService: ITelemetryService, data: { durationMs: number; restoredSessions: number; route: string }): void {
	telemetryService.publicLog2<AgentsWindowTimeToReadyEvent, AgentsWindowTimeToReadyClassification>('vscodeAgents.window/timeToReady', data);
}

type SessionTimeToFirstChatEvent = {
	durationMs: number;
	providerId: string;
	sessionType: string;
};

type SessionTimeToFirstChatClassification = {
	owner: 'osortega';
	comment: 'Tracks how long it takes from session creation to the first chat message rendering.';
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from session creation to first chat message visible.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier of the sessions provider.' };
	sessionType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Provider-defined session type identifier.' };
};

export function logSessionTimeToFirstChat(telemetryService: ITelemetryService, data: { durationMs: number; providerId: string; sessionType: string }): void {
	telemetryService.publicLog2<SessionTimeToFirstChatEvent, SessionTimeToFirstChatClassification>('vscodeAgents.session/timeToFirstChat', data);
}

type CopilotChatSessionsLoadEvent = {
	count: number;
	durationMs: number;
	success: boolean;
	errorCategory: string;
};

type CopilotChatSessionsLoadClassification = {
	owner: 'osortega';
	comment: 'Tracks the load duration and outcome of fetching Copilot chat sessions.';
	count: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of sessions loaded.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock load duration in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the load succeeded.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum error category on failure; empty on success.' };
};

export function logCopilotChatSessionsLoad(telemetryService: ITelemetryService, data: { count: number; durationMs: number; success: boolean; errorCategory?: string }): void {
	telemetryService.publicLog2<CopilotChatSessionsLoadEvent, CopilotChatSessionsLoadClassification>('vscodeAgents.copilotChatSessions/load', {
		count: data.count,
		durationMs: data.durationMs,
		success: data.success,
		errorCategory: data.errorCategory ?? '',
	});
}

type AiCustomizationLoadFilesEvent = {
	scope: string;
	fileCount: number;
	durationMs: number;
	success: boolean;
};

type AiCustomizationLoadFilesClassification = {
	owner: 'osortega';
	comment: 'Tracks the load duration and outcome of scanning AI customization files (instructions, prompts, agents, skills, hooks, etc.).';
	scope: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed-enum scope: workspace | user | remote.' };
	fileCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of files scanned.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Wall-clock scan duration in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the scan succeeded.' };
};

export function logAiCustomizationLoadFiles(telemetryService: ITelemetryService, data: { scope: 'workspace' | 'user' | 'remote'; fileCount: number; durationMs: number; success: boolean }): void {
	telemetryService.publicLog2<AiCustomizationLoadFilesEvent, AiCustomizationLoadFilesClassification>('vscodeAgents.aiCustomization/loadFiles', data);
}
