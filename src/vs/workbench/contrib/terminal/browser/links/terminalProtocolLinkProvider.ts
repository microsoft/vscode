/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, IViewportRange, ILinkProvider, IBufferCellPosition, ILink, IBufferLine } from 'xterm';
import { ILinkComputerTarget, LinkComputer } from 'vs/editor/common/modes/linkComputer';
import { getXtermLineContent, convertLinkRangeToBuffer, positionIsInRange } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { TerminalLink, OPEN_FILE_LABEL } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export class TerminalProtocolLinkProvider implements ILinkProvider {
	private _linkComputerTarget: ILinkComputerTarget | undefined;

	constructor(
		private readonly _xterm: Terminal,
		private readonly _activateCallback: (event: MouseEvent | undefined, uri: string) => void,
		private readonly _tooltipCallback: (link: TerminalLink, viewportRange: IViewportRange, modifierDownCallback?: () => void, modifierUpCallback?: () => void) => void,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
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
				const uri = link.url
					? (typeof link.url === 'string' ? URI.parse(link.url) : link.url)
					: undefined;
				const label = (uri?.scheme === 'file') ? OPEN_FILE_LABEL : undefined;
				callback(this._instantiationService.createInstance(TerminalLink, range, link.url?.toString() || '', this._xterm.buffer.active.viewportY, this._activateCallback, this._tooltipCallback, true, label));
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
