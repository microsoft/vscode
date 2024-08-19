/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import type { IPromptInputModel, ISerializedPromptInputModel } from 'vs/platform/terminal/common/capabilities/commandDetection/promptInputModel';
import { ICurrentPartialCommand } from 'vs/platform/terminal/common/capabilities/commandDetection/terminalCommand';
import { ITerminalOutputMatch, ITerminalOutputMatcher } from 'vs/platform/terminal/common/terminal';
import { ReplayEntry } from 'vs/platform/terminal/common/terminalProcess';

interface IEvent<T, U = void> {
	(listener: (arg1: T, arg2: U) => any): IDisposable;
}

export interface IMarker extends IDisposable {
	/**
	 * A unique identifier for this marker.
	 */
	readonly id: number;

	/**
	 * Whether this marker is disposed.
	 */
	readonly isDisposed: boolean;

	/**
	 * The actual line index in the buffer at this point in time. This is set to
	 * -1 if the marker has been disposed.
	 */
	readonly line: number;

	/**
	 * Event listener to get notified when the marker gets disposed. Automatic disposal
	 * might happen for a marker, that got invalidated by scrolling out or removal of
	 * a line from the buffer.
	 */
	onDispose: IEvent<void>;
}


/**
 * Primarily driven by the shell integration feature, a terminal capability is the mechanism for
 * progressively enhancing various features that may not be supported in all terminals/shells.
 */
export const enum TerminalCapability {
	/**
	 * The terminal can reliably detect the current working directory as soon as the change happens
	 * within the buffer.
	 */
	CwdDetection,
	/**
	 * The terminal can reliably detect the current working directory when requested.
	 */
	NaiveCwdDetection,
	/**
	 * The terminal can reliably identify prompts, commands and command outputs within the buffer.
	 */
	CommandDetection,
	/**
	 * The terminal can often identify prompts, commands and command outputs within the buffer. It
	 * may not be so good at remembering the position of commands that ran in the past. This state
	 * may be enabled when something goes wrong or when using conpty for example.
	 */
	PartialCommandDetection,

	/**
	 * Manages buffer marks that can be used for terminal navigation. The source of
	 * the request (task, debug, etc) provides an ID, optional marker, hoverMessage, and hidden property. When
	 * hidden is not provided, a generic decoration is added to the buffer and overview ruler.
	 */
	BufferMarkDetection
}

/**
 * An object that keeps track of additional capabilities and their implementations for features that
 * are not available for all terminals.
 */
export interface ITerminalCapabilityStore {
	/**
	 * An iterable of all capabilities in the store.
	 */
	readonly items: IterableIterator<TerminalCapability>;

	/**
	 * Fired when a capability is added. The event data for this is only the
	 * {@link TerminalCapability} type, use {@link onDidAddCapability} to access the actual
	 * capability.
	 */
	readonly onDidAddCapabilityType: Event<TerminalCapability>;

	/**
	 * Fired when a capability is removed. The event data for this is only the
	 * {@link TerminalCapability} type, use {@link onDidAddCapability} to access the actual
	 * capability.
	 */
	readonly onDidRemoveCapabilityType: Event<TerminalCapability>;

	/**
	 * Fired when a capability is added.
	 */
	readonly onDidAddCapability: Event<TerminalCapabilityChangeEvent<any>>;

	/**
	 * Fired when a capability is removed.
	 */
	readonly onDidRemoveCapability: Event<TerminalCapabilityChangeEvent<any>>;

	/**
	 * Gets whether the capability exists in the store.
	 */
	has(capability: TerminalCapability): boolean;

	/**
	 * Gets the implementation of a capability if it has been added to the store.
	 */
	get<T extends TerminalCapability>(capability: T): ITerminalCapabilityImplMap[T] | undefined;
}

export interface TerminalCapabilityChangeEvent<T extends TerminalCapability> {
	id: T;
	capability: ITerminalCapabilityImplMap[T];
}

/**
 * Maps capability types to their implementation, enabling strongly typed fetching of
 * implementations.
 */
export interface ITerminalCapabilityImplMap {
	[TerminalCapability.CwdDetection]: ICwdDetectionCapability;
	[TerminalCapability.CommandDetection]: ICommandDetectionCapability;
	[TerminalCapability.NaiveCwdDetection]: INaiveCwdDetectionCapability;
	[TerminalCapability.PartialCommandDetection]: IPartialCommandDetectionCapability;
	[TerminalCapability.BufferMarkDetection]: IBufferMarkCapability;
}

export interface ICwdDetectionCapability {
	readonly type: TerminalCapability.CwdDetection;
	readonly onDidChangeCwd: Event<string>;
	readonly cwds: string[];
	getCwd(): string;
	updateCwd(cwd: string): void;
}

export const enum CommandInvalidationReason {
	Windows = 'windows',
	NoProblemsReported = 'noProblemsReported'
}

export interface ICommandInvalidationRequest {
	reason: CommandInvalidationReason;
}

export interface IBufferMarkCapability {
	type: TerminalCapability.BufferMarkDetection;
	markers(): IterableIterator<IMarker>;
	onMarkAdded: Event<IMarkProperties>;
	addMark(properties?: IMarkProperties): void;
	getMark(id: string): IMarker | undefined;
}

