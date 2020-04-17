/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, IViewportRange, ILinkProvider, IBufferCellPosition, ILink, IBufferLine } from 'xterm';
import { ILinkComputerTarget, LinkComputer } from 'vs/editor/common/modes/linkComputer';
import { getXtermLineContent, convertLinkRangeToBuffer, convertBufferRangeToViewport, positionIsInRange, TOOLTIP_HOVER_THRESHOLD } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { IDisposable } from 'vs/base/common/lifecycle';

export class TerminalWebLinkProvider implements ILinkProvider {
	private _linkComputerTarget: ILinkComputerTarget | undefined;

	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent, uri: string) => void,
		private readonly _tooltipCallback: (event: MouseEvent, uri: string, location: IViewportRange) => boolean | void
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
			if (positionIsInRange(position, range)) {
				found = true;

				let timeout: number | undefined;
				let documentMouseOutListener: IDisposable | undefined;
				const clearTimer = () => {
					if (timeout !== undefined) {
						window.clearTimeout(timeout);
					}
					documentMouseOutListener?.dispose();
				};
				callback({
					text: link.url?.toString() || '',
					range,
					activate: (event: MouseEvent, text: string) => this._activateCallback(event, text),
					hover: (event: MouseEvent, text: string) => {
						documentMouseOutListener = addDisposableListener(document, EventType.MOUSE_OVER, () => clearTimer());
						timeout = window.setTimeout(() => {
							this._tooltipCallback(event, text, convertBufferRangeToViewport(range, this._xterm.buffer.active.viewportY));
							clearTimer();
						}, TOOLTIP_HOVER_THRESHOLD);
					},
					leave: () => clearTimer()
				});
			}
		});

		if (!found) {
			callback(undefined);
		}
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
