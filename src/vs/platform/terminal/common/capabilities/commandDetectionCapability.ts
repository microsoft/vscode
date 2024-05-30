/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { debounce } from 'vs/base/common/decorators';
import { Emitter } from 'vs/base/common/event';
import { Disposable, MandatoryMutableDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { CommandInvalidationReason, ICommandDetectionCapability, ICommandInvalidationRequest, IHandleCommandOptions, ISerializedCommandDetectionCapability, ISerializedTerminalCommand, ITerminalCommand, IXtermMarker, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalOutputMatcher } from 'vs/platform/terminal/common/terminal';
import { ICurrentPartialCommand, PartialTerminalCommand, TerminalCommand } from 'vs/platform/terminal/common/capabilities/commandDetection/terminalCommand';
import { PromptInputModel, type IPromptInputModel } from 'vs/platform/terminal/common/capabilities/commandDetection/promptInputModel';

// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { IBuffer, IDisposable, IMarker, Terminal } from '@xterm/headless';

interface ITerminalDimensions {
	cols: number;
	rows: number;
}

export class CommandDetectionCapability extends Disposable implements ICommandDetectionCapability {
	readonly type = TerminalCapability.CommandDetection;

	private readonly _promptInputModel: PromptInputModel;
	get promptInputModel(): IPromptInputModel { return this._promptInputModel; }

	protected _commands: TerminalCommand[] = [];
	private _cwd: string | undefined;
	private _promptTerminator: string | undefined;
	private _currentCommand: PartialTerminalCommand = new PartialTerminalCommand(this._terminal);
	private _commandMarkers: IMarker[] = [];
	private _dimensions: ITerminalDimensions;
	private __isCommandStorageDisabled: boolean = false;
	private _handleCommandStartOptions?: IHandleCommandOptions;

	private _commitCommandFinished?: RunOnceScheduler;

	private _ptyHeuristicsHooks: ICommandDetectionHeuristicsHooks;
	private readonly _ptyHeuristics: MandatoryMutableDisposable<IPtyHeuristics>;

	get commands(): readonly TerminalCommand[] { return this._commands; }
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
	get promptTerminator(): string | undefined { return this._promptTerminator; }
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
	private readonly _onCommandExecuted = this._register(new Emitter<ITerminalCommand>());
	readonly onCommandExecuted = this._onCommandExecuted.event;
	private readonly _onCommandInvalidated = this._register(new Emitter<ITerminalCommand[]>());
	readonly onCommandInvalidated = this._onCommandInvalidated.event;
	private readonly _onCurrentCommandInvalidated = this._register(new Emitter<ICommandInvalidationRequest>());
	readonly onCurrentCommandInvalidated = this._onCurrentCommandInvalidated.event;

	constructor(
		private readonly _terminal: Terminal,
		@ILogService private readonly _logService: ILogService
	) {
		super();

		this._promptInputModel = this._register(new PromptInputModel(this._terminal, this.onCommandStarted, this.onCommandExecuted, this._logService));

		// Pull command line from the buffer if it was not set explicitly
		this._register(this.onCommandExecuted(command => {
			if (command.commandLineConfidence !== 'high') {
				// HACK: onCommandExecuted actually fired with PartialTerminalCommand
				const typedCommand = (command as ITerminalCommand | PartialTerminalCommand);
				command.command = typedCommand.extractCommandLine();
				command.commandLineConfidence = 'low';

				// ITerminalCommand
				if ('getOutput' in typedCommand) {
					if (
						// Markers exist
						typedCommand.promptStartMarker && typedCommand.marker && typedCommand.executedMarker &&
						// Single line command
						command.command.indexOf('\n') === -1 &&
						// Start marker is not on the left-most column
						typedCommand.startX !== undefined && typedCommand.startX > 0
					) {
						command.commandLineConfidence = 'medium';
					}
				}
				// PartialTerminalCommand
				else {
					if (
						// Markers exist
						typedCommand.promptStartMarker && typedCommand.commandStartMarker && typedCommand.commandExecutedMarker &&
						// Single line command
						command.command.indexOf('\n') === -1 &&
						// Start marker is not on the left-most column
						typedCommand.commandStartX !== undefined && typedCommand.commandStartX > 0
					) {
						command.commandLineConfidence = 'medium';
					}
				}
			}
		}));

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
			commitCommandFinished() {
				that._commitCommandFinished?.flush();
				that._commitCommandFinished = undefined;
			}
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

	setContinuationPrompt(value: string): void {
		this._promptInputModel.setContinuationPrompt(value);
	}

	// TODO: Simplify this, can everything work off the last line?
	setPromptTerminator(promptTerminator: string, lastPromptLine: string) {
		this._logService.debug('CommandDetectionCapability#setPromptTerminator', promptTerminator);
		this._promptTerminator = promptTerminator;
		this._promptInputModel.setLastPromptLine(lastPromptLine);
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
					get clearCommandsInViewport() { return that._clearCommandsInViewport.bind(that); }
					commitCommandFinished() {
						that._commitCommandFinished?.flush();
						that._commitCommandFinished = undefined;
					}
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
		if ((this._commands[0].promptStartMarker ?? this._commands[0].marker!).line > line) {
			return undefined;
		}

		// Iterate backwards through commands to find the right one
		for (let i = this.commands.length - 1; i >= 0; i--) {
			if ((this.commands[i].promptStartMarker ?? this.commands[i].marker!).line <= line) {
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
		// Adjust the last command's finished marker when needed. The standard position for the
		// finished marker `D` to appear is at the same position as the following prompt started
		// `A`.
		const lastCommand = this.commands.at(-1);
		if (lastCommand?.endMarker && lastCommand?.executedMarker && lastCommand.endMarker.line === lastCommand.executedMarker.line) {
			this._logService.debug('CommandDetectionCapability#handlePromptStart adjusted commandFinished', `${lastCommand.endMarker.line} -> ${lastCommand.executedMarker.line + 1}`);
			lastCommand.endMarker = cloneMarker(this._terminal, lastCommand.executedMarker, 1);
		}

		this._currentCommand.promptStartMarker = options?.marker || (lastCommand?.endMarker ? cloneMarker(this._terminal, lastCommand.endMarker) : this._terminal.registerMarker(0));

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
		this._currentCommand.cwd = this._cwd;
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
		this._currentCommand.markExecutedTime();
	}

	handleCommandFinished(exitCode: number | undefined, options?: IHandleCommandOptions): void {
		this._currentCommand.markFinishedTime();
		this._ptyHeuristics.value.preHandleCommandFinished?.();

		this._logService.debug('CommandDetectionCapability#handleCommandFinished', this._terminal.buffer.active.cursorX, options?.marker?.line, this._currentCommand.command, this._currentCommand);

		// HACK: Handle a special case on some versions of bash where identical commands get merged
		// in the output of `history`, this detects that case and sets the exit code to the the last
		// command's exit code. This covered the majority of cases but will fail if the same command
		// runs with a different exit code, that will need a more robust fix where we send the
		// command ID and exit code over to the capability to adjust there.
		if (exitCode === undefined) {
			const lastCommand = this.commands.length > 0 ? this.commands[this.commands.length - 1] : undefined;
			if (this._currentCommand.command && this._currentCommand.command.length > 0 && lastCommand?.command === this._currentCommand.command) {
				exitCode = lastCommand.exitCode;
			}
		}

		if (this._currentCommand.commandStartMarker === undefined || !this._terminal.buffer.active) {
			return;
		}

		this._currentCommand.commandFinishedMarker = options?.marker || this._terminal.registerMarker(0);

		this._ptyHeuristics.value.postHandleCommandFinished?.();

		const newCommand = this._currentCommand.promoteToFullCommand(this._cwd, exitCode, this._handleCommandStartOptions?.ignoreCommandLine ?? false, options?.markProperties);

		if (newCommand) {
			this._commands.push(newCommand);
			this._commitCommandFinished = new RunOnceScheduler(() => {
				this._onBeforeCommandFinished.fire(newCommand);
				if (!this._currentCommand.isInvalid) {
					this._logService.debug('CommandDetectionCapability#onCommandFinished', newCommand);
					this._onCommandFinished.fire(newCommand);
				}
			}, 50);
			this._commitCommandFinished.schedule();
		}
		this._currentCommand = new PartialTerminalCommand(this._terminal);
		this._handleCommandStartOptions = undefined;
	}

	setCommandLine(commandLine: string, isTrusted: boolean) {
		this._logService.debug('CommandDetectionCapability#setCommandLine', commandLine, isTrusted);
		this._currentCommand.command = commandLine;
		this._currentCommand.commandLineConfidence = 'high';
		this._currentCommand.isTrusted = isTrusted;

		if (isTrusted) {
			this._promptInputModel.setConfidentCommandLine(commandLine);
		}
	}

	serialize(): ISerializedCommandDetectionCapability {
		const commands: ISerializedTerminalCommand[] = this.commands.map(e => e.serialize(this.__isCommandStorageDisabled));
		const partialCommand = this._currentCommand.serialize(this._cwd);
		if (partialCommand) {
			commands.push(partialCommand);
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
			// Partial command
			if (!e.endLine) {
				// Check for invalid command
				const marker = e.startLine !== undefined ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : undefined;
				if (!marker) {
					continue;
				}
				this._currentCommand.commandStartMarker = e.startLine !== undefined ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : undefined;
				this._currentCommand.commandStartX = e.startX;
				this._currentCommand.promptStartMarker = e.promptStartLine !== undefined ? this._terminal.registerMarker(e.promptStartLine - (buffer.baseY + buffer.cursorY)) : undefined;
				this._cwd = e.cwd;
				this._onCommandStarted.fire({ marker } as ITerminalCommand);
				continue;
			}

			// Full command
			const newCommand = TerminalCommand.deserialize(this._terminal, e, this.__isCommandStorageDisabled);
			if (!newCommand) {
				continue;
			}

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
	readonly onCommandStartedEmitter: Emitter<ITerminalCommand>;
	readonly onCommandExecutedEmitter: Emitter<ITerminalCommand>;
	readonly dimensions: ITerminalDimensions;
	readonly isCommandStorageDisabled: boolean;

	commandMarkers: IMarker[];

	clearCommandsInViewport(): void;
	commitCommandFinished(): void;
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

	handleCommandStart(options?: IHandleCommandOptions) {
		this._hooks.commitCommandFinished();

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
		this._hooks.onCommandExecutedEmitter.fire(currentCommand as ITerminalCommand);
	}
}

const enum AdjustCommandStartMarkerConstants {
	MaxCheckLineCount = 10,
	Interval = 20,
	MaximumPollCount = 10,
}

/**
 * An object that integrated with and decorates the command detection capability to add heuristics
 * that adjust various markers to work better with Windows and ConPTY. This isn't depended upon the
 * frontend OS, or even the backend OS, but the `IsWindows` property which technically a non-Windows
 * client can emit (for example in tests).
 */
class WindowsPtyHeuristics extends Disposable {

	private readonly _onCursorMoveListener = this._register(new MutableDisposable());

	private _tryAdjustCommandStartMarkerScheduler?: RunOnceScheduler;
	private _tryAdjustCommandStartMarkerScannedLineCount: number = 0;
	private _tryAdjustCommandStartMarkerPollCount: number = 0;

	constructor(
		private readonly _terminal: Terminal,
		private readonly _capability: CommandDetectionCapability,
		private readonly _hooks: ICommandDetectionHeuristicsHooks,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(_terminal.parser.registerCsiHandler({ final: 'J' }, params => {
			// Clear commands when the viewport is cleared
			if (params.length >= 1 && (params[0] === 2 || params[0] === 3)) {
				this._hooks.clearCommandsInViewport();
			}
			// We don't want to override xterm.js' default behavior, just augment it
			return false;
		}));

		this._register(this._capability.onBeforeCommandFinished(command => {
			// For older Windows backends we cannot listen to CSI J, instead we assume running clear
			// or cls will clear all commands in the viewport. This is not perfect but it's right
			// most of the time.
			if (command.command.trim().toLowerCase() === 'clear' || command.command.trim().toLowerCase() === 'cls') {
				this._tryAdjustCommandStartMarkerScheduler?.cancel();
				this._tryAdjustCommandStartMarkerScheduler = undefined;
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

	handleCommandStart() {
		this._capability.currentCommand.commandStartX = this._terminal.buffer.active.cursorX;

		// On Windows track all cursor movements after the command start sequence
		this._hooks.commandMarkers.length = 0;

		const initialCommandStartMarker = this._capability.currentCommand.commandStartMarker = (
			this._capability.currentCommand.promptStartMarker
				? cloneMarker(this._terminal, this._capability.currentCommand.promptStartMarker)
				: this._terminal.registerMarker(0)
		)!;
		this._capability.currentCommand.commandStartX = 0;

		// DEBUG: Add a decoration for the original unadjusted command start position
		// if ('registerDecoration' in this._terminal) {
		// 	const d = (this._terminal as any).registerDecoration({
		// 		marker: this._capability.currentCommand.commandStartMarker,
		// 		x: this._capability.currentCommand.commandStartX
		// 	});
		// 	d?.onRender((e: HTMLElement) => {
		// 		e.textContent = 'b';
		// 		e.classList.add('xterm-sequence-decoration', 'top', 'right');
		// 		e.title = 'Initial command start position';
		// 	});
		// }

		// The command started sequence may be printed before the actual prompt is, for example a
		// multi-line prompt will typically look like this where D, A and B signify the command
		// finished, prompt started and command started sequences respectively:
		//
		//     D/my/cwdB
		//     > C
		//
		// Due to this, it's likely that this will be called before the line has been parsed.
		// Unfortunately, it is also the case that the actual command start data may not be parsed
		// by the end of the task either, so a microtask cannot be used.
		//
		// The strategy used is to begin polling and scanning downwards for up to the next 5 lines.
		// If it looks like a prompt is found, the command started location is adjusted. If the
		// command executed sequences comes in before polling is done, polling is canceled and the
		// final polling task is executed synchronously.
		this._tryAdjustCommandStartMarkerScannedLineCount = 0;
		this._tryAdjustCommandStartMarkerPollCount = 0;
		this._tryAdjustCommandStartMarkerScheduler = new RunOnceScheduler(() => this._tryAdjustCommandStartMarker(initialCommandStartMarker), AdjustCommandStartMarkerConstants.Interval);
		this._tryAdjustCommandStartMarkerScheduler.schedule();

		// TODO: Cache details about polling for the future - eg. if it always fails, stop bothering
	}

	private _tryAdjustCommandStartMarker(start: IMarker) {
		if (this._store.isDisposed) {
			return;
		}
		const buffer = this._terminal.buffer.active;
		let scannedLineCount = this._tryAdjustCommandStartMarkerScannedLineCount;
		while (scannedLineCount < AdjustCommandStartMarkerConstants.MaxCheckLineCount && start.line + scannedLineCount < buffer.baseY + this._terminal.rows) {
			if (this._cursorOnNextLine()) {
				const prompt = this._getWindowsPrompt(start.line + scannedLineCount);
				if (prompt) {
					const adjustedPrompt = typeof prompt === 'string' ? prompt : prompt.prompt;
					this._capability.currentCommand.commandStartMarker = this._terminal.registerMarker(0)!;
					if (typeof prompt === 'object' && prompt.likelySingleLine) {
						this._logService.debug('CommandDetectionCapability#_tryAdjustCommandStartMarker adjusted promptStart', `${this._capability.currentCommand.promptStartMarker?.line} -> ${this._capability.currentCommand.commandStartMarker.line}`);
						this._capability.currentCommand.promptStartMarker?.dispose();
						this._capability.currentCommand.promptStartMarker = cloneMarker(this._terminal, this._capability.currentCommand.commandStartMarker);
						// Adjust the last command if it's not in the same position as the following
						// prompt start marker
						const lastCommand = this._capability.commands.at(-1);
						if (lastCommand && this._capability.currentCommand.commandStartMarker.line !== lastCommand.endMarker?.line) {
							lastCommand.endMarker?.dispose();
							lastCommand.endMarker = cloneMarker(this._terminal, this._capability.currentCommand.commandStartMarker);
						}
					}
					// use the regex to set the position as it's possible input has occurred
					this._capability.currentCommand.commandStartX = adjustedPrompt.length;
					this._logService.debug('CommandDetectionCapability#_tryAdjustCommandStartMarker adjusted commandStart', `${start.line} -> ${this._capability.currentCommand.commandStartMarker.line}:${this._capability.currentCommand.commandStartX}`);
					this._flushPendingHandleCommandStartTask();
					return;
				}
			}
			scannedLineCount++;
		}
		if (scannedLineCount < AdjustCommandStartMarkerConstants.MaxCheckLineCount) {
			this._tryAdjustCommandStartMarkerScannedLineCount = scannedLineCount;
			if (++this._tryAdjustCommandStartMarkerPollCount < AdjustCommandStartMarkerConstants.MaximumPollCount) {
				this._tryAdjustCommandStartMarkerScheduler?.schedule();
			} else {
				this._flushPendingHandleCommandStartTask();
			}
		} else {
			this._flushPendingHandleCommandStartTask();
		}
	}

	private _flushPendingHandleCommandStartTask() {
		// Perform final try adjust if necessary
		if (this._tryAdjustCommandStartMarkerScheduler) {
			// Max out poll count to ensure it's the last run
			this._tryAdjustCommandStartMarkerPollCount = AdjustCommandStartMarkerConstants.MaximumPollCount;
			this._tryAdjustCommandStartMarkerScheduler.flush();
			this._tryAdjustCommandStartMarkerScheduler = undefined;
		}

		this._hooks.commitCommandFinished();

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

		if (this._capability.currentCommand.commandStartMarker) {
			const line = this._terminal.buffer.active.getLine(this._capability.currentCommand.commandStartMarker.line);
			if (line) {
				this._capability.currentCommand.commandStartLineContent = line.translateToString(true);
			}
		}
		this._hooks.onCommandStartedEmitter.fire({ marker: this._capability.currentCommand.commandStartMarker } as ITerminalCommand);
		this._logService.debug('CommandDetectionCapability#_handleCommandStartWindows', this._capability.currentCommand.commandStartX, this._capability.currentCommand.commandStartMarker?.line);
	}

	handleCommandExecuted(options: IHandleCommandOptions | undefined) {
		if (this._tryAdjustCommandStartMarkerScheduler) {
			this._flushPendingHandleCommandStartTask();
		}
		// Use the gathered cursor move markers to correct the command start and executed markers
		this._onCursorMoveListener.clear();
		this._evaluateCommandMarkers();
		this._capability.currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
		this._hooks.onCommandExecutedEmitter.fire(this._capability.currentCommand as ITerminalCommand);
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
		this._hooks.onCommandExecutedEmitter.fire(this._capability.currentCommand as ITerminalCommand);
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

	private _getWindowsPrompt(y: number = this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY): string | { prompt: string; likelySingleLine: true } | undefined {
		const line = this._terminal.buffer.active.getLine(y);
		if (!line) {
			return;
		}
		const lineText = line.translateToString(true);
		if (!lineText) {
			return;
		}

		// PowerShell
		const pwshPrompt = lineText.match(/(?<prompt>(\(.+\)\s)?(?:PS.+>\s?))/)?.groups?.prompt;
		if (pwshPrompt) {
			const adjustedPrompt = this._adjustPrompt(pwshPrompt, lineText, '>');
			if (adjustedPrompt) {
				return {
					prompt: adjustedPrompt,
					likelySingleLine: true
				};
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

		// Bash Prompt
		const bashPrompt = lineText.match(/^(?<prompt>\$)/)?.groups?.prompt;
		if (bashPrompt) {
			const adjustedPrompt = this._adjustPrompt(bashPrompt, lineText, '$');
			if (adjustedPrompt) {
				return adjustedPrompt;
			}
		}

		// Python Prompt
		const pythonPrompt = lineText.match(/^(?<prompt>>>> )/g)?.groups?.prompt;
		if (pythonPrompt) {
			return {
				prompt: pythonPrompt,
				likelySingleLine: true
			};
		}

		// Dynamic prompt detection
		if (this._capability.promptTerminator && lineText.trim().endsWith(this._capability.promptTerminator)) {
			const adjustedPrompt = this._adjustPrompt(lineText, lineText, this._capability.promptTerminator);
			if (adjustedPrompt) {
				return adjustedPrompt;
			}
		}

		// Command Prompt
		const cmdMatch = lineText.match(/^(?<prompt>(\(.+\)\s)?(?:[A-Z]:\\.*>))/);
		return cmdMatch?.groups?.prompt ? {
			prompt: cmdMatch.groups.prompt,
			likelySingleLine: true
		} : undefined;
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

function cloneMarker(xterm: Terminal, marker: IXtermMarker, offset: number = 0): IXtermMarker | undefined {
	return xterm.registerMarker(marker.line - (xterm.buffer.active.baseY + xterm.buffer.active.cursorY) + offset);
}
