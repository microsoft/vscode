/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { matchesScheme } from 'vs/base/common/network';
import { IProductService } from 'vs/platform/product/common/productService';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { ITerminalSimpleLink, ITerminalLinkDetector, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { convertLinkRangeToBuffer, getXtermLineContent } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkHelpers';
import { ITerminalConfiguration, TERMINAL_CONFIG_SECTION } from 'vs/workbench/contrib/terminal/common/terminal';
import type { IBufferLine, Terminal } from '@xterm/xterm';

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

export class TerminalWordLinkDetector extends Disposable implements ITerminalLinkDetector {
	static id = 'word';

	// Word links typically search the workspace so it makes sense that their maximum link length is
	// quite small.
	readonly maxLinkLength = 100;

	private _separatorRegex!: RegExp;

	constructor(
		readonly xterm: Terminal,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		this._refreshSeparatorCodes();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.WordSeparators)) {
				this._refreshSeparatorCodes();
			}
		}));
	}

	detect(lines: IBufferLine[], startLine: number, endLine: number): ITerminalSimpleLink[] {
		const links: ITerminalSimpleLink[] = [];

		// Get the text representation of the wrapped line
		const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
		if (text === '' || text.length > Constants.MaxLineLength) {
			return [];
		}

		// Parse out all words from the wrapped line
		const words: Word[] = this._parseWords(text);

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
				type: TerminalBuiltinLinkType.Search,
				contextLine: text
			});
		}

		return links;
	}

	private _parseWords(text: string): Word[] {
		const words: Word[] = [];
		const splitWords = text.split(this._separatorRegex);
		let runningIndex = 0;
		for (let i = 0; i < splitWords.length; i++) {
			words.push({
				text: splitWords[i],
				startIndex: runningIndex,
				endIndex: runningIndex + splitWords[i].length
			});
			runningIndex += splitWords[i].length + 1;
		}
		return words;
	}

	private _refreshSeparatorCodes(): void {
		const separators = this._configurationService.getValue<ITerminalConfiguration>(TERMINAL_CONFIG_SECTION).wordSeparators;
		let powerlineSymbols = '';
		for (let i = 0xe0b0; i <= 0xe0bf; i++) {
			powerlineSymbols += String.fromCharCode(i);
		}
		this._separatorRegex = new RegExp(`[${escapeRegExpCharacters(separators)}${powerlineSymbols}]`, 'g');
	}
}
