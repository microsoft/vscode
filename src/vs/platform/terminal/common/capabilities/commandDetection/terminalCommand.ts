/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkProperties, IMarker, ISerializedTerminalCommand, ITerminalCommand, IXtermMarker } from '../capabilities.js';
import { ITerminalOutputMatcher, ITerminalOutputMatch } from '../../terminal.js';
import type { IBuffer, IBufferLine, Terminal } from '@xterm/headless';

export interface ITerminalCommandProperties {
	command: string;
	commandLineConfidence: 'low' | 'medium' | 'high';
	isTrusted: boolean;
	timestamp: number;
	duration: number;
	marker: IXtermMarker | undefined;
	cwd: string | undefined;
	exitCode: number | undefined;
	commandStartLineContent: string | undefined;
	markProperties: IMarkProperties | undefined;
	executedX: number | undefined;
	startX: number | undefined;

	promptStartMarker?: IMarker | undefined;
	endMarker?: IXtermMarker | undefined;
	executedMarker?: IXtermMarker | undefined;
	aliases?: string[][] | undefined;
	wasReplayed?: boolean | undefined;
}

export class TerminalCommand implements ITerminalCommand {

	get command() { return this._properties.command; }
	get commandLineConfidence() { return this._properties.commandLineConfidence; }
	get isTrusted() { return this._properties.isTrusted; }
	get timestamp() { return this._properties.timestamp; }
	get duration() { return this._properties.duration; }
	get promptStartMarker() { return this._properties.promptStartMarker; }
	get marker() { return this._properties.marker; }
	get endMarker() { return this._properties.endMarker; }
	set endMarker(value: IXtermMarker | undefined) { this._properties.endMarker = value; }
	get executedMarker() { return this._properties.executedMarker; }
	get aliases() { return this._properties.aliases; }
	get wasReplayed() { return this._properties.wasReplayed; }
	get cwd() { return this._properties.cwd; }
	get exitCode() { return this._properties.exitCode; }
	get commandStartLineContent() { return this._properties.commandStartLineContent; }
	get markProperties() { return this._properties.markProperties; }
	get executedX() { return this._properties.executedX; }
	get startX() { return this._properties.startX; }

	constructor(
		private readonly _xterm: Terminal,
		private readonly _properties: ITerminalCommandProperties,
	) {
	}

	static deserialize(xterm: Terminal, serialized: ISerializedTerminalCommand & Required<Pick<ISerializedTerminalCommand, 'endLine'>>, isCommandStorageDisabled: boolean): TerminalCommand | undefined {
		const buffer = xterm.buffer.normal;
		const marker = serialized.startLine !== undefined ? xterm.registerMarker(serialized.startLine - (buffer.baseY + buffer.cursorY)) : undefined;

		// Check for invalid command
		if (!marker) {
			return undefined;
		}
		const promptStartMarker = serialized.promptStartLine !== undefined ? xterm.registerMarker(serialized.promptStartLine - (buffer.baseY + buffer.cursorY)) : undefined;

		// Valid full command
		const endMarker = serialized.endLine !== undefined ? xterm.registerMarker(serialized.endLine - (buffer.baseY + buffer.cursorY)) : undefined;
		const executedMarker = serialized.executedLine !== undefined ? xterm.registerMarker(serialized.executedLine - (buffer.baseY + buffer.cursorY)) : undefined;
		const newCommand = new TerminalCommand(xterm, {
			command: isCommandStorageDisabled ? '' : serialized.command,
			commandLineConfidence: serialized.commandLineConfidence ?? 'low',
			isTrusted: serialized.isTrusted,
			promptStartMarker,
			marker,
			startX: serialized.startX,
			endMarker,
			executedMarker,
			executedX: serialized.executedX,
			timestamp: serialized.timestamp,
			duration: serialized.duration,
			cwd: serialized.cwd,
			commandStartLineContent: serialized.commandStartLineContent,
			exitCode: serialized.exitCode,
			markProperties: serialized.markProperties,
			aliases: undefined,
			wasReplayed: true
		});
		return newCommand;
	}

