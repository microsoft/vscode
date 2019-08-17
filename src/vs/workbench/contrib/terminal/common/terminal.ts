/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { RawContextKey, ContextKeyExpr, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { OperatingSystem } from 'vs/base/common/platform';
import { IOpenFileRequest } from 'vs/platform/windows/common/windows';

export const TERMINAL_PANEL_ID = 'workbench.panel.terminal';

/** A context key that is set when there is at least one opened integrated terminal. */
export const KEYBINDING_CONTEXT_TERMINAL_IS_OPEN = new RawContextKey<boolean>('terminalIsOpen', false);
/** A context key that is set when the integrated terminal has focus. */
export const KEYBINDING_CONTEXT_TERMINAL_FOCUS = new RawContextKey<boolean>('terminalFocus', false);
/** A context key that is set when the integrated terminal does not have focus. */
export const KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED: ContextKeyExpr = KEYBINDING_CONTEXT_TERMINAL_FOCUS.toNegated();
/** A context key that is set when the user is navigating the accessibility tree */
export const KEYBINDING_CONTEXT_TERMINAL_A11Y_TREE_FOCUS = new RawContextKey<boolean>('terminalA11yTreeFocus', false);

/** A keybinding context key that is set when the integrated terminal has text selected. */
export const KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED = new RawContextKey<boolean>('terminalTextSelected', false);
/** A keybinding context key that is set when the integrated terminal does not have text selected. */
export const KEYBINDING_CONTEXT_TERMINAL_TEXT_NOT_SELECTED: ContextKeyExpr = KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED.toNegated();

/**  A context key that is set when the find widget in integrated terminal is visible. */
export const KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE = new RawContextKey<boolean>('terminalFindWidgetVisible', false);
/**  A context key that is set when the find widget in integrated terminal is not visible. */
export const KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_NOT_VISIBLE: ContextKeyExpr = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE.toNegated();
/**  A context key that is set when the find widget find input in integrated terminal is focused. */
export const KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED = new RawContextKey<boolean>('terminalFindWidgetInputFocused', false);
/**  A context key that is set when the find widget in integrated terminal is focused. */
export const KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED = new RawContextKey<boolean>('terminalFindWidgetFocused', false);
/**  A context key that is set when the find widget find input in integrated terminal is not focused. */
export const KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_NOT_FOCUSED: ContextKeyExpr = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED.toNegated();

export const IS_WORKSPACE_SHELL_ALLOWED_STORAGE_KEY = 'terminal.integrated.isWorkspaceShellAllowed';
export const NEVER_MEASURE_RENDER_TIME_STORAGE_KEY = 'terminal.integrated.neverMeasureRenderTime';

// The creation of extension host terminals is delayed by this value (milliseconds). The purpose of
// this delay is to allow the terminal instance to initialize correctly and have its ID set before
// trying to create the corressponding object on the ext host.
export const EXT_HOST_CREATION_DELAY = 100;

export const ITerminalService = createDecorator<ITerminalService>('terminalService');
export const ITerminalNativeService = createDecorator<ITerminalNativeService>('terminalNativeService');

export const TerminalCursorStyle = {
	BLOCK: 'block',
	LINE: 'line',
	UNDERLINE: 'underline'
};

export const TERMINAL_CONFIG_SECTION = 'terminal.integrated';

export const TERMINAL_ACTION_CATEGORY = nls.localize('terminalCategory', "Terminal");

export const DEFAULT_LETTER_SPACING = 0;
export const MINIMUM_LETTER_SPACING = -5;
export const DEFAULT_LINE_HEIGHT = 1;
export const SHELL_PATH_INVALID_EXIT_CODE = -1;
export const SHELL_PATH_DIRECTORY_EXIT_CODE = -2;
export const SHELL_CWD_INVALID_EXIT_CODE = -3;

export type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

export interface ITerminalConfiguration {
	shell: {
		linux: string | null;
		osx: string | null;
		windows: string | null;
	};
	automationShell: {
		linux: string | null;
		osx: string | null;
		windows: string | null;
	};
	shellArgs: {
		linux: string[];
		osx: string[];
		windows: string[];
	};
	macOptionIsMeta: boolean;
	macOptionClickForcesSelection: boolean;
	rendererType: 'auto' | 'canvas' | 'dom';
	rightClickBehavior: 'default' | 'copyPaste' | 'selectWord';
	cursorBlinking: boolean;
	cursorStyle: string;
	drawBoldTextInBrightColors: boolean;
	fontFamily: string;
	fontWeight: FontWeight;
	fontWeightBold: FontWeight;
	// fontLigatures: boolean;
	fontSize: number;
	letterSpacing: number;
	lineHeight: number;
	setLocaleVariables: boolean;
	scrollback: number;
	commandsToSkipShell: string[];
	cwd: string;
	confirmOnExit: boolean;
	enableBell: boolean;
	inheritEnv: boolean;
	env: {
		linux: { [key: string]: string };
		osx: { [key: string]: string };
		windows: { [key: string]: string };
	};
	showExitAlert: boolean;
	experimentalBufferImpl: 'JsArray' | 'TypedArray';
	splitCwd: 'workspaceRoot' | 'initial' | 'inherited';
	windowsEnableConpty: boolean;
	experimentalRefreshOnResume: boolean;
}

export interface ITerminalConfigHelper {
	config: ITerminalConfiguration;

	onWorkspacePermissionsChanged: Event<boolean>;

	configFontIsMonospace(): boolean;
	getFont(): ITerminalFont;
	/** Sets whether a workspace shell configuration is allowed or not */
	setWorkspaceShellAllowed(isAllowed: boolean): void;
	checkWorkspaceShellPermissions(osOverride?: OperatingSystem): boolean;
	showRecommendations(shellLaunchConfig: IShellLaunchConfig): void;
}

export interface ITerminalFont {
	fontFamily: string;
	fontSize: number;
	letterSpacing: number;
	lineHeight: number;
	charWidth?: number;
	charHeight?: number;
}

export interface ITerminalEnvironment {
	[key: string]: string | null;
}

export interface IShellLaunchConfig {
	/**
	 * The name of the terminal, if this is not set the name of the process will be used.
	 */
	name?: string;

	/**
	 * The shell executable (bash, cmd, etc.).
	 */
	executable?: string;

	/**
	 * The CLI arguments to use with executable, a string[] is in argv format and will be escaped,
	 * a string is in "CommandLine" pre-escaped format and will be used as is. The string option is
	 * only supported on Windows and will throw an exception if used on macOS or Linux.
	 */
	args?: string[] | string;

	/**
	 * The current working directory of the terminal, this overrides the `terminal.integrated.cwd`
	 * settings key.
	 */
	cwd?: string | URI;

	/**
	 * A custom environment for the terminal, if this is not set the environment will be inherited
	 * from the VS Code process.
	 */
	env?: ITerminalEnvironment;

	/**
	 * Whether to ignore a custom cwd from the `terminal.integrated.cwd` settings key (e.g. if the
	 * shell is being launched by an extension).
	 */
	ignoreConfigurationCwd?: boolean;

	/** Whether to wait for a key press before closing the terminal. */
	waitOnExit?: boolean | string;

	/**
	 * A string including ANSI escape sequences that will be written to the terminal emulator
	 * _before_ the terminal process has launched, a trailing \n is added at the end of the string.
	 * This allows for example the terminal instance to display a styled message as the first line
	 * of the terminal. Use \x1b over \033 or \e for the escape control character.
	 */
	initialText?: string;

	/**
	 * Whether an extension is controlling the terminal via a `vscode.Pseudoterminal`.
	 */
	isExtensionTerminal?: boolean;

	/**
	 * Whether the terminal process environment should be exactly as provided in
	 * `TerminalOptions.env`. When this is false (default), the environment will be based on the
	 * window's environment and also apply configured platform settings like
	 * `terminal.integrated.windows.env` on top. When this is true, the complete environment must be
	 * provided as nothing will be inherited from the process or any configuration.
	 */
	strictEnv?: boolean;

	/**
	 * When enabled the terminal will run the process as normal but not be surfaced to the user
	 * until `Terminal.show` is called. The typical usage for this is when you need to run
	 * something that may need interactivity but only want to tell the user about it when
	 * interaction is needed. Note that the terminals will still be exposed to all extensions
	 * as normal.
	 */
	hideFromUser?: boolean;
}

export interface ITerminalService {
	_serviceBrand: any;

	activeTabIndex: number;
	configHelper: ITerminalConfigHelper;
	terminalInstances: ITerminalInstance[];
	terminalTabs: ITerminalTab[];

	onActiveTabChanged: Event<void>;
	onTabDisposed: Event<ITerminalTab>;
	onInstanceCreated: Event<ITerminalInstance>;
	onInstanceDisposed: Event<ITerminalInstance>;
	onInstanceProcessIdReady: Event<ITerminalInstance>;
	onInstanceDimensionsChanged: Event<ITerminalInstance>;
	onInstanceMaximumDimensionsChanged: Event<ITerminalInstance>;
	onInstanceRequestSpawnExtHostProcess: Event<ISpawnExtHostProcessRequest>;
	onInstanceRequestStartExtensionTerminal: Event<IStartExtensionTerminalRequest>;
	onInstancesChanged: Event<void>;
	onInstanceTitleChanged: Event<ITerminalInstance>;
	onActiveInstanceChanged: Event<ITerminalInstance | undefined>;
	onRequestAvailableShells: Event<IAvailableShellsRequest>;

	/**
	 * Creates a terminal.
	 * @param shell The shell launch configuration to use.
	 */
	createTerminal(shell?: IShellLaunchConfig): ITerminalInstance;

	/**
	 * Creates a raw terminal instance, this should not be used outside of the terminal part.
	 */
	createInstance(container: HTMLElement | undefined, shellLaunchConfig: IShellLaunchConfig): ITerminalInstance;
	getInstanceFromId(terminalId: number): ITerminalInstance | undefined;
	getInstanceFromIndex(terminalIndex: number): ITerminalInstance;
	getTabLabels(): string[];
	getActiveInstance(): ITerminalInstance | null;
	setActiveInstance(terminalInstance: ITerminalInstance): void;
	setActiveInstanceByIndex(terminalIndex: number): void;
	getActiveOrCreateInstance(wasNewTerminalAction?: boolean): ITerminalInstance;
	splitInstance(instance: ITerminalInstance, shell?: IShellLaunchConfig): ITerminalInstance | null;

	getActiveTab(): ITerminalTab | null;
	setActiveTabToNext(): void;
	setActiveTabToPrevious(): void;
	setActiveTabByIndex(tabIndex: number): void;

	/**
	 * Fire the onActiveTabChanged event, this will trigger the terminal dropdown to be updated,
	 * among other things.
	 */
	refreshActiveTab(): void;

	showPanel(focus?: boolean): Promise<void>;
	hidePanel(): void;
	focusFindWidget(): Promise<void>;
	hideFindWidget(): void;
	getFindState(): FindReplaceState;
	findNext(): void;
	findPrevious(): void;

	selectDefaultWindowsShell(): Promise<void>;

	setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void;
	manageWorkspaceShellPermissions(): void;

	/**
	 * Takes a path and returns the properly escaped path to send to the terminal.
	 * On Windows, this included trying to prepare the path for WSL if needed.
	 *
	 * @param executable The executable off the shellLaunchConfig
	 * @param title The terminal's title
	 * @param path The path to be escaped and formatted.
	 * @returns An escaped version of the path to be execuded in the terminal.
	 */
	preparePathForTerminalAsync(path: string, executable: string | undefined, title: string): Promise<string>;

	extHostReady(remoteAuthority: string): void;
	requestSpawnExtHostProcess(proxy: ITerminalProcessExtHostProxy, shellLaunchConfig: IShellLaunchConfig, activeWorkspaceRootUri: URI, cols: number, rows: number, isWorkspaceShellAllowed: boolean): void;
	requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): void;
}

