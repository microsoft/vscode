/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../../base/common/strings.js';
import { CursorColumns } from '../cursorColumns.js';

function _normalizeIndentationFromWhitespace(str: string, indentSize: number, insertSpaces: boolean, tabSize: number): string {
	let spacesCnt = 0;
	for (let i = 0; i < str.length; i++) {
		if (str.charAt(i) === '\t') {
			// When inserting spaces, an existing tab stands for one indentation level (as
			// authored e.g. in snippet templates). When inserting tabs, it is rendered at
			// the render tab stops given by `tabSize`.
			spacesCnt = CursorColumns.nextIndentTabStop(spacesCnt, insertSpaces ? indentSize : tabSize);
		} else {
			spacesCnt++;
		}
	}

	let result = '';
	if (!insertSpaces) {
		// Use as many tabs as possible (aligned to the render tab stops given by `tabSize`),
		// and use spaces for the remainder. When `tabSize === indentSize` this is equivalent
		// to the plain "tabs only" indentation style. When `tabSize > indentSize` this
		// produces the classic mixed tab/space indentation (e.g. GNU style: tab size 8,
		// indent size 2 -> 12 columns of indent = "\t    ").
		const tabsCnt = Math.floor(spacesCnt / tabSize);
		spacesCnt = spacesCnt - tabsCnt * tabSize;
		for (let i = 0; i < tabsCnt; i++) {
			result += '\t';
		}
	}

	for (let i = 0; i < spacesCnt; i++) {
		result += ' ';
	}

	return result;
}

export function normalizeIndentation(str: string, indentSize: number, insertSpaces: boolean, tabSize: number = indentSize): string {
	let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
	if (firstNonWhitespaceIndex === -1) {
		firstNonWhitespaceIndex = str.length;
	}
	return _normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex), indentSize, insertSpaces, tabSize) + str.substring(firstNonWhitespaceIndex);
}
