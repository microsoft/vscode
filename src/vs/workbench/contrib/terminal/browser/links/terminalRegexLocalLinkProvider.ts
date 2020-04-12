/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, ILinkProvider, IViewportRange, IBufferCellPosition, ILink } from 'xterm';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalRegexLocalLinkProvider implements ILinkProvider {
	constructor(
		private readonly _xterm: Terminal,
		private readonly _processManager: ITerminalProcessManager | undefined,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange) => boolean | void,
		private readonly _leaveCallback: () => void
	) {
	}

	public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
		let startLine = position.y - 1;
		let endLine = startLine;

		while (this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
			startLine--;
		}

		while (this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
			endLine++;
		}

		const text = getXtermLineContent(this._xterm.buffer.active, startLine, endLine);

		// clone regex to do a global search on text
		const rex = new RegExp(this._localLinkRegex, 'g');
		let match;
		let stringIndex = -1;
		while ((match = rex.exec(text)) !== null) {
			// const uri = match[typeof matcher.matchIndex !== 'number' ? 0 : matcher.matchIndex];
			const uri = match[0];
			if (!uri) {
				// something matched but does not comply with the given matchIndex
				// since this is most likely a bug the regex itself we simply do nothing here
				// this._logService.debug('match found without corresponding matchIndex', match, matcher);
				break;
			}

			// Get index, match.index is for the outer match which includes negated chars
			// therefore we cannot use match.index directly, instead we search the position
			// of the match group in text again
			// also correct regex and string search offsets for the next loop run
			stringIndex = text.indexOf(uri, stringIndex + 1);
			rex.lastIndex = stringIndex + uri.length;
			if (stringIndex < 0) {
				// invalid stringIndex (should not have happened)
				break;
			}

			console.log('found link!', stringIndex, uri);

			// get the buffer index as [absolute row, col] for the match
			// const bufferIndex = this._xterm.buffer.active.stringIndexToBufferIndex(rowIndex, stringIndex);
			// if (bufferIndex[0] < 0) {
			// 	// invalid bufferIndex (should not have happened)
			// 	break;
			// }

			// const line = this._xterm.buffer.active.getLine(bufferIndex[0]);
			// if (!line) {
			// 	break;
			// }

			//   const attr = line.getFg(bufferIndex[1]);
			//   const fg = attr ? (attr >> 9) & 0x1ff : undefined;


			// if (matcher.validationCallback) {
			// 	matcher.validationCallback(uri, isValid => {
			// 		// Discard link if the line has already changed
			// 		if (this._rowsTimeoutId) {
			// 			return;
			// 		}
			// 		if (isValid) {
			// 			this._addLink(bufferIndex[1], bufferIndex[0] - this._bufferService.buffer.ydisp, uri, matcher, fg);
			// 		}
			// 	});
			// } else {
			// 	this._addLink(bufferIndex[1], bufferIndex[0] - this._bufferService.buffer.ydisp, uri, matcher, fg);
			// }
		}

		// this._linkComputerTarget = new TerminalLinkAdapter(this._xterm, startLine, endLine);
		// const links = LinkComputer.computeLinks(this._linkComputerTarget);

		// let found = false;
		// links.forEach(link => {
		// 	const range = this._convertLinkRangeToBuffer(link.range, startLine);

		// 	// Check if the link if within the mouse position
		// 	if (this._positionIsInRange(position, range)) {
		// 		found = true;

		// 		callback({
		// 			text: link.url?.toString() || '',
		// 			range,
		// 			activate: (event: MouseEvent, text: string) => {
		// 				this._activateCallback(event, text);
		// 			},
		// 			hover: (event: MouseEvent, text: string) => {
		// 				setTimeout(() => {
		// 					this._tooltipCallback(event, text, convertBufferRangeToViewport(range, this._xterm.buffer.active.viewportY));
		// 				}, 200);
		// 			},
		// 			leave: () => {
		// 				this._leaveCallback();
		// 			}
		// 		});
		// 	}
		// });

		// if (!found) {
		callback(undefined);
		// }
	}

	protected get _localLinkRegex(): RegExp {
		if (!this._processManager) {
			throw new Error('Process manager is required');
		}
		const baseLocalLinkClause = this._processManager.os === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause;
		// Append line and column number regex
		return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
	}

	// private _positionIsInRange(position: IBufferCellPosition, range: IBufferRange): boolean {
	// 	if (position.y < range.start.y || position.y > range.end.y) {
	// 		return false;
	// 	}
	// 	if (position.y === range.start.y && position.x < range.start.x) {
	// 		return false;
	// 	}
	// 	if (position.y === range.end.y && position.x > range.end.x) {
	// 		return false;
	// 	}
	// 	return true;
	// }
}