/**
 * Provides access to native or electron APIs to other terminal services.
 */
export interface ITerminalNativeService {
	_serviceBrand: any;

	readonly linuxDistro: LinuxDistro;

	readonly onOpenFileRequest: Event<IOpenFileRequest>;
	readonly onOsResume: Event<void>;

	getWindowsBuildNumber(): number;
	whenFileDeleted(path: URI): Promise<void>;
	getWslPath(path: string): Promise<string>;
}

export interface IShellDefinition {
	label: string;
	path: string;
}

export const enum Direction {
	Left = 0,
	Right = 1,
	Up = 2,
	Down = 3
}

export interface ITerminalTab {
	activeInstance: ITerminalInstance | null;
	terminalInstances: ITerminalInstance[];
	title: string;
	onDisposed: Event<ITerminalTab>;
	onInstancesChanged: Event<void>;

	focusPreviousPane(): void;
	focusNextPane(): void;
	resizePane(direction: Direction): void;
	setActiveInstanceByIndex(index: number): void;
	attachToElement(element: HTMLElement): void;
	setVisible(visible: boolean): void;
	layout(width: number, height: number): void;
	addDisposable(disposable: IDisposable): void;
	split(terminalFocusContextKey: IContextKey<boolean>, configHelper: ITerminalConfigHelper, shellLaunchConfig: IShellLaunchConfig): ITerminalInstance | undefined;
}

