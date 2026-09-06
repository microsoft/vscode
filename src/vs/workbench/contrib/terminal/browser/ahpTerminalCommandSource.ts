/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import type { IMarker } from '@xterm/xterm';
import { TerminalCapability, type ITerminalCommand, type IMarkProperties } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import type { ITerminalOutputMatch, ITerminalOutputMatcher } from '../../../../platform/terminal/common/terminal.js';
import type { IAhpTerminalCommandSource, ITerminalInstance } from './terminal.js';
import { AhpCommandMarkKind, getAhpCommandMarkId, type AgentHostPty, type IAgentHostPtyCommandExecutedEvent, type IAgentHostPtyCommandFinishedEvent } from './agentHostPty.js';

/**
 * An implementation of {@link ITerminalCommand} backed by AHP protocol data
 * rather than local shell integration markers. For streaming commands (arriving
 * after initial subscription), real xterm markers are registered via
 * {@link ITerminalInstance.registerMarker}. For replayed commands (from state
 * snapshot), stored VT output is used as a fallback since marker positions are
 * unreliable during bulk replay.
 */
export class AhpTerminalCommand implements ITerminalCommand {
	// -- IBaseTerminalCommand mandatory fields --
	command: string;
	readonly commandLineConfidence: 'low' | 'medium' | 'high' = 'high';
	readonly isTrusted: boolean = false;
	timestamp: number;
	duration: number = 0;
	readonly id: string;

	// -- IBaseTerminalCommand optional fields --
	readonly cwd: string | undefined = undefined;
	exitCode: number | undefined = undefined;
	readonly commandStartLineContent: string | undefined = undefined;
	readonly markProperties: IMarkProperties | undefined = undefined;
	readonly executedX: number | undefined = undefined;
	readonly startX: number | undefined = undefined;

	// -- ITerminalCommand marker fields --
	readonly promptStartMarker?: IMarker;
	readonly marker?: IMarker;
	readonly aliases?: string[][];
	readonly wasReplayed?: boolean;

	/**
	 * Lazily resolved executed marker. Uses a getter so that the marker is
	 * resolved on first access rather than at construction time, giving xterm
	 * a chance to flush the SetMark sequence through its async write queue.
	 */
	get executedMarker(): IMarker | undefined {
		if (this._executedMarker === undefined && this._resolveMarker) {
			this._executedMarker = this._resolveMarker(AhpCommandMarkKind.Executed);
		}
		return this._executedMarker;
	}
	private _executedMarker: IMarker | undefined;

	/**
	 * Lazily resolved end marker, same rationale as {@link executedMarker}.
	 */
	get endMarker(): IMarker | undefined {
		if (this._endMarker === undefined && this._isComplete && this._resolveMarker) {
			this._endMarker = this._resolveMarker(AhpCommandMarkKind.End);
		}
		return this._endMarker;
	}
	set endMarker(value: IMarker | undefined) {
		this._endMarker = value;
	}
	private _endMarker: IMarker | undefined;
	private _isComplete = false;

	/**
	 * Stored VT output from the AHP content part. Used as a fallback when
	 * xterm markers are not available (e.g. during content replay).
	 */
	private _storedOutput: string | undefined;

	/**
	 * Optional function to lazily resolve markers from the terminal's
	 * {@link IBufferMarkCapability}. Set during construction.
	 */
	private readonly _resolveMarker?: (kind: AhpCommandMarkKind) => IMarker | undefined;

	constructor(
		commandId: string,
		commandLine: string,
		timestamp: number,
		options?: {
			resolveMarker?: (kind: AhpCommandMarkKind) => IMarker | undefined;
			storedOutput?: string;
			wasReplayed?: boolean;
		},
	) {
		this.id = commandId;
		this.command = commandLine;
		this.timestamp = timestamp;
		this._resolveMarker = options?.resolveMarker;
		this._storedOutput = options?.storedOutput;
		this.wasReplayed = options?.wasReplayed;
	}

	extractCommandLine(): string {
		return this.command;
	}

	getOutput(): string | undefined {
		return this._storedOutput !== undefined
			? removeAnsiEscapeCodes(this._storedOutput)
			: undefined;
	}

	/**
	 * Get the raw VT output (with ANSI escape codes preserved).
	 * Used by the terminal mirror for rendering.
	 */
	getRawOutput(): string | undefined {
		return this._storedOutput;
	}

