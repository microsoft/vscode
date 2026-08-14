/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
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
	WindowPositionOffset = 'chatInputWindow.windowPositionOffset',
	DismissedCIFailures = 'chatInputWindow.dismissedCIFailures',
}

export interface IChatInputWindowPositionOffset {
	readonly x: number;
	readonly y: number;
}

export function getChatInputWindowBounds(invokingWindowBounds: IRectangle, width: number, height: number, offset?: IChatInputWindowPositionOffset): IRectangle {
	return {
		x: Math.round(invokingWindowBounds.x + (offset?.x ?? (invokingWindowBounds.width - width) / 2)),
		y: Math.round(invokingWindowBounds.y + (offset?.y ?? (invokingWindowBounds.height - height) / 2)),
		width,
		height,
	};
}

export const IChatInputWindowService = createDecorator<IChatInputWindowService>('chatInputWindowService');

/** A session whose pull request has failing CI checks. */
export interface IChatInputWindowCIFailure {
	readonly sessionResource: URI;
	readonly occurrenceId: string;
	readonly label: string;
	readonly failed: number;
	readonly pending: number;
	readonly updatedAt: number;
}

/** Supplies actionable failing-CI sessions to the floating chat input. */
export interface IChatInputWindowCIFailureProvider {
	readonly failures: IObservable<readonly IChatInputWindowCIFailure[]>;
	fixCI(sessionResource: URI): void;
}

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

	/**
	 * Registers failing CI sessions to show in the floating input's attention panel.
	 */
	registerCIFailureProvider(provider: IChatInputWindowCIFailureProvider): IDisposable;

	/** Routes voice input through omni when its auxiliary window owns focus. */
	acceptVoiceInput(text: string): Promise<URI | false>;

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