export interface ITerminalDimensions {
	/**
	 * The columns of the terminal.
	 */
	readonly cols: number;

	/**
	 * The rows of the terminal.
	 */
	readonly rows: number;
}

interface ISearchOptions {
	/**
	 * Whether the find should be done as a regex.
	 */
	regex?: boolean;
	/**
	 * Whether only whole words should match.
	 */
	wholeWord?: boolean;
	/**
	 * Whether find should pay attention to case.
	 */
	caseSensitive?: boolean;
	/**
	 * Whether the search should start at the current search position (not the next row)
	 */
	incremental?: boolean;
}

export interface ITerminalInstance {
	/**
	 * The ID of the terminal instance, this is an arbitrary number only used to identify the
	 * terminal instance.
	 */
	readonly id: number;

	readonly cols: number;
	readonly rows: number;
	readonly maxCols: number;
	readonly maxRows: number;

	/**
	 * The process ID of the shell process, this is undefined when there is no process associated
	 * with this terminal.
	 */
	processId: number | undefined;

	/**
	 * An event that fires when the terminal instance's title changes.
	 */
	onTitleChanged: Event<ITerminalInstance>;

	/**
	 * An event that fires when the terminal instance is disposed.
	 */
	onDisposed: Event<ITerminalInstance>;

	onFocused: Event<ITerminalInstance>;
	onProcessIdReady: Event<ITerminalInstance>;
	onRequestExtHostProcess: Event<ITerminalInstance>;
	onDimensionsChanged: Event<void>;
	onMaximumDimensionsChanged: Event<void>;

