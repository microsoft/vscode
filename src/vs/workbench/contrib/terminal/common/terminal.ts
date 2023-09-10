/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment, OperatingSystem } from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ISerializedCommandDetectionCapability, ITerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IMergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';
import { ICreateContributedTerminalProfileOptions, IExtensionTerminalProfile, IFixedTerminalDimensions, IProcessDataEvent, IProcessProperty, IProcessPropertyMap, IProcessReadyEvent, IProcessReadyWindowsPty, IShellLaunchConfig, ITerminalBackend, ITerminalContributions, ITerminalEnvironment, ITerminalLaunchError, ITerminalProfile, ITerminalProfileObject, ProcessPropertyType, TerminalIcon, TerminalLocationString, TitleEventSource } from 'vs/platform/terminal/common/terminal';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IExtensionPointDescriptor } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const TERMINAL_VIEW_ID = 'terminal';

export const TERMINAL_CREATION_COMMANDS = ['workbench.action.terminal.toggleTerminal', 'workbench.action.terminal.new', 'workbench.action.togglePanel', 'workbench.action.terminal.focus'];

export const TerminalCursorStyle = {
	BLOCK: 'block',
	LINE: 'line',
	UNDERLINE: 'underline'
};

export const TERMINAL_CONFIG_SECTION = 'terminal.integrated';

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
	getDefaultIcon(): TerminalIcon & ThemeIcon;
	getEnvironment(remoteAuthority: string | undefined): Promise<IProcessEnvironment>;
	createProfileFromShellAndShellArgs(shell?: unknown, shellArgs?: unknown): Promise<ITerminalProfile | string>;
}

/*
 * When there were shell integration args injected
 * and createProcess returns an error, this exit code will be used.
 */
export const ShellIntegrationExitCode = 633;

export interface IRegisterContributedProfileArgs {
	extensionIdentifier: string; id: string; title: string; options: ICreateContributedTerminalProfileOptions;
}

export const ITerminalProfileService = createDecorator<ITerminalProfileService>('terminalProfileService');
export interface ITerminalProfileService {
	readonly _serviceBrand: undefined;
	readonly availableProfiles: ITerminalProfile[];
	readonly contributedProfiles: IExtensionTerminalProfile[];
	readonly profilesReady: Promise<void>;
	getPlatformKey(): Promise<string>;
	refreshAvailableProfiles(): void;
	getDefaultProfileName(): string | undefined;
	getDefaultProfile(os?: OperatingSystem): ITerminalProfile | undefined;
	onDidChangeAvailableProfiles: Event<ITerminalProfile[]>;
	getContributedDefaultProfile(shellLaunchConfig: IShellLaunchConfig): Promise<IExtensionTerminalProfile | undefined>;
	registerContributedProfile(args: IRegisterContributedProfileArgs): Promise<void>;
	getContributedProfileProvider(extensionIdentifier: string, id: string): ITerminalProfileProvider | undefined;
	registerTerminalProfileProvider(extensionIdentifier: string, id: string, profileProvider: ITerminalProfileProvider): IDisposable;
}

export interface ITerminalProfileProvider {
	createContributedTerminalProfile(options: ICreateContributedTerminalProfileOptions): Promise<void>;
}

export interface IShellLaunchConfigResolveOptions {
	remoteAuthority: string | undefined;
	os: OperatingSystem;
	allowAutomationShell?: boolean;
}

export type FontWeight = 'normal' | 'bold' | number;

export interface ITerminalProfiles {
	linux: { [key: string]: ITerminalProfileObject };
	osx: { [key: string]: ITerminalProfileObject };
	windows: { [key: string]: ITerminalProfileObject };
}

export type ConfirmOnKill = 'never' | 'always' | 'editor' | 'panel';
export type ConfirmOnExit = 'never' | 'always' | 'hasChildProcesses';