	serialize(isCommandStorageDisabled: boolean): ISerializedTerminalCommand {
		return {
			promptStartLine: this.promptStartMarker?.line,
			startLine: this.marker?.line,
			startX: undefined,
			endLine: this.endMarker?.line,
			executedLine: this.executedMarker?.line,
			executedX: this.executedX,
			command: isCommandStorageDisabled ? '' : this.command,
			commandLineConfidence: isCommandStorageDisabled ? 'low' : this.commandLineConfidence,
			isTrusted: this.isTrusted,
			cwd: this.cwd,
			exitCode: this.exitCode,
			commandStartLineContent: this.commandStartLineContent,
			timestamp: this.timestamp,
			duration: this.duration,
			markProperties: this.markProperties,
		};
	}

	extractCommandLine(): string {
		return extractCommandLine(this._xterm.buffer.active, this._xterm.cols, this.marker, this.startX, this.executedMarker, this.executedX);
	}

	getOutput(): string | undefined {
		if (!this.executedMarker || !this.endMarker) {
			return undefined;
		}
		const startLine = this.executedMarker.line;
		const endLine = this.endMarker.line;

		if (startLine === endLine) {
			return undefined;
		}
		let output = '';
		let line: IBufferLine | undefined;
		for (let i = startLine; i < endLine; i++) {
			line = this._xterm.buffer.active.getLine(i);
			if (!line) {
				continue;
			}
			output += line.translateToString(!line.isWrapped) + (line.isWrapped ? '' : '\n');
		}
		return output === '' ? undefined : output;
	}

	getOutputMatch(outputMatcher: ITerminalOutputMatcher): ITerminalOutputMatch | undefined {
		// TODO: Add back this check? this._ptyHeuristics.value instanceof WindowsPtyHeuristics && (executedMarker?.line === endMarker?.line) ? this._currentCommand.commandStartMarker : executedMarker
		if (!this.executedMarker || !this.endMarker) {
			return undefined;
		}
		const endLine = this.endMarker.line;
		if (endLine === -1) {
			return undefined;
		}
		const buffer = this._xterm.buffer.active;
		const startLine = Math.max(this.executedMarker.line, 0);
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
				lines.unshift(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, this._xterm.cols));
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
				lines.push(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, this._xterm.cols));
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

	hasOutput(): boolean {
		return (
			!this.executedMarker?.isDisposed &&
			!this.endMarker?.isDisposed &&
			!!(
				this.executedMarker &&
				this.endMarker &&
				this.executedMarker.line < this.endMarker.line
			)
		);
	}

	getPromptRowCount(): number {
		return getPromptRowCount(this, this._xterm.buffer.active);
	}

	getCommandRowCount(): number {
		return getCommandRowCount(this);
	}
}

export interface ICurrentPartialCommand {
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

	getPromptRowCount(): number;
	getCommandRowCount(): number;
}

export class PartialTerminalCommand implements ICurrentPartialCommand {
	promptStartMarker?: IMarker;

	commandStartMarker?: IMarker;
	commandStartX?: number;
	commandStartLineContent?: string;

	commandRightPromptStartX?: number;
	commandRightPromptEndX?: number;

	commandLines?: IMarker;

	commandExecutedMarker?: IMarker;
	commandExecutedX?: number;

	private commandExecutedTimestamp?: number;
	private commandDuration?: number;

	commandFinishedMarker?: IMarker;

	currentContinuationMarker?: IMarker;
	continuations?: { marker: IMarker; end: number }[];

	cwd?: string;
	command?: string;
	commandLineConfidence?: 'low' | 'medium' | 'high';

	isTrusted?: boolean;
	isInvalid?: boolean;

	constructor(
		private readonly _xterm: Terminal,
	) {
	}

	serialize(cwd: string | undefined): ISerializedTerminalCommand | undefined {
		if (!this.commandStartMarker) {
			return undefined;
		}

		return {
			promptStartLine: this.promptStartMarker?.line,
			startLine: this.commandStartMarker.line,
			startX: this.commandStartX,
			endLine: undefined,
			executedLine: undefined,
			executedX: undefined,
			command: '',
			commandLineConfidence: 'low',
			isTrusted: true,
			cwd,
			exitCode: undefined,
			commandStartLineContent: undefined,
			timestamp: 0,
			duration: 0,
			markProperties: undefined
		};
	}