	onFocus: Event<ITerminalInstance>;

	/**
	 * Attach a listener to the raw data stream coming from the pty, including ANSI escape
	 * sequences.
	 */
	onData: Event<string>;

	/**
	 * Attach a listener to listen for new lines added to this terminal instance.
	 *
	 * @param listener The listener function which takes new line strings added to the terminal,
	 * excluding ANSI escape sequences. The line event will fire when an LF character is added to
	 * the terminal (ie. the line is not wrapped). Note that this means that the line data will
	 * not fire for the last line, until either the line is ended with a LF character of the process
	 * is exited. The lineData string will contain the fully wrapped line, not containing any LF/CR
	 * characters.
	 */
	onLineData: Event<string>;

	/**
	 * Attach a listener that fires when the terminal's pty process exits. The number in the event
	 * is the processes' exit code, an exit code of null means the process was killed as a result of
	 * the ITerminalInstance being disposed.
	 */
	onExit: Event<number>;

	processReady: Promise<void>;

	/**
	 * The title of the terminal. This is either title or the process currently running or an
	 * explicit name given to the terminal instance through the extension API.
	 */
	readonly title: string;

	/**
	 * The focus state of the terminal before exiting.
	 */
	readonly hadFocusOnExit: boolean;

	/**
	 * False when the title is set by an API or the user. We check this to make sure we
	 * do not override the title when the process title changes in the terminal.
	 */
	isTitleSetByProcess: boolean;

	/**
	 * The shell launch config used to launch the shell.
	 */
	readonly shellLaunchConfig: IShellLaunchConfig;

	/**
	 * Whether to disable layout for the terminal. This is useful when the size of the terminal is
	 * being manipulating (e.g. adding a split pane) and we want the terminal to ignore particular
	 * resize events.
	 */
	disableLayout: boolean;

	/**
	 * An object that tracks when commands are run and enables navigating and selecting between
	 * them.
	 */
	readonly commandTracker: ICommandTracker | undefined;

	readonly navigationMode: INavigationMode | undefined;