export interface ICompleteTerminalConfiguration {
	'terminal.integrated.env.windows': ITerminalEnvironment;
	'terminal.integrated.env.osx': ITerminalEnvironment;
	'terminal.integrated.env.linux': ITerminalEnvironment;
	'terminal.integrated.cwd': string;
	'terminal.integrated.detectLocale': 'auto' | 'off' | 'on';
}

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
	rightClickBehavior: 'default' | 'copyPaste' | 'paste' | 'selectWord' | 'nothing';
	cursorBlinking: boolean;
	cursorStyle: 'block' | 'underline' | 'line';
	cursorWidth: number;
	drawBoldTextInBrightColors: boolean;
	fastScrollSensitivity: number;
	fontFamily: string;
	fontWeight: FontWeight;
	fontWeightBold: FontWeight;
	minimumContrastRatio: number;
	mouseWheelScrollSensitivity: number;
	tabStopWidth: number;
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
	enableFileLinks: 'off' | 'on' | 'notRemote';
	unicodeVersion: '6' | '11';
	localEchoLatencyThreshold: number;
	localEchoExcludePrograms: ReadonlyArray<string>;
	localEchoEnabled: 'auto' | 'on' | 'off';
	localEchoStyle: 'bold' | 'dim' | 'italic' | 'underlined' | 'inverted' | string;
	enablePersistentSessions: boolean;
	tabs: {
		enabled: boolean;
		hideCondition: 'never' | 'singleTerminal' | 'singleGroup';
		showActiveTerminal: 'always' | 'singleTerminal' | 'singleTerminalOrNarrow' | 'singleGroup' | 'never';
		location: 'left' | 'right';
		focusMode: 'singleClick' | 'doubleClick';
		title: string;
		description: string;
		separator: string;
	};
	bellDuration: number;
	defaultLocation: TerminalLocationString;
	customGlyphs: boolean;
	persistentSessionReviveProcess: 'onExit' | 'onExitAndWindowClose' | 'never';
	ignoreProcessNames: string[];
	autoReplies: { [key: string]: string };
	shellIntegration?: {
		enabled: boolean;
		decorationsEnabled: boolean;
	};
	enableImages: boolean;
	smoothScrolling: boolean;
	ignoreBracketedPasteMode: boolean;
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
	icon: URI | { light: URI; dark: URI } | { id: string; color?: { id: string } } | undefined;
	color: string | undefined;
	fixedDimensions: IFixedTerminalDimensions | undefined;
	shellIntegrationNonce: string;
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
	readonly initialCwd: string;
	readonly environmentVariableInfo: IEnvironmentVariableInfo | undefined;
	readonly persistentProcessId: number | undefined;
	readonly shouldPersist: boolean;
	readonly hasWrittenData: boolean;
	readonly hasChildProcesses: boolean;
	readonly backend: ITerminalBackend | undefined;
	readonly capabilities: ITerminalCapabilityStore;
	readonly shellIntegrationNonce: string;
	readonly extEnvironmentVariableCollection: IMergedEnvironmentVariableCollection | undefined;

	readonly onPtyDisconnect: Event<void>;
	readonly onPtyReconnect: Event<void>;

	readonly onProcessReady: Event<IProcessReadyEvent>;
	readonly onBeforeProcessData: Event<IBeforeProcessDataEvent>;
	readonly onProcessData: Event<IProcessDataEvent>;
	readonly onProcessReplayComplete: Event<void>;
	readonly onEnvironmentVariableInfoChanged: Event<IEnvironmentVariableInfo>;
	readonly onDidChangeProperty: Event<IProcessProperty<any>>;
	readonly onProcessExit: Event<number | undefined>;
	readonly onRestoreCommands: Event<ISerializedCommandDetectionCapability>;

	dispose(immediate?: boolean): void;
	detachFromProcess(forcePersist?: boolean): Promise<void>;
	createProcess(shellLaunchConfig: IShellLaunchConfig, cols: number, rows: number): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined>;
	relaunch(shellLaunchConfig: IShellLaunchConfig, cols: number, rows: number, reset: boolean): Promise<ITerminalLaunchError | { injectedArgs: string[] } | undefined>;
	write(data: string): Promise<void>;
	setDimensions(cols: number, rows: number): Promise<void>;
	setDimensions(cols: number, rows: number, sync: false): Promise<void>;
	setDimensions(cols: number, rows: number, sync: true): void;
	clearBuffer(): Promise<void>;
	setUnicodeVersion(version: '6' | '11'): Promise<void>;
	acknowledgeDataEvent(charCount: number): void;
	processBinary(data: string): void;

	refreshProperty<T extends ProcessPropertyType>(type: T): Promise<IProcessPropertyMap[T]>;
	updateProperty<T extends ProcessPropertyType>(property: T, value: IProcessPropertyMap[T]): Promise<void>;
	getBackendOS(): Promise<OperatingSystem>;
	freePortKillProcess(port: string): Promise<void>;
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
	emitProcessProperty(property: IProcessProperty<any>): void;
	emitReady(pid: number, cwd: string, windowsPty: IProcessReadyWindowsPty | undefined): void;
	emitExit(exitCode: number | undefined): void;

	onInput: Event<string>;
	onBinary: Event<string>;
	onResize: Event<{ cols: number; rows: number }>;
	onAcknowledgeDataEvent: Event<number>;
	onShutdown: Event<boolean>;
	onRequestInitialCwd: Event<void>;
	onRequestCwd: Event<void>;
}

