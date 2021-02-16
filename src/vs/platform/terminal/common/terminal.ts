/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IGetTerminalLayoutInfoArgs, ISetTerminalLayoutInfoArgs } from 'vs/platform/terminal/common/terminalProcess';

export interface IRawTerminalInstanceLayoutInfo<T> {
	relativeSize: number;
	terminal: T;
}
export type ITerminalInstanceLayoutInfoById = IRawTerminalInstanceLayoutInfo<number>;
export type ITerminalInstanceLayoutInfo = IRawTerminalInstanceLayoutInfo<IPtyHostAttachTarget>;

export interface IRawTerminalTabLayoutInfo<T> {
	isActive: boolean;
	activeTerminalProcessId: number | undefined;
	terminals: IRawTerminalInstanceLayoutInfo<T>[];
}

export type ITerminalTabLayoutInfoById = IRawTerminalTabLayoutInfo<number>;
export type ITerminalTabLayoutInfo = IRawTerminalTabLayoutInfo<IPtyHostAttachTarget | null>;

export interface IRawTerminalsLayoutInfo<T> {
	tabs: IRawTerminalTabLayoutInfo<T>[];
}

export interface IPtyHostAttachTarget {
	id: number;
	pid: number;
	title: string;
	cwd: string;
	workspaceId: string;
	workspaceName: string;
	isOrphan: boolean;
}

export type ITerminalsLayoutInfo = IRawTerminalsLayoutInfo<IPtyHostAttachTarget | null>;
export type ITerminalsLayoutInfoById = IRawTerminalsLayoutInfo<number>;

export interface IBeforeProcessDataEvent {
	/**
	 * The data of the event, this can be modified by the event listener to change what gets sent
	 * to the terminal.
	 */
	data: string;
}


export interface ITerminalProcessExtHostProxy extends IDisposable {
	readonly terminalId: number;

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
	onResize: Event<{ cols: number, rows: number }>;
	onAcknowledgeDataEvent: Event<number>;
	onShutdown: Event<boolean>;
	onRequestInitialCwd: Event<void>;
	onRequestCwd: Event<void>;
	onRequestLatency: Event<void>;
}

export interface ISpawnExtHostProcessRequest {
	proxy: ITerminalProcessExtHostProxy;
	shellLaunchConfig: IShellLaunchConfig;
	activeWorkspaceRootUri: URI | undefined;
	cols: number;
	rows: number;
	isWorkspaceShellAllowed: boolean;
	callback: (error: ITerminalLaunchError | undefined) => void;
}

export interface IStartExtensionTerminalRequest {
	proxy: ITerminalProcessExtHostProxy;
	cols: number;
	rows: number;
	callback: (error: ITerminalLaunchError | undefined) => void;
}

export interface IShellDefinition {
	label: string;
	path: string;
}

export interface IAvailableShellsRequest {
	callback: (shells: IShellDefinition[]) => void;
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

export enum TitleEventSource {
	/** From the API or the rename command that overrides any other type */
	Api,
	/** From the process name property*/
	Process,
	/** From the VT sequence */
	Sequence
}

export interface IWindowsShellHelper extends IDisposable {
	readonly onShellNameChange: Event<string>;

	getShellName(): Promise<string>;
}

export interface IRawTerminalInstanceLayoutInfo<T> {
	relativeSize: number;
	terminal: T;
}

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
	 * Deals with logging from the pty host process.
	 */
	Log = 'log'
}

export interface IPtyService {
	readonly _serviceBrand: undefined;

	readonly onPtyHostExit?: Event<number>;
	readonly onPtyHostStart?: Event<void>;

	readonly onProcessData: Event<{ id: number, event: IProcessDataEvent | string }>;
	readonly onProcessExit: Event<{ id: number, event: number | undefined }>;
	readonly onProcessReady: Event<{ id: number, event: { pid: number, cwd: string } }>;
	readonly onProcessTitleChanged: Event<{ id: number, event: string }>;
	readonly onProcessOverrideDimensions: Event<{ id: number, event: ITerminalDimensionsOverride | undefined }>;
	readonly onProcessResolvedShellLaunchConfig: Event<{ id: number, event: IShellLaunchConfig }>;

	createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		env: IProcessEnvironment,
		executableEnv: IProcessEnvironment,
		windowsEnableConpty: boolean,
		workspaceId: string,
		workspaceName: string
	): Promise<number>;

	start(id: number): Promise<ITerminalLaunchError | { persistentTerminalId: number; } | undefined>;

	shutdown(id: number, immediate: boolean): Promise<void>;

	input(id: number, data: string): Promise<void>;

	resize(id: number, cols: number, rows: number): Promise<void>;

	acknowledgeDataEvent(id: number, charCount: number): Promise<void>;

	getInitialCwd(id: number): Promise<string>;

	getCwd(id: number): Promise<string>;

	getLatency(id: number): Promise<number>;

	setTerminalLayoutInfo(args: ISetTerminalLayoutInfoArgs): void;
	getTerminalLayoutInfo(args: IGetTerminalLayoutInfoArgs): Promise<ITerminalsLayoutInfo | undefined>;
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
	 * A UUID generated by the extension host process for terminals created on the extension host process.
	 */
	extHostTerminalId?: string;

	/**
	 * This is a terminal that attaches to an already running terminal.
	 */
	attachPersistentTerminal?: { id: number; pid: number; title: string; cwd: string; };

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

	/**
	 * Whether this terminal is not a terminal that the user directly created and uses, but rather
	 * a terminal used to drive some VS Code feature.
	 */
	isFeatureTerminal?: boolean;

	/**
	 * Whether flow control is enabled for this terminal.
	 */
	flowControl?: boolean;
}

export interface ITerminalEnvironment {
	[key: string]: string | null;
}

export interface ITerminalLaunchError {
	message: string;
	code?: number;
}

/**
 * An interface representing a raw terminal child process, this contains a subset of the
 * child_process.ChildProcess node.js interface.
 */
export interface ITerminalChildProcess {
	onProcessData: Event<IProcessDataEvent | string>;
	onProcessExit: Event<number | undefined>;
	onProcessReady: Event<{ pid: number, cwd: string }>;
	onProcessTitleChanged: Event<string>;
	onProcessOverrideDimensions?: Event<ITerminalDimensionsOverride | undefined>;
	onProcessResolvedShellLaunchConfig?: Event<IShellLaunchConfig>;

	/**
	 * Starts the process.
	 *
	 * @returns undefined when the process was successfully started, otherwise an object containing
	 * information on what went wrong.
	 */
	start(): Promise<ITerminalLaunchError | { persistentTerminalId: number } | undefined>;

	/**
	 * Shutdown the terminal process.
	 *
	 * @param immediate When true the process will be killed immediately, otherwise the process will
	 * be given some time to make sure no additional data comes through.
	 */
	shutdown(immediate: boolean): void;
	input(data: string): void;
	resize(cols: number, rows: number): void;

	/**
	 * Acknowledge a data event has been parsed by the terminal, this is used to implement flow
	 * control to ensure remote processes to not get too far ahead of the client and flood the
	 * connection.
	 * @param charCount The number of characters being acknowledged.
	 */
	acknowledgeDataEvent(charCount: number): void;

	getInitialCwd(): Promise<string>;
	getCwd(): Promise<string>;
	getLatency(): Promise<number>;
}

export const enum LocalReconnectConstants {
	/**
	 * If there is no reconnection within this time-frame, consider the connection permanently closed...
	*/
	ReconnectionGraceTime = 5000, // 5 seconds
	/**
	 * Maximal grace time between the first and the last reconnection...
	*/
	ReconnectionShortGraceTime = 1000, // 1 second
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
	sync: boolean;
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

export interface ITerminalDimensionsOverride extends ITerminalDimensions {
	/**
	 * indicate that xterm must receive these exact dimensions, even if they overflow the ui!
	 */
	forceExactSize?: boolean;
}

export function printTime(ms: number): string {
	let h = 0;
	let m = 0;
	let s = 0;
	if (ms >= 1000) {
		s = Math.floor(ms / 1000);
		ms -= s * 1000;
	}
	if (s >= 60) {
		m = Math.floor(s / 60);
		s -= m * 60;
	}
	if (m >= 60) {
		h = Math.floor(m / 60);
		m -= h * 60;
	}
	const _h = h ? `${h}h` : ``;
	const _m = m ? `${m}m` : ``;
	const _s = s ? `${s}s` : ``;
	const _ms = ms ? `${ms}ms` : ``;
	return `${_h}${_m}${_s}${_ms}`;
}
