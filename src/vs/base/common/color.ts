/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Object from 'vs/base/common/objects';

export interface RGBA { r: number; g: number; b: number; a: number; }
export interface HSLA { h: number; s: number; l: number; a: number; }

/**
 * Converts an Hex color value to RGB.
 * returns r, g, and b are contained in the set [0, 255]
 */
function hex2rgba(hex: string): RGBA {
	function parseHex(str: string) {
		return parseInt('0x' + str);
	}
	if (hex.charAt(0) === '#' && hex.length >= 7) {
		let r = parseHex(hex.substr(1, 2));
		let g = parseHex(hex.substr(3, 2));
		let b = parseHex(hex.substr(5, 2));
		let a = hex.length === 9 ? parseHex(hex.substr(7, 2)) / 0xff : 1;
		return { r, g, b, a };
	}
	return { r: 255, g: 0, b: 0, a: 1 };
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h in the set [0, 360], s, and l in the set [0, 1].
 */
function rgba2hsla(rgba: RGBA): HSLA {
	let r = rgba.r / 255;
	let g = rgba.g / 255;
	let b = rgba.b / 255;
	let a = rgba.a === void 0 ? rgba.a : 1;

	let max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h = 0, s = 0, l = Math.round(((min + max) / 2) * 1000) / 1000, chroma = max - min;

	if (chroma > 0) {
		s = Math.min(Math.round((l <= 0.5 ? chroma / (2 * l) : chroma / (2 - (2 * l))) * 1000) / 1000, 1);
		switch (max) {
			case r: h = (g - b) / chroma + (g < b ? 6 : 0); break;
			case g: h = (b - r) / chroma + 2; break;
			case b: h = (r - g) / chroma + 4; break;
		}
		h *= 60;
		h = Math.round(h);
	}
	return { h, s, l, a };
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h in the set [0, 360] s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 */
function hsla2rgba(hsla: HSLA): RGBA {
	let h = hsla.h / 360;
	let s = Math.min(hsla.s, 1);
	let l = Math.min(hsla.l, 1);
	let a = hsla.a === void 0 ? hsla.a : 1;
	let r: number, g: number, b: number;

	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		let hue2rgb = function hue2rgb(p: number, q: number, t: number) {
			if (t < 0) {
				t += 1;
			}
			if (t > 1) {
				t -= 1;
			}
			if (t < 1 / 6) {
				return p + (q - p) * 6 * t;
			}
			if (t < 1 / 2) {
				return q;
			}
			if (t < 2 / 3) {
				return p + (q - p) * (2 / 3 - t) * 6;
			}
			return p;
		};

		let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		let p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}

	return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a };
}

export class Color {

	private rgba: RGBA;
	private hsla: HSLA;
	private str: string;

	constructor(arg: string | RGBA) {
		this.rgba = typeof arg === 'string' ? hex2rgba(arg) : <RGBA>arg;
		this.str = null;
	}

	/**
	 * http://www.w3.org/TR/WCAG20/#relativeluminancedef
	 * Returns the number in the set [0, 1]. O => Darkest Black. 1 => Lightest white.
	 */
	public getLuminosity(): number {
		let luminosityFor = function (color: number): number {
			let c = color / 255;
			return (c <= 0.03928) ? c / 12.92 : Math.pow(((c + 0.055) / 1.055), 2.4);
		};
		let R = luminosityFor(this.rgba.r);
		let G = luminosityFor(this.rgba.g);
		let B = luminosityFor(this.rgba.b);
		let luminosity = 0.2126 * R + 0.7152 * G + 0.0722 * B;
		return Math.round(luminosity * 10000) / 10000;
	}

	/**
	 * http://www.w3.org/TR/WCAG20/#contrast-ratiodef
	 * Returns the contrast ration number in the set [1, 21].
	 */
	public getContrast(another: Color): number {
		let lum1 = this.getLuminosity();
		let lum2 = another.getLuminosity();
		return lum1 > lum2 ? (lum1 + 0.05) / (lum2 + 0.05) : (lum2 + 0.05) / (lum1 + 0.05);
	}

	/**
	 *	http://24ways.org/2010/calculating-color-contrast
	 *  Return 'true' if darker color otherwise 'false'
	 */
	public isDarker(): boolean {
		var yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1000;
		return yiq < 128;
	}

	/**
	 *	http://24ways.org/2010/calculating-color-contrast
	 *  Return 'true' if lighter color otherwise 'false'
	 */
	public isLighter(): boolean {
		var yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1000;
		return yiq >= 128;
	}

	public isLighterThan(another: Color): boolean {
		let lum1 = this.getLuminosity();
		let lum2 = another.getLuminosity();
		return lum1 > lum2;
	}

	public isDarkerThan(another: Color): boolean {
		let lum1 = this.getLuminosity();
		let lum2 = another.getLuminosity();
		return lum1 < lum2;
	}

	public lighten(factor: number): Color {
		let hsl = this.toHSLA();
		hsl.l += hsl.l * factor;
		return new Color(hsla2rgba(hsl));
	}

	public darken(factor: number): Color {
		let hsl = this.toHSLA();
		hsl.l -= hsl.l * factor;
		return new Color(hsla2rgba(hsl));
	}

	public transparent(factor: number): Color {
		let p = this.rgba;
		return new Color({ r: p.r, g: p.g, b: p.b, a: p.a * factor });
	}

	public opposite(): Color {
		return new Color({
			r: 255 - this.rgba.r,
			g: 255 - this.rgba.g,
			b: 255 - this.rgba.b,
			a: this.rgba.a
		});
	}

	public toString(): string {
		if (!this.str) {
			let p = this.rgba;
			this.str = `rgba(${p.r}, ${p.g}, ${p.b}, ${+p.a.toFixed(2)})`;
		}
		return this.str;
	}

	public toHSLA(): HSLA {
		if (!this.hsla) {
			this.hsla = rgba2hsla(this.rgba);
		}
		return Object.clone(this.hsla);
	}

	public toRGBA(): RGBA {
		return Object.clone(this.rgba);
	}

	public static fromRGBA(rgba: RGBA): Color {
		return new Color(rgba);
	}

	public static fromHex(hex: string): Color {
		return new Color(hex);
	}

	public static fromHSLA(hsla: HSLA): Color {
		return new Color(hsla2rgba(hsla));
	}

	public static getLighterColor(of: Color, relative: Color, factor?: number): Color {
		if (of.isLighterThan(relative)) {
			return of;
		}
		factor = factor ? factor : 0.5;
		let lum1 = of.getLuminosity(), lum2 = relative.getLuminosity();
		factor = factor * (lum2 - lum1) / lum2;
		return of.lighten(factor);
	}

	public static getDarkerColor(of: Color, relative: Color, factor?: number): Color {
		if (of.isDarkerThan(relative)) {
			return of;
		}
		factor = factor ? factor : 0.5;
		let lum1 = of.getLuminosity(), lum2 = relative.getLuminosity();
		factor = factor * (lum1 - lum2) / lum1;
		return of.darken(factor);
	}
}