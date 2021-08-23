/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment, OperatingSystem } from 'vs/base/common/platform';
import { IExtensionPointDescriptor } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IProcessDataEvent, IProcessReadyEvent, IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensions, ITerminalDimensionsOverride, ITerminalLaunchError, ITerminalProfile, ITerminalProfileObject, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, TerminalIcon, TerminalLocationString, TerminalShellType, TitleEventSource } from 'vs/platform/terminal/common/terminal';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IProcessDetails } from 'vs/platform/terminal/common/terminalProcess';

export const TERMINAL_VIEW_ID = 'terminal';

export const TERMINAL_CREATION_COMMANDS = ['workbench.action.terminal.toggleTerminal', 'workbench.action.terminal.new', 'workbench.action.togglePanel', 'workbench.action.terminal.focus'];

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

export const MINIMUM_FONT_WEIGHT = 1;
export const MAXIMUM_FONT_WEIGHT = 1000;
export const DEFAULT_FONT_WEIGHT = 'normal';
export const DEFAULT_BOLD_FONT_WEIGHT = 'bold';
export const SUGGESTIONS_FONT_WEIGHT = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

export const ITerminalProfileResolverService = createDecorator<ITerminalProfileResolverService>('terminalProfileResolverService');
export interface ITerminalProfileResolverService {
	readonly _serviceBrand: undefined;

	readonly defaultProfileName: string | undefined;

	/**
	 * Resolves the icon of a shell launch config if this will use the default profile
	 */
	resolveIcon(shellLaunchConfig: IShellLaunchConfig, os: OperatingSystem): void;
	resolveShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig, options: IShellLaunchConfigResolveOptions): Promise<void>;
	getDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile>;
	getDefaultShell(options: IShellLaunchConfigResolveOptions): Promise<string>;
	getDefaultShellArgs(options: IShellLaunchConfigResolveOptions): Promise<string | string[]>;
	getEnvironment(remoteAuthority: string | undefined): Promise<IProcessEnvironment>;
	createProfileFromShellAndShellArgs(shell?: unknown, shellArgs?: unknown): Promise<ITerminalProfile | string>;
}

export interface IShellLaunchConfigResolveOptions {
	remoteAuthority: string | undefined;
	os: OperatingSystem;
	allowAutomationShell?: boolean;
}

export interface IOffProcessTerminalService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when the ptyHost process becomes non-responsive, this should disable stdin for all
	 * terminals using this pty host connection and mark them as disconnected.
	 */
	onPtyHostUnresponsive: Event<void>;
	/**
	 * Fired when the ptyHost process becomes responsive after being non-responsive. Allowing
	 * previously disconnected terminals to reconnect.
	 */
	onPtyHostResponsive: Event<void>;
	/**
	 * Fired when the ptyHost has been restarted, this is used as a signal for listening terminals
	 * that its pty has been lost and will remain disconnected.
	 */
	onPtyHostRestart: Event<void>;

	onDidRequestDetach: Event<{ requestId: number, workspaceId: string, instanceId: number }>;

	attachToProcess(id: number): Promise<ITerminalChildProcess | undefined>;
	listProcesses(): Promise<IProcessDetails[]>;
	getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string>;
	getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]>;
	getWslPath(original: string): Promise<string>;
	getEnvironment(): Promise<IProcessEnvironment>;
	getShellEnvironment(): Promise<IProcessEnvironment | undefined>;
	setTerminalLayoutInfo(layoutInfo?: ITerminalsLayoutInfoById): Promise<void>;
	updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void>;
	updateIcon(id: number, icon: TerminalIcon, color?: string): Promise<void>;
	getTerminalLayoutInfo(): Promise<ITerminalsLayoutInfo | undefined>;
	reduceConnectionGraceTime(): Promise<void>;
	requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined>;
	acceptDetachInstanceReply(requestId: number, persistentProcessId?: number): Promise<void>;
}

