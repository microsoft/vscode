/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IProcessEnvironment, OperatingSystem } from '../../../base/common/platform.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IPtyHostProcessReplayEvent, ISerializedCommandDetectionCapability, ITerminalCapabilityStore, type ITerminalCommand } from './capabilities/capabilities.js';
import { IGetTerminalLayoutInfoArgs, IProcessDetails, ISetTerminalLayoutInfoArgs } from './terminalProcess.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { ISerializableEnvironmentVariableCollections } from './environmentVariable.js';
import { IWorkspaceFolder } from '../../workspace/common/workspace.js';
import { Registry } from '../../registry/common/platform.js';
import type * as performance from '../../../base/common/performance.js';
import { ILogService } from '../../log/common/log.js';
import type { IAction } from '../../../base/common/actions.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { SingleOrMany } from '../../../base/common/types.js';

export const enum TerminalSettingPrefix {
	AutomationProfile = 'terminal.integrated.automationProfile.',
	DefaultProfile = 'terminal.integrated.defaultProfile.',
	Profiles = 'terminal.integrated.profiles.'
}

export const enum TerminalSettingId {
	SendKeybindingsToShell = 'terminal.integrated.sendKeybindingsToShell',
	AutomationProfileLinux = 'terminal.integrated.automationProfile.linux',
	AutomationProfileMacOs = 'terminal.integrated.automationProfile.osx',
	AutomationProfileWindows = 'terminal.integrated.automationProfile.windows',
	ProfilesWindows = 'terminal.integrated.profiles.windows',
	ProfilesMacOs = 'terminal.integrated.profiles.osx',
	ProfilesLinux = 'terminal.integrated.profiles.linux',
	DefaultProfileLinux = 'terminal.integrated.defaultProfile.linux',
	DefaultProfileMacOs = 'terminal.integrated.defaultProfile.osx',
	DefaultProfileWindows = 'terminal.integrated.defaultProfile.windows',
	UseWslProfiles = 'terminal.integrated.useWslProfiles',
	TabsDefaultColor = 'terminal.integrated.tabs.defaultColor',
	TabsDefaultIcon = 'terminal.integrated.tabs.defaultIcon',
	TabsEnabled = 'terminal.integrated.tabs.enabled',
	TabsEnableAnimation = 'terminal.integrated.tabs.enableAnimation',
	TabsHideCondition = 'terminal.integrated.tabs.hideCondition',
	TabsShowActiveTerminal = 'terminal.integrated.tabs.showActiveTerminal',
	TabsShowActions = 'terminal.integrated.tabs.showActions',
	TabsLocation = 'terminal.integrated.tabs.location',
	TabsFocusMode = 'terminal.integrated.tabs.focusMode',
	MacOptionIsMeta = 'terminal.integrated.macOptionIsMeta',
	MacOptionClickForcesSelection = 'terminal.integrated.macOptionClickForcesSelection',
	AltClickMovesCursor = 'terminal.integrated.altClickMovesCursor',
	CopyOnSelection = 'terminal.integrated.copyOnSelection',
	EnableMultiLinePasteWarning = 'terminal.integrated.enableMultiLinePasteWarning',
	DrawBoldTextInBrightColors = 'terminal.integrated.drawBoldTextInBrightColors',
	FontFamily = 'terminal.integrated.fontFamily',
	FontSize = 'terminal.integrated.fontSize',
	LetterSpacing = 'terminal.integrated.letterSpacing',
	LineHeight = 'terminal.integrated.lineHeight',
	MinimumContrastRatio = 'terminal.integrated.minimumContrastRatio',
	TabStopWidth = 'terminal.integrated.tabStopWidth',
	FastScrollSensitivity = 'terminal.integrated.fastScrollSensitivity',
	MouseWheelScrollSensitivity = 'terminal.integrated.mouseWheelScrollSensitivity',
	BellDuration = 'terminal.integrated.bellDuration',
	FontWeight = 'terminal.integrated.fontWeight',
	FontWeightBold = 'terminal.integrated.fontWeightBold',
	CursorBlinking = 'terminal.integrated.cursorBlinking',
	CursorStyle = 'terminal.integrated.cursorStyle',
	CursorStyleInactive = 'terminal.integrated.cursorStyleInactive',
	CursorWidth = 'terminal.integrated.cursorWidth',
	Scrollback = 'terminal.integrated.scrollback',
	DetectLocale = 'terminal.integrated.detectLocale',
	DefaultLocation = 'terminal.integrated.defaultLocation',
	GpuAcceleration = 'terminal.integrated.gpuAcceleration',
	TerminalTitleSeparator = 'terminal.integrated.tabs.separator',
	TerminalTitle = 'terminal.integrated.tabs.title',
	TerminalDescription = 'terminal.integrated.tabs.description',
	RightClickBehavior = 'terminal.integrated.rightClickBehavior',
	MiddleClickBehavior = 'terminal.integrated.middleClickBehavior',
	Cwd = 'terminal.integrated.cwd',
	ConfirmOnExit = 'terminal.integrated.confirmOnExit',
	ConfirmOnKill = 'terminal.integrated.confirmOnKill',
	EnableBell = 'terminal.integrated.enableBell',
	EnableVisualBell = 'terminal.integrated.enableVisualBell',
	CommandsToSkipShell = 'terminal.integrated.commandsToSkipShell',
	AllowChords = 'terminal.integrated.allowChords',
	AllowMnemonics = 'terminal.integrated.allowMnemonics',
	TabFocusMode = 'terminal.integrated.tabFocusMode',
	EnvMacOs = 'terminal.integrated.env.osx',
	EnvLinux = 'terminal.integrated.env.linux',
	EnvWindows = 'terminal.integrated.env.windows',
	EnvironmentChangesRelaunch = 'terminal.integrated.environmentChangesRelaunch',
	ShowExitAlert = 'terminal.integrated.showExitAlert',
	SplitCwd = 'terminal.integrated.splitCwd',
	WindowsEnableConpty = 'terminal.integrated.windowsEnableConpty',
	WindowsUseConptyDll = 'terminal.integrated.windowsUseConptyDll',
	WordSeparators = 'terminal.integrated.wordSeparators',
	EnableFileLinks = 'terminal.integrated.enableFileLinks',
	AllowedLinkSchemes = 'terminal.integrated.allowedLinkSchemes',
	UnicodeVersion = 'terminal.integrated.unicodeVersion',
	EnablePersistentSessions = 'terminal.integrated.enablePersistentSessions',
	PersistentSessionReviveProcess = 'terminal.integrated.persistentSessionReviveProcess',
	HideOnStartup = 'terminal.integrated.hideOnStartup',
	HideOnLastClosed = 'terminal.integrated.hideOnLastClosed',
	CustomGlyphs = 'terminal.integrated.customGlyphs',
	RescaleOverlappingGlyphs = 'terminal.integrated.rescaleOverlappingGlyphs',
	PersistentSessionScrollback = 'terminal.integrated.persistentSessionScrollback',
	InheritEnv = 'terminal.integrated.inheritEnv',
	ShowLinkHover = 'terminal.integrated.showLinkHover',
	IgnoreProcessNames = 'terminal.integrated.ignoreProcessNames',
	ShellIntegrationEnabled = 'terminal.integrated.shellIntegration.enabled',
	ShellIntegrationShowWelcome = 'terminal.integrated.shellIntegration.showWelcome',
	ShellIntegrationDecorationsEnabled = 'terminal.integrated.shellIntegration.decorationsEnabled',
	ShellIntegrationTimeout = 'terminal.integrated.shellIntegration.timeout',
	ShellIntegrationQuickFixEnabled = 'terminal.integrated.shellIntegration.quickFixEnabled',
	ShellIntegrationEnvironmentReporting = 'terminal.integrated.shellIntegration.environmentReporting',
	EnableImages = 'terminal.integrated.enableImages',
	SmoothScrolling = 'terminal.integrated.smoothScrolling',
	IgnoreBracketedPasteMode = 'terminal.integrated.ignoreBracketedPasteMode',
	FocusAfterRun = 'terminal.integrated.focusAfterRun',
	FontLigaturesEnabled = 'terminal.integrated.fontLigatures.enabled',
	FontLigaturesFeatureSettings = 'terminal.integrated.fontLigatures.featureSettings',
	FontLigaturesFallbackLigatures = 'terminal.integrated.fontLigatures.fallbackLigatures',

	// Developer/debug settings

	/** Simulated latency applied to all calls made to the pty host */
	DeveloperPtyHostLatency = 'terminal.integrated.developer.ptyHost.latency',
	/** Simulated startup delay of the pty host process */
	DeveloperPtyHostStartupDelay = 'terminal.integrated.developer.ptyHost.startupDelay',
	/** Shows the textarea element */
	DevMode = 'terminal.integrated.developer.devMode'
}

