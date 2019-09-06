/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type LineSeparator = '\n' | '\r\n' | '';

export interface LineData {
	readonly lineNo: number;
	readonly offset: number;
	readonly text: string;
	readonly separator: LineSeparator;
}

export function toLineData(text: string): LineData[] {
	let current = 0;
	let result: LineData[] = [];
	while (true) {
		let nextNewLine = text.indexOf('\r\n', current);
		let separator: LineSeparator;
		if (nextNewLine === -1) {
			nextNewLine = text.indexOf('\n', current);
			if (nextNewLine !== -1) {
				separator = '\n';
			} else {
				separator = '';
			}
		} else {
			separator = '\r\n';
		}

		if (nextNewLine === -1) {
			break;
		}

		result.push({
			lineNo: result.length,
			offset: current,
			text: text.substring(current, nextNewLine),
			separator: separator
		});

		current = nextNewLine + separator.length;
	}

	result.push({
		lineNo: result.length,
		offset: current,
		text: text.substring(current, text.length),
		separator: ''
	});

	return result;
}
