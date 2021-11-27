/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, IBufferLine } from 'xterm';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalBaseLinkProvider } from 'vs/workbench/contrib/terminal/browser/links/terminalBaseLinkProvider';
import { convertLinkRangeToBuffer, getXtermLineContent } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { WordTerminalLink } from 'vs/workbench/contrib/terminal/browser/links/wordTerminalLink';

const MAX_LENGTH = 2000;

export class TerminalWordLinkProvider extends TerminalBaseLinkProvider {
	private get _xterm(): Terminal {
		return (this._terminal as any)._xterm;
	}

	constructor(
		private readonly _terminal: ITerminalInstance,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	protected _provideLinks(y: number): TerminalLink[] {
		// Dispose of all old links if new links are provides, links are only cached for the current line
		const links: TerminalLink[] = [];
		const wordSeparators = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).wordSeparators;

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

		const text = getXtermLineContent(this._xterm.buffer.active, startLine, endLine, this._xterm.cols);
		if (text === '' || text.length > MAX_LENGTH) {
			return [];
		}

		const words: Word[] = this._parseWords(text, wordSeparators);

		for (const word of words) {
			if (word.text === '') {
				continue;
			}

			// Remove trailing colon if there is one so the link is more useful
			if (word.text.length > 0) {
				if (word.text.charAt(word.text.length - 1) === ':') {
					word.text = word.text.slice(0, -1);
					word.endIndex -= 1;
				}
			}

			// Convert the link text's string index into a wrapped buffer range
			const bufferRange = convertLinkRangeToBuffer(lines, this._xterm.cols, {
				startColumn: word.startIndex + 1,
				startLineNumber: 1,
				endColumn: word.endIndex + 1,
				endLineNumber: 1
			}, startLine);

			links.push(this._instantiationService.createInstance(WordTerminalLink,
				this._terminal,
				bufferRange,
				word.text,
				this._xterm.buffer.active.viewportY,
				true
			));
		}
		return links;
	}

	private _parseWords(text: string, separators: string): Word[] {
		const words: Word[] = [];

		const wordSeparators: string[] = separators.split('');
		const characters = text.split('');

		let startIndex = 0;
		for (let i = 0; i < text.length; i++) {
			if (wordSeparators.includes(characters[i])) {
				words.push({ startIndex, endIndex: i, text: text.substring(startIndex, i) });
				startIndex = i + 1;
			}
		}
		if (startIndex < text.length) {
			words.push({ startIndex, endIndex: text.length, text: text.substring(startIndex) });
		}

		return words;
	}
}

interface Word {
	startIndex: number;
	endIndex: number;
	text: string;
}