export const ILocalTerminalService = createDecorator<ILocalTerminalService>('localTerminalService');
export interface ILocalTerminalService extends IOffProcessTerminalService {
	createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment,
		windowsEnableConpty: boolean,
		shouldPersist: boolean
	): Promise<ITerminalChildProcess>;
}

export type FontWeight = 'normal' | 'bold' | number;

export interface ITerminalProfiles {
	linux: { [key: string]: ITerminalProfileObject };
	osx: { [key: string]: ITerminalProfileObject };
	windows: { [key: string]: ITerminalProfileObject };
}

export type ConfirmOnKill = 'never' | 'always' | 'editor' | 'panel';
export type ConfirmOnExit = 'never' | 'always' | 'hasChildProcesses';

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
	profiles: ITerminalProfiles;
	defaultProfile: {
		linux: string | null;
		osx: string | null;
		windows: string | null;
	};
	useWslProfiles: boolean;
	altClickMovesCursor: boolean;
	macOptionIsMeta: boolean;
	macOptionClickForcesSelection: boolean;
	gpuAcceleration: 'auto' | 'on' | 'canvas' | 'off';
	rightClickBehavior: 'default' | 'copyPaste' | 'paste' | 'selectWord';
	cursorBlinking: boolean;
	cursorStyle: string;
	cursorWidth: number;
	drawBoldTextInBrightColors: boolean;
	fastScrollSensitivity: number;
	fontFamily: string;
	fontWeight: FontWeight;
	fontWeightBold: FontWeight;
	minimumContrastRatio: number;
	mouseWheelScrollSensitivity: number;
	sendKeybindingsToShell: boolean;
	// fontLigatures: boolean;
	fontSize: number;
	letterSpacing: number;
	lineHeight: number;
	detectLocale: 'auto' | 'off' | 'on';
	scrollback: number;
	commandsToSkipShell: string[];
	allowChords: boolean;
	allowMnemonics: boolean;
	cwd: string;
	confirmOnExit: ConfirmOnExit;
	confirmOnKill: ConfirmOnKill;
	enableBell: boolean;
	env: {
		linux: { [key: string]: string };
		osx: { [key: string]: string };
		windows: { [key: string]: string };
	};
	environmentChangesIndicator: 'off' | 'on' | 'warnonly';
	environmentChangesRelaunch: boolean;
	showExitAlert: boolean;
	splitCwd: 'workspaceRoot' | 'initial' | 'inherited';
	windowsEnableConpty: boolean;
	wordSeparators: string;
	titleMode: 'executable' | 'sequence';
	enableFileLinks: boolean;
	unicodeVersion: '6' | '11';
	experimentalLinkProvider: boolean;
	localEchoLatencyThreshold: number;
	localEchoExcludePrograms: ReadonlyArray<string>;
	localEchoStyle: 'bold' | 'dim' | 'italic' | 'underlined' | 'inverted' | string;
	enablePersistentSessions: boolean;
	tabs: {
		enabled: boolean;
		hideCondition: 'never' | 'singleTerminal' | 'singleGroup';
		showActiveTerminal: 'always' | 'singleTerminal' | 'singleTerminalOrNarrow' | 'singleGroup' | 'never';
		location: 'left' | 'right';
		focusMode: 'singleClick' | 'doubleClick';
	},
	bellDuration: number;
	defaultLocation: TerminalLocationString;
	customGlyphs: boolean;
}

export const DEFAULT_LOCAL_ECHO_EXCLUDE: ReadonlyArray<string> = ['vim', 'vi', 'nano', 'tmux'];

export interface ITerminalConfigHelper {
	config: ITerminalConfiguration;

