/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';

function roundFloat(number: number, decimalPoints: number): number {
	const decimal = Math.pow(10, decimalPoints);
	return Math.round(number * decimal) / decimal;
}

interface Node {
	(color: Color): string;
}

function createLiteralNode(value: string): Node {
	return () => value;
}

function normalize(value: number, min: number, max: number): number {
	return value * (max - min) + min;
}

function getPropertyValue(color: Color, variable: string): number | undefined {
	switch (variable) {
		case 'red':
			return color.rgba.r / 255;
		case 'green':
			return color.rgba.g / 255;
		case 'blue':
			return color.rgba.b / 255;
		case 'alpha':
			return color.rgba.a / 255;
		case 'hue':
			return color.hsla.h / 360;
		case 'saturation':
			return color.hsla.s;
		case 'luminance':
			return color.hsla.l;
		default:
			return undefined;
	}
}

function createPropertyNode(variable: string, fractionDigits: number, type: string, min: number | undefined, max: number | undefined): Node {
	return color => {
		let value = getPropertyValue(color, variable);

		if (value === undefined) {
			return '';
		}

		if (type === 'd') {
			min = typeof min === 'number' ? min : 0;
			max = typeof max === 'number' ? max : 255;

			return (normalize(value, min, max) | 0).toString();
		} else if (type === 'x' || type === 'X') {
			min = typeof min === 'number' ? min : 0;
			max = typeof max === 'number' ? max : 255;

			console.log(value, min, max);

			let result = normalize(value, min, max).toString(16);

			if (type === 'X') {
				result = result.toUpperCase();
			}

			return result.length < 2 ? `0${result}` : result;
		}

		min = typeof min === 'number' ? min : 0;
		max = typeof max === 'number' ? max : 1;
		return roundFloat(normalize(value, min, max), 2).toString();
	};
}

export interface IColorFormatter {
	canFormat(color: Color): boolean;
	format(color: Color): string;
}

export class ColorFormatter implements IColorFormatter {

	private tree: Node[] = [];
	private supportsAlpha = false;

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

			this.supportsAlpha = this.supportsAlpha || (variable === 'alpha');

			const decimals = match[2] && parseInt(match[2]);
			const type = match[3];
			const startRange = match[4] && parseInt(match[4]);
			const endRange = match[5] && parseInt(match[5]);

			this.tree.push(createPropertyNode(variable, decimals, type, startRange, endRange));

			startIndex = index + match[0].length;
			match = ColorFormatter.PATTERN.exec(format);
		}

		this.tree.push(createLiteralNode(format.substring(startIndex, format.length)));
	}

	canFormat(color: Color): boolean {
		return color.isOpaque() || this.supportsAlpha;
	}

	format(color: Color): string {
		return this.tree.map(node => node(color)).join('');
	}
}

export class CombinedColorFormatter implements IColorFormatter {

	constructor(private opaqueFormatter: IColorFormatter, private transparentFormatter: IColorFormatter) { }

	canFormat(color: Color): boolean {
		return true;
	}

	format(color: Color): string {
		return color.isOpaque() ? this.opaqueFormatter.format(color) : this.transparentFormatter.format(color);
	}
}