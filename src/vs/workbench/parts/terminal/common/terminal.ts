/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import platform = require('vs/base/common/platform');
import processes = require('vs/base/node/processes');
import { RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const TERMINAL_PANEL_ID = 'workbench.panel.terminal';

export const TERMINAL_SERVICE_ID = 'terminalService';

export const TERMINAL_DEFAULT_SHELL_LINUX = !platform.isWindows ? (process.env.SHELL || 'sh') : 'sh';
export const TERMINAL_DEFAULT_SHELL_OSX = !platform.isWindows ? (process.env.SHELL || 'sh') : 'sh';
export const TERMINAL_DEFAULT_SHELL_WINDOWS = processes.getWindowsShell();

/**
 * A context key that is set when the integrated terminal has focus.
 */
export const KEYBINDING_CONTEXT_TERMINAL_FOCUS = new RawContextKey<boolean>('terminalFocus', undefined);
export const KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED: ContextKeyExpr = KEYBINDING_CONTEXT_TERMINAL_FOCUS.toNegated();

export const ITerminalService = createDecorator<ITerminalService>(TERMINAL_SERVICE_ID);

export interface ITerminalConfiguration {
	terminal: {
		integrated: {
			shell: {
				linux: string,
				osx: string,
				windows: string
			},
			shellArgs: {
				linux: string[],
				osx: string[],
				windows: string[]
			},
			cursorBlinking: boolean,
			fontFamily: string,
			fontLigatures: boolean,
			fontSize: number,
			lineHeight: number,
			setLocaleVariables: boolean,
			scrollback: number,
			commandsToSkipShell: string[]
		}
	};
}

export interface ITerminalConfigHelper {
	getTheme(baseThemeId: string): string[];
	getFont(): ITerminalFont;
	getFontLigaturesEnabled(): boolean;
	getCursorBlink(): boolean;
	getCommandsToSkipShell(): string[];
	getScrollback(): number;
}

export interface ITerminalFont {
	fontFamily: string;
	fontSize: string;
	lineHeight: number;
	charWidth: number;
	charHeight: number;
}

export interface IShell {
	executable: string;
	args: string[];
}

export interface ITerminalService {
	_serviceBrand: any;

	activeTerminalInstanceIndex: number;
	configHelper: ITerminalConfigHelper;
	onActiveInstanceChanged: Event<string>;
	onInstanceDisposed: Event<ITerminalInstance>;
	onInstanceProcessIdReady: Event<ITerminalInstance>;
	onInstancesChanged: Event<string>;
	onInstanceTitleChanged: Event<string>;
	terminalInstances: ITerminalInstance[];

	createInstance(name?: string, shellPath?: string, shellArgs?: string[]): ITerminalInstance;
	getInstanceFromId(terminalId: number): ITerminalInstance;
	getInstanceLabels(): string[];
	getActiveInstance(): ITerminalInstance;
	setActiveInstance(terminalInstance: ITerminalInstance): void;
	setActiveInstanceByIndex(terminalIndex: number): void;
	setActiveInstanceToNext(): void;
	setActiveInstanceToPrevious(): void;

	showPanel(focus?: boolean): TPromise<void>;
	hidePanel(): void;
	setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void;
}

export interface ITerminalInstance {
	/**
	 * The ID of the terminal instance, this is an arbitrary number only used to identify the
	 * terminal instance.
	 */
	id: number;

	/**
	 * The process ID of the shell process.
	 */
	processId: number;

	/**
	 * An event that fires when the terminal instance's title changes.
	 */
	onTitleChanged: Event<string>;

	/**
	 * The title of the terminal. This is either title or the process currently running or an
	 * explicit name given to the terminal instance through the extension API.
	 *
	 * @readonly
	 */
	title: string;

	/**
	 * Dispose the terminal instance, removing it from the panel/service and freeing up resources.
	 */
	dispose(): void;

	/**
	 * Copies the terminal selection to the clipboard.
	 */
	copySelection(): void;

	/**
	 * Focuses the terminal instance.
	 *
	 * @param focus Force focus even if there is a selection.
	 */
	focus(force?: boolean): void;

	/**
	 * Focuses and pastes the contents of the clipboard into the terminal instance.
	 */
	paste(): void;

	/**
	 * Send text to the terminal instance. The text is written to the stdin of the underlying pty
	 * process (shell) of the terminal instance.
	 *
	 * @param text The text to send.
	 * @param addNewLine Whether to add a new line to the text being sent, this is normally
	 * required to run a command in the terminal. The character(s) added are \n or \r\n
	 * depending on the platform. This defaults to `true`.
	 */
	sendText(text: string, addNewLine: boolean): void;

	/** Scroll the terminal buffer down 1 line. */
	scrollDownLine(): void;
	/** Scroll the terminal buffer down 1 page. */
	scrollDownPage(): void;
	/** Scroll the terminal buffer to the bottom. */
	scrollToBottom(): void;
	/** Scroll the terminal buffer up 1 line. */
	scrollUpLine(): void;
	/** Scroll the terminal buffer up 1 page. */
	scrollUpPage(): void;
	/** Scroll the terminal buffer to the top. */
	scrollToTop(): void;

	/**
	 * Clears the terminal buffer, leaving only the prompt line.
	 */
	clear(): void;

	/**
	 * Attaches the terminal instance to an element on the DOM, before this is called the terminal
	 * instance process may run in the background but cannot be displayed on the UI.
	 *
	 * @param container The element to attach the terminal instance to.
	 */
	attachToElement(container: HTMLElement): void;

	/**
	 * Sets whether the terminal instance's cursor will blink or be solid.
	 *
	 * @param blink Whether the cursor will blink.
	 */
	setCursorBlink(blink: boolean): void;

	/**
	 * Sets the array of commands that skip the shell process so they can be handled by VS Code's
	 * keybinding system.
	 */
	setCommandsToSkipShell(commands: string[]): void;

	/**
	 * Sets the maximum amount of lines that the buffer can store before discarding old ones.
	 */
	setScrollback(lineCount: number): void;

	/**
	 * Configure the dimensions of the terminal instance.
	 *
	 * @param dimension The dimensions of the container.
	 */
	layout(dimension: { width: number, height: number }): void;

	/**
	 * Sets whether the terminal instance's element is visible in the DOM.
	 *
	 * @param visible Whether the element is visible.
	 */
	setVisible(visible: boolean): void;
}