	configFontIsMonospace(): boolean;
	getFont(): ITerminalFont;
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

export interface IRemoteTerminalAttachTarget {
	id: number;
	pid: number;
	title: string;
	titleSource: TitleEventSource;
	cwd: string;
	workspaceId: string;
	workspaceName: string;
	isOrphan: boolean;
	icon: URI | { light: URI; dark: URI } | { id: string, color?: { id: string } } | undefined;
	color: string | undefined;
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

export interface IDefaultShellAndArgsRequest {
	useAutomationShell: boolean;
	callback: (shell: string, args: string[] | string | undefined) => void;
}

export interface ITerminalProcessManager extends IDisposable {
	readonly processState: ProcessState;
	readonly ptyProcessReady: Promise<void>;
	readonly shellProcessId: number | undefined;
	readonly remoteAuthority: string | undefined;
	readonly os: OperatingSystem | undefined;
	readonly userHome: string | undefined;
	readonly environmentVariableInfo: IEnvironmentVariableInfo | undefined;
	readonly persistentProcessId: number | undefined;
	readonly shouldPersist: boolean;
	readonly isDisconnected: boolean;
	readonly hasWrittenData: boolean;
	readonly hasChildProcesses: boolean;

	readonly onPtyDisconnect: Event<void>;
	readonly onPtyReconnect: Event<void>;

	readonly onProcessReady: Event<IProcessReadyEvent>;
	readonly onBeforeProcessData: Event<IBeforeProcessDataEvent>;
	readonly onProcessData: Event<IProcessDataEvent>;
	readonly onProcessTitle: Event<string>;
	readonly onProcessShellTypeChanged: Event<TerminalShellType>;
	readonly onProcessExit: Event<number | undefined>;
	readonly onProcessOverrideDimensions: Event<ITerminalDimensionsOverride | undefined>;
	readonly onProcessResolvedShellLaunchConfig: Event<IShellLaunchConfig>;
	readonly onProcessDidChangeHasChildProcesses: Event<boolean>;
	readonly onEnvironmentVariableInfoChanged: Event<IEnvironmentVariableInfo>;

	dispose(immediate?: boolean): void;
	detachFromProcess(): Promise<void>;
	createProcess(shellLaunchConfig: IShellLaunchConfig, cols: number, rows: number, isScreenReaderModeEnabled: boolean): Promise<ITerminalLaunchError | undefined>;
	relaunch(shellLaunchConfig: IShellLaunchConfig, cols: number, rows: number, isScreenReaderModeEnabled: boolean, reset: boolean): Promise<ITerminalLaunchError | undefined>;
	write(data: string): Promise<void>;
	setDimensions(cols: number, rows: number): Promise<void>;
	setDimensions(cols: number, rows: number, sync: false): Promise<void>;
	setDimensions(cols: number, rows: number, sync: true): void;
	setUnicodeVersion(version: '6' | '11'): Promise<void>;
	acknowledgeDataEvent(charCount: number): void;
	processBinary(data: string): void;

	getInitialCwd(): Promise<string>;
	getCwd(): Promise<string>;
	getLatency(): Promise<number>;
}

export const enum ProcessState {
	// The process has not been initialized yet.
	Uninitialized = 1,
	// The process is currently launching, the process is marked as launching
	// for a short duration after being created and is helpful to indicate
	// whether the process died as a result of bad shell and args.
	Launching = 2,
	// The process is running normally.
	Running = 3,
	// The process was killed during launch, likely as a result of bad shell and
	// args.
	KilledDuringLaunch = 4,
	// The process was killed by the user (the event originated from VS Code).
	KilledByUser = 5,
	// The process was killed by itself, for example the shell crashed or `exit`
	// was run.
	KilledByProcess = 6
}

export interface ITerminalProcessExtHostProxy extends IDisposable {
	readonly instanceId: number;

	emitData(data: string): void;
	emitTitle(title: string): void;
	emitReady(pid: number, cwd: string): void;
	emitExit(exitCode: number | undefined): void;
	emitOverrideDimensions(dimensions: ITerminalDimensions | undefined): void;
	emitResolvedShellLaunchConfig(shellLaunchConfig: IShellLaunchConfig): void;
	emitInitialCwd(initialCwd: string): void;
	emitCwd(cwd: string): void;
	emitLatency(latency: number): void;