export const enum PosixShellType {
	Bash = 'bash',
	Fish = 'fish',
	Sh = 'sh',
	Csh = 'csh',
	Ksh = 'ksh',
	Zsh = 'zsh',

}
export const enum WindowsShellType {
	CommandPrompt = 'cmd',
	Wsl = 'wsl',
	GitBash = 'gitbash',
}

export const enum GeneralShellType {
	PowerShell = 'pwsh',
	Python = 'python',
	Julia = 'julia',
	NuShell = 'nu',
	Node = 'node',
}
export type TerminalShellType = PosixShellType | WindowsShellType | GeneralShellType | undefined;

export interface IRawTerminalInstanceLayoutInfo<T> {
	relativeSize: number;
	terminal: T;
}
export type ITerminalInstanceLayoutInfoById = IRawTerminalInstanceLayoutInfo<number>;
export type ITerminalInstanceLayoutInfo = IRawTerminalInstanceLayoutInfo<IPtyHostAttachTarget>;

export interface IRawTerminalTabLayoutInfo<T> {
	isActive: boolean;
	activePersistentProcessId: number | undefined;
	terminals: IRawTerminalInstanceLayoutInfo<T>[];
}

export type ITerminalTabLayoutInfoById = IRawTerminalTabLayoutInfo<number>;

export interface IRawTerminalsLayoutInfo<T> {
	tabs: IRawTerminalTabLayoutInfo<T>[];
	background: T[] | null;
}

export interface IPtyHostAttachTarget {
	id: number;
	pid: number;
	title: string;
	titleSource: TitleEventSource;
	cwd: string;
	workspaceId: string;
	workspaceName: string;
	isOrphan: boolean;
	icon: TerminalIcon | undefined;
	fixedDimensions: IFixedTerminalDimensions | undefined;
	environmentVariableCollections: ISerializableEnvironmentVariableCollections | undefined;
	reconnectionProperties?: IReconnectionProperties;
	waitOnExit?: WaitOnExitValue;
	hideFromUser?: boolean;
	isFeatureTerminal?: boolean;
	type?: TerminalType;
	hasChildProcesses: boolean;
	shellIntegrationNonce: string;
	tabActions?: ITerminalTabAction[];
}

export interface IReconnectionProperties {
	ownerId: string;
	data?: unknown;
}

export type TerminalType = 'Task' | 'Local' | undefined;

export enum TitleEventSource {
	/** From the API or the rename command that overrides any other type */
	Api,
	/** From the process name property*/
	Process,
	/** From the VT sequence */
	Sequence,
	/** Config changed */
	Config
}

