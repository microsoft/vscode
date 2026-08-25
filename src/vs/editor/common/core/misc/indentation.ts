/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../../base/common/strings.js';
import { CursorColumns } from '../cursorColumns.js';

export enum InsertSpaces {
	Spaces = 'spaces',
	Tabs = 'tabs',
	Mixed = 'mixed'
}

function _normalizeIndentationFromWhitespace(str: string, indentSize: number, tabSize: number, insertSpaces: InsertSpaces): string {
	let spacesCnt = 0;
	const renderTabSize = insertSpaces === InsertSpaces.Mixed ? tabSize : indentSize;
	for (let i = 0; i < str.length; i++) {
		if (str.charAt(i) === '\t') {
			spacesCnt = CursorColumns.nextRenderTabStop(spacesCnt, renderTabSize);
		} else {
			spacesCnt++;
		}
	}

	let result = '';
	if (insertSpaces !== InsertSpaces.Spaces) {
		const tabsCnt = Math.floor(spacesCnt / renderTabSize);
		spacesCnt = spacesCnt % renderTabSize;
		for (let i = 0; i < tabsCnt; i++) {
			result += '\t';
		}
	}

	for (let i = 0; i < spacesCnt; i++) {
		result += ' ';
	}

	return result;
}

export function normalizeIndentation(str: string, indentSize: number, insertSpaces: InsertSpaces, tabSize: number = indentSize): string {
	let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
	if (firstNonWhitespaceIndex === -1) {
		firstNonWhitespaceIndex = str.length;
	}
	return _normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex), indentSize, tabSize, insertSpaces) + str.substring(firstNonWhitespaceIndex);
}
