/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import platform = require('vs/base/common/platform');
import { IDisposable } from 'vs/base/common/lifecycle';
import { RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const TERMINAL_PANEL_ID = 'workbench.panel.terminal';

export const TERMINAL_SERVICE_ID = 'terminalService';

export const TERMINAL_DEFAULT_RIGHT_CLICK_COPY_PASTE = platform.isWindows;

/**  A context key that is set when the integrated terminal has focus. */
export const KEYBINDING_CONTEXT_TERMINAL_FOCUS = new RawContextKey<boolean>('terminalFocus', undefined);
/**  A context key that is set when the integrated terminal does not have focus. */
export const KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED: ContextKeyExpr = KEYBINDING_CONTEXT_TERMINAL_FOCUS.toNegated();

/** A keybinding context key that is set when the integrated terminal has text selected. */
export const KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED = new RawContextKey<boolean>('terminalTextSelected', undefined);
/** A keybinding context key that is set when the integrated terminal does not have text selected. */
export const KEYBINDING_CONTEXT_TERMINAL_TEXT_NOT_SELECTED: ContextKeyExpr = KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED.toNegated();

export const ITerminalService = createDecorator<ITerminalService>(TERMINAL_SERVICE_ID);

export const TerminalCursorStyle = {
	BLOCK: 'block',
	LINE: 'line',
	UNDERLINE: 'underline'
};

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
			rightClickCopyPaste: boolean,
			cursorBlinking: boolean,
			cursorStyle: string,
			fontFamily: string,
			fontLigatures: boolean,
			fontSize: number,
			lineHeight: number,
			setLocaleVariables: boolean,
			scrollback: number,
			commandsToSkipShell: string[],
			cwd: string,
			flowControl: boolean
		}
	};
}

export interface ITerminalConfigHelper {
	getTheme(baseThemeId: string): string[];
	getFont(): ITerminalFont;
	getFontLigaturesEnabled(): boolean;
	getFlowControl(): boolean;
	getCursorBlink(): boolean;
	getRightClickCopyPaste(): boolean;
	getCommandsToSkipShell(): string[];
	getScrollback(): number;
	getCwd(): string;
}

export interface ITerminalFont {
	fontFamily: string;
	fontSize: string;
	lineHeight: number;
	charWidth: number;
	charHeight: number;
}

export interface IShellLaunchConfig {
	/** The name of the terminal, if this is not set the name of the process will be used. */
	name?: string;
	/** The shell executable (bash, cmd, etc.). */
	executable?: string;
	/** The CLI arguments to use with executable. */
	args?: string[];
	/**
	 * The current working directory of the terminal, this overrides the `terminal.integrated.cwd`
	 * settings key.
	 */
	cwd?: string;
	/**
	 * A custom environment for the terminal, if this is not set the environment will be inherited
	 * from the VS Code process.
	 */
	env?: { [key: string]: string };
	/**
	 * Whether to ignore a custom cwd from the `terminal.integrated.cwd` settings key (eg. if the
	 * shell is being launched by an extension).
	 */
	ignoreConfigurationCwd?: boolean;
	/** Whether to wait for a key press before closing the terminal. */
	waitOnExit?: boolean;
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

	createInstance(shell?: IShellLaunchConfig): ITerminalInstance;
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
	updateConfig(): void;
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
	 * An event that fires when the terminal instance is disposed.
	 */
	onDisposed: Event<ITerminalInstance>;

	/**
	 * The title of the terminal. This is either title or the process currently running or an
	 * explicit name given to the terminal instance through the extension API.
	 *
	 * @readonly
	 */
	title: string;

	/**
	 * The focus state of the terminal before exiting.
	 *
	 * @readonly
	 */
	hadFocusOnExit: boolean;

	/**
	 * Dispose the terminal instance, removing it from the panel/service and freeing up resources.
	 */
	dispose(): void;

	/**
	 * Check if anything is selected in terminal.
	 */
	hasSelection(): boolean;

	/**
	 * Copies the terminal selection to the clipboard.
	 */
	copySelection(): void;

	/**
	 * Clear current selection.
	 */
	clearSelection(): void;

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
	 * Updates the configuration of the terminal instance.
	 */
	updateConfig(): void;

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

	/**
	 * Attach a listener to the data stream from the terminal's pty process.
	 *
	 * @param listener The listener function which takes the processes' data stream (including
	 * ANSI escape sequences).
	 */
	onData(listener: (data: string) => void): IDisposable;

	/**
	 * Attach a listener that fires when the terminal's pty process exits.
	 *
	 * @param listener The listener function which takes the processes' exit code, an exit code of
	 * null means the process was killed as a result of the ITerminalInstance being disposed.
	 */
	onExit(listener: (exitCode: number) => void): IDisposable;

	/**
	 * Immediately kills the terminal's current pty process and launches a new one to replace it.
	 *
	 * @param shell The new launch configuration.
	 */
	reuseTerminal(shell?: IShellLaunchConfig): void;
}