export type ITerminalsLayoutInfo = IRawTerminalsLayoutInfo<IPtyHostAttachTarget | null>;
export type ITerminalsLayoutInfoById = IRawTerminalsLayoutInfo<number>;

export enum TerminalIpcChannels {
	/**
	 * Communicates between the renderer process and shared process.
	 */
	LocalPty = 'localPty',
	/**
	 * Communicates between the shared process and the pty host process.
	 */
	PtyHost = 'ptyHost',
	/**
	 * Communicates between the renderer process and the pty host process.
	 */
	PtyHostWindow = 'ptyHostWindow',
	/**
	 * Deals with logging from the pty host process.
	 */
	Logger = 'logger',
	/**
	 * Enables the detection of unresponsive pty hosts.
	 */
	Heartbeat = 'heartbeat'
}

export const enum ProcessPropertyType {
	Cwd = 'cwd',
	InitialCwd = 'initialCwd',
	FixedDimensions = 'fixedDimensions',
	Title = 'title',
	ShellType = 'shellType',
	HasChildProcesses = 'hasChildProcesses',
	ResolvedShellLaunchConfig = 'resolvedShellLaunchConfig',
	OverrideDimensions = 'overrideDimensions',
	FailedShellIntegrationActivation = 'failedShellIntegrationActivation',
	UsedShellIntegrationInjection = 'usedShellIntegrationInjection',
	ShellIntegrationInjectionFailureReason = 'shellIntegrationInjectionFailureReason',
}

export interface IProcessProperty<T extends ProcessPropertyType = ProcessPropertyType> {
	type: T;
	value: IProcessPropertyMap[T];
}

export interface IProcessPropertyMap {
	[ProcessPropertyType.Cwd]: string;
	[ProcessPropertyType.InitialCwd]: string;
	[ProcessPropertyType.FixedDimensions]: IFixedTerminalDimensions;
	[ProcessPropertyType.Title]: string;
	[ProcessPropertyType.ShellType]: TerminalShellType | undefined;
	[ProcessPropertyType.HasChildProcesses]: boolean;
	[ProcessPropertyType.ResolvedShellLaunchConfig]: IShellLaunchConfig;
	[ProcessPropertyType.OverrideDimensions]: ITerminalDimensionsOverride | undefined;
	[ProcessPropertyType.FailedShellIntegrationActivation]: boolean | undefined;
	[ProcessPropertyType.UsedShellIntegrationInjection]: boolean | undefined;
	[ProcessPropertyType.ShellIntegrationInjectionFailureReason]: ShellIntegrationInjectionFailureReason | undefined;
}

export interface IFixedTerminalDimensions {
	/**
	 * The fixed columns of the terminal.
	 */
	cols?: number;

	/**
	 * The fixed rows of the terminal.
	 */
	rows?: number;
}

export interface ITerminalLaunchResult {
	injectedArgs: string[];
}

/**
 * A service that communicates with a pty host.
*/
export interface IPtyService {
	readonly _serviceBrand: undefined;

	readonly onProcessData: Event<{ id: number; event: IProcessDataEvent | string }>;
	readonly onProcessReady: Event<{ id: number; event: IProcessReadyEvent }>;
	readonly onProcessReplay: Event<{ id: number; event: IPtyHostProcessReplayEvent }>;
	readonly onProcessOrphanQuestion: Event<{ id: number }>;
	readonly onDidRequestDetach: Event<{ requestId: number; workspaceId: string; instanceId: number }>;
	readonly onDidChangeProperty: Event<{ id: number; property: IProcessProperty }>;
	readonly onProcessExit: Event<{ id: number; event: number | undefined }>;

	createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment,
		executableEnv: IProcessEnvironment,
		options: ITerminalProcessOptions,
		shouldPersist: boolean,
		workspaceId: string,
		workspaceName: string
	): Promise<number>;
	attachToProcess(id: number): Promise<void>;
	detachFromProcess(id: number, forcePersist?: boolean): Promise<void>;
	shutdownAll(): Promise<void>;

	/**
	 * Lists all orphaned processes, ie. those without a connected frontend.
	 */
	listProcesses(): Promise<IProcessDetails[]>;
	getPerformanceMarks(): Promise<performance.PerformanceMark[]>;
	/**
	 * Measures and returns the latency of the current and all other processes to the pty host.
	 */
	getLatency(): Promise<IPtyHostLatencyMeasurement[]>;

	start(id: number): Promise<ITerminalLaunchError | ITerminalLaunchResult | undefined>;
	shutdown(id: number, immediate: boolean): Promise<void>;
	input(id: number, data: string): Promise<void>;
	sendSignal(id: number, signal: string): Promise<void>;
	resize(id: number, cols: number, rows: number): Promise<void>;
	clearBuffer(id: number): Promise<void>;
	getInitialCwd(id: number): Promise<string>;
	getCwd(id: number): Promise<string>;
	acknowledgeDataEvent(id: number, charCount: number): Promise<void>;
	setNextCommandId(id: number, commandLine: string, commandId: string): Promise<void>;
	setUnicodeVersion(id: number, version: '6' | '11'): Promise<void>;
	processBinary(id: number, data: string): Promise<void>;
	/** Confirm the process is _not_ an orphan. */
	orphanQuestionReply(id: number): Promise<void>;
	updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void>;
	updateIcon(id: number, userInitiated: boolean, icon: TerminalIcon, color?: string): Promise<void>;

	getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string>;
	getEnvironment(): Promise<IProcessEnvironment>;
	getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string>;
	getRevivedPtyNewId(workspaceId: string, id: number): Promise<number | undefined>;
	setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): Promise<void>;
	getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined>;
	reduceConnectionGraceTime(): Promise<void>;
	requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined>;
	acceptDetachInstanceReply(requestId: number, persistentProcessId?: number): Promise<void>;
	freePortKillProcess(port: string): Promise<{ port: string; processId: string }>;
	/**
	 * Serializes and returns terminal state.
	 * @param ids The persistent terminal IDs to serialize.
	 */
	serializeTerminalState(ids: number[]): Promise<string>;
	/**
	 * Revives a workspaces terminal processes, these can then be reconnected to using the normal
	 * flow for restoring terminals after reloading.
	 */
	reviveTerminalProcesses(workspaceId: string, state: ISerializedTerminalState[], dateTimeFormatLocate: string): Promise<void>;
	refreshProperty<T extends ProcessPropertyType>(id: number, property: T): Promise<IProcessPropertyMap[T]>;
	updateProperty<T extends ProcessPropertyType>(id: number, property: T, value: IProcessPropertyMap[T]): Promise<void>;

	// TODO: Make mandatory and remove impl from pty host service
	refreshIgnoreProcessNames?(names: string[]): Promise<void>;

	// #region Pty service contribution RPC calls

	installAutoReply(match: string, reply: string): Promise<void>;
	uninstallAllAutoReplies(): Promise<void>;

	// #endregion
}
export const IPtyService = createDecorator<IPtyService>('ptyService');

