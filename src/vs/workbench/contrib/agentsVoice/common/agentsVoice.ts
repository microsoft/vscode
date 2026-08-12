/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Event } from '../../../../base/common/event.js';
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
	AGENTS_VOICE_ENTITLED,
)!;

export const enum AgentsVoiceSettingId {
	ShowButton = 'agents.voice.showButton',
}

/**
 * Default dimensions for the Agents Voice floating window.
 */
export const AGENTS_VOICE_WINDOW_DEFAULT_WIDTH = 400;
export const AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT = 70;

/**
 * Storage keys for persisting window state across restarts.
 */
export const enum AgentsVoiceStorageKeys {
	WindowOpen = 'agentsVoice.windowOpen',
	WindowBounds = 'agentsVoice.windowBounds',
	TranscriptIndex = 'agentsVoice.transcriptIndex',
	OnboardingCompleted = 'agentsVoice.onboardingCompleted',
	/**
	 * First-run introduction shown above the chat input. Distinct from
	 * {@link OnboardingCompleted}, which tracks the Voice Mode window's own
	 * onboarding.
	 */
	IntroBannerShown = 'agentsVoice.introBannerShown',
	MicrophoneDevice = 'agentsVoice.microphoneDevice',
}

export const IAgentsVoiceWindowService = createDecorator<IAgentsVoiceWindowService>('agentsVoiceWindowService');

export interface IAgentsVoiceWindowService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the floating voice window is currently open.
	 */
	readonly isOpen: boolean;

	/**
	 * Fires when the window opens or closes.
	 */
	readonly onDidChangeOpen: Event<boolean>;

	/**
	 * Opens the floating voice window. No-op if already open.
	 */
	openWindow(): Promise<void>;

	/**
	 * Closes the floating voice window. No-op if already closed.
	 */
	closeWindow(): void;

	/**
	 * Toggles the floating voice window open/closed.
	 */
	toggleWindow(): Promise<void>;
}
