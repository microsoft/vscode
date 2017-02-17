/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class RGBA {
	_rgbaBrand: void;

	/**
	 * Red: integer in [0-255]
	 */
	public readonly r: number;
	/**
	 * Green: integer in [0-255]
	 */
	public readonly g: number;
	/**
	 * Blue: integer in [0-255]
	 */
	public readonly b: number;
	/**
	 * Alpha: float in [0-1]
	 */
	public readonly a: number;

	constructor(r: number, g: number, b: number, a: number) {
		this.r = RGBA._clampColorComponent(r);
		this.g = RGBA._clampColorComponent(g);
		this.b = RGBA._clampColorComponent(b);
		this.a = RGBA._clampAlphaComponent(a);
	}

	private static _clampColorComponent(c: number): number {
		if (c < 0) {
			return 0;
		}
		if (c > 255) {
			return 255;
		}
		return c | 0;
	}

	private static _clampAlphaComponent(alpha: number): number {
		if (alpha < 0) {
			return 0.0;
		}
		if (alpha > 1) {
			return 1.0;
		}
		return alpha;
	}
}

/**
 * http://en.wikipedia.org/wiki/HSL_color_space
 */
export class HSLA {
	_hslaBrand: void;

	/**
	 * Hue: float in [0, 360]
	 */
	public readonly h: number;
	/**
	 * Saturation: float in [0, 1]
	 */
	public readonly s: number;
	/**
	 * Luminosity: float in [0, 1]
	 */
	public readonly l: number;
	/**
	 * Alpha: float in [0, 1]
	 */
	public readonly a: number;

	constructor(h: number, s: number, l: number, a: number) {
		this.h = HSLA._clampHue(h);
		this.s = HSLA._clamp01(s);
		this.l = HSLA._clamp01(l);
		this.a = HSLA._clamp01(a);
	}

	private static _clampHue(hue: number): number {
		if (hue < 0) {
			return 0.0;
		}
		if (hue > 360) {
			return 360.0;
		}
		return hue;
	}

	private static _clamp01(n: number): number {
		if (n < 0) {
			return 0.0;
		}
		if (n > 1) {
			return 1.0;
		}
		return n;
	}
}

/**
 * Converts an Hex color value to RGB.
 * returns r, g, and b are contained in the set [0, 255]
 */
