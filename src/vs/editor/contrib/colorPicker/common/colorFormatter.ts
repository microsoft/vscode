/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from "vs/base/common/color";

interface Node {
	(color: Color): string;
}

function createLiteralNode(value: string): Node {
	return () => value;
}

const RGBA_ENDRANGE = 255;
const HSL_HUERANGE = 360;
const HSL_ENDRANGE = 1;

function normalize(value: number, start?: number, end?: number, currentEndRange?: number): number {
	let val = value;

	if (start || end) {
		// More safety checks
		// if (!start) {
		// 	throw new Error('Color format range defined is not correct. There is no range start.');
		// }
		// if (!end) {
		// 	throw new Error('Color format range defined is not correct. There is no range end.');
		// }
		if (start > end) {
			throw new Error('Color format range defined is not correct. Range start is bigger than end.');
		}
		if (start === end) {
			throw new Error('Color format range defined is not correct. Range start is the same as end.');
		}

		const ratio = val / currentEndRange;
		val = ratio * (end - start) + start;
	}

	return val;
};

function createPropertyNode(variable: string, fractionDigits: number, type: string, min: number, max: number): Node {

	return color => {
		let absoluteValue: number;

		switch (variable) {
			case 'red':
				absoluteValue = normalize(color.toRGBA().r, min, max, RGBA_ENDRANGE);
				break;
			case 'green':
				absoluteValue = normalize(color.toRGBA().g, min, max, RGBA_ENDRANGE);
				break;
			case 'blue':
				absoluteValue = normalize(color.toRGBA().b, min, max, RGBA_ENDRANGE);
				break;
			case 'alpha':
				absoluteValue = normalize(color.toRGBA().a, min, max, RGBA_ENDRANGE);
				break;
			case 'hue':
				absoluteValue = normalize(color.toHSLA().h, min, max, HSL_HUERANGE);
				break;
			case 'saturation':
				absoluteValue = normalize(color.toHSLA().s, min, max, HSL_ENDRANGE);
				break;
			case 'luminosity':
				absoluteValue = normalize(color.toHSLA().l, min, max, HSL_ENDRANGE);
				break;
		}

		if (absoluteValue === undefined) {
			throw new Error(`${variable} is not supported as a color format.`);
		}

		let value: number | string;
		if (type === 'f') {
			fractionDigits = fractionDigits ? fractionDigits : 2; // 2 is default
			value = absoluteValue.toFixed(fractionDigits);
		} else if (type === 'x' || type === 'X') {
			value = normalize(absoluteValue, min, max, RGBA_ENDRANGE).toString(16);

			if (value.length !== 2) {
				value = '0' + value;
			}
			if (type === 'X') {
				value = value.toUpperCase();
			}
		} else { // also 'd'-case
			value = absoluteValue.toFixed(0);
		}


		return value.toString();
	};
}

export class ColorFormatter {
	/*
		Variables
		- red
		- green
		- blue
		- hue
		- saturation
		- luminosity
		- alpha

		Number formats
		- decimal - d
		- float - f
		- hex - x X

		Number ranges
		- 0-1
		- 0-255
		- 0-100
		- arbitrary

		Examples
		"{red}" - 123
		"{red:d}" - 123
		"{red:x}" - af
		"{red:X}" - AF
		"{red:d[0-255]}" - AF
		"{red:x[0-255]}" - AF
		"{red:X[0-1024]}" - FEFE
		"{red:2f}" - 123.51
		"{red:1f}" - 123.5
		"{red:2f[0-1]}" - 1.23

		- default format: decimal
		- default range: 0-255
	*/

	private tree: Node[] = [];

	// Group 0: variable
	// Group 1: decimal digits
	// Group 2: floating/integer/hex
	// Group 3: range begin
	// Group 4: range end
	private static PATTERN = /{(\w+)(?::(\d*)(\w)+(?:\[(\d+)-(\d+)\])?)?}/g;

	constructor(format: string) {
		this.parse(format);
	}

	private parse(format: string): void {
		let match = ColorFormatter.PATTERN.exec(format);
		let startIndex = 0;

		// if no match -> erroor	throw new Error(`${format} is not consistent with color format syntax.`);
		while (match !== null) {
			const index = match.index;

			if (startIndex < index) {
				this.tree.push(createLiteralNode(format.substring(startIndex, index)));
			}

			// add more parser catches
			const variable = match[1];
			if (!variable) {
				throw new Error(`${variable} is not defined.`);
			}
			const decimals = parseInt(match[2]);
			const type = match[3];
			const startRange = parseInt(match[4]);
			const endRange = parseInt(match[5]);

			this.tree.push(createPropertyNode(variable, decimals, type, startRange, endRange));

			startIndex = index + match[0].length;
			match = ColorFormatter.PATTERN.exec(format);
		}

		this.tree.push(createLiteralNode(format.substring(startIndex, format.length)));
	}

	public toString(color: Color): string {
		let colorString = [];
		this.tree.forEach(node => {
			colorString.push(node(color));
		});

		return colorString.join('');
	}
}
