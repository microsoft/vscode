/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';

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
