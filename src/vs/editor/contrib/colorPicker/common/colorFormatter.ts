/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorFormatter, IColor } from 'vs/editor/common/modes';
import { Color, RGBA } from 'vs/base/common/color';

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
			return color.rgba.a;
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

			return (normalize(value, min, max).toFixed(0)).toString();
		} else if (type === 'x' || type === 'X') {
			min = typeof min === 'number' ? min : 0;
			max = typeof max === 'number' ? max : 255;

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

export class ColorFormatter implements IColorFormatter {

	readonly supportsTransparency: boolean = false;
	private tree: Node[] = [];

	// Group 0: variable
	// Group 1: decimal digits
	// Group 2: floating/integer/hex
	// Group 3: range begin
	// Group 4: range end
	private static PATTERN = /{(\w+)(?::(\d*)(\w)+(?:\[(\d+)-(\d+)\])?)?}/g;

	constructor(format: string) {
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

			this.supportsTransparency = this.supportsTransparency || (variable === 'alpha');

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

	format(color: IColor): string {
		const richColor = new Color(new RGBA(Math.round(color.red * 255), Math.round(color.green * 255), Math.round(color.blue * 255), color.alpha));
		return this.tree.map(node => node(richColor)).join('');
	}
}

export class CombinedColorFormatter implements IColorFormatter {

	readonly supportsTransparency: boolean = true;

	constructor(private opaqueFormatter: IColorFormatter, private transparentFormatter: IColorFormatter) {
		if (!transparentFormatter.supportsTransparency) {
			throw new Error('Invalid transparent formatter');
		}
	}

	format(color: IColor): string {
		return color.alpha === 1 ? this.opaqueFormatter.format(color) : this.transparentFormatter.format(color);
	}
}