export interface IPtyServiceContribution {
	handleProcessReady(persistentProcessId: number, process: ITerminalChildProcess): void;
	handleProcessDispose(persistentProcessId: number): void;
	handleProcessInput(persistentProcessId: number, data: string): void;
	handleProcessResize(persistentProcessId: number, cols: number, rows: number): void;
}

export interface IPtyHostController {
	readonly onPtyHostExit: Event<number>;
	readonly onPtyHostStart: Event<void>;
	readonly onPtyHostUnresponsive: Event<void>;
	readonly onPtyHostResponsive: Event<void>;
	readonly onPtyHostRequestResolveVariables: Event<IRequestResolveVariablesEvent>;

	restartPtyHost(): Promise<void>;
	acceptPtyHostResolvedVariables(requestId: number, resolved: string[]): Promise<void>;
	getProfiles(workspaceId: string, profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]>;
}

/**
 * A service that communicates with a pty host controller (eg. main or server
 * process) and is able to launch and forward requests to the pty host.
*/
export interface IPtyHostService extends IPtyService, IPtyHostController {
}

export interface IPtyHostLatencyMeasurement {
	label: string;
	latency: number;
}

/**
 * Serialized terminal state matching the interface that can be used across versions, the version
 * should be verified before using the state payload.
 */
export interface ICrossVersionSerializedTerminalState {
	version: number;
	state: unknown;
}

export interface ISerializedTerminalState {
	id: number;
	shellLaunchConfig: IShellLaunchConfig;
	processDetails: IProcessDetails;
	processLaunchConfig: IPersistentTerminalProcessLaunchConfig;
	unicodeVersion: '6' | '11';
	replayEvent: IPtyHostProcessReplayEvent;
	timestamp: number;
}

export interface IPersistentTerminalProcessLaunchConfig {
	env: IProcessEnvironment;
	executableEnv: IProcessEnvironment;
	options: ITerminalProcessOptions;
}

export interface IRequestResolveVariablesEvent {
	requestId: number;
	workspaceId: string;
	originalText: string[];
}

export enum HeartbeatConstants {
	/**
	 * The duration between heartbeats
	 */
	BeatInterval = 5000,
	/**
	 * The duration of the first heartbeat while the pty host is starting up. This is much larger
	 * than the regular BeatInterval to accommodate slow machines, we still want to warn about the
	 * pty host's unresponsiveness eventually though.
	 */
	ConnectingBeatInterval = 20000,
	/**
	 * Defines a multiplier for BeatInterval for how long to wait before starting the second wait
	 * timer.
	 */
	FirstWaitMultiplier = 1.2,
	/**
	 * Defines a multiplier for BeatInterval for how long to wait before telling the user about
	 * non-responsiveness. The second timer is to avoid informing the user incorrectly when waking
	 * the computer up from sleep
	 */
	SecondWaitMultiplier = 1,
	/**
	 * How long to wait before telling the user about non-responsiveness when they try to create a
	 * process. This short circuits the standard wait timeouts to tell the user sooner and only
	 * create process is handled to avoid additional perf overhead.
	 */
	CreateProcessTimeout = 5000
}

export interface IHeartbeatService {
	readonly onBeat: Event<void>;
}


export interface IShellLaunchConfig {
	/**
	 * The name of the terminal, if this is not set the name of the process will be used.
	 */
	name?: string;

	/**
	 * A string to follow the name of the terminal with, indicating the type of terminal
	 */
	type?: 'Task' | 'Local';

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

	/**
	 * The reconnection properties for this terminal
	 */
	reconnectionProperties?: IReconnectionProperties;

	/** Whether to wait for a key press before closing the terminal. */
	waitOnExit?: WaitOnExitValue;

	/**
	 * A string including ANSI escape sequences that will be written to the terminal emulator
	 * _before_ the terminal process has launched, when a string is specified, a trailing \n is
	 * added at the end. This allows for example the terminal instance to display a styled message
	 * as the first line of the terminal. Use \x1b over \033 or \e for the escape control character.
	 */
	initialText?: string | { text: string; trailingNewLine: boolean };

	/**
	 * Custom PTY/pseudoterminal process to use.
	 */
	customPtyImplementation?: (terminalId: number, cols: number, rows: number) => ITerminalChildProcess;

	/**
	 * A UUID generated by the extension host process for terminals created on the extension host process.
	 */
	extHostTerminalId?: string;