export interface IStartExtensionTerminalRequest {
	proxy: ITerminalProcessExtHostProxy;
	cols: number;
	rows: number;
	callback: (error: ITerminalLaunchError | undefined) => void;
}

export interface ITerminalStatus {
	/** An internal string ID used to identify the status. */
	id: string;
	/**
	 * The severity of the status, this defines both the color and how likely the status is to be
	 * the "primary status".
	 */
	severity: Severity;
	/**
	 * An icon representing the status, if this is not specified it will not show up on the terminal
	 * tab and will use the generic `info` icon when hovering.
	 */
	icon?: ThemeIcon;
	/**
	 * What to show for this status in the terminal's hover.
	 */
	tooltip?: string | undefined;
	/**
	 * Actions to expose on hover.
	 */
	hoverActions?: ITerminalStatusHoverAction[];
}

export interface ITerminalStatusHoverAction {
	label: string;
	commandId: string;
	run: () => void;
}

export const QUICK_LAUNCH_PROFILE_CHOICE = 'workbench.action.terminal.profile.choice';

export const enum TerminalCommandId {
	FindNext = 'workbench.action.terminal.findNext',
	FindPrevious = 'workbench.action.terminal.findPrevious',
	Toggle = 'workbench.action.terminal.toggleTerminal',
	Kill = 'workbench.action.terminal.kill',
	KillEditor = 'workbench.action.terminal.killEditor',
	KillInstance = 'workbench.action.terminal.killInstance',
	KillAll = 'workbench.action.terminal.killAll',
	QuickKill = 'workbench.action.terminal.quickKill',
	ConfigureTerminalSettings = 'workbench.action.terminal.openSettings',
	OpenDetectedLink = 'workbench.action.terminal.openDetectedLink',
	OpenWordLink = 'workbench.action.terminal.openWordLink',
	ShellIntegrationLearnMore = 'workbench.action.terminal.learnMore',
	OpenFileLink = 'workbench.action.terminal.openFileLink',
	OpenWebLink = 'workbench.action.terminal.openUrlLink',
	RunRecentCommand = 'workbench.action.terminal.runRecentCommand',
	FocusAccessibleBuffer = 'workbench.action.terminal.focusAccessibleBuffer',
	NavigateAccessibleBuffer = 'workbench.action.terminal.navigateAccessibleBuffer',
	AccessibleBufferGoToNextCommand = 'workbench.action.terminal.accessibleBufferGoToNextCommand',
	AccessibleBufferGoToPreviousCommand = 'workbench.action.terminal.accessibleBufferGoToPreviousCommand',
	CopyLastCommandOutput = 'workbench.action.terminal.copyLastCommandOutput',
	GoToRecentDirectory = 'workbench.action.terminal.goToRecentDirectory',
	CopyAndClearSelection = 'workbench.action.terminal.copyAndClearSelection',
	CopySelection = 'workbench.action.terminal.copySelection',
	CopySelectionAsHtml = 'workbench.action.terminal.copySelectionAsHtml',
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
	ShowQuickFixes = 'workbench.action.terminal.showQuickFixes',
	Unsplit = 'workbench.action.terminal.unsplit',
	UnsplitInstance = 'workbench.action.terminal.unsplitInstance',
	JoinInstance = 'workbench.action.terminal.joinInstance',
	Join = 'workbench.action.terminal.join',
	Relaunch = 'workbench.action.terminal.relaunch',
	FocusPreviousPane = 'workbench.action.terminal.focusPreviousPane',
	ShowTabs = 'workbench.action.terminal.showTabs',
	CreateTerminalEditor = 'workbench.action.createTerminalEditor',
	CreateTerminalEditorSameGroup = 'workbench.action.createTerminalEditorSameGroup',
	CreateTerminalEditorSide = 'workbench.action.createTerminalEditorSide',
	FocusTabs = 'workbench.action.terminal.focusTabs',
	FocusNextPane = 'workbench.action.terminal.focusNextPane',
	ResizePaneLeft = 'workbench.action.terminal.resizePaneLeft',
	ResizePaneRight = 'workbench.action.terminal.resizePaneRight',
	ResizePaneUp = 'workbench.action.terminal.resizePaneUp',
	SizeToContentWidth = 'workbench.action.terminal.sizeToContentWidth',
	SizeToContentWidthInstance = 'workbench.action.terminal.sizeToContentWidthInstance',
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
	SendSequence = 'workbench.action.terminal.sendSequence',
	ToggleFindRegex = 'workbench.action.terminal.toggleFindRegex',
	ToggleFindWholeWord = 'workbench.action.terminal.toggleFindWholeWord',
	ToggleFindCaseSensitive = 'workbench.action.terminal.toggleFindCaseSensitive',
	SearchWorkspace = 'workbench.action.terminal.searchWorkspace',
	AttachToSession = 'workbench.action.terminal.attachToSession',
	DetachSession = 'workbench.action.terminal.detachSession',
	MoveToEditor = 'workbench.action.terminal.moveToEditor',
	MoveToEditorInstance = 'workbench.action.terminal.moveToEditorInstance',
	MoveToTerminalPanel = 'workbench.action.terminal.moveToTerminalPanel',
	SetDimensions = 'workbench.action.terminal.setDimensions',
	ClearPreviousSessionHistory = 'workbench.action.terminal.clearPreviousSessionHistory',
	SelectPrevSuggestion = 'workbench.action.terminal.selectPrevSuggestion',
	SelectPrevPageSuggestion = 'workbench.action.terminal.selectPrevPageSuggestion',
	SelectNextSuggestion = 'workbench.action.terminal.selectNextSuggestion',
	SelectNextPageSuggestion = 'workbench.action.terminal.selectNextPageSuggestion',
	AcceptSelectedSuggestion = 'workbench.action.terminal.acceptSelectedSuggestion',
	HideSuggestWidget = 'workbench.action.terminal.hideSuggestWidget',
	FocusHover = 'workbench.action.terminal.focusHover',
	ShowEnvironmentContributions = 'workbench.action.terminal.showEnvironmentContributions',

	// Developer commands

	WriteDataToTerminal = 'workbench.action.terminal.writeDataToTerminal',
	ShowTextureAtlas = 'workbench.action.terminal.showTextureAtlas',
	RestartPtyHost = 'workbench.action.terminal.restartPtyHost',
}

