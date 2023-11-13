/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkProperties, IMarker, ISerializedTerminalCommand, ITerminalCommand, IXtermMarker } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalOutputMatcher, ITerminalOutputMatch } from 'vs/platform/terminal/common/terminal';

// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { IBuffer, IBufferLine, Terminal } from '@xterm/headless';

export interface ITerminalCommandProperties {
	command: string;
	isTrusted: boolean;
	timestamp: number;
	promptStartMarker: IMarker | undefined;
	marker: IXtermMarker | undefined;
	endMarker: IXtermMarker | undefined;
	executedMarker: IXtermMarker | undefined;
	aliases: string[][] | undefined;
	wasReplayed: boolean | undefined;
	cwd: string | undefined;
	exitCode: number | undefined;
	commandStartLineContent: string | undefined;
	markProperties: IMarkProperties | undefined;
	executedX: number | undefined;
	startX: number | undefined;
}

export class TerminalCommand implements ITerminalCommand {

	get command() { return this._properties.command; }
	get isTrusted() { return this._properties.isTrusted; }
	get timestamp() { return this._properties.timestamp; }
	get promptStartMarker() { return this._properties.promptStartMarker; }
	get marker() { return this._properties.marker; }
	get endMarker() { return this._properties.endMarker; }
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

	// static deserialize(serialized: ISerializedTerminalCommand): ITerminalCommand {
	// 	return new
	// }

	serialize(isCommandStorageDisabled: boolean): ISerializedTerminalCommand {
		return {
			promptStartLine: this.promptStartMarker?.line,
			startLine: this.marker?.line,
			startX: undefined,
			endLine: this.endMarker?.line,
			executedLine: this.executedMarker?.line,
			executedX: this.executedX,
			command: isCommandStorageDisabled ? '' : this.command,
			isTrusted: this.isTrusted,
			cwd: this.cwd,
			exitCode: this.exitCode,
			commandStartLineContent: this.commandStartLineContent,
			timestamp: this.timestamp,
			markProperties: this.markProperties,
		};
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