	onInput: Event<string>;
	onBinary: Event<string>;
	onResize: Event<{ cols: number, rows: number }>;
	onAcknowledgeDataEvent: Event<number>;
	onShutdown: Event<boolean>;
	onRequestInitialCwd: Event<void>;
	onRequestCwd: Event<void>;
	onRequestLatency: Event<void>;
}

export interface IStartExtensionTerminalRequest {
	proxy: ITerminalProcessExtHostProxy;
	cols: number;
	rows: number;
	callback: (error: ITerminalLaunchError | undefined) => void;
}

export interface IDefaultShellAndArgsRequest {
	useAutomationShell: boolean;
	callback: (shell: string, args: string[] | string | undefined) => void;
}

export const QUICK_LAUNCH_PROFILE_CHOICE = 'workbench.action.terminal.profile.choice';

export const enum TerminalCommandId {
	FindNext = 'workbench.action.terminal.findNext',
	FindPrevious = 'workbench.action.terminal.findPrevious',
	Toggle = 'workbench.action.terminal.toggleTerminal',
	Kill = 'workbench.action.terminal.kill',
	KillEditor = 'workbench.action.terminal.killEditor',
	KillInstance = 'workbench.action.terminal.killInstance',
	QuickKill = 'workbench.action.terminal.quickKill',
	ConfigureTerminalSettings = 'workbench.action.terminal.openSettings',
	CopySelection = 'workbench.action.terminal.copySelection',
	SelectAll = 'workbench.action.terminal.selectAll',
	DeleteWordLeft = 'workbench.action.terminal.deleteWordLeft',
	DeleteWordRight = 'workbench.action.terminal.deleteWordRight',
	DeleteToLineStart = 'workbench.action.terminal.deleteToLineStart',
	MoveToLineStart = 'workbench.action.terminal.moveToLineStart',
	MoveToLineEnd = 'workbench.action.terminal.moveToLineEnd',
	New = 'workbench.action.terminal.new',
	NewWithCwd = 'workbench.action.terminal.newWithCwd',
	NewLocal = 'workbench.action.terminal.newLocal',
	NewInActiveWorkspace = 'workbench.action.terminal.newInActiveWorkspace',
	NewWithProfile = 'workbench.action.terminal.newWithProfile',
	Split = 'workbench.action.terminal.split',
	SplitInstance = 'workbench.action.terminal.splitInstance',
	SplitInActiveWorkspace = 'workbench.action.terminal.splitInActiveWorkspace',
	Unsplit = 'workbench.action.terminal.unsplit',
	UnsplitInstance = 'workbench.action.terminal.unsplitInstance',
	JoinInstance = 'workbench.action.terminal.joinInstance',
	Relaunch = 'workbench.action.terminal.relaunch',
	FocusPreviousPane = 'workbench.action.terminal.focusPreviousPane',
	ShowTabs = 'workbench.action.terminal.showTabs',
	CreateTerminalEditor = 'workbench.action.createTerminalEditor',
	CreateTerminalEditorSide = 'workbench.action.createTerminalEditorSide',
	FocusTabs = 'workbench.action.terminal.focusTabs',
	FocusNextPane = 'workbench.action.terminal.focusNextPane',
	ResizePaneLeft = 'workbench.action.terminal.resizePaneLeft',
	ResizePaneRight = 'workbench.action.terminal.resizePaneRight',
	ResizePaneUp = 'workbench.action.terminal.resizePaneUp',
	CreateWithProfileButton = 'workbench.action.terminal.createProfileButton',
	ResizePaneDown = 'workbench.action.terminal.resizePaneDown',
	Focus = 'workbench.action.terminal.focus',
	FocusNext = 'workbench.action.terminal.focusNext',
	FocusPrevious = 'workbench.action.terminal.focusPrevious',
	Paste = 'workbench.action.terminal.paste',
	PasteSelection = 'workbench.action.terminal.pasteSelection',
	SelectDefaultProfile = 'workbench.action.terminal.selectDefaultShell',
	RunSelectedText = 'workbench.action.terminal.runSelectedText',
	RunActiveFile = 'workbench.action.terminal.runActiveFile',
	SwitchTerminal = 'workbench.action.terminal.switchTerminal',
	ScrollDownLine = 'workbench.action.terminal.scrollDown',
	ScrollDownPage = 'workbench.action.terminal.scrollDownPage',
	ScrollToBottom = 'workbench.action.terminal.scrollToBottom',
	ScrollUpLine = 'workbench.action.terminal.scrollUp',
	ScrollUpPage = 'workbench.action.terminal.scrollUpPage',
	ScrollToTop = 'workbench.action.terminal.scrollToTop',
	Clear = 'workbench.action.terminal.clear',
	ClearSelection = 'workbench.action.terminal.clearSelection',
	ChangeIcon = 'workbench.action.terminal.changeIcon',
	ChangeIconPanel = 'workbench.action.terminal.changeIconPanel',
	ChangeIconInstance = 'workbench.action.terminal.changeIconInstance',
	ChangeColor = 'workbench.action.terminal.changeColor',
	ChangeColorPanel = 'workbench.action.terminal.changeColorPanel',
	ChangeColorInstance = 'workbench.action.terminal.changeColorInstance',
	Rename = 'workbench.action.terminal.rename',
	RenamePanel = 'workbench.action.terminal.renamePanel',
	RenameInstance = 'workbench.action.terminal.renameInstance',
	RenameWithArgs = 'workbench.action.terminal.renameWithArg',
	FindFocus = 'workbench.action.terminal.focusFind',
	FindHide = 'workbench.action.terminal.hideFind',
	QuickOpenTerm = 'workbench.action.quickOpenTerm',
	ScrollToPreviousCommand = 'workbench.action.terminal.scrollToPreviousCommand',
	ScrollToNextCommand = 'workbench.action.terminal.scrollToNextCommand',
	SelectToPreviousCommand = 'workbench.action.terminal.selectToPreviousCommand',
	SelectToNextCommand = 'workbench.action.terminal.selectToNextCommand',
	SelectToPreviousLine = 'workbench.action.terminal.selectToPreviousLine',
	SelectToNextLine = 'workbench.action.terminal.selectToNextLine',
	ToggleEscapeSequenceLogging = 'toggleEscapeSequenceLogging',
	SendSequence = 'workbench.action.terminal.sendSequence',
	ToggleFindRegex = 'workbench.action.terminal.toggleFindRegex',
	ToggleFindWholeWord = 'workbench.action.terminal.toggleFindWholeWord',
	ToggleFindCaseSensitive = 'workbench.action.terminal.toggleFindCaseSensitive',
	NavigationModeExit = 'workbench.action.terminal.navigationModeExit',
	NavigationModeFocusNext = 'workbench.action.terminal.navigationModeFocusNext',
	NavigationModeFocusPrevious = 'workbench.action.terminal.navigationModeFocusPrevious',
	ShowEnvironmentInformation = 'workbench.action.terminal.showEnvironmentInformation',
	SearchWorkspace = 'workbench.action.terminal.searchWorkspace',
	AttachToSession = 'workbench.action.terminal.attachToSession',
	DetachSession = 'workbench.action.terminal.detachSession',
	MoveToEditor = 'workbench.action.terminal.moveToEditor',
	MoveToEditorInstance = 'workbench.action.terminal.moveToEditorInstance',
	MoveToTerminalPanel = 'workbench.action.terminal.moveToTerminalPanel',
}

export const DEFAULT_COMMANDS_TO_SKIP_SHELL: string[] = [
	TerminalCommandId.ClearSelection,
	TerminalCommandId.Clear,
	TerminalCommandId.CopySelection,
	TerminalCommandId.DeleteToLineStart,
	TerminalCommandId.DeleteWordLeft,
	TerminalCommandId.DeleteWordRight,
	TerminalCommandId.FindFocus,
	TerminalCommandId.FindHide,
	TerminalCommandId.FindNext,
	TerminalCommandId.FindPrevious,
	TerminalCommandId.ToggleFindRegex,
	TerminalCommandId.ToggleFindWholeWord,
	TerminalCommandId.ToggleFindCaseSensitive,
	TerminalCommandId.FocusNextPane,
	TerminalCommandId.FocusNext,
	TerminalCommandId.FocusPreviousPane,
	TerminalCommandId.FocusPrevious,
	TerminalCommandId.Focus,
	TerminalCommandId.Kill,
	TerminalCommandId.KillEditor,
	TerminalCommandId.MoveToEditor,
	TerminalCommandId.MoveToLineEnd,
	TerminalCommandId.MoveToLineStart,
	TerminalCommandId.MoveToTerminalPanel,
	TerminalCommandId.NewInActiveWorkspace,
	TerminalCommandId.New,
	TerminalCommandId.Paste,
	TerminalCommandId.PasteSelection,
	TerminalCommandId.ResizePaneDown,
	TerminalCommandId.ResizePaneLeft,
	TerminalCommandId.ResizePaneRight,
	TerminalCommandId.ResizePaneUp,
	TerminalCommandId.RunActiveFile,
	TerminalCommandId.RunSelectedText,
	TerminalCommandId.ScrollDownLine,
	TerminalCommandId.ScrollDownPage,
	TerminalCommandId.ScrollToBottom,
	TerminalCommandId.ScrollToNextCommand,
	TerminalCommandId.ScrollToPreviousCommand,
	TerminalCommandId.ScrollToTop,
	TerminalCommandId.ScrollUpLine,
	TerminalCommandId.ScrollUpPage,
	TerminalCommandId.SendSequence,
	TerminalCommandId.SelectAll,
	TerminalCommandId.SelectToNextCommand,
	TerminalCommandId.SelectToNextLine,
	TerminalCommandId.SelectToPreviousCommand,
	TerminalCommandId.SelectToPreviousLine,
	TerminalCommandId.SplitInActiveWorkspace,
	TerminalCommandId.Split,
	TerminalCommandId.Toggle,
	TerminalCommandId.NavigationModeExit,
	TerminalCommandId.NavigationModeFocusNext,
	TerminalCommandId.NavigationModeFocusPrevious,
	'editor.action.toggleTabFocusMode',
	'notifications.hideToasts',
	'workbench.action.quickOpen',
	'workbench.action.quickOpenPreviousEditor',
	'workbench.action.showCommands',
	'workbench.action.tasks.build',
	'workbench.action.tasks.restartTask',
	'workbench.action.tasks.runTask',
	'workbench.action.tasks.reRunTask',
	'workbench.action.tasks.showLog',
	'workbench.action.tasks.showTasks',
	'workbench.action.tasks.terminate',
	'workbench.action.tasks.test',
	'workbench.action.toggleFullScreen',
	'workbench.action.terminal.focusAtIndex1',
	'workbench.action.terminal.focusAtIndex2',
	'workbench.action.terminal.focusAtIndex3',
	'workbench.action.terminal.focusAtIndex4',
	'workbench.action.terminal.focusAtIndex5',
	'workbench.action.terminal.focusAtIndex6',
	'workbench.action.terminal.focusAtIndex7',
	'workbench.action.terminal.focusAtIndex8',
	'workbench.action.terminal.focusAtIndex9',
	'workbench.action.focusSecondEditorGroup',
	'workbench.action.focusThirdEditorGroup',
	'workbench.action.focusFourthEditorGroup',
	'workbench.action.focusFifthEditorGroup',
	'workbench.action.focusSixthEditorGroup',
	'workbench.action.focusSeventhEditorGroup',
	'workbench.action.focusEighthEditorGroup',
	'workbench.action.focusNextPart',
	'workbench.action.focusPreviousPart',
	'workbench.action.nextPanelView',
	'workbench.action.previousPanelView',
	'workbench.action.nextSideBarView',
	'workbench.action.previousSideBarView',
	'workbench.action.debug.start',
	'workbench.action.debug.stop',
	'workbench.action.debug.run',
	'workbench.action.debug.restart',
	'workbench.action.debug.continue',
	'workbench.action.debug.pause',
	'workbench.action.debug.stepInto',
	'workbench.action.debug.stepOut',
	'workbench.action.debug.stepOver',
	'workbench.action.nextEditor',
	'workbench.action.previousEditor',
	'workbench.action.nextEditorInGroup',
	'workbench.action.previousEditorInGroup',
	'workbench.action.openNextRecentlyUsedEditor',
	'workbench.action.openPreviousRecentlyUsedEditor',
	'workbench.action.openNextRecentlyUsedEditorInGroup',
	'workbench.action.openPreviousRecentlyUsedEditorInGroup',
	'workbench.action.quickOpenPreviousRecentlyUsedEditor',
	'workbench.action.quickOpenLeastRecentlyUsedEditor',
	'workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup',
	'workbench.action.quickOpenLeastRecentlyUsedEditorInGroup',
	'workbench.action.focusActiveEditorGroup',
	'workbench.action.focusFirstEditorGroup',
	'workbench.action.focusLastEditorGroup',
	'workbench.action.firstEditorInGroup',
	'workbench.action.lastEditorInGroup',
	'workbench.action.navigateUp',
	'workbench.action.navigateDown',
	'workbench.action.navigateRight',
	'workbench.action.navigateLeft',
	'workbench.action.togglePanel',
	'workbench.action.quickOpenView',
	'workbench.action.toggleMaximizedPanel'
];

export const terminalContributionsDescriptor: IExtensionPointDescriptor = {
	extensionPoint: 'terminal',
	defaultExtensionKind: ['workspace'],
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.terminal', 'Contributes terminal functionality.'),
		type: 'object',
		properties: {
			types: {
				type: 'array',
				description: nls.localize('vscode.extension.contributes.terminal.types', "Defines additional terminal types that the user can create."),
				items: {
					type: 'object',
					required: ['command', 'title'],
					properties: {
						command: {
							description: nls.localize('vscode.extension.contributes.terminal.types.command', "Command to execute when the user creates this type of terminal."),
							type: 'string',
						},
						title: {
							description: nls.localize('vscode.extension.contributes.terminal.types.title', "Title for this type of terminal."),
							type: 'string',
						},
						icon: {
							description: nls.localize('vscode.extension.contributes.terminal.types.icon', "A codicon, URI, or light and dark URIs to associate with this terminal type."),
							anyOf: [{
								type: 'string',
							},
							{
								type: 'object',
								properties: {
									light: {
										description: nls.localize('vscode.extension.contributes.terminal.types.icon.light', 'Icon path when a light theme is used'),
										type: 'string'
									},
									dark: {
										description: nls.localize('vscode.extension.contributes.terminal.types.icon.dark', 'Icon path when a dark theme is used'),
										type: 'string'
									}
								}
							}]
						},
					},
				},
			},
			profiles: {
				type: 'array',
				description: nls.localize('vscode.extension.contributes.terminal.profiles', "Defines additional terminal profiles that the user can create."),
				items: {
					type: 'object',
					required: ['id', 'title'],
					defaultSnippets: [{
						body: {
							id: '$1',
							title: '$2'
						}
					}],
					properties: {
						id: {
							description: nls.localize('vscode.extension.contributes.terminal.profiles.id', "The ID of the terminal profile provider."),
							type: 'string',
						},
						title: {
							description: nls.localize('vscode.extension.contributes.terminal.profiles.title', "Title for this terminal profile."),
							type: 'string',
						},
						icon: {
							description: nls.localize('vscode.extension.contributes.terminal.types.icon', "A codicon, URI, or light and dark URIs to associate with this terminal type."),
							anyOf: [{
								type: 'string',
							},
							{
								type: 'object',
								properties: {
									light: {
										description: nls.localize('vscode.extension.contributes.terminal.types.icon.light', 'Icon path when a light theme is used'),
										type: 'string'
									},
									dark: {
										description: nls.localize('vscode.extension.contributes.terminal.types.icon.dark', 'Icon path when a dark theme is used'),
										type: 'string'
									}
								}
							}]
						},
					},
				},
			},
		},
	},
};
