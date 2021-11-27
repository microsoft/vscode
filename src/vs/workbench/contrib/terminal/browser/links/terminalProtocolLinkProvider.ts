/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, IBufferLine } from 'xterm';
import { ILinkComputerTarget, LinkComputer } from 'vs/editor/common/modes/linkComputer';
import { getXtermLineContent, convertLinkRangeToBuffer } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { TerminalBaseLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalBaseLinkProvider';
import { Schemas } from 'vs/base/common/network';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ProtocolTerminalLink } from 'vs/workbench/contrib/terminal/browser/links/protocolTerminalLink';
import { FileTerminalLink } from 'vs/workbench/contrib/terminal/browser/links/fileTerminalLink';

export class TerminalProtocolLinkProvider extends TerminalBaseLinkProvider {
	private _linkComputerTarget: ILinkComputerTarget | undefined;

	private get _xterm(): Terminal {
		return (this._terminal as any)._xterm;
	}

	constructor(
		private readonly _terminal: ITerminalInstance,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}

	protected async _provideLinks(y: number): Promise<TerminalLink[]> {
		let startLine = y - 1;
		let endLine = startLine;

		const lines: IBufferLine[] = [
			this._xterm.buffer.active.getLine(startLine)!
		];

		while (startLine >= 0 && this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
			lines.unshift(this._xterm.buffer.active.getLine(startLine - 1)!);
			startLine--;
		}

		while (endLine < this._xterm.buffer.active.length && this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
			lines.push(this._xterm.buffer.active.getLine(endLine + 1)!);
			endLine++;
		}

		this._linkComputerTarget = new TerminalLinkAdapter(this._xterm, startLine, endLine);
		const links = LinkComputer.computeLinks(this._linkComputerTarget);

		const result: TerminalLink[] = [];
		for (const link of links) {
			const bufferRange = convertLinkRangeToBuffer(lines, this._xterm.cols, link.range, startLine);

			// Check if the link is within the mouse position
			const uri = link.url
				? (typeof link.url === 'string' ? URI.parse(link.url) : link.url)
				: undefined;

			if (!uri) {
				continue;
			}

			const linkText = link.url?.toString() || '';

			if (uri.scheme === Schemas.file) {
				// Handle 'file://' link
				result.push(this._instantiationService.createInstance(FileTerminalLink,
					this._terminal,
					bufferRange,
					linkText,
					this._xterm.buffer.active.viewportY,
					true,
					uri,
					// TODO: try to extract any following line and column info
					1,
					1,
				));
			}
			else {
				// Handle normal links, like HTTP.
				result.push(this._instantiationService.createInstance(ProtocolTerminalLink,
					this._terminal,
					bufferRange,
					linkText,
					this._xterm.buffer.active.viewportY,
					true,
					uri,
				));
			}
		}
		return result;
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
		return getXtermLineContent(this._xterm.buffer.active, this._lineStart, this._lineEnd, this._xterm.cols);
	}
}
