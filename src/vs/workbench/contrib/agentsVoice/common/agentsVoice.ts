/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';

import './agentsVoiceColors.js'; // Register custom voice theme colors

/**
 * Context keys reflecting the live Voice Mode connection state. Defined here in
 * the common layer so other contributions (e.g. chat-input dictation) can gate
 * their UI on Voice Mode being active without importing the browser contribution.
 */
export const AGENTS_VOICE_CONNECTED = new RawContextKey<boolean>('agentsVoiceConnected', false);
export const AGENTS_VOICE_CONNECTING = new RawContextKey<boolean>('agentsVoiceConnecting', false);
export const AGENTS_VOICE_RECONNECTING = new RawContextKey<boolean>('agentsVoiceReconnecting', false);
export const AGENTS_VOICE_LISTENING = new RawContextKey<boolean>('agentsVoiceListening', false);
export const AGENTS_VOICE_MUTED = new RawContextKey<boolean>('agentsVoiceMuted', false);
export const AGENTS_VOICE_TOGGLE_MUTE_COMMAND_ID = 'agentsVoice.toggleMute';
/**
 * True when the current Copilot entitlement permits Voice Mode. This is a single
 * key set imperatively from `IChatEntitlementService` (see
 * `AgentsVoiceEntitlementKeyContribution`) rather than an OR-of-plans context-key
 * expression: negating such a disjunction — as `SegmentedVoiceInputModePillInactive`
 * does — distributes it combinatorially into thousands of terms, which is
 * prohibitively expensive to build and evaluate on every menu/keybinding update.
 */
export const AGENTS_VOICE_ENTITLED = new RawContextKey<boolean>('agentsVoiceEntitled', false);
export const AGENTS_VOICE_ENABLED = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals('config.agents.voice.enabled', true),
	ContextKeyExpr.or(
		AGENTS_VOICE_ENTITLED,
		ContextKeyExpr.regex('config.agents.voice.useBYOKVoiceModel', /\S/),
	),
)!;

export function getAgentsVoicePolicyValue(policyData: IPolicyData): false | undefined {
	return policyData.chat_preview_features_enabled === false ? false : undefined;
}

export const enum AgentsVoiceSettingId {
	ShowButton = 'agents.voice.showButton',
	UseBYOKVoiceModel = 'agents.voice.useBYOKVoiceModel',
	SessionAwareness = 'agents.voice.sessionAwareness',
}

/**
 * Storage keys for persisting Voice Mode state across restarts.
 */
export const enum AgentsVoiceStorageKeys {
	TranscriptIndex = 'agentsVoice.transcriptIndex',
	GptLiveNoticeShown = 'agentsVoice.gptLiveNoticeShown',
	/** First-run introduction shown above the chat input. */
	IntroBannerShown = 'agentsVoice.introBannerShown',
	MicrophoneDevice = 'agentsVoice.microphoneDevice',
}
