/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, IViewportRange, ILinkProvider, IBufferCellPosition, ILink, IBufferRange, IBufferLine } from 'xterm';
import { ILinkComputerTarget, LinkComputer } from 'vs/editor/common/modes/linkComputer';
import { getXtermLineContent, convertLinkRangeToBuffer, convertBufferRangeToViewport } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';

export class TerminalWebLinkProvider implements ILinkProvider {
	private _linkComputerTarget: ILinkComputerTarget | undefined;

	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange) => boolean | void,
		private readonly _leaveCallback: () => void
	) {
	}

	public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
		let startLine = position.y - 1;
		let endLine = startLine;

		const lines: IBufferLine[] = [
			this._xterm.buffer.active.getLine(startLine)!
		];

		while (this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
			lines.unshift(this._xterm.buffer.active.getLine(startLine - 1)!);
			startLine--;
		}

		while (this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
			lines.push(this._xterm.buffer.active.getLine(endLine + 1)!);
			endLine++;
		}

		this._linkComputerTarget = new TerminalLinkAdapter(this._xterm, startLine, endLine);
		const links = LinkComputer.computeLinks(this._linkComputerTarget);

		let found = false;
		links.forEach(link => {
			const range = convertLinkRangeToBuffer(lines, this._xterm.cols, link.range, startLine);

			// Check if the link if within the mouse position
			if (this._positionIsInRange(position, range)) {
				found = true;

				callback({
					text: link.url?.toString() || '',
					range,
					activate: (event: MouseEvent, text: string) => {
						this._activateCallback(event, text);
					},
					hover: (event: MouseEvent, text: string) => {
						setTimeout(() => {
							this._tooltipCallback(event, text, convertBufferRangeToViewport(range, this._xterm.buffer.active.viewportY));
						}, 200);
					},
					leave: () => {
						this._leaveCallback();
					}
				});
			}
		});

		if (!found) {
			callback(undefined);
		}
	}

	private _positionIsInRange(position: IBufferCellPosition, range: IBufferRange): boolean {
		if (position.y < range.start.y || position.y > range.end.y) {
			return false;
		}
		if (position.y === range.start.y && position.x < range.start.x) {
			return false;
		}
		if (position.y === range.end.y && position.x > range.end.x) {
			return false;
		}
		return true;
	}
}

class TerminalLinkAdapter implements ILinkComputerTarget {
	constructor(
		private _xterm: Terminal,
		private _lineStart: number,
		private _lineEnd: number
	) { }

	getLineCount(): number {
		return 1;
	}

	getLineContent(): string {
		return getXtermLineContent(this._xterm.buffer.active, this._lineStart, this._lineEnd);
	}
}
