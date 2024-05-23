/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalLinkDetector, ITerminalSimpleLink, OmitFirstArg } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { convertLinkRangeToBuffer, getXtermLineContent } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkHelpers';
import { ITerminalExternalLinkProvider } from 'vs/workbench/contrib/terminal/browser/terminal';
import type { IBufferLine, Terminal } from '@xterm/xterm';

export class TerminalExternalLinkDetector implements ITerminalLinkDetector {
	readonly maxLinkLength = 2000;

	constructor(
		readonly id: string,
		readonly xterm: Terminal,
		private readonly _provideLinks: OmitFirstArg<ITerminalExternalLinkProvider['provideLinks']>
	) {
	}

	async detect(lines: IBufferLine[], startLine: number, endLine: number): Promise<ITerminalSimpleLink[]> {
		// Get the text representation of the wrapped line
		const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
		if (text === '' || text.length > this.maxLinkLength) {
			return [];
		}

		const externalLinks = await this._provideLinks(text);
		if (!externalLinks) {
			return [];
		}

		const result = externalLinks.map(link => {
			const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
				startColumn: link.startIndex + 1,
				startLineNumber: 1,
				endColumn: link.startIndex + link.length + 1,
				endLineNumber: 1
			}, startLine);
			const matchingText = text.substring(link.startIndex, link.startIndex + link.length) || '';

			const l: ITerminalSimpleLink = {
				text: matchingText,
				label: link.label,
				bufferRange,
				type: { id: this.id },
				activate: link.activate
			};
			return l;
		});

		return result;
	}
}