	hasOutput(): boolean {
		if (this._storedOutput !== undefined) {
			return this._storedOutput.length > 0;
		}
		return false;
	}

	getOutputMatch(_outputMatcher: ITerminalOutputMatcher): ITerminalOutputMatch | undefined {
		return undefined;
	}

	getPromptRowCount(): number {
		return 1;
	}

	getCommandRowCount(): number {
		return 1;
	}

	/**
	 * Append VT output to the stored output buffer. Called during streaming
	 * as `terminal/data` actions arrive.
	 */
	appendOutput(data: string): void {
		if (this._storedOutput === undefined) {
			this._storedOutput = data;
		} else {
			this._storedOutput += data;
		}
	}

	/**
	 * Mark this command as finished with the given exit code and duration.
	 */
	finish(exitCode: number | undefined, durationMs: number | undefined): void {
		this.exitCode = exitCode;
		this.duration = durationMs ?? 0;
		this._isComplete = true;
	}
}

/**
 * A command detection source for AHP terminals. Listens to
 * {@link AgentHostPty} command lifecycle events and maintains a list of
 * {@link AhpTerminalCommand} objects, exposing an interface compatible with
 * {@link IAhpTerminalCommandSource}.
 */
export class AhpTerminalCommandSource extends Disposable implements IAhpTerminalCommandSource {
	private readonly _commands: AhpTerminalCommand[] = [];
	private _executingCommand: AhpTerminalCommand | undefined;

	private readonly _onCommandExecuted = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandExecuted: Event<ITerminalCommand> = this._onCommandExecuted.event;

	private readonly _onCommandFinished = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandFinished: Event<ITerminalCommand> = this._onCommandFinished.event;

	private _terminalInstance: ITerminalInstance | undefined;

	get commands(): readonly ITerminalCommand[] {
		return this._commands;
	}

	get executingCommandObject(): ITerminalCommand | undefined {
		return this._executingCommand;
	}

	connect(
		terminalInstance: ITerminalInstance,
		pty: AgentHostPty,
	) {
		this._terminalInstance = terminalInstance;
		this._register(pty.onCommandExecuted(e => this._handleCommandExecuted(e)));
		this._register(pty.onCommandFinished(e => this._handleCommandFinished(e)));
		// Track streaming data so we can append to the executing command's output.
		// Skip for replayed commands (storedOutput already populated from snapshot).
		this._register(terminalInstance.onWillData(data => {
			if (this._executingCommand && !this._executingCommand.wasReplayed) {
				this._executingCommand.appendOutput(data);
			}
		}));
	}

	getCommandById(id: string): ITerminalCommand | undefined {
		if (this._executingCommand?.id === id) {
			return this._executingCommand;
		}
		return this._commands.find(c => c.id === id);
	}

	/**
	 * Resolves an xterm marker by its AHP command mark ID from the
	 * {@link IBufferMarkCapability}. The marker is placed by xterm's OSC 633
	 * parser when it processes the SetMark sequence injected by
	 * {@link AgentHostPty}, so it is always at the correct cursor position
	 * regardless of whether the data was replayed or streamed.
	 */
	private _resolveMarkById(commandId: string, kind: AhpCommandMarkKind): IMarker | undefined {
		const markId = getAhpCommandMarkId(commandId, kind);
		const bufferMarkCapability = this._terminalInstance?.capabilities.get(TerminalCapability.BufferMarkDetection);
		return bufferMarkCapability?.getMark(markId);
	}

	private _handleCommandExecuted(event: IAgentHostPtyCommandExecutedEvent): void {
		const command = new AhpTerminalCommand(
			event.commandId,
			event.commandLine,
			event.timestamp,
			{
				resolveMarker: (kind) => this._resolveMarkById(event.commandId, kind),
				storedOutput: event.storedOutput,
				wasReplayed: event.storedOutput !== undefined,
			},
		);
		this._executingCommand = command;
		this._onCommandExecuted.fire(command);
	}

	private _handleCommandFinished(event: IAgentHostPtyCommandFinishedEvent): void {
		const command = this._executingCommand?.id === event.commandId
			? this._executingCommand
			: this._commands.find(c => c.id === event.commandId);

		if (!command) {
			return;
		}

		command.finish(event.exitCode, event.durationMs);

		// Move from executing to completed
		if (this._executingCommand === command) {
			this._executingCommand = undefined;
			this._commands.push(command);
		}

		this._onCommandFinished.fire(command);
	}
}
