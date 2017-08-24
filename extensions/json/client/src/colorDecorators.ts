/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range, TextDocument, DocumentColorProvider, Color, ColorRange } from 'vscode';

const ColorFormat_HEX = {
	opaque: '"#{red:X}{green:X}{blue:X}"',
	transparent: '"#{red:X}{green:X}{blue:X}{alpha:X}"'
};

export class ColorProvider implements DocumentColorProvider {
	constructor(private decoratorProvider: (uri: string) => Thenable<Range[]>) { }

	async provideDocumentColors(document: TextDocument): Promise<ColorRange[]> {
		const ranges = await this.decoratorProvider(document.uri.toString());
		const result = [];
		for (let range of ranges) {
			let color = parseColorFromRange(document, range);
			if (color) {
				let r = new Range(range.start.line, range.start.character, range.end.line, range.end.character);
				result.push(new ColorRange(r, color, [ColorFormat_HEX]));
			}
		}
		return result;
	}
}

function parseColorFromRange(document: TextDocument, range: Range) {
	let text = document.getText(range);
	try {
		let value = <string>JSON.parse(text);
		if (typeof value === 'string') {
			return Color.fromHex(value);
		}
	} catch (e) {
		// ignore JSON parse error
	}
	return null;
}