	/**
	 * This is a terminal that attaches to an already running terminal.
	 */
	attachPersistentProcess?: {
		id: number;
		findRevivedId?: boolean;
		pid: number;
		title: string;
		titleSource: TitleEventSource;
		cwd: string;
		icon?: TerminalIcon;
		color?: string;
		hasChildProcesses?: boolean;
		fixedDimensions?: IFixedTerminalDimensions;
		environmentVariableCollections?: ISerializableEnvironmentVariableCollections;
		reconnectionProperties?: IReconnectionProperties;
		type?: TerminalType;
		waitOnExit?: WaitOnExitValue;
		hideFromUser?: boolean;
		isFeatureTerminal?: boolean;
		shellIntegrationNonce: string;
		tabActions?: ITerminalTabAction[];
	};

	/**
	 * Whether the terminal process environment should be exactly as provided in
	 * `TerminalOptions.env`. When this is false (default), the environment will be based on the
	 * window's environment and also apply configured platform settings like
	 * `terminal.integrated.env.windows` on top. When this is true, the complete environment must be
	 * provided as nothing will be inherited from the process or any configuration.
	 */
	strictEnv?: boolean;

	/**
	 * Whether the terminal process environment will inherit VS Code's "shell environment" that may
	 * get sourced from running a login shell depnding on how the application was launched.
	 * Consumers that rely on development tools being present in the $PATH should set this to true.
	 * This will overwrite the value of the inheritEnv setting.
	 */
	useShellEnvironment?: boolean;

	/**
	 * When enabled the terminal will run the process as normal but not be surfaced to the user
	 * until `Terminal.show` is called. The typical usage for this is when you need to run
	 * something that may need interactivity but only want to tell the user about it when
	 * interaction is needed. Note that the terminals will still be exposed to all extensions
	 * as normal. The hidden terminals will not be restored when the workspace is next opened.
	 */
	hideFromUser?: boolean;

	/**
	 * Whether to force the terminal to persist across sessions regardless of the other
	 * launch config, like `hideFromUser`.
	 */
	forcePersist?: boolean;

	/**
	 * Whether this terminal is not a terminal that the user directly created and uses, but rather
	 * a terminal used to drive some VS Code feature.
	 */
	isFeatureTerminal?: boolean;

	/**
	 * Whether this terminal was created by an extension.
	 */
	isExtensionOwnedTerminal?: boolean;

	/**
	 * The icon for the terminal, used primarily in the terminal tab.
	 */
	icon?: TerminalIcon;

	/**
	 * The color ID to use for this terminal. If not specified it will use the default fallback
	 */
	color?: string;

	/**
	 * When a parent terminal is provided via API, the group needs
	 * to find the index in order to place the child
	 * directly to the right of its parent.
	 */
	parentTerminalId?: number;

	/**
	 * The dimensions for the instance as set by the user
	 * or via Size to Content Width
	 */
	fixedDimensions?: IFixedTerminalDimensions;

	/**
	 * Opt-out of the default terminal persistence on restart and reload
	 */
	isTransient?: boolean;

	/**
	 * Attempt to force shell integration to be enabled by bypassing the {@link isFeatureTerminal}
	 * equals false requirement.
	 */
	forceShellIntegration?: boolean;

	/**
	 * Create a terminal without shell integration even when it's enabled
	 */
	ignoreShellIntegration?: boolean;

	/**
	 * Actions to include inline on hover of the terminal tab. E.g. the "Rerun task" action
	 */
	tabActions?: ITerminalTabAction[];
	/**
	 * Report terminal's shell environment variables to VS Code and extensions
	 */
	shellIntegrationEnvironmentReporting?: boolean;

	/**
	 * A custom nonce to use for shell integration when provided by an extension.
	 * This allows extensions to control shell integration for terminals they create.
	 */
	shellIntegrationNonce?: string;
}

export interface ITerminalTabAction {
	id: string;
	label: string;
	icon?: ThemeIcon;
}

export type WaitOnExitValue = boolean | string | ((exitCode: number) => string);

export interface ICreateContributedTerminalProfileOptions {
	icon?: URI | string | { light: URI; dark: URI };
	color?: string;
	location?: TerminalLocation | { viewColumn: number; preserveState?: boolean } | { splitActiveTerminal: boolean };
	cwd?: string | URI;
}

export enum TerminalLocation {
	Panel = 1,
	Editor = 2
}

export const enum TerminalLocationConfigValue {
	TerminalView = 'view',
	Editor = 'editor'
}

export type TerminalIcon = ThemeIcon | URI | { light: URI; dark: URI };

export interface IShellLaunchConfigDto {
	name?: string;
	executable?: string;
	args?: string[] | string;
	cwd?: string | UriComponents;
	env?: ITerminalEnvironment;
	useShellEnvironment?: boolean;
	hideFromUser?: boolean;
	reconnectionProperties?: IReconnectionProperties;
	type?: 'Task' | 'Local';
	isFeatureTerminal?: boolean;
	tabActions?: ITerminalTabAction[];
	shellIntegrationEnvironmentReporting?: boolean;
}

/**
 * A set of options for the terminal process. These differ from the shell launch config in that they
 * are set internally to the terminal component, not from the outside.
 */
export interface ITerminalProcessOptions {
	shellIntegration: {
		enabled: boolean;
		suggestEnabled: boolean;
		nonce: string;
	};
	windowsEnableConpty: boolean;
	windowsUseConptyDll: boolean;
	environmentVariableCollections: ISerializableEnvironmentVariableCollections | undefined;
	workspaceFolder: IWorkspaceFolder | undefined;
	isScreenReaderOptimized: boolean;
}