export const DEFAULT_COMMANDS_TO_SKIP_SHELL: string[] = [
	TerminalCommandId.ClearSelection,
	TerminalCommandId.Clear,
	TerminalCommandId.CopyAndClearSelection,
	TerminalCommandId.CopySelection,
	TerminalCommandId.CopySelectionAsHtml,
	TerminalCommandId.CopyLastCommandOutput,
	TerminalCommandId.DeleteToLineStart,
	TerminalCommandId.DeleteWordLeft,
	TerminalCommandId.DeleteWordRight,
	TerminalCommandId.FindFocus,
	TerminalCommandId.FindHide,
	TerminalCommandId.FindNext,
	TerminalCommandId.FindPrevious,
	TerminalCommandId.GoToRecentDirectory,
	TerminalCommandId.ToggleFindRegex,
	TerminalCommandId.ToggleFindWholeWord,
	TerminalCommandId.ToggleFindCaseSensitive,
	TerminalCommandId.FocusNextPane,
	TerminalCommandId.FocusNext,
	TerminalCommandId.FocusPreviousPane,
	TerminalCommandId.FocusPrevious,
	TerminalCommandId.Focus,
	TerminalCommandId.SizeToContentWidth,
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
	TerminalCommandId.RunRecentCommand,
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
	TerminalCommandId.SelectPrevSuggestion,
	TerminalCommandId.SelectPrevPageSuggestion,
	TerminalCommandId.SelectNextSuggestion,
	TerminalCommandId.SelectNextPageSuggestion,
	TerminalCommandId.AcceptSelectedSuggestion,
	TerminalCommandId.HideSuggestWidget,
	TerminalCommandId.FocusHover,
	'editor.action.accessibilityHelp',
	'editor.action.toggleTabFocusMode',
	'notifications.hideList',
	'notifications.hideToasts',
	'workbench.action.closeQuickOpen',
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
	'workbench.action.toggleMaximizedPanel',
	'notification.acceptPrimaryAction',
	'runCommands'
];

export const terminalContributionsDescriptor: IExtensionPointDescriptor<ITerminalContributions> = {
	extensionPoint: 'terminal',
	defaultExtensionKind: ['workspace'],
	activationEventsGenerator: (contribs: ITerminalContributions[], result: { push(item: string): void }) => {
		for (const contrib of contribs) {
			for (const profileContrib of (contrib.profiles ?? [])) {
				result.push(`onTerminalProfile:${profileContrib.id}`);
			}
		}
	},
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.terminal', 'Contributes terminal functionality.'),
		type: 'object',
		properties: {
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
