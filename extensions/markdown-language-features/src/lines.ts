/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SkinnyTextLine } from './tableOfContentsProvider';

export function toTextLines(text: string): SkinnyTextLine[] {
	const result  = [];
	const parts = text.split(/(\r?\n)/);
	const lines = Math.floor(parts.length / 2) + 1;
	for (let line = 0; line < lines; line++) {
		result.push({
			text: parts[line * 2]
		});
	}
	return result;
}