export interface ITerminalEnvironment {
	[key: string]: string | null | undefined;
}

export interface ITerminalLaunchError {
	message: string;
	code?: number;
}

export interface IProcessReadyEvent {
	pid: number;
	cwd: string;
	windowsPty: IProcessReadyWindowsPty | undefined;
}

export interface IProcessReadyWindowsPty {
	/**
	 * What pty emulation backend is being used.
	 */
	backend: 'conpty' | 'winpty';
	/**
	 * The Windows build version (eg. 19045)
	 */
	buildNumber: number;
}

/**
 * An interface representing a raw terminal child process, this contains a subset of the
 * child_process.ChildProcess node.js interface.
 */
export interface ITerminalChildProcess {
	/**
	 * A unique identifier for the terminal process. Note that the uniqueness only applies to a
	 * given pty service connection, IDs will be duplicated for remote and local terminals for
	 * example. The ID will be 0 if it does not support reconnection.
	 */
	id: number;

	/**
	 * Whether the process should be persisted across reloads.
	 */
	shouldPersist: boolean;

	readonly onProcessData: Event<IProcessDataEvent | string>;
	readonly onProcessReady: Event<IProcessReadyEvent>;
	readonly onProcessReplayComplete?: Event<void>;
	readonly onDidChangeProperty: Event<IProcessProperty>;
	readonly onProcessExit: Event<number | undefined>;
	readonly onRestoreCommands?: Event<ISerializedCommandDetectionCapability>;

	/**
	 * Starts the process.
	 *
	 * @returns undefined when the process was successfully started, otherwise an object containing
	 * information on what went wrong.
	 */
	start(): Promise<ITerminalLaunchError | ITerminalLaunchResult | undefined>;

	/**
	 * Detach the process from the UI and await reconnect.
	 * @param forcePersist Whether to force the process to persist if it supports persistence.
	 */
	detach?(forcePersist?: boolean): Promise<void>;

	/**
	 * Frees the port and kills the process
	 */
	freePortKillProcess?(port: string): Promise<{ port: string; processId: string }>;

	/**
	 * Shutdown the terminal process.
	 *
	 * @param immediate When true the process will be killed immediately, otherwise the process will
	 * be given some time to make sure no additional data comes through.
	 */
	shutdown(immediate: boolean): void;
	input(data: string): void;
	sendSignal(signal: string): void;
	processBinary(data: string): Promise<void>;
	resize(cols: number, rows: number): void;
	clearBuffer(): void | Promise<void>;

	/**
	 * Acknowledge a data event has been parsed by the terminal, this is used to implement flow
	 * control to ensure remote processes to not get too far ahead of the client and flood the
	 * connection.
	 * @param charCount The number of characters being acknowledged.
	 */
	acknowledgeDataEvent(charCount: number): void;

	/**
	 * Pre-assigns the command identifier that should be associated with the next command detected by
	 * shell integration. This keeps the pty host and renderer command stores aligned.
	 */
	setNextCommandId(commandLine: string, commandId: string): Promise<void>;

	/**
	 * Sets the unicode version for the process, this drives the size of some characters in the
	 * xterm-headless instance.
	 */
	setUnicodeVersion(version: '6' | '11'): Promise<void>;

	getInitialCwd(): Promise<string>;
	getCwd(): Promise<string>;
	refreshProperty<T extends ProcessPropertyType>(property: T): Promise<IProcessPropertyMap[T]>;
	updateProperty<T extends ProcessPropertyType>(property: T, value: IProcessPropertyMap[T]): Promise<void>;
}

export interface IReconnectConstants {
	graceTime: number;
	shortGraceTime: number;
	scrollback: number;
}

export const enum LocalReconnectConstants {
	/**
	 * If there is no reconnection within this time-frame, consider the connection permanently closed...
	*/
	GraceTime = 60000, // 60 seconds
	/**
	 * Maximal grace time between the first and the last reconnection...
	*/
	ShortGraceTime = 6000, // 6 seconds
}

export const enum FlowControlConstants {
	/**
	 * The number of _unacknowledged_ chars to have been sent before the pty is paused in order for
	 * the client to catch up.
	 */
	HighWatermarkChars = 100000,
	/**
	 * After flow control pauses the pty for the client the catch up, this is the number of
	 * _unacknowledged_ chars to have been caught up to on the client before resuming the pty again.
	 * This is used to attempt to prevent pauses in the flowing data; ideally while the pty is
	 * paused the number of unacknowledged chars would always be greater than 0 or the client will
	 * appear to stutter. In reality this balance is hard to accomplish though so heavy commands
	 * will likely pause as latency grows, not flooding the connection is the important thing as
	 * it's shared with other core functionality.
	 */
	LowWatermarkChars = 5000,
	/**
	 * The number characters that are accumulated on the client side before sending an ack event.
	 * This must be less than or equal to LowWatermarkChars or the terminal max never unpause.
	 */
	CharCountAckSize = 5000
}

export interface IProcessDataEvent {
	data: string;
	trackCommit: boolean;
	/**
	 * When trackCommit is set, this will be set to a promise that resolves when the data is parsed.
	 */
	writePromise?: Promise<void>;
}

export interface ITerminalDimensions {
	/**
	 * The columns of the terminal.
	 */
	cols: number;

	/**
	 * The rows of the terminal.
	 */
	rows: number;
}