	promoteToFullCommand(cwd: string | undefined, exitCode: number | undefined, ignoreCommandLine: boolean, markProperties: IMarkProperties | undefined): TerminalCommand | undefined {
		// When the command finishes and executed never fires the placeholder selector should be used.
		if (exitCode === undefined && this.command === undefined) {
			this.command = '';
		}

		if ((this.command !== undefined && !this.command.startsWith('\\')) || ignoreCommandLine) {
			return new TerminalCommand(this._xterm, {
				command: ignoreCommandLine ? '' : (this.command || ''),
				commandLineConfidence: ignoreCommandLine ? 'low' : (this.commandLineConfidence || 'low'),
				isTrusted: !!this.isTrusted,
				promptStartMarker: this.promptStartMarker,
				marker: this.commandStartMarker,
				startX: this.commandStartX,
				endMarker: this.commandFinishedMarker,
				executedMarker: this.commandExecutedMarker,
				executedX: this.commandExecutedX,
				timestamp: Date.now(),
				duration: this.commandDuration || 0,
				cwd,
				exitCode,
				commandStartLineContent: this.commandStartLineContent,
				markProperties
			});
		}

		return undefined;
	}

	markExecutedTime() {
		if (this.commandExecutedTimestamp === undefined) {
			this.commandExecutedTimestamp = Date.now();
		}
	}

	markFinishedTime() {
		if (this.commandDuration === undefined && this.commandExecutedTimestamp !== undefined) {
			this.commandDuration = Date.now() - this.commandExecutedTimestamp;
		}
	}

	extractCommandLine(): string {
		return extractCommandLine(this._xterm.buffer.active, this._xterm.cols, this.commandStartMarker, this.commandStartX, this.commandExecutedMarker, this.commandExecutedX);
	}

	getPromptRowCount(): number {
		return getPromptRowCount(this, this._xterm.buffer.active);
	}

	getCommandRowCount(): number {
		return getCommandRowCount(this);
	}
}

function extractCommandLine(
	buffer: IBuffer,
	cols: number,
	commandStartMarker: IXtermMarker | undefined,
	commandStartX: number | undefined,
	commandExecutedMarker: IXtermMarker | undefined,
	commandExecutedX: number | undefined
): string {
	if (!commandStartMarker || !commandExecutedMarker || commandStartX === undefined || commandExecutedX === undefined) {
		return '';
	}
	let content = '';
	for (let i = commandStartMarker.line; i <= commandExecutedMarker.line; i++) {
		const line = buffer.getLine(i);
		if (line) {
			content += line.translateToString(true, i === commandStartMarker.line ? commandStartX : 0, i === commandExecutedMarker.line ? commandExecutedX : cols);
		}
	}
	return content;
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

function getPromptRowCount(command: ITerminalCommand | ICurrentPartialCommand, buffer: IBuffer): number {
	const marker = 'hasOutput' in command ? command.marker : command.commandStartMarker;
	if (!marker || !command.promptStartMarker) {
		return 1;
	}
	let promptRowCount = 1;
	let promptStartLine = command.promptStartMarker.line;
	// Trim any leading whitespace-only lines to retain vertical space
	while (promptStartLine < marker.line && (buffer.getLine(promptStartLine)?.translateToString(true) ?? '').length === 0) {
		promptStartLine++;
	}
	promptRowCount = marker.line - promptStartLine + 1;
	return promptRowCount;
}

function getCommandRowCount(command: ITerminalCommand | ICurrentPartialCommand): number {
	const marker = 'hasOutput' in command ? command.marker : command.commandStartMarker;
	const executedMarker = 'hasOutput' in command ? command.executedMarker : command.commandExecutedMarker;
	if (!marker || !executedMarker) {
		return 1;
	}
	const commandExecutedLine = Math.max(executedMarker.line, marker.line);
	let commandRowCount = commandExecutedLine - marker.line + 1;
	// Trim the last line if the cursor X is in the left-most cell
	const executedX = 'hasOutput' in command ? command.executedX : command.commandExecutedX;
	if (executedX === 0) {
		commandRowCount--;
	}
	return commandRowCount;
}
