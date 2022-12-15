/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { matchesScheme } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITerminalSimpleLink, ITerminalLinkDetector, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { convertLinkRangeToBuffer, getXtermLineContent } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import { IBufferLine, Terminal } from 'xterm';

const enum Constants {
	/**
	 * The max line length to try extract word links from.
	 */
	MaxLineLength = 2000
}

interface Word {
	startIndex: number;
	endIndex: number;
	text: string;
}

export class TerminalWordLinkDetector implements ITerminalLinkDetector {
	static id = 'word';

	// Word links typically search the workspace so it makes sense that their maximum link length is
	// quite small.
	readonly maxLinkLength = 100;

	constructor(
		readonly xterm: Terminal,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IProductService private readonly _productService: IProductService,
	) {
	}

	detect(lines: IBufferLine[], startLine: number, endLine: number): ITerminalSimpleLink[] {
		const links: ITerminalSimpleLink[] = [];
		const wordSeparators = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).wordSeparators;

		// Get the text representation of the wrapped line
		const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
		if (text === '' || text.length > Constants.MaxLineLength) {
			return [];
		}

		// Parse out all words from the wrapped line
		const words: Word[] = this._parseWords(text, wordSeparators);

		// Map the words to ITerminalLink objects
		for (const word of words) {
			if (word.text === '') {
				continue;
			}
			if (word.text.length > 0 && word.text.charAt(word.text.length - 1) === ':') {
				word.text = word.text.slice(0, -1);
				word.endIndex--;
			}
			const bufferRange = convertLinkRangeToBuffer(
				lines,
				this.xterm.cols,
				{
					startColumn: word.startIndex + 1,
					startLineNumber: 1,
					endColumn: word.endIndex + 1,
					endLineNumber: 1
				},
				startLine
			);

			// Support this product's URL protocol
			if (matchesScheme(word.text, this._productService.urlProtocol)) {
				const uri = URI.parse(word.text);
				if (uri) {
					links.push({
						text: word.text,
						uri,
						bufferRange,
						type: TerminalBuiltinLinkType.Url
					});
				}
				continue;
			}

			// Search links
			links.push({
				text: word.text,
				bufferRange,
				type: TerminalBuiltinLinkType.Search
			});
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