export interface ITerminalProfile {
	profileName: string;
	path: string;
	isDefault: boolean;
	/**
	 * Whether the terminal profile contains a potentially unsafe {@link path}. For example, the path
	 * `C:\Cygwin` is the default install for Cygwin on Windows, but it could be created by any
	 * user in a multi-user environment. As such, we don't want to blindly present it as a profile
	 * without a warning.
	 */
	isUnsafePath?: boolean;
	/**
	 * An additional unsafe path that must exist, for example a script that appears in {@link args}.
	 */
	requiresUnsafePath?: string;
	isAutoDetected?: boolean;
	/**
	 * Whether the profile path was found on the `$PATH` environment variable, if so it will be
	 * cleaner to display this profile in the UI using only `basename(path)`.
	 */
	isFromPath?: boolean;
	args?: SingleOrMany<string> | undefined;
	env?: ITerminalEnvironment;
	overrideName?: boolean;
	color?: string;
	icon?: ThemeIcon | URI | { light: URI; dark: URI };
}

export interface ITerminalDimensionsOverride extends Readonly<ITerminalDimensions> {
	/**
	 * indicate that xterm must receive these exact dimensions, even if they overflow the ui!
	 */
	forceExactSize?: boolean;
}

export const enum ProfileSource {
	GitBash = 'Git Bash',
	Pwsh = 'PowerShell'
}

export interface IBaseUnresolvedTerminalProfile {
	args?: SingleOrMany<string> | undefined;
	isAutoDetected?: boolean;
	overrideName?: boolean;
	icon?: string | ThemeIcon | URI | { light: URI; dark: URI };
	color?: string;
	env?: ITerminalEnvironment;
	requiresPath?: string | ITerminalUnsafePath;
}

export interface ITerminalUnsafePath {
	path: string;
	isUnsafe: true;
}

export interface ITerminalExecutable extends IBaseUnresolvedTerminalProfile {
	path: SingleOrMany<string | ITerminalUnsafePath>;
}

export interface ITerminalProfileSource extends IBaseUnresolvedTerminalProfile {
	source: ProfileSource;
}

export interface ITerminalProfileContribution {
	title: string;
	id: string;
	icon?: URI | { light: URI; dark: URI } | string;
	color?: string;
}

export interface IExtensionTerminalProfile extends ITerminalProfileContribution {
	extensionIdentifier: string;
}

export type ITerminalProfileObject = ITerminalExecutable | ITerminalProfileSource | IExtensionTerminalProfile | null;

export interface IShellIntegration {
	readonly capabilities: ITerminalCapabilityStore;
	readonly seenSequences: ReadonlySet<string>;
	readonly status: ShellIntegrationStatus;

	readonly onDidChangeStatus: Event<ShellIntegrationStatus>;
	readonly onDidChangeSeenSequences: Event<ReadonlySet<string>>;

	deserialize(serialized: ISerializedCommandDetectionCapability): void;

	setNextCommandId(command: string, commandId: string): void;
}

export interface IDecorationAddon {
	registerMenuItems(command: ITerminalCommand, items: IAction[]): IDisposable;
}

export interface ITerminalCompletionProviderContribution {
	description?: string;
}

export interface ITerminalContributions {
	profiles?: ITerminalProfileContribution[];
	completionProviders?: ITerminalCompletionProviderContribution[];
}

export const enum ShellIntegrationStatus {
	/** No shell integration sequences have been encountered. */
	Off,
	/** Final term shell integration sequences have been encountered. */
	FinalTerm,
	/** VS Code shell integration sequences have been encountered. Supercedes FinalTerm. */
	VSCode
}


export const enum ShellIntegrationInjectionFailureReason {
	/**
	 * The setting is disabled.
	 */
	InjectionSettingDisabled = 'injectionSettingDisabled',
	/**
	 * There is no executable (so there's no way to determine how to inject).
	 */
	NoExecutable = 'noExecutable',
	/**
	 * It's a feature terminal (tasks, debug), unless it's explicitly being forced.
	 */
	FeatureTerminal = 'featureTerminal',
	/**
	 * The ignoreShellIntegration flag is passed (eg. relaunching without shell integration).
	 */
	IgnoreShellIntegrationFlag = 'ignoreShellIntegrationFlag',
	/**
	 * Shell integration doesn't work with winpty.
	 */
	Winpty = 'winpty',
	/**
	 * We're conservative whether we inject when we don't recognize the arguments used for the
	 * shell as we would prefer launching one without shell integration than breaking their profile.
	 */
	UnsupportedArgs = 'unsupportedArgs',
	/**
	 * The shell doesn't have built-in shell integration. Note that this doesn't mean the shell
	 * won't have shell integration in the end.
	 */
	UnsupportedShell = 'unsupportedShell',


	/**
	 * For zsh, we failed to set the sticky bit on the shell integration script folder.
	 */
	FailedToSetStickyBit = 'failedToSetStickyBit',

	/**
	 * For zsh, we failed to create a temp directory for the shell integration script.
	 */
	FailedToCreateTmpDir = 'failedToCreateTmpDir',
}

export enum TerminalExitReason {
	Unknown = 0,
	Shutdown = 1,
	Process = 2,
	User = 3,
	Extension = 4,
}

export interface ITerminalOutputMatch {
	regexMatch: RegExpMatchArray;
	outputLines: string[];
}

/**
 * A matcher that runs on a sub-section of a terminal command's output
 */
export interface ITerminalOutputMatcher {
	/**
	 * A string or regex to match against the unwrapped line. If this is a regex with the multiline
	 * flag, it will scan an amount of lines equal to `\n` instances in the regex + 1.
	 */
	lineMatcher: string | RegExp;
	/**
	 * Which side of the output to anchor the {@link offset} and {@link length} against.
	 */
	anchor: 'top' | 'bottom';
	/**
	 * The number of rows above or below the {@link anchor} to start matching against.
	 */
	offset: number;
	/**
	 * The number of rows to match against, this should be as small as possible for performance
	 * reasons. This is capped at 40.
	 */
	length: number;

