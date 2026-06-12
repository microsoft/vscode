/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

import './agentsVoiceColors.js'; // Register custom voice theme colors

/**
 * Default dimensions for the Agents Voice floating window.
 */
export const AGENTS_VOICE_WINDOW_DEFAULT_WIDTH = 220;
export const AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT = 100;

/**
 * Storage keys for persisting window state across restarts.
 */
export const enum AgentsVoiceStorageKeys {
	WindowOpen = 'agentsVoice.windowOpen',
	WindowBounds = 'agentsVoice.windowBounds',
	TranscriptIndex = 'agentsVoice.transcriptIndex',
	OnboardingCompleted = 'agentsVoice.onboardingCompleted',
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
