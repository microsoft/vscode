/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* -- Activation -- */

export type VoiceEnabledEvent = {
	source: string;
};
export type VoiceEnabledClassification = {
	owner: 'meganrogge';
	comment: 'Fired when the user enables agents.voice.enabled.';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the setting was enabled (settings UI, command, etc.).' };
};

export type VoiceDisabledEvent = {
	daysActive: number;
};
export type VoiceDisabledClassification = {
	owner: 'meganrogge';
	comment: 'Fired when the user disables agents.voice.enabled.';
	daysActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of days the feature was enabled before disabling.' };
};

export type VoiceFirstConnectEvent = {
	timeToConnectMs: number;
};
export type VoiceFirstConnectClassification = {
	owner: 'meganrogge';
	comment: 'Fired on the first successful WebSocket connect in a window lifetime.';
	timeToConnectMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Milliseconds from connect() call to WebSocket open.' };
};

export type VoiceOnboardingCompletedEvent = {};
export type VoiceOnboardingCompletedClassification = {
	owner: 'meganrogge';
	comment: 'Fired when the user completes the voice onboarding flow.';
};

/* -- Usage -- */

export type VoiceSessionStartedEvent = {
	sessionIndex: number;
};
export type VoiceSessionStartedClassification = {
	owner: 'meganrogge';
	comment: 'Fired each time a voice WebSocket session is started (connect or reconnect).';
	sessionIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Monotonic index of this session within the window lifetime.' };
};

export type VoiceSessionEndedEvent = {
	turnCount: number;
	durationSec: number;
	reconnectCount: number;
};
export type VoiceSessionEndedClassification = {
	owner: 'meganrogge';
	comment: 'Fired when a voice session ends (user disconnect or window close).';
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Total user turns (PTT presses) in this session.' };
	durationSec: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Wall-clock seconds the session was active.' };
	reconnectCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Number of automatic reconnects during this session.' };
};

export type VoicePttEvent = {
	holdDurationMs: number;
};
export type VoicePttClassification = {
	owner: 'meganrogge';
	comment: 'Fired on each PTT release (pttUp). Measures how long the user held the key.';
	holdDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Milliseconds between pttDown and pttUp.' };
};

export type VoiceTtsListenThroughEvent = {
	listenedToEnd: boolean;
	listenedPct: number;
};
export type VoiceTtsListenThroughClassification = {
	owner: 'meganrogge';
	comment: 'Fired when TTS playback finishes or is interrupted. Tracks listen-through rate.';
	listenedToEnd: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user listened to the entire response.' };
	listenedPct: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Approximate percentage of the response the user heard (0-100).' };
};

/* -- Quality -- */

export type VoiceToolApprovalEvent = {
	toolName: string;
	approved: boolean;
};
export type VoiceToolApprovalClassification = {
	owner: 'meganrogge';
	comment: 'Fired when the voice backend approves or rejects a tool confirmation.';
	toolName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Name of the voice tool that was invoked (approve_confirmation, reject_confirmation).' };
	approved: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the action was an approval (true) or denial (false).' };
};

export type VoiceReconnectEvent = {
	timeSinceLastConnectSec: number;
};
export type VoiceReconnectClassification = {
	owner: 'meganrogge';
	comment: 'Fired on each automatic WebSocket reconnect.';
	timeSinceLastConnectSec: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Seconds since the previous successful connect.' };
};

/* -- Latency -- */

export type VoiceLatencyEvent = {
	timeToFirstTranscriptionMs: number;
	endToEndTurnMs: number;
};
export type VoiceLatencyClassification = {
	owner: 'meganrogge';
	comment: 'Fired after a complete voice turn (user speaks → assistant responds). Measures latency.';
	timeToFirstTranscriptionMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Milliseconds from pttDown to first partial transcription received.' };
	endToEndTurnMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Milliseconds from pttUp to first audio response chunk.' };
};