	/**
	 * If multiple matches are expected - this will result in {@link outputLines} being returned
	 * when there's a {@link regexMatch} from {@link offset} to {@link length}
	 */
	multipleMatches?: boolean;
}

export interface ITerminalCommandSelector {
	id: string;
	commandLineMatcher: string | RegExp;
	outputMatcher?: ITerminalOutputMatcher;
	exitStatus: boolean;
	commandExitResult: 'success' | 'error';
	kind?: 'fix' | 'explain';
}

export interface ITerminalBackend extends ITerminalBackendPtyServiceContributions {
	readonly remoteAuthority: string | undefined;

	readonly isResponsive: boolean;

	/**
	 * A promise that resolves when the backend is ready to be used, ie. after terminal persistence
	 * has been actioned.
	 */
	readonly whenReady: Promise<void>;

	/**
	 * Signal to the backend that persistence has been actioned and is ready for use.
	 */
	setReady(): void;

	/**
	 * Fired when the ptyHost process becomes non-responsive, this should disable stdin for all
	 * terminals using this pty host connection and mark them as disconnected.
	 */
	readonly onPtyHostUnresponsive: Event<void>;
	/**
	 * Fired when the ptyHost process becomes responsive after being non-responsive. Allowing
	 * previously disconnected terminals to reconnect.
	 */
	readonly onPtyHostResponsive: Event<void>;
	/**
	 * Fired when the ptyHost has been restarted, this is used as a signal for listening terminals
	 * that its pty has been lost and will remain disconnected.
	 */
	readonly onPtyHostRestart: Event<void>;

	readonly onDidRequestDetach: Event<{ requestId: number; workspaceId: string; instanceId: number }>;

	attachToProcess(id: number): Promise<ITerminalChildProcess | undefined>;
	attachToRevivedProcess(id: number): Promise<ITerminalChildProcess | undefined>;
	listProcesses(): Promise<IProcessDetails[]>;
	getLatency(): Promise<IPtyHostLatencyMeasurement[]>;
	getDefaultSystemShell(osOverride?: OperatingSystem): Promise<string>;
	getProfiles(profiles: unknown, defaultProfile: unknown, includeDetectedProfiles?: boolean): Promise<ITerminalProfile[]>;
	getWslPath(original: string, direction: 'unix-to-win' | 'win-to-unix'): Promise<string>;
	getEnvironment(): Promise<IProcessEnvironment>;
	getShellEnvironment(): Promise<IProcessEnvironment | undefined>;
	setTerminalLayoutInfo(layoutInfo?: ITerminalsLayoutInfoById): Promise<void>;
	updateTitle(id: number, title: string, titleSource: TitleEventSource): Promise<void>;
	updateIcon(id: number, userInitiated: boolean, icon: TerminalIcon, color?: string): Promise<void>;
	getTerminalLayoutInfo(): Promise<ITerminalsLayoutInfo | undefined>;
	getPerformanceMarks(): Promise<performance.PerformanceMark[]>;
	reduceConnectionGraceTime(): Promise<void>;
	requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined>;
	acceptDetachInstanceReply(requestId: number, persistentProcessId?: number): Promise<void>;
	persistTerminalState(): Promise<void>;

	createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment,
		options: ITerminalProcessOptions,
		shouldPersist: boolean
	): Promise<ITerminalChildProcess>;

	restartPtyHost(): void;
}

export interface ITerminalBackendPtyServiceContributions {
	installAutoReply(match: string, reply: string): Promise<void>;
	uninstallAllAutoReplies(): Promise<void>;
}

export const TerminalExtensions = {
	Backend: 'workbench.contributions.terminal.processBackend'
};

export interface ITerminalBackendRegistry {
	/**
	 * Gets all backends in the registry.
	 */
	backends: ReadonlyMap<string, ITerminalBackend>;

	/**
	 * Registers a terminal backend for a remote authority.
	 */
	registerTerminalBackend(backend: ITerminalBackend): void;

	/**
	 * Returns the registered terminal backend for a remote authority.
	 */
	getTerminalBackend(remoteAuthority?: string): ITerminalBackend | undefined;
}

class TerminalBackendRegistry implements ITerminalBackendRegistry {
	private readonly _backends = new Map<string, ITerminalBackend>();

	get backends(): ReadonlyMap<string, ITerminalBackend> { return this._backends; }

	registerTerminalBackend(backend: ITerminalBackend): void {
		const key = this._sanitizeRemoteAuthority(backend.remoteAuthority);
		if (this._backends.has(key)) {
			throw new Error(`A terminal backend with remote authority '${key}' was already registered.`);
		}
		this._backends.set(key, backend);
	}

	getTerminalBackend(remoteAuthority: string | undefined): ITerminalBackend | undefined {
		return this._backends.get(this._sanitizeRemoteAuthority(remoteAuthority));
	}

	private _sanitizeRemoteAuthority(remoteAuthority: string | undefined) {
		// Normalize the key to lowercase as the authority is case-insensitive
		return remoteAuthority?.toLowerCase() ?? '';
	}
}
Registry.add(TerminalExtensions.Backend, new TerminalBackendRegistry());

export const ILocalPtyService = createDecorator<ILocalPtyService>('localPtyService');

/**
 * A service responsible for communicating with the pty host process on Electron.
 *
 * **This service should only be used within the terminal component.**
 */
export interface ILocalPtyService extends IPtyHostService { }

export const ITerminalLogService = createDecorator<ITerminalLogService>('terminalLogService');
export interface ITerminalLogService extends ILogService {
	/**
	 * Similar to _serviceBrand but used to differentiate this service at compile time from
	 * ILogService; ITerminalLogService is an ILogService, but ILogService is not an
	 * ITerminalLogService.
	 */
	readonly _logBrand: undefined;
}
