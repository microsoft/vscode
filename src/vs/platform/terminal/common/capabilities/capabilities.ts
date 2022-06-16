/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ISerializedCommandDetectionCapability } from 'vs/platform/terminal/common/terminalProcess';

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
	PartialCommandDetection
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
	 * Fired when a capability is added.
	 */
	readonly onDidAddCapability: Event<TerminalCapability>;

	/**
	 * Fired when a capability is removed.
	 */
	readonly onDidRemoveCapability: Event<TerminalCapability>;

	/**
	 * Gets whether the capability exists in the store.
	 */
	has(capability: TerminalCapability): boolean;

	/**
	 * Gets the implementation of a capability if it has been added to the store.
	 */
	get<T extends TerminalCapability>(capability: T): ITerminalCapabilityImplMap[T] | undefined;
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
}

export interface ICwdDetectionCapability {
	readonly type: TerminalCapability.CwdDetection;
	readonly onDidChangeCwd: Event<string>;
	readonly cwds: string[];
	getCwd(): string;
	updateCwd(cwd: string): void;
}

export interface ICommandDetectionCapability {
	readonly type: TerminalCapability.CommandDetection;
	readonly commands: readonly ITerminalCommand[];
	/** The command currently being executed, otherwise undefined. */
	readonly executingCommand: string | undefined;
	readonly executingCommandObject: ITerminalCommand | undefined;
	/** The current cwd at the cursor's position. */
	readonly cwd: string | undefined;
	readonly onCommandStarted: Event<ITerminalCommand>;
	readonly onCommandFinished: Event<ITerminalCommand>;
	readonly onCommandInvalidated: Event<ITerminalCommand[]>;
	readonly onCurrentCommandInvalidated: Event<void>;
	setCwd(value: string): void;
	setIsWindowsPty(value: boolean): void;
	setIsCommandStorageDisabled(): void;
	/**
	 * Gets the working directory for a line, this will return undefined if it's unknown in which
	 * case the terminal's initial cwd should be used.
	 */
	getCwdForLine(line: number): string | undefined;
	handlePromptStart(): void;
	handleContinuationStart(): void;
	handleContinuationEnd(): void;
	handleRightPromptStart(): void;
	handleRightPromptEnd(): void;
	handleCommandStart(): void;
	handleCommandExecuted(): void;
	handleCommandFinished(exitCode: number | undefined): void;
	/**
	 * Set the command line explicitly.
	 */
	setCommandLine(commandLine: string): void;
	serialize(): ISerializedCommandDetectionCapability;
	deserialize(serialized: ISerializedCommandDetectionCapability): void;
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

export interface ITerminalCommand {
	command: string;
	timestamp: number;
	cwd?: string;
	exitCode?: number;
	marker?: IXtermMarker;
	endMarker?: IXtermMarker;
	executedMarker?: IXtermMarker;
	commandStartLineContent?: string;
	getOutput(): string | undefined;
	hasOutput: boolean;
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
