/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, ILinkProvider, IViewportRange, IBufferCellPosition, ILink } from 'xterm';
import { convertBufferRangeToViewport, TOOLTIP_HOVER_THRESHOLD } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalWordLinkProvider implements ILinkProvider {
	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange) => boolean | void,
		private readonly _leaveCallback: () => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
	}

	public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
		const start: IBufferCellPosition = { x: position.x, y: position.y };
		const end: IBufferCellPosition = { x: position.x, y: position.y };

		// let startLine = position.y - 1;
		// let endLine = startLine;

		// const lines: IBufferLine[] = [
		// 	this._xterm.buffer.active.getLine(startLine)!
		// ];

		// while (this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
		// 	lines.unshift(this._xterm.buffer.active.getLine(startLine - 1)!);
		// 	startLine--;
		// }

		// while (this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
		// 	lines.push(this._xterm.buffer.active.getLine(endLine + 1)!);
		// 	endLine++;
		// }

		// TODO: Support wrapping

		// Expand to the left until a word separator is hit
		const line = this._xterm.buffer.active.getLine(position.y - 1)!;
		let text = '';
		start.x++; // The hovered cell is considered first
		for (let x = position.x; x > 0; x--) {
			const char = line.getCell(x - 1)?.getChars();
			if (!char) {
				break;
			}
			const config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
			if (config.wordSeparators.indexOf(char) >= 0) {
				break;
			}
			start.x--;
			text = char + text;
		}

		// Expand to the right until a word separator is hit
		// end.x++; // The hovered cell is considered first
		for (let x = position.x + 1; x < line.length; x++) {
			const char = line.getCell(x - 1)?.getChars();
			if (!char) {
				break;
			}
			const config = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION);
			if (config.wordSeparators.indexOf(char) >= 0) {
				break;
			}
			end.x++;
			text += char;
		}

		// TODO: Only show word links when modifier is down?
		// TODO: Only show tooltip if no mouse movement has happened; copy how editor works

		// No links were found (the hovered cell is whitespace)
		if (text.length === 0) {
			callback(undefined);
			return;
		}

		const range = { start, end };
		callback({
			text,
			range,
			activate: (event: MouseEvent, text: string) => this._activateCallback(event, text),
			hover: (event: MouseEvent, text: string) => {
				// TODO: This tooltip timer is currently not totally reliable
				setTimeout(() => {
					this._tooltipCallback(event, text, convertBufferRangeToViewport(range, this._xterm.buffer.active.viewportY));
				}, TOOLTIP_HOVER_THRESHOLD);
			},
			leave: () => this._leaveCallback()
		});

		// let startLine = position.y - 1;
		// let endLine = startLine;

		// const lines: IBufferLine[] = [
		// 	this._xterm.buffer.active.getLine(startLine)!
		// ];

		// while (this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
		// 	lines.unshift(this._xterm.buffer.active.getLine(startLine - 1)!);
		// 	startLine--;
		// }

		// while (this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
		// 	lines.push(this._xterm.buffer.active.getLine(endLine + 1)!);
		// 	endLine++;
		// }

		// const text = getXtermLineContent(this._xterm.buffer.active, startLine, endLine);

		// clone regex to do a global search on text
		// const rex = new RegExp(this._localLinkRegex, 'g');
		// let match;
		// let stringIndex = -1;
		// while ((match = rex.exec(text)) !== null) {
		// 	// const uri = match[typeof matcher.matchIndex !== 'number' ? 0 : matcher.matchIndex];
		// 	const uri = match[0];
		// 	if (!uri) {
		// 		// something matched but does not comply with the given matchIndex
		// 		// since this is most likely a bug the regex itself we simply do nothing here
		// 		// this._logService.debug('match found without corresponding matchIndex', match, matcher);
		// 		break;
		// 	}

		// 	// Get index, match.index is for the outer match which includes negated chars
		// 	// therefore we cannot use match.index directly, instead we search the position
		// 	// of the match group in text again
		// 	// also correct regex and string search offsets for the next loop run
		// 	stringIndex = text.indexOf(uri, stringIndex + 1);
		// 	rex.lastIndex = stringIndex + uri.length;
		// 	if (stringIndex < 0) {
		// 		// invalid stringIndex (should not have happened)
		// 		break;
		// 	}

		// 	// Convert the link text's string index into a wrapped buffer range
		// 	const bufferRange = convertLinkRangeToBuffer(lines, this._xterm.cols, {
		// 		startColumn: stringIndex + 1,
		// 		startLineNumber: 1,
		// 		endColumn: stringIndex + uri.length + 1,
		// 		endLineNumber: 1
		// 	}, startLine);

		// 	if (positionIsInRange(position, bufferRange)) {
		// 		this._validationCallback(uri, isValid => {
		// 			// TODO: Discard if buffers have changes or if another link was added for this line
		// 			if (isValid) {
		// 				callback({
		// 					text: uri,
		// 					range: bufferRange,
		// 					activate: (event: MouseEvent, text: string) => this._activateCallback(event, text),
		// 					hover: (event: MouseEvent, text: string) => {
		// 						// TODO: This tooltip timer is currently not totally reliable
		// 						setTimeout(() => {
		// 							this._tooltipCallback(event, text, convertBufferRangeToViewport(bufferRange, this._xterm.buffer.active.viewportY));
		// 						}, 200);
		// 					},
		// 					leave: () => this._leaveCallback()
		// 				});
		// 			} else {
		// 				// TODO: Support multiple matches from the regexes
		// 				callback(undefined);
		// 			}
		// 		});
		// 	} else {
		// 		callback(undefined);
		// 	}
		// 	return;
		// }

		// callback(undefined);
	}
}