function hex2rgba(hex: string): RGBA {
	function parseHex(str: string) {
		return parseInt('0x' + str);
	}
	if (hex.charAt(0) === '#' && hex.length >= 7) {
		const r = parseHex(hex.substr(1, 2));
		const g = parseHex(hex.substr(3, 2));
		const b = parseHex(hex.substr(5, 2));
		const a = hex.length === 9 ? parseHex(hex.substr(7, 2)) / 0xff : 1;
		return new RGBA(r, g, b, a);
	}
	return new RGBA(255, 0, 0, 1);
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h in the set [0, 360], s, and l in the set [0, 1].
 */
function rgba2hsla(rgba: RGBA): HSLA {
	const r = rgba.r / 255;
	const g = rgba.g / 255;
	const b = rgba.b / 255;
	const a = rgba.a;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = Math.round(((min + max) / 2) * 1000) / 1000;
	const chroma = max - min;

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
	return new HSLA(h, s, l, a);
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h in the set [0, 360] s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 */
function hsla2rgba(hsla: HSLA): RGBA {
	const h = hsla.h / 360;
	const s = Math.min(hsla.s, 1);
	const l = Math.min(hsla.l, 1);
	const a = hsla.a;
	let r: number, g: number, b: number;

	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = _hue2rgb(p, q, h + 1 / 3);
		g = _hue2rgb(p, q, h);
		b = _hue2rgb(p, q, h - 1 / 3);
	}

	return new RGBA(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a);
}

function _hue2rgb(p: number, q: number, t: number) {
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
}

export function hexToCSS(hex: string) {
	if (hex.length === 9) {
		return toCSSColor(hex2rgba(hex));
	}
	return hex;
}

function toCSSColor(rgba: RGBA): string {
	return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${+rgba.a.toFixed(2)})`;
}

export class Color {

	public static fromRGBA(rgba: RGBA): Color {
		return new Color(rgba);
	}

	/**
	 * Creates a color from a hex string (#RRGGBB or #RRGGBBAA).
	 */
	public static fromHex(hex: string): Color {
		return new Color(hex);
	}

	public static fromHSLA(hsla: HSLA): Color {
		return new Color(hsla2rgba(hsla));
	}

	private readonly rgba: RGBA;
	private hsla: HSLA;
	private str: string;

	private constructor(arg: string | RGBA) {
		this.rgba = typeof arg === 'string' ? hex2rgba(arg) : <RGBA>arg;
		this.hsla = null;
		this.str = null;
	}

	/**
	 * http://www.w3.org/TR/WCAG20/#relativeluminancedef
	 * Returns the number in the set [0, 1]. O => Darkest Black. 1 => Lightest white.
	 */
	public getLuminosity(): number {
		const R = Color._luminosityFor(this.rgba.r);
		const G = Color._luminosityFor(this.rgba.g);
		const B = Color._luminosityFor(this.rgba.b);
		const luminosity = 0.2126 * R + 0.7152 * G + 0.0722 * B;
		return Math.round(luminosity * 10000) / 10000;
	}

	private static _luminosityFor(color: number): number {
		const c = color / 255;
		return (c <= 0.03928) ? c / 12.92 : Math.pow(((c + 0.055) / 1.055), 2.4);
	}

	/**
	 * http://www.w3.org/TR/WCAG20/#contrast-ratiodef
	 * Returns the contrast ration number in the set [1, 21].
	 */
	public getContrast(another: Color): number {
		const lum1 = this.getLuminosity();
		const lum2 = another.getLuminosity();
		return lum1 > lum2 ? (lum1 + 0.05) / (lum2 + 0.05) : (lum2 + 0.05) / (lum1 + 0.05);
	}

	/**
	 *	http://24ways.org/2010/calculating-color-contrast
	 *  Return 'true' if darker color otherwise 'false'
	 */
	public isDarker(): boolean {
		const yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1000;
		return yiq < 128;
	}

	/**
	 *	http://24ways.org/2010/calculating-color-contrast
	 *  Return 'true' if lighter color otherwise 'false'
	 */
	public isLighter(): boolean {
		const yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1000;
		return yiq >= 128;
	}

	public isLighterThan(another: Color): boolean {
		const lum1 = this.getLuminosity();
		const lum2 = another.getLuminosity();
		return lum1 > lum2;
	}

	public isDarkerThan(another: Color): boolean {
		const lum1 = this.getLuminosity();
		const lum2 = another.getLuminosity();
		return lum1 < lum2;
	}

	public lighten(factor: number): Color {
		const hsl = this.toHSLA();
		const result = new HSLA(hsl.h, hsl.s, hsl.l + hsl.l * factor, hsl.a);
		return new Color(hsla2rgba(result));
	}

	public darken(factor: number): Color {
		const hsl = this.toHSLA();
		const result = new HSLA(hsl.h, hsl.s, hsl.l - hsl.l * factor, hsl.a);
		return new Color(hsla2rgba(result));
	}

	public transparent(factor: number): Color {
		const p = this.rgba;
		return new Color(new RGBA(p.r, p.g, p.b, p.a * factor));
	}

	public opposite(): Color {
		return new Color(new RGBA(
			255 - this.rgba.r,
			255 - this.rgba.g,
			255 - this.rgba.b,
			this.rgba.a
		));
	}

	public toString(): string {
		if (this.str === null) {
			this.str = toCSSColor(this.rgba);
		}
		return this.str;
	}

	public toHSLA(): HSLA {
		if (this.hsla === null) {
			this.hsla = rgba2hsla(this.rgba);
		}
		return this.hsla;
	}

	public toRGBA(): RGBA {
		return this.rgba;
	}

	public static getLighterColor(of: Color, relative: Color, factor?: number): Color {
		if (of.isLighterThan(relative)) {
			return of;
		}
		factor = factor ? factor : 0.5;
		const lum1 = of.getLuminosity();
		const lum2 = relative.getLuminosity();
		factor = factor * (lum2 - lum1) / lum2;
		return of.lighten(factor);
	}

	public static getDarkerColor(of: Color, relative: Color, factor?: number): Color {
		if (of.isDarkerThan(relative)) {
			return of;
		}
		factor = factor ? factor : 0.5;
		const lum1 = of.getLuminosity();
		const lum2 = relative.getLuminosity();
		factor = factor * (lum1 - lum2) / lum1;
		return of.darken(factor);
	}
}