	/**
	 * Dispose the terminal instance, removing it from the panel/service and freeing up resources.
	 *
	 * @param immediate Whether the kill should be immediate or not. Immediate should only be used
	 * when VS Code is shutting down or in cases where the terminal dispose was user initiated.
	 * The immediate===false exists to cover an edge case where the final output of the terminal can
	 * get cut off. If immediate kill any terminal processes immediately.
	 */
	dispose(immediate?: boolean): void;

	/**
	 * Forces the terminal to redraw its viewport.
	 */
	forceRedraw(): void;

	/**
	 * Registers a link matcher, allowing custom link patterns to be matched and handled.
	 * @param regex The regular expression the search for, specifically this searches the
	 * textContent of the rows. You will want to use \s to match a space ' ' character for example.
	 * @param handler The callback when the link is called.
	 * @param matchIndex The index of the link from the regex.match(html) call. This defaults to 0
	 * (for regular expressions without capture groups).
	 * @param validationCallback A callback which can be used to validate the link after it has been
	 * added to the DOM.
	 * @return The ID of the new matcher, this can be used to deregister.
	 */
	registerLinkMatcher(regex: RegExp, handler: (url: string) => void, matchIndex?: number, validationCallback?: (uri: string, callback: (isValid: boolean) => void) => void): number;

	/**
	 * Deregisters a link matcher if it has been registered.
	 * @param matcherId The link matcher's ID (returned after register)
	 * @return Whether a link matcher was found and deregistered.
	 */
	deregisterLinkMatcher(matcherId: number): void;

	/**
	 * Check if anything is selected in terminal.
	 */
	hasSelection(): boolean;

	/**
	 * Copies the terminal selection to the clipboard.
	 */
	copySelection(): Promise<void>;

	/**
	 * Current selection in the terminal.
	 */
	readonly selection: string | undefined;

	/**
	 * Clear current selection.
	 */
	clearSelection(): void;

	/**
	 * Select all text in the terminal.
	 */
	selectAll(): void;

	/**
	 * Find the next instance of the term
	*/
	findNext(term: string, searchOptions: ISearchOptions): boolean;

	/**
	 * Find the previous instance of the term
	 */
	findPrevious(term: string, searchOptions: ISearchOptions): boolean;

	/**
	 * Notifies the terminal that the find widget's focus state has been changed.
	 */
	notifyFindWidgetFocusChanged(isFocused: boolean): void;

	/**
	 * Focuses the terminal instance if it's able to (xterm.js instance exists).
	 *
	 * @param focus Force focus even if there is a selection.
	 */
	focus(force?: boolean): void;

	/**
	 * Focuses the terminal instance when it's ready (the xterm.js instance is created). Use this
	 * when the terminal is being shown.
	 *
	 * @param focus Force focus even if there is a selection.
	 */
	focusWhenReady(force?: boolean): Promise<void>;

	/**
	 * Focuses and pastes the contents of the clipboard into the terminal instance.
	 */
	paste(): Promise<void>;

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

	/**
	 * Write text directly to the terminal, skipping the process if it exists.
	 * @param text The text to write.
	 */
	write(text: string): void;

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
	 * Immediately kills the terminal's current pty process and launches a new one to replace it.
	 *
	 * @param shell The new launch configuration.
	 */
	reuseTerminal(shell: IShellLaunchConfig): void;

	/**
	 * Sets the title of the terminal instance.
	 */
	setTitle(title: string, eventFromProcess: boolean): void;

	waitForTitle(): Promise<string>;

	setDimensions(dimensions: ITerminalDimensions): void;

	addDisposable(disposable: IDisposable): void;

	toggleEscapeSequenceLogging(): void;

	getInitialCwd(): Promise<string>;
	getCwd(): Promise<string>;
}

export interface ICommandTracker {
	scrollToPreviousCommand(): void;
	scrollToNextCommand(): void;
	selectToPreviousCommand(): void;
	selectToNextCommand(): void;
	selectToPreviousLine(): void;
	selectToNextLine(): void;
}

export interface INavigationMode {
	exitNavigationMode(): void;
	focusPreviousLine(): void;
	focusNextLine(): void;
}

export interface IBeforeProcessDataEvent {
	/**
	 * The data of the event, this can be modified by the event listener to change what gets sent
	 * to the terminal.
	 */
	data: string;
}