export interface ICommandDetectionCapability {
	readonly type: TerminalCapability.CommandDetection;
	readonly promptInputModel: IPromptInputModel;
	readonly commands: readonly ITerminalCommand[];
	/** The command currently being executed, otherwise undefined. */
	readonly executingCommand: string | undefined;
	readonly executingCommandObject: ITerminalCommand | undefined;
	/** The current cwd at the cursor's position. */
	readonly cwd: string | undefined;
	readonly currentCommand: ICurrentPartialCommand | undefined;
	readonly onCommandStarted: Event<ITerminalCommand>;
	readonly onCommandFinished: Event<ITerminalCommand>;
	readonly onCommandExecuted: Event<ITerminalCommand>;
	readonly onCommandInvalidated: Event<ITerminalCommand[]>;
	readonly onCurrentCommandInvalidated: Event<ICommandInvalidationRequest>;
	setContinuationPrompt(value: string): void;
	setPromptTerminator(value: string, lastPromptLine: string): void;
	setCwd(value: string): void;
	setIsWindowsPty(value: boolean): void;
	setIsCommandStorageDisabled(): void;
	/**
	 * Gets the working directory for a line, this will return undefined if it's unknown in which
	 * case the terminal's initial cwd should be used.
	 */
	getCwdForLine(line: number): string | undefined;
	getCommandForLine(line: number): ITerminalCommand | ICurrentPartialCommand | undefined;
	handlePromptStart(options?: IHandleCommandOptions): void;
	handleContinuationStart(): void;
	handleContinuationEnd(): void;
	handleRightPromptStart(): void;
	handleRightPromptEnd(): void;
	handleCommandStart(options?: IHandleCommandOptions): void;
	handleCommandExecuted(options?: IHandleCommandOptions): void;
	handleCommandFinished(exitCode?: number, options?: IHandleCommandOptions): void;
	/**
	 * Set the command line explicitly.
	 * @param commandLine The command line being set.
	 * @param isTrusted Whether the command line is trusted via the optional nonce is send in order
	 * to prevent spoofing. This is important as some interactions do not require verification
	 * before re-running a command. Note that this is optional according to the spec, it should
	 * always be present when running the _builtin_ SI scripts.
	 */
	setCommandLine(commandLine: string, isTrusted: boolean): void;
	serialize(): ISerializedCommandDetectionCapability;
	deserialize(serialized: ISerializedCommandDetectionCapability): void;
}

export interface IHandleCommandOptions {
	/**
	 * Whether to allow an empty command to be registered. This should be used to support certain
	 * shell integration scripts/features where tracking the command line may not be possible.
	 */
	ignoreCommandLine?: boolean;
	/**
	 * The marker to use
	 */
	marker?: IMarker;

	/**
	 * Properties for the mark
	 */
	markProperties?: IMarkProperties;
}

export interface INaiveCwdDetectionCapability {
	readonly type: TerminalCapability.NaiveCwdDetection;
	readonly onDidChangeCwd: Event<string>;
	getCwd(): Promise<string>;
}

export interface IPartialCommandDetectionCapability {
	readonly type: TerminalCapability.PartialCommandDetection;
	readonly commands: readonly IXtermMarker[];
	readonly onCommandFinished: Event<IXtermMarker>;
}

interface IBaseTerminalCommand {
	// Mandatory
	command: string;
	commandLineConfidence: 'low' | 'medium' | 'high';
	isTrusted: boolean;
	timestamp: number;
	duration: number;

	// Optional serializable
	cwd: string | undefined;
	exitCode: number | undefined;
	commandStartLineContent: string | undefined;
	markProperties: IMarkProperties | undefined;
	executedX: number | undefined;
	startX: number | undefined;
}

export interface ITerminalCommand extends IBaseTerminalCommand {
	// Optional non-serializable
	readonly promptStartMarker?: IMarker;
	readonly marker?: IXtermMarker;
	endMarker?: IXtermMarker;
	readonly executedMarker?: IXtermMarker;
	readonly aliases?: string[][];
	readonly wasReplayed?: boolean;

	extractCommandLine(): string;
	getOutput(): string | undefined;
	getOutputMatch(outputMatcher: ITerminalOutputMatcher): ITerminalOutputMatch | undefined;
	hasOutput(): boolean;
	getPromptRowCount(): number;
	getCommandRowCount(): number;
}

export interface ISerializedTerminalCommand extends IBaseTerminalCommand {
	// Optional non-serializable converted for serialization
	startLine: number | undefined;
	promptStartLine: number | undefined;
	endLine: number | undefined;
	executedLine: number | undefined;
}

/**
 * A clone of the IMarker from xterm which cannot be imported from common
 */
export interface IXtermMarker {
	readonly id: number;
	readonly isDisposed: boolean;
	readonly line: number;
	dispose(): void;
	onDispose: {
		(listener: () => any): { dispose(): void };
	};
}

export interface IMarkProperties {
	hoverMessage?: string;
	disableCommandStorage?: boolean;
	hidden?: boolean;
	marker?: IMarker;
	id?: string;
}
export interface ISerializedCommandDetectionCapability {
	isWindowsPty: boolean;
	commands: ISerializedTerminalCommand[];
	promptInputModel: ISerializedPromptInputModel | undefined;
}
export interface IPtyHostProcessReplayEvent {
	events: ReplayEntry[];
	commands: ISerializedCommandDetectionCapability;
}
