/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { Searcher } from 'vs/editor/common/model/textModelSearch';
import * as strings from 'vs/base/common/strings';

export interface IUnicodeCharacterSearcherTarget {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
}

export const enum UnicodeCharacterSearchType {
	NonASCII,
	Confusables
}

export class UnicodeCharacterSearcher {

	public static ASCII_REGEX = '[^\\t\\n\\r\\x20-\\x7E]+';

	public static search(model: IUnicodeCharacterSearcherTarget, type: UnicodeCharacterSearchType): Range[] {
		if (type !== UnicodeCharacterSearchType.NonASCII) {
			throw new Error('TODO'); // TODO
		}

		const regex = new RegExp(UnicodeCharacterSearcher.ASCII_REGEX, 'g');
		const searcher = new Searcher(null, regex);
		const result: Range[] = [];
		let m: RegExpExecArray | null;
		for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineContent = model.getLineContent(lineNumber);
			const lineLength = lineContent.length;

			// Reset regex to search from the beginning
			searcher.reset(0);
			do {
				m = searcher.next(lineContent);
				if (m) {
					let startIndex = m.index;
					let endIndex = m.index + m[0].length;

					// Extend range to entire code point
					if (startIndex > 0) {
						const charCodeBefore = lineContent.charCodeAt(startIndex - 1);
						if (strings.isHighSurrogate(charCodeBefore)) {
							startIndex--;
						}
					}
					if (endIndex + 1 < lineLength) {
						const charCodeBefore = lineContent.charCodeAt(endIndex - 1);
						if (strings.isHighSurrogate(charCodeBefore)) {
							endIndex++;
						}
					}
					result.push(new Range(lineNumber, startIndex + 1, lineNumber, endIndex + 1));
				}
			} while (m);
		}
		return result;
	}
}