export interface ITerminalProcessManager extends IDisposable {
	readonly processState: ProcessState;
	readonly ptyProcessReady: Promise<void>;
	readonly shellProcessId: number | undefined;
	readonly remoteAuthority: string | undefined;
	readonly os: OperatingSystem | undefined;
	readonly userHome: string | undefined;

	readonly onProcessReady: Event<void>;
	readonly onBeforeProcessData: Event<IBeforeProcessDataEvent>;
	readonly onProcessData: Event<string>;
	readonly onProcessTitle: Event<string>;
	readonly onProcessExit: Event<number>;
	readonly onProcessOverrideDimensions: Event<ITerminalDimensions | undefined>;
	readonly onProcessResolvedShellLaunchConfig: Event<IShellLaunchConfig>;

	dispose(immediate?: boolean): void;
	createProcess(shellLaunchConfig: IShellLaunchConfig, cols: number, rows: number, isScreenReaderModeEnabled: boolean): Promise<void>;
	write(data: string): void;
	setDimensions(cols: number, rows: number): void;

	getInitialCwd(): Promise<string>;
	getCwd(): Promise<string>;
	getLatency(): Promise<number>;
}

export const enum ProcessState {
	// The process has not been initialized yet.
	UNINITIALIZED,
	// The process is currently launching, the process is marked as launching
	// for a short duration after being created and is helpful to indicate
	// whether the process died as a result of bad shell and args.
	LAUNCHING,
	// The process is running normally.
	RUNNING,
	// The process was killed during launch, likely as a result of bad shell and
	// args.
	KILLED_DURING_LAUNCH,
	// The process was killed by the user (the event originated from VS Code).
	KILLED_BY_USER,
	// The process was killed by itself, for example the shell crashed or `exit`
	// was run.
	KILLED_BY_PROCESS
}

export interface ITerminalProcessExtHostProxy extends IDisposable {
	readonly terminalId: number;

	emitData(data: string): void;
	emitTitle(title: string): void;
	emitReady(pid: number, cwd: string): void;
	emitExit(exitCode: number): void;
	emitOverrideDimensions(dimensions: ITerminalDimensions | undefined): void;
	emitResolvedShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig): void;
	emitInitialCwd(initialCwd: string): void;
	emitCwd(cwd: string): void;
	emitLatency(latency: number): void;

	onInput: Event<string>;
	onResize: Event<{ cols: number, rows: number }>;
	onShutdown: Event<boolean>;
	onRequestInitialCwd: Event<void>;
	onRequestCwd: Event<void>;
	onRequestLatency: Event<void>;
}

export interface ISpawnExtHostProcessRequest {
	proxy: ITerminalProcessExtHostProxy;
	shellLaunchConfig: IShellLaunchConfig;
	activeWorkspaceRootUri: URI;
	cols: number;
	rows: number;
	isWorkspaceShellAllowed: boolean;
}

export interface IStartExtensionTerminalRequest {
	proxy: ITerminalProcessExtHostProxy;
	cols: number;
	rows: number;
}

export interface IAvailableShellsRequest {
	(shells: IShellDefinition[]): void;
}

export interface IDefaultShellAndArgsRequest {
	useAutomationShell: boolean;
	callback: (shell: string, args: string[] | string | undefined) => void;
}

export enum LinuxDistro {
	Fedora,
	Ubuntu,
	Unknown
}

export interface IWindowsShellHelper extends IDisposable {
	getShellName(): Promise<string>;
}

/**
 * An interface representing a raw terminal child process, this contains a subset of the
 * child_process.ChildProcess node.js interface.
 */
export interface ITerminalChildProcess {
	onProcessData: Event<string>;
	onProcessExit: Event<number>;
	onProcessReady: Event<{ pid: number, cwd: string }>;
	onProcessTitleChanged: Event<string>;
	onProcessOverrideDimensions?: Event<ITerminalDimensions | undefined>;
	onProcessResolvedShellLaunchConfig?: Event<IShellLaunchConfig>;

	/**
	 * Shutdown the terminal process.
	 *
	 * @param immediate When true the process will be killed immediately, otherwise the process will
	 * be given some time to make sure no additional data comes through.
	 */
	shutdown(immediate: boolean): void;
	input(data: string): void;
	resize(cols: number, rows: number): void;

	getInitialCwd(): Promise<string>;
	getCwd(): Promise<string>;
	getLatency(): Promise<number>;
}
