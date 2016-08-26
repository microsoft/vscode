/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface RGBA { r: number; g: number; b: number; a: number; }

export class Color {

	private parsed: RGBA;
	private str: string;

	constructor(arg: string | RGBA) {
		if (typeof arg === 'string') {
			this.parsed = Color.parse(<string>arg);
		} else {
			this.parsed = <RGBA>arg;
		}
		this.str = null;
	}

	private static parse(color: string): RGBA {
		function parseHex(str: string) {
			return parseInt('0x' + str);
		}

		if (color.charAt(0) === '#' && color.length >= 7) {
			let r = parseHex(color.substr(1, 2));
			let g = parseHex(color.substr(3, 2));
			let b = parseHex(color.substr(5, 2));
			let a = color.length === 9 ? parseHex(color.substr(7, 2)) / 0xff : 1;
			return { r, g, b, a };
		}
		return { r: 255, g: 0, b: 0, a: 1 };
	}

	public toString(): string {
		if (!this.str) {
			let p = this.parsed;
			this.str = `rgba(${p.r}, ${p.g}, ${p.b}, ${+p.a.toFixed(2)})`;
		}
		return this.str;
	}

	public transparent(factor: number): Color {
		let p = this.parsed;
		return new Color({ r: p.r, g: p.g, b: p.b, a: p.a * factor });
	}

	public opposite(): Color {
		return new Color({
			r: 255 - this.parsed.r,
			g: 255 - this.parsed.g,
			b: 255 - this.parsed.b,
			a : this.parsed.a
		});
	}
}