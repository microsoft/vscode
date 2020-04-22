/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModes, TextDocument, Position, Range, SelectionRange } from './languageModes';
import { insideRangeButNotSame } from '../utils/positions';

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

