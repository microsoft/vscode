/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { DefaultEndOfLine } from 'vs/editor/common/editorCommon';

/**
 * A processed string ready to be turned into an editor model.
 */
export interface IRawTextSource {
	/**
	 * The entire text length.
	 */
	readonly length: number;
	/**
	 * The text split into lines.
	 */
	readonly lines: string[];
	/**
	 * The BOM (leading character sequence of the file).
	 */
	readonly BOM: string;
	/**
	 * The number of lines ending with '\r\n'
	 */
	readonly totalCRCount: number;
	/**
	 * The text contains Unicode characters classified as "R" or "AL".
	 */
	readonly containsRTL: boolean;
	/**
	 * The text contains only characters inside the ASCII range 32-126 or \t \r \n
	 */
	readonly isBasicASCII: boolean;
}

export class RawTextSource {

	public static fromString(rawText: string): IRawTextSource {
		// Count the number of lines that end with \r\n
		let carriageReturnCnt = 0;
		let lastCarriageReturnIndex = -1;
		while ((lastCarriageReturnIndex = rawText.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
			carriageReturnCnt++;
		}

		const containsRTL = strings.containsRTL(rawText);
		const isBasicASCII = (containsRTL ? false : strings.isBasicASCII(rawText));

		// Split the text into lines
		const lines = rawText.split(/\r\n|\r|\n/);

		// Remove the BOM (if present)
		let BOM = '';
		if (strings.startsWithUTF8BOM(lines[0])) {
			BOM = strings.UTF8_BOM_CHARACTER;
			lines[0] = lines[0].substr(1);
		}

		return {
			BOM: BOM,
			lines: lines,
			length: rawText.length,
			containsRTL: containsRTL,
			isBasicASCII: isBasicASCII,
			totalCRCount: carriageReturnCnt
		};
	}

}

/**
 * A processed string with its EOL resolved ready to be turned into an editor model.
 */
export interface ITextSource {
	/**
	 * The entire text length.
	 */
	readonly length: number;
	/**
	 * The text split into lines.
	 */
	readonly lines: string[];
	/**
	 * The BOM (leading character sequence of the file).
	 */
	readonly BOM: string;
	/**
	 * The end of line sequence.
	 */
	readonly EOL: string;
	/**
	 * The text contains Unicode characters classified as "R" or "AL".
	 */
	readonly containsRTL: boolean;
	/**
	 * The text contains only characters inside the ASCII range 32-126 or \t \r \n
	 */
	readonly isBasicASCII: boolean;
}

export class TextSource {

	/**
	 * if text source is empty or with precisely one line, returns null. No end of line is detected.
	 * if text source contains more lines ending with '\r\n', returns '\r\n'.
	 * Otherwise returns '\n'. More lines end with '\n'.
	 */
	private static _getEOL(rawTextSource: IRawTextSource, defaultEOL: DefaultEndOfLine): '\r\n' | '\n' {
		const lineFeedCnt = rawTextSource.lines.length - 1;
		if (lineFeedCnt === 0) {
			// This is an empty file or a file with precisely one line
			return (defaultEOL === DefaultEndOfLine.LF ? '\n' : '\r\n');
		}
		if (rawTextSource.totalCRCount > lineFeedCnt / 2) {
			// More than half of the file contains \r\n ending lines
			return '\r\n';
		}
		// At least one line more ends in \n
		return '\n';
	}

	public static fromRawTextSource(rawTextSource: IRawTextSource, defaultEOL: DefaultEndOfLine): ITextSource {
		return {
			length: rawTextSource.length,
			lines: rawTextSource.lines,
			BOM: rawTextSource.BOM,
			EOL: this._getEOL(rawTextSource, defaultEOL),
			containsRTL: rawTextSource.containsRTL,
			isBasicASCII: rawTextSource.isBasicASCII,
		};
	}

	public static fromString(text: string, defaultEOL: DefaultEndOfLine): ITextSource {
		return this.fromRawTextSource(RawTextSource.fromString(text), defaultEOL);
	}

	public static create(source: string | IRawTextSource, defaultEOL: DefaultEndOfLine): ITextSource {
		if (typeof source === 'string') {
			return this.fromString(source, defaultEOL);
		}

		return this.fromRawTextSource(source, defaultEOL);
	}

}
