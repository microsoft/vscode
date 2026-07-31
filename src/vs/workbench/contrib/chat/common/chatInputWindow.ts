/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID = 'workbench.action.chat.toggleInputWindow';

/**
 * Default height for the floating chat input window.
 */
export const CHAT_INPUT_WINDOW_DEFAULT_HEIGHT = 110;

/**
 * Storage keys for persisting window state across restarts.
 */
export const enum ChatInputWindowStorageKeys {
	WindowOpen = 'chatInputWindow.windowOpen',
}

export const IChatInputWindowService = createDecorator<IChatInputWindowService>('chatInputWindowService');

export interface IChatInputWindowService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the floating chat input window is currently open.
	 */
	readonly isOpen: boolean;

	/**
	 * Fires when the window opens or closes.
	 */
	readonly onDidChangeOpen: Event<boolean>;

	/** Fires when omni resolves a single voice routing target. */
	readonly onDidResolveRoute: Event<{ resource: URI | undefined; kind?: 'existing_session' | 'new_session' }>;

	/** Routes voice input through omni when its auxiliary window owns focus. */
	acceptVoiceInput(text: string): Promise<boolean>;

	/**
	 * Opens the floating chat input window. No-op if already open.
	 */
	openWindow(): Promise<void>;

	/**
	 * Closes the floating chat input window. No-op if already closed.
	 */
	closeWindow(): void;

	/**
	 * Toggles the floating chat input window open/closed.
	 */
	toggleWindow(): Promise<void>;
}
