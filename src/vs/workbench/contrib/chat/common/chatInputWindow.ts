/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IRectangle } from '../../../../platform/window/common/window.js';

export const CHAT_INPUT_WINDOW_TOGGLE_COMMAND_ID = 'workbench.action.chat.toggleInputWindow';
export const CHAT_INPUT_WINDOW_ACCEPT_VOICE_COMMAND_ID = '_chat.omni.acceptVoiceInput';
export const CHAT_INPUT_WINDOW_SET_VOICE_TARGET_COMMAND_ID = '_chat.voice.setOmniTarget';

/**
 * Default height for the floating chat input window.
 */
export const CHAT_INPUT_WINDOW_DEFAULT_HEIGHT = 110;

/**
 * Storage keys for persisting window state across restarts.
 */
export const enum ChatInputWindowStorageKeys {
	WindowOpen = 'chatInputWindow.windowOpen',
	WindowPosition = 'chatInputWindow.windowPosition',
}

export const IChatInputWindowService = createDecorator<IChatInputWindowService>('chatInputWindowService');

export interface IChatInputWindowService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the floating chat input window is currently open.
	 */
	readonly isOpen: boolean;
	/** Whether the floating input's auxiliary window currently owns OS focus. */
	readonly hasFocus: boolean;

	/**
	 * Fires when the window opens or closes.
	 */
	readonly onDidChangeOpen: Event<boolean>;

	/** Routes voice input through omni when its auxiliary window owns focus. */
	acceptVoiceInput(text: string): Promise<boolean>;

	/**
	 * Opens the floating chat input window. No-op if already open.
	 */
	openWindow(invokingWindowBounds?: IRectangle): Promise<void>;

	/**
	 * Closes the floating chat input window. No-op if already closed.
	 */
	closeWindow(): void;

	/**
	 * Toggles the floating chat input window open/closed.
	 */
	toggleWindow(invokingWindowBounds?: IRectangle): Promise<void>;
}
