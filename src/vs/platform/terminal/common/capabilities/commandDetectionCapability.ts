/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier, timeout } from 'vs/base/common/async';
import { debounce } from 'vs/base/common/decorators';
import { Emitter } from 'vs/base/common/event';
import { Disposable, MandatoryMutableDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { ICommandDetectionCapability, TerminalCapability, ITerminalCommand, IHandleCommandOptions, ICommandInvalidationRequest, CommandInvalidationReason, ISerializedTerminalCommand, ISerializedCommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalOutputMatch, ITerminalOutputMatcher } from 'vs/platform/terminal/common/terminal';

// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { IBuffer, IBufferLine, IDisposable, IMarker, Terminal } from '@xterm/headless';

export interface ICurrentPartialCommand {
	previousCommandMarker?: IMarker;

	promptStartMarker?: IMarker;

	commandStartMarker?: IMarker;
	commandStartX?: number;
	commandStartLineContent?: string;

	commandRightPromptStartX?: number;
	commandRightPromptEndX?: number;

	commandLines?: IMarker;

	commandExecutedMarker?: IMarker;
	commandExecutedX?: number;

	commandFinishedMarker?: IMarker;

	currentContinuationMarker?: IMarker;
	continuations?: { marker: IMarker; end: number }[];

	command?: string;

	/**
	 * Whether the command line is trusted via a nonce.
	 */
	isTrusted?: boolean;

	/**
	 * Something invalidated the command before it finished, this will prevent the onCommandFinished
	 * event from firing.
	 */
	isInvalid?: boolean;
}

interface ITerminalDimensions {
	cols: number;
	rows: number;
}

export class CommandDetectionCapability extends Disposable implements ICommandDetectionCapability {
	readonly type = TerminalCapability.CommandDetection;

	protected _commands: ITerminalCommand[] = [];
	private _exitCode: number | undefined;
	private _cwd: string | undefined;
	private _currentCommand: ICurrentPartialCommand = {};
	private _commandMarkers: IMarker[] = [];
	private _dimensions: ITerminalDimensions;
	private __isCommandStorageDisabled: boolean = false;
	private _handleCommandStartOptions?: IHandleCommandOptions;

	private _ptyHeuristicsHooks: ICommandDetectionHeuristicsHooks;
	private _ptyHeuristics: MandatoryMutableDisposable<IPtyHeuristics>;

	get commands(): readonly ITerminalCommand[] { return this._commands; }
	get executingCommand(): string | undefined { return this._currentCommand.command; }
	// TODO: as is unsafe here and it duplicates behavor of executingCommand
	get executingCommandObject(): ITerminalCommand | undefined {
		if (this._currentCommand.commandStartMarker) {
			return { marker: this._currentCommand.commandStartMarker } as ITerminalCommand;
		}
		return undefined;
	}
	get currentCommand(): ICurrentPartialCommand {
		return this._currentCommand;
	}
	get cwd(): string | undefined { return this._cwd; }
	private get _isInputting(): boolean {
		return !!(this._currentCommand.commandStartMarker && !this._currentCommand.commandExecutedMarker);
	}

	get hasInput(): boolean | undefined {
		if (!this._isInputting || !this._currentCommand?.commandStartMarker) {
			return undefined;
		}
		if (this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY === this._currentCommand.commandStartMarker?.line) {
			const line = this._terminal.buffer.active.getLine(this._terminal.buffer.active.cursorY)?.translateToString(true, this._currentCommand.commandStartX);
			if (line === undefined) {
				return undefined;
			}
			return line.length > 0;
		}
		return true;
	}

	private readonly _onCommandStarted = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandStarted = this._onCommandStarted.event;
	private readonly _onBeforeCommandFinished = this._register(new Emitter<ITerminalCommand>());
	readonly onBeforeCommandFinished = this._onBeforeCommandFinished.event;
	private readonly _onCommandFinished = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandFinished = this._onCommandFinished.event;
	private readonly _onCommandExecuted = this._register(new Emitter<void>());
	readonly onCommandExecuted = this._onCommandExecuted.event;
	private readonly _onCommandInvalidated = this._register(new Emitter<ITerminalCommand[]>());
	readonly onCommandInvalidated = this._onCommandInvalidated.event;
	private readonly _onCurrentCommandInvalidated = this._register(new Emitter<ICommandInvalidationRequest>());
	readonly onCurrentCommandInvalidated = this._onCurrentCommandInvalidated.event;

	constructor(
		private readonly _terminal: Terminal,
		private readonly _logService: ILogService
	) {
		super();

		// Set up platform-specific behaviors
		const that = this;
		this._ptyHeuristicsHooks = new class implements ICommandDetectionHeuristicsHooks {
			get onCurrentCommandInvalidatedEmitter() { return that._onCurrentCommandInvalidated; }
			get onCommandStartedEmitter() { return that._onCommandStarted; }
			get onCommandExecutedEmitter() { return that._onCommandExecuted; }
			get dimensions() { return that._dimensions; }
			get isCommandStorageDisabled() { return that.__isCommandStorageDisabled; }
			get commandMarkers() { return that._commandMarkers; }
			set commandMarkers(value) { that._commandMarkers = value; }
			get clearCommandsInViewport() { return that._clearCommandsInViewport.bind(that); }
		};
		this._ptyHeuristics = this._register(new MandatoryMutableDisposable(new UnixPtyHeuristics(this._terminal, this, this._ptyHeuristicsHooks, this._logService)));

		this._dimensions = {
			cols: this._terminal.cols,
			rows: this._terminal.rows
		};
		this._register(this._terminal.onResize(e => this._handleResize(e)));
		this._register(this._terminal.onCursorMove(() => this._handleCursorMove()));
	}

	private _handleResize(e: { cols: number; rows: number }) {
		this._ptyHeuristics.value.preHandleResize?.(e);
		this._dimensions.cols = e.cols;
		this._dimensions.rows = e.rows;
	}

	@debounce(500)
	private _handleCursorMove() {
		// Early versions of conpty do not have real support for an alt buffer, in addition certain
		// commands such as tsc watch will write to the top of the normal buffer. The following
		// checks when the cursor has moved while the normal buffer is empty and if it is above the
		// current command, all decorations within the viewport will be invalidated.
		//
		// This function is debounced so that the cursor is only checked when it is stable so
		// conpty's screen reprinting will not trigger decoration clearing.
		//
		// This is mostly a workaround for Windows but applies to all OS' because of the tsc watch
		// case.
		if (this._terminal.buffer.active === this._terminal.buffer.normal && this._currentCommand.commandStartMarker) {
			if (this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY < this._currentCommand.commandStartMarker.line) {
				this._clearCommandsInViewport();
				this._currentCommand.isInvalid = true;
				this._onCurrentCommandInvalidated.fire({ reason: CommandInvalidationReason.Windows });
			}
		}
	}

	private _clearCommandsInViewport(): void {
		// Find the number of commands on the tail end of the array that are within the viewport
		let count = 0;
		for (let i = this._commands.length - 1; i >= 0; i--) {
			const line = this._commands[i].marker?.line;
			if (line && line < this._terminal.buffer.active.baseY) {
				break;
			}
			count++;
		}
		// Remove them
		if (count > 0) {
			this._onCommandInvalidated.fire(this._commands.splice(this._commands.length - count, count));
		}
	}

	setCwd(value: string) {
		this._cwd = value;
	}

	setIsWindowsPty(value: boolean) {
		if (value && !(this._ptyHeuristics.value instanceof WindowsPtyHeuristics)) {
			const that = this;
			this._ptyHeuristics.value = new WindowsPtyHeuristics(
				this._terminal,
				this,
				new class {
					get onCurrentCommandInvalidatedEmitter() { return that._onCurrentCommandInvalidated; }
					get onCommandStartedEmitter() { return that._onCommandStarted; }
					get onCommandExecutedEmitter() { return that._onCommandExecuted; }
					get dimensions() { return that._dimensions; }
					get isCommandStorageDisabled() { return that.__isCommandStorageDisabled; }
					get commandMarkers() { return that._commandMarkers; }
					set commandMarkers(value) { that._commandMarkers = value; }
					get clearCommandsInViewport() { return that._clearCommandsInViewport; }
				},
				this._logService
			);
		} else if (!value && !(this._ptyHeuristics.value instanceof UnixPtyHeuristics)) {
			this._ptyHeuristics.value = new UnixPtyHeuristics(this._terminal, this, this._ptyHeuristicsHooks, this._logService);
		}
	}

	setIsCommandStorageDisabled(): void {
		this.__isCommandStorageDisabled = true;
	}

	getCommandForLine(line: number): ITerminalCommand | ICurrentPartialCommand | undefined {
		// Handle the current partial command first, anything below it's prompt is considered part
		// of the current command
		if (this._currentCommand.promptStartMarker && line >= this._currentCommand.promptStartMarker?.line) {
			return this._currentCommand;
		}

		// No commands
		if (this._commands.length === 0) {
			return undefined;
		}

		// Line is before any registered commands
		if (this._commands[0].marker!.line > line) {
			return undefined;
		}

		// Iterate backwards through commands to find the right one
		for (let i = this.commands.length - 1; i >= 0; i--) {
			if (this.commands[i].marker!.line <= line - 1) {
				return this.commands[i];
			}
		}

		return undefined;
	}

	getCwdForLine(line: number): string | undefined {
		// Handle the current partial command first, anything below it's prompt is considered part
		// of the current command
		if (this._currentCommand.promptStartMarker && line >= this._currentCommand.promptStartMarker?.line) {
			return this._cwd;
		}

		const command = this.getCommandForLine(line);
		if (command && 'cwd' in command) {
			return command.cwd;
		}

		return undefined;
	}

	handlePromptStart(options?: IHandleCommandOptions): void {
		this._currentCommand.promptStartMarker = options?.marker || this._terminal.registerMarker(0);
		this._logService.debug('CommandDetectionCapability#handlePromptStart', this._terminal.buffer.active.cursorX, this._currentCommand.promptStartMarker?.line);
	}

	handleContinuationStart(): void {
		this._currentCommand.currentContinuationMarker = this._terminal.registerMarker(0);
		this._logService.debug('CommandDetectionCapability#handleContinuationStart', this._currentCommand.currentContinuationMarker);
	}

	handleContinuationEnd(): void {
		if (!this._currentCommand.currentContinuationMarker) {
			this._logService.warn('CommandDetectionCapability#handleContinuationEnd Received continuation end without start');
			return;
		}
		if (!this._currentCommand.continuations) {
			this._currentCommand.continuations = [];
		}
		this._currentCommand.continuations.push({
			marker: this._currentCommand.currentContinuationMarker,
			end: this._terminal.buffer.active.cursorX
		});
		this._currentCommand.currentContinuationMarker = undefined;
		this._logService.debug('CommandDetectionCapability#handleContinuationEnd', this._currentCommand.continuations[this._currentCommand.continuations.length - 1]);
	}

	handleRightPromptStart(): void {
		this._currentCommand.commandRightPromptStartX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleRightPromptStart', this._currentCommand.commandRightPromptStartX);
	}

	handleRightPromptEnd(): void {
		this._currentCommand.commandRightPromptEndX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleRightPromptEnd', this._currentCommand.commandRightPromptEndX);
	}

	handleCommandStart(options?: IHandleCommandOptions): void {
		this._handleCommandStartOptions = options;
		// Only update the column if the line has already been set
		this._currentCommand.commandStartMarker = options?.marker || this._currentCommand.commandStartMarker;
		if (this._currentCommand.commandStartMarker?.line === this._terminal.buffer.active.cursorY) {
			this._currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
			this._logService.debug('CommandDetectionCapability#handleCommandStart', this._currentCommand.commandStartX, this._currentCommand.commandStartMarker?.line);
			return;
		}
		this._ptyHeuristics.value.handleCommandStart(options);
	}

	handleGenericCommand(options?: IHandleCommandOptions): void {
		if (options?.markProperties?.disableCommandStorage) {
			this.setIsCommandStorageDisabled();
		}
		this.handlePromptStart(options);
		this.handleCommandStart(options);
		this.handleCommandExecuted(options);
		this.handleCommandFinished(undefined, options);
	}

	handleCommandExecuted(options?: IHandleCommandOptions): void {
		this._ptyHeuristics.value.handleCommandExecuted(options);
	}

	handleCommandFinished(exitCode: number | undefined, options?: IHandleCommandOptions): void {
		this._ptyHeuristics.value?.preHandleCommandFinished?.();

		this._currentCommand.commandFinishedMarker = options?.marker || this._terminal.registerMarker(0);
		let command = this._currentCommand.command;
		this._logService.debug('CommandDetectionCapability#handleCommandFinished', this._terminal.buffer.active.cursorX, this._currentCommand.commandFinishedMarker?.line, this._currentCommand.command, this._currentCommand);
		this._exitCode = exitCode;

		// HACK: Handle a special case on some versions of bash where identical commands get merged
		// in the output of `history`, this detects that case and sets the exit code to the the last
		// command's exit code. This covered the majority of cases but will fail if the same command
		// runs with a different exit code, that will need a more robust fix where we send the
		// command ID and exit code over to the capability to adjust there.
		if (this._exitCode === undefined) {
			const lastCommand = this.commands.length > 0 ? this.commands[this.commands.length - 1] : undefined;
			if (command && command.length > 0 && lastCommand?.command === command) {
				this._exitCode = lastCommand.exitCode;
			}
		}

		if (this._currentCommand.commandStartMarker === undefined || !this._terminal.buffer.active) {
			return;
		}

		// When the command finishes and executed never fires the placeholder selector should be used.
		if (this._exitCode === undefined && command === undefined) {
			command = '';
		}

		this._ptyHeuristics.value?.postHandleCommandFinished?.();

		if ((command !== undefined && !command.startsWith('\\')) || this._handleCommandStartOptions?.ignoreCommandLine) {
			const buffer = this._terminal.buffer.active;
			const timestamp = Date.now();
			const executedMarker = this._currentCommand.commandExecutedMarker;
			const endMarker = this._currentCommand.commandFinishedMarker;
			const newCommand: ITerminalCommand = {
				command: this._handleCommandStartOptions?.ignoreCommandLine ? '' : (command || ''),
				isTrusted: !!this._currentCommand.isTrusted,
				promptStartMarker: this._currentCommand.promptStartMarker,
				marker: this._currentCommand.commandStartMarker,
				startX: this._currentCommand.commandStartX,
				endMarker,
				executedMarker,
				executedX: this._currentCommand.commandExecutedX,
				timestamp,
				cwd: this._cwd,
				exitCode: this._exitCode,
				commandStartLineContent: this._currentCommand.commandStartLineContent,
				hasOutput: () => !executedMarker?.isDisposed && !endMarker?.isDisposed && !!(executedMarker && endMarker && executedMarker?.line < endMarker!.line),
				getOutput: () => getOutputForCommand(executedMarker, endMarker, buffer),
				getOutputMatch: (outputMatcher: ITerminalOutputMatcher) => getOutputMatchForCommand(this._ptyHeuristics.value instanceof WindowsPtyHeuristics && (executedMarker?.line === endMarker?.line) ? this._currentCommand.commandStartMarker : executedMarker, endMarker, buffer, this._terminal.cols, outputMatcher),
				markProperties: options?.markProperties
			};
			this._commands.push(newCommand);
			this._logService.debug('CommandDetectionCapability#onCommandFinished', newCommand);

			this._onBeforeCommandFinished.fire(newCommand);
			if (!this._currentCommand.isInvalid) {
				this._onCommandFinished.fire(newCommand);
			}
		}
		this._currentCommand.previousCommandMarker = this._currentCommand.commandStartMarker;
		this._currentCommand = {};
		this._handleCommandStartOptions = undefined;
	}

	setCommandLine(commandLine: string, isTrusted: boolean) {
		this._logService.debug('CommandDetectionCapability#setCommandLine', commandLine, isTrusted);
		this._currentCommand.command = commandLine;
		this._currentCommand.isTrusted = isTrusted;
	}

	serialize(): ISerializedCommandDetectionCapability {
		const commands: ISerializedTerminalCommand[] = this.commands.map(e => {
			return {
				promptStartLine: e.promptStartMarker?.line,
				startLine: e.marker?.line,
				startX: undefined,
				endLine: e.endMarker?.line,
				executedLine: e.executedMarker?.line,
				executedX: e.executedX,
				command: this.__isCommandStorageDisabled ? '' : e.command,
				isTrusted: e.isTrusted,
				cwd: e.cwd,
				exitCode: e.exitCode,
				commandStartLineContent: e.commandStartLineContent,
				timestamp: e.timestamp,
				markProperties: e.markProperties,
				aliases: e.aliases
			};
		});
		if (this._currentCommand.commandStartMarker) {
			commands.push({
				promptStartLine: this._currentCommand.promptStartMarker?.line,
				startLine: this._currentCommand.commandStartMarker.line,
				startX: this._currentCommand.commandStartX,
				endLine: undefined,
				executedLine: undefined,
				executedX: undefined,
				command: '',
				isTrusted: true,
				cwd: this._cwd,
				exitCode: undefined,
				commandStartLineContent: undefined,
				timestamp: 0,
				markProperties: undefined
			});
		}
		return {
			isWindowsPty: this._ptyHeuristics.value instanceof WindowsPtyHeuristics,
			commands
		};
	}

	deserialize(serialized: ISerializedCommandDetectionCapability): void {
		if (serialized.isWindowsPty) {
			this.setIsWindowsPty(serialized.isWindowsPty);
		}
		const buffer = this._terminal.buffer.normal;
		for (const e of serialized.commands) {
			const marker = e.startLine !== undefined ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : undefined;
			// Check for invalid command
			if (!marker) {
				continue;
			}
			const promptStartMarker = e.promptStartLine !== undefined ? this._terminal.registerMarker(e.promptStartLine - (buffer.baseY + buffer.cursorY)) : undefined;
			// Partial command
			if (!e.endLine) {
				this._currentCommand.commandStartMarker = marker;
				this._currentCommand.commandStartX = e.startX;
				if (promptStartMarker) {
					this._currentCommand.promptStartMarker = promptStartMarker;
				}
				this._cwd = e.cwd;
				this._onCommandStarted.fire({ marker } as ITerminalCommand);
				continue;
			}
			// Full command
			const endMarker = e.endLine !== undefined ? this._terminal.registerMarker(e.endLine - (buffer.baseY + buffer.cursorY)) : undefined;
			const executedMarker = e.executedLine !== undefined ? this._terminal.registerMarker(e.executedLine - (buffer.baseY + buffer.cursorY)) : undefined;
			const newCommand: ITerminalCommand = {
				command: this.__isCommandStorageDisabled ? '' : e.command,
				isTrusted: e.isTrusted,
				promptStartMarker,
				marker,
				startX: e.startX,
				endMarker,
				executedMarker,
				executedX: e.executedX,
				timestamp: e.timestamp,
				cwd: e.cwd,
				commandStartLineContent: e.commandStartLineContent,
				exitCode: e.exitCode,
				hasOutput: () => !executedMarker?.isDisposed && !endMarker?.isDisposed && !!(executedMarker && endMarker && executedMarker.line < endMarker.line),
				getOutput: () => getOutputForCommand(executedMarker, endMarker, buffer),
				getOutputMatch: (outputMatcher: ITerminalOutputMatcher) => getOutputMatchForCommand(this._ptyHeuristics.value instanceof WindowsPtyHeuristics && (executedMarker?.line === endMarker?.line) ? marker : executedMarker, endMarker, buffer, this._terminal.cols, outputMatcher),
				markProperties: e.markProperties,
				wasReplayed: true
			};
			this._commands.push(newCommand);
			this._logService.debug('CommandDetectionCapability#onCommandFinished', newCommand);
			this._onCommandFinished.fire(newCommand);
		}
	}
}

/**
 * Additional hooks to private methods on {@link CommandDetectionCapability} that are needed by the
 * heuristics objects.
 */
interface ICommandDetectionHeuristicsHooks {
	readonly onCurrentCommandInvalidatedEmitter: Emitter<ICommandInvalidationRequest>;
	readonly onCommandExecutedEmitter: Emitter<void>;
	readonly onCommandStartedEmitter: Emitter<ITerminalCommand>;
	readonly dimensions: ITerminalDimensions;
	readonly isCommandStorageDisabled: boolean;

	commandMarkers: IMarker[];

	clearCommandsInViewport(): void;
}

type IPtyHeuristics = (
	// All optional methods
	Partial<UnixPtyHeuristics> & Partial<WindowsPtyHeuristics> &
	// All common methods
	(UnixPtyHeuristics | WindowsPtyHeuristics) &
	IDisposable
);

/**
 * Non-Windows-specific behavior.
 */
class UnixPtyHeuristics extends Disposable {
	constructor(
		private readonly _terminal: Terminal,
		private readonly _capability: CommandDetectionCapability,
		private readonly _hooks: ICommandDetectionHeuristicsHooks,
		private readonly _logService: ILogService
	) {
		super();
		this._register(_terminal.parser.registerCsiHandler({ final: 'J' }, params => {
			if (params.length >= 1 && (params[0] === 2 || params[0] === 3)) {
				_hooks.clearCommandsInViewport();
			}
			// We don't want to override xterm.js' default behavior, just augment it
			return false;
		}));
	}

	async handleCommandStart(options?: IHandleCommandOptions) {
		const currentCommand = this._capability.currentCommand;
		currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
		currentCommand.commandStartMarker = options?.marker || this._terminal.registerMarker(0);

		// Clear executed as it must happen after command start
		currentCommand.commandExecutedMarker?.dispose();
		currentCommand.commandExecutedMarker = undefined;
		currentCommand.commandExecutedX = undefined;
		for (const m of this._hooks.commandMarkers) {
			m.dispose();
		}
		this._hooks.commandMarkers.length = 0;

		this._hooks.onCommandStartedEmitter.fire({ marker: options?.marker || currentCommand.commandStartMarker, markProperties: options?.markProperties } as ITerminalCommand);
		this._logService.debug('CommandDetectionCapability#handleCommandStart', currentCommand.commandStartX, currentCommand.commandStartMarker?.line);
	}

	handleCommandExecuted(options?: IHandleCommandOptions) {
		const currentCommand = this._capability.currentCommand;
		currentCommand.commandExecutedMarker = options?.marker || this._terminal.registerMarker(0);
		currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
		this._logService.debug('CommandDetectionCapability#handleCommandExecuted', currentCommand.commandExecutedX, currentCommand.commandExecutedMarker?.line);

		// Sanity check optional props
		if (!currentCommand.commandStartMarker || !currentCommand.commandExecutedMarker || currentCommand.commandStartX === undefined) {
			return;
		}

		// Calculate the command
		currentCommand.command = this._hooks.isCommandStorageDisabled ? '' : this._terminal.buffer.active.getLine(currentCommand.commandStartMarker.line)?.translateToString(true, currentCommand.commandStartX, currentCommand.commandRightPromptStartX).trim();
		let y = currentCommand.commandStartMarker.line + 1;
		const commandExecutedLine = currentCommand.commandExecutedMarker.line;
		for (; y < commandExecutedLine; y++) {
			const line = this._terminal.buffer.active.getLine(y);
			if (line) {
				const continuation = currentCommand.continuations?.find(e => e.marker.line === y);
				if (continuation) {
					currentCommand.command += '\n';
				}
				const startColumn = continuation?.end ?? 0;
				currentCommand.command += line.translateToString(true, startColumn);
			}
		}
		if (y === commandExecutedLine) {
			currentCommand.command += this._terminal.buffer.active.getLine(commandExecutedLine)?.translateToString(true, undefined, currentCommand.commandExecutedX) || '';
		}
		this._hooks.onCommandExecutedEmitter.fire();
	}
}

/**
 * An object that integrated with and decorates the command detection capability to add heuristics
 * that adjust various markers to work better with Windows and ConPTY. This isn't depended upon the
 * frontend OS, or even the backend OS, but the `IsWindows` property which technically a non-Windows
 * client can emit (for example in tests).
 */
class WindowsPtyHeuristics extends Disposable {

	private _onCursorMoveListener = this._register(new MutableDisposable());
	private _commandStartedWindowsBarrier?: Barrier;
	private _windowsPromptPollingInProcess: boolean = false;

	constructor(
		private readonly _terminal: Terminal,
		private readonly _capability: CommandDetectionCapability,
		private readonly _hooks: ICommandDetectionHeuristicsHooks,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._capability.onBeforeCommandFinished(command => {
			// For a Windows backend we cannot listen to CSI J, instead we assume running clear or
			// cls will clear all commands in the viewport. This is not perfect but it's right most
			// of the time.
			if (command.command.trim().toLowerCase() === 'clear' || command.command.trim().toLowerCase() === 'cls') {
				this._hooks.clearCommandsInViewport();
				this._capability.currentCommand.isInvalid = true;
				this._hooks.onCurrentCommandInvalidatedEmitter.fire({ reason: CommandInvalidationReason.Windows });
			}
		}));
	}

	preHandleResize(e: { cols: number; rows: number }) {
		// Resize behavior is different under conpty; instead of bringing parts of the scrollback
		// back into the viewport, new lines are inserted at the bottom (ie. the same behavior as if
		// there was no scrollback).
		//
		// On resize this workaround will wait for a conpty reprint to occur by waiting for the
		// cursor to move, it will then calculate the number of lines that the commands within the
		// viewport _may have_ shifted. After verifying the content of the current line is
		// incorrect, the line after shifting is checked and if that matches delete events are fired
		// on the xterm.js buffer to move the markers.
		//
		// While a bit hacky, this approach is quite safe and seems to work great at least for pwsh.
		const baseY = this._terminal.buffer.active.baseY;
		const rowsDifference = e.rows - this._hooks.dimensions.rows;
		// Only do when rows increase, do in the next frame as this needs to happen after
		// conpty reprints the screen
		if (rowsDifference > 0) {
			this._waitForCursorMove().then(() => {
				// Calculate the number of lines the content may have shifted, this will max out at
				// scrollback count since the standard behavior will be used then
				const potentialShiftedLineCount = Math.min(rowsDifference, baseY);
				// For each command within the viewport, assume commands are in the correct order
				for (let i = this._capability.commands.length - 1; i >= 0; i--) {
					const command = this._capability.commands[i];
					if (!command.marker || command.marker.line < baseY || command.commandStartLineContent === undefined) {
						break;
					}
					const line = this._terminal.buffer.active.getLine(command.marker.line);
					if (!line || line.translateToString(true) === command.commandStartLineContent) {
						continue;
					}
					const shiftedY = command.marker.line - potentialShiftedLineCount;
					const shiftedLine = this._terminal.buffer.active.getLine(shiftedY);
					if (shiftedLine?.translateToString(true) !== command.commandStartLineContent) {
						continue;
					}
					// HACK: xterm.js doesn't expose this by design as it's an internal core
					// function an embedder could easily do damage with. Additionally, this
					// can't really be upstreamed since the event relies on shell integration to
					// verify the shifting is necessary.
					(this._terminal as any)._core._bufferService.buffer.lines.onDeleteEmitter.fire({
						index: this._terminal.buffer.active.baseY,
						amount: potentialShiftedLineCount
					});
				}
			});
		}
	}

	async handleCommandStart() {
		if (this._windowsPromptPollingInProcess) {
			this._windowsPromptPollingInProcess = false;
		}
		this._commandStartedWindowsBarrier = new Barrier();
		this._capability.currentCommand.commandStartX = this._terminal.buffer.active.cursorX;

		// On Windows track all cursor movements after the command start sequence
		this._hooks.commandMarkers.length = 0;

		let prompt: string | undefined = this._getWindowsPrompt();
		// Conpty could have the wrong cursor position at this point.
		if (!this._cursorOnNextLine() || !prompt) {
			this._windowsPromptPollingInProcess = true;
			// Poll for 1000ms until the cursor position is correct.
			let i = 0;
			for (; i < 50; i++) {
				await timeout(20);
				prompt = this._getWindowsPrompt();
				if (this._store.isDisposed || !this._windowsPromptPollingInProcess || this._cursorOnNextLine() && prompt) {
					if (!this._windowsPromptPollingInProcess) {
						this._logService.debug('CommandDetectionCapability#_handleCommandStartWindows polling cancelled');
					}
					break;
				}
			}
			this._windowsPromptPollingInProcess = false;
			if (i >= 50) {
				this._logService.debug('CommandDetectionCapability#_handleCommandStartWindows reached max attempts, ', this._cursorOnNextLine(), this._getWindowsPrompt());
			} else if (prompt) {
				// use the regex to set the position as it's possible input has occurred
				this._capability.currentCommand.commandStartX = prompt.length;
			}
		} else {
			// HACK: Fire command started on the following frame on Windows to allow the cursor
			// position to update as conpty often prints the sequence on a different line to the
			// actual line the command started on.
			await timeout(0);
		}

		if (!this._capability.currentCommand.commandExecutedMarker) {
			this._onCursorMoveListener.value = this._terminal.onCursorMove(() => {
				if (this._hooks.commandMarkers.length === 0 || this._hooks.commandMarkers[this._hooks.commandMarkers.length - 1].line !== this._terminal.buffer.active.cursorY) {
					const marker = this._terminal.registerMarker(0);
					if (marker) {
						this._hooks.commandMarkers.push(marker);
					}
				}
			});
		}
		this._capability.currentCommand.commandStartMarker = this._terminal.registerMarker(0);
		if (this._capability.currentCommand.commandStartMarker) {
			const line = this._terminal.buffer.active.getLine(this._capability.currentCommand.commandStartMarker.line);
			if (line) {
				this._capability.currentCommand.commandStartLineContent = line.translateToString(true);
			}
		}
		this._hooks.onCommandStartedEmitter.fire({ marker: this._capability.currentCommand.commandStartMarker } as ITerminalCommand);
		this._logService.debug('CommandDetectionCapability#_handleCommandStartWindows', this._capability.currentCommand.commandStartX, this._capability.currentCommand.commandStartMarker?.line);
		this._commandStartedWindowsBarrier.open();
	}

	handleCommandExecuted(options: IHandleCommandOptions | undefined) {
		// TODO: Flush here?
		// await this._commandStartedWindowsBarrier?.wait();
		// On Windows, use the gathered cursor move markers to correct the command start and
		// executed markers
		this._onCursorMoveListener.clear();
		this._evaluateCommandMarkers();
		this._capability.currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
		this._hooks.onCommandExecutedEmitter.fire();
		this._logService.debug('CommandDetectionCapability#handleCommandExecuted', this._capability.currentCommand.commandExecutedX, this._capability.currentCommand.commandExecutedMarker?.line);
	}

	preHandleCommandFinished() {
		if (this._capability.currentCommand.commandExecutedMarker) {
			return;
		}
		// This is done on command finished just in case command executed never happens (for example
		// PSReadLine tab completion)
		if (this._hooks.commandMarkers.length === 0) {
			// If the command start timeout doesn't happen before command finished, just use the
			// current marker.
			if (!this._capability.currentCommand.commandStartMarker) {
				this._capability.currentCommand.commandStartMarker = this._terminal.registerMarker(0);
			}
			if (this._capability.currentCommand.commandStartMarker) {
				this._hooks.commandMarkers.push(this._capability.currentCommand.commandStartMarker);
			}
		}
		this._evaluateCommandMarkers();
	}

	postHandleCommandFinished(): void {
		const currentCommand = this._capability.currentCommand;
		const commandText = currentCommand.command;
		const commandLine = currentCommand.commandStartMarker?.line;
		const executedLine = currentCommand.commandExecutedMarker?.line;
		if (
			!commandText || commandText.length === 0 ||
			commandLine === undefined || commandLine === -1 ||
			executedLine === undefined || executedLine === -1
		) {
			return;
		}

		// Scan downwards from the command start line and search for every character in the actual
		// command line. This may end up matching the wrong characters, but it shouldn't matter at
		// least in the typical case as the entire command will still get matched.
		let current = 0;
		let found = false;
		for (let i = commandLine; i <= executedLine; i++) {
			const line = this._terminal.buffer.active.getLine(i);
			if (!line) {
				break;
			}
			const text = line.translateToString(true);
			for (let j = 0; j < text.length; j++) {
				// Skip whitespace in case it was not actually rendered or could be trimmed from the
				// end of the line
				while (commandText.length < current && commandText[current] === ' ') {
					current++;
				}

				// Character match
				if (text[j] === commandText[current]) {
					current++;
				}

				// Full command match
				if (current === commandText.length) {
					// It's ambiguous whether the command executed marker should ideally appear at
					// the end of the line or at the beginning of the next line. Since it's more
					// useful for extracting the command at the end of the current line we go with
					// that.
					const wrapsToNextLine = j >= this._terminal.cols - 1;
					currentCommand.commandExecutedMarker = this._terminal.registerMarker(i - (this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY) + (wrapsToNextLine ? 1 : 0));
					currentCommand.commandExecutedX = wrapsToNextLine ? 0 : j + 1;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
	}

	private _evaluateCommandMarkers(): void {
		// On Windows, use the gathered cursor move markers to correct the command start and
		// executed markers.
		if (this._hooks.commandMarkers.length === 0) {
			return;
		}
		this._hooks.commandMarkers = this._hooks.commandMarkers.sort((a, b) => a.line - b.line);
		this._capability.currentCommand.commandStartMarker = this._hooks.commandMarkers[0];
		if (this._capability.currentCommand.commandStartMarker) {
			const line = this._terminal.buffer.active.getLine(this._capability.currentCommand.commandStartMarker.line);
			if (line) {
				this._capability.currentCommand.commandStartLineContent = line.translateToString(true);
			}
		}
		this._capability.currentCommand.commandExecutedMarker = this._hooks.commandMarkers[this._hooks.commandMarkers.length - 1];
		// Fire this now to prevent issues like #197409
		this._hooks.onCommandExecutedEmitter.fire();
	}

	private _cursorOnNextLine(): boolean {
		const lastCommand = this._capability.commands.at(-1);

		// There is only a single command, so this check is unnecessary
		if (!lastCommand) {
			return true;
		}

		const cursorYAbsolute = this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY;
		// If the cursor position is within the last command, we should poll.
		const lastCommandYAbsolute = (lastCommand.endMarker ? lastCommand.endMarker.line : lastCommand.marker?.line) ?? -1;
		return cursorYAbsolute > lastCommandYAbsolute;
	}

	private _waitForCursorMove(): Promise<void> {
		const cursorX = this._terminal.buffer.active.cursorX;
		const cursorY = this._terminal.buffer.active.cursorY;
		let totalDelay = 0;
		return new Promise<void>((resolve, reject) => {
			const interval = setInterval(() => {
				if (cursorX !== this._terminal.buffer.active.cursorX || cursorY !== this._terminal.buffer.active.cursorY) {
					resolve();
					clearInterval(interval);
					return;
				}
				totalDelay += 10;
				if (totalDelay > 1000) {
					clearInterval(interval);
					resolve();
				}
			}, 10);
		});
	}

	private _getWindowsPrompt(): string | undefined {
		const line = this._terminal.buffer.active.getLine(this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY);
		if (!line) {
			return;
		}
		// TODO: fine tune prompt regex to accomodate for unique configurations.
		const lineText = line.translateToString(true);
		if (!lineText) {
			return;
		}

		// PowerShell
		const pwshPrompt = lineText.match(/(?<prompt>(\(.+\)\s)?(?:PS.+>\s?))/)?.groups?.prompt;
		if (pwshPrompt) {
			const adjustedPrompt = this._adjustPrompt(pwshPrompt, lineText, '>');
			if (adjustedPrompt) {
				return adjustedPrompt;
			}
		}

		// Custom prompts like starship end in the common \u276f character
		const customPrompt = lineText.match(/.*\u276f(?=[^\u276f]*$)/g)?.[0];
		if (customPrompt) {
			const adjustedPrompt = this._adjustPrompt(customPrompt, lineText, '\u276f');
			if (adjustedPrompt) {
				return adjustedPrompt;
			}
		}

		// Command Prompt
		const cmdMatch = lineText.match(/^(?<prompt>(\(.+\)\s)?(?:[A-Z]:\\.*>))/);
		return cmdMatch?.groups?.prompt;
	}

	private _adjustPrompt(prompt: string | undefined, lineText: string, char: string): string | undefined {
		if (!prompt) {
			return;
		}
		// Conpty may not 'render' the space at the end of the prompt
		if (lineText === prompt && prompt.endsWith(char)) {
			prompt += ' ';
		}
		return prompt;
	}
}

function getOutputForCommand(executedMarker: IMarker | undefined, endMarker: IMarker | undefined, buffer: IBuffer): string | undefined {
	if (!executedMarker || !endMarker) {
		return undefined;
	}
	const startLine = executedMarker.line;
	const endLine = endMarker.line;

	if (startLine === endLine) {
		return undefined;
	}
	let output = '';
	let line: IBufferLine | undefined;
	for (let i = startLine; i < endLine; i++) {
		line = buffer.getLine(i);
		if (!line) {
			continue;
		}
		output += line.translateToString(!line.isWrapped) + (line.isWrapped ? '' : '\n');
	}
	return output === '' ? undefined : output;
}

function getOutputMatchForCommand(executedMarker: IMarker | undefined, endMarker: IMarker | undefined, buffer: IBuffer, cols: number, outputMatcher: ITerminalOutputMatcher): ITerminalOutputMatch | undefined {
	if (!executedMarker || !endMarker) {
		return undefined;
	}
	const endLine = endMarker.line;
	if (endLine === -1) {
		return undefined;
	}
	const startLine = Math.max(executedMarker.line, 0);
	const matcher = outputMatcher.lineMatcher;
	const linesToCheck = typeof matcher === 'string' ? 1 : outputMatcher.length || countNewLines(matcher);
	const lines: string[] = [];
	let match: RegExpMatchArray | null | undefined;
	if (outputMatcher.anchor === 'bottom') {
		for (let i = endLine - (outputMatcher.offset || 0); i >= startLine; i--) {
			let wrappedLineStart = i;
			const wrappedLineEnd = i;
			while (wrappedLineStart >= startLine && buffer.getLine(wrappedLineStart)?.isWrapped) {
				wrappedLineStart--;
			}
			i = wrappedLineStart;
			lines.unshift(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
			if (!match) {
				match = lines[0].match(matcher);
			}
			if (lines.length >= linesToCheck) {
				break;
			}
		}
	} else {
		for (let i = startLine + (outputMatcher.offset || 0); i < endLine; i++) {
			const wrappedLineStart = i;
			let wrappedLineEnd = i;
			while (wrappedLineEnd + 1 < endLine && buffer.getLine(wrappedLineEnd + 1)?.isWrapped) {
				wrappedLineEnd++;
			}
			i = wrappedLineEnd;
			lines.push(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
			if (!match) {
				match = lines[lines.length - 1].match(matcher);
			}
			if (lines.length >= linesToCheck) {
				break;
			}
		}
	}
	return match ? { regexMatch: match, outputLines: lines } : undefined;
}

export function getLinesForCommand(buffer: IBuffer, command: ITerminalCommand, cols: number, outputMatcher?: ITerminalOutputMatcher): string[] | undefined {
	if (!outputMatcher) {
		return undefined;
	}
	const executedMarker = command.executedMarker;
	const endMarker = command.endMarker;
	if (!executedMarker || !endMarker) {
		return undefined;
	}
	const startLine = executedMarker.line;
	const endLine = endMarker.line;

	const linesToCheck = outputMatcher.length;
	const lines: string[] = [];
	if (outputMatcher.anchor === 'bottom') {
		for (let i = endLine - (outputMatcher.offset || 0); i >= startLine; i--) {
			let wrappedLineStart = i;
			const wrappedLineEnd = i;
			while (wrappedLineStart >= startLine && buffer.getLine(wrappedLineStart)?.isWrapped) {
				wrappedLineStart--;
			}
			i = wrappedLineStart;
			lines.unshift(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
			if (lines.length > linesToCheck) {
				lines.pop();
			}
		}
	} else {
		for (let i = startLine + (outputMatcher.offset || 0); i < endLine; i++) {
			const wrappedLineStart = i;
			let wrappedLineEnd = i;
			while (wrappedLineEnd + 1 < endLine && buffer.getLine(wrappedLineEnd + 1)?.isWrapped) {
				wrappedLineEnd++;
			}
			i = wrappedLineEnd;
			lines.push(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
			if (lines.length === linesToCheck) {
				lines.shift();
			}
		}
	}
	return lines;
}

export function getPromptRowCount(command: ITerminalCommand, buffer: IBuffer): number {
	if (!command.marker) {
		return 1;
	}
	let promptRowCount = 1;
	let promptStartLine = command.marker.line;
	if (command.promptStartMarker) {
		promptStartLine = Math.min(command.promptStartMarker?.line ?? command.marker.line, command.marker.line);
		// Trim any leading whitespace-only lines to retain vertical space
		while (promptStartLine < command.marker.line && (buffer.getLine(promptStartLine)?.translateToString(true) ?? '').length === 0) {
			promptStartLine++;
		}
		promptRowCount = command.marker.line - promptStartLine + 1;
	}
	return promptRowCount;
}

function getXtermLineContent(buffer: IBuffer, lineStart: number, lineEnd: number, cols: number): string {
	// Cap the maximum number of lines generated to prevent potential performance problems. This is
	// more of a sanity check as the wrapped line should already be trimmed down at this point.
	const maxLineLength = Math.max(2048 / cols * 2);
	lineEnd = Math.min(lineEnd, lineStart + maxLineLength);
	let content = '';
	for (let i = lineStart; i <= lineEnd; i++) {
		// Make sure only 0 to cols are considered as resizing when windows mode is enabled will
		// retain buffer data outside of the terminal width as reflow is disabled.
		const line = buffer.getLine(i);
		if (line) {
			content += line.translateToString(true, 0, cols);
		}
	}
	return content;
}

function countNewLines(regex: RegExp): number {
	if (!regex.multiline) {
		return 1;
	}
	const source = regex.source;
	let count = 1;
	let i = source.indexOf('\\n');
	while (i !== -1) {
		count++;
		i = source.indexOf('\\n', i + 1);
	}
	return count;
}
