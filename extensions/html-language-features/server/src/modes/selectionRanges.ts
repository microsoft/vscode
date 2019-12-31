/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModes, TextDocument, Position, Range, SelectionRange } from './languageModes';

export function getSelectionRanges(languageModes: LanguageModes, document: TextDocument, positions: Position[]) {
	const htmlMode = languageModes.getMode('html');
	return positions.map(position => {
		const htmlRange = htmlMode!.getSelectionRange!(document, position);
		const mode = languageModes.getModeAtPosition(document, position);
		if (mode && mode.getSelectionRange) {
			let range = mode.getSelectionRange(document, position);
			let top = range;
			while (top.parent && insideRangeButNotSame(htmlRange.range, top.parent.range)) {
				top = top.parent;
			}
			top.parent = htmlRange;
			return range;
		}
		return htmlRange || SelectionRange.create(Range.create(position, position));
	});
}

function beforeOrSame(p1: Position, p2: Position) {
	return p1.line < p2.line || p1.line === p2.line && p1.character <= p2.character;
}
function insideRangeButNotSame(r1: Range, r2: Range) {
	return beforeOrSame(r1.start, r2.start) && beforeOrSame(r2.end, r1.end) && !equalRange(r1, r2);
}
function equalRange(r1: Range, r2: Range) {
	return r1.start.line === r2.start.line && r1.start.character === r2.start.character && r1.end.line === r2.end.line && r1.end.character === r2.end.character;
}

