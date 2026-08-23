/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from './charCode.js';

function roundFloat(number: number, decimalPoints: number): number {
	const decimal = Math.pow(10, decimalPoints);
	return Math.round(number * decimal) / decimal;
}

export class RGBA {
	_rgbaBrand: void = undefined;

	/**
	 * Red: integer in [0-255]
	 */
	readonly r: number;

	/**
	 * Green: integer in [0-255]
	 */
	readonly g: number;

	/**
	 * Blue: integer in [0-255]
	 */
	readonly b: number;

	/**
	 * Alpha: float in [0-1]
	 */
	readonly a: number;

	constructor(r: number, g: number, b: number, a: number = 1) {
		this.r = Math.min(255, Math.max(0, r)) | 0;
		this.g = Math.min(255, Math.max(0, g)) | 0;
		this.b = Math.min(255, Math.max(0, b)) | 0;
		this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
	}

	static equals(a: RGBA, b: RGBA): boolean {
		return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
	}
}

export class HSLA {

	_hslaBrand: void = undefined;

	/**
	 * Hue: integer in [0, 360]
	 */
	readonly h: number;

	/**
	 * Saturation: float in [0, 1]
	 */
	readonly s: number;

	/**
	 * Luminosity: float in [0, 1]
	 */
	readonly l: number;

	/**
	 * Alpha: float in [0, 1]
	 */
	readonly a: number;

	constructor(h: number, s: number, l: number, a: number) {
		this.h = Math.max(Math.min(360, h), 0) | 0;
		this.s = roundFloat(Math.max(Math.min(1, s), 0), 3);
		this.l = roundFloat(Math.max(Math.min(1, l), 0), 3);
		this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
	}

	static equals(a: HSLA, b: HSLA): boolean {
		return a.h === b.h && a.s === b.s && a.l === b.l && a.a === b.a;
	}

	/**
	 * Converts an RGB color value to HSL. Conversion formula
	 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
	 * Assumes r, g, and b are contained in the set [0, 255] and
	 * returns h in the set [0, 360], s, and l in the set [0, 1].
	 */
	static fromRGBA(rgba: RGBA): HSLA {
		const r = rgba.r / 255;
		const g = rgba.g / 255;
		const b = rgba.b / 255;
		const a = rgba.a;

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		let h = 0;
		let s = 0;
		const l = (min + max) / 2;
		const chroma = max - min;

		if (chroma > 0) {
			s = Math.min((l <= 0.5 ? chroma / (2 * l) : chroma / (2 - (2 * l))), 1);

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

	private static _hue2rgb(p: number, q: number, t: number): number {
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

	/**
	 * Converts an HSL color value to RGB. Conversion formula
	 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
	 * Assumes h in the set [0, 360] s, and l are contained in the set [0, 1] and
	 * returns r, g, and b in the set [0, 255].
	 */
	static toRGBA(hsla: HSLA): RGBA {
		const h = hsla.h / 360;
		const { s, l, a } = hsla;
		let r: number, g: number, b: number;

		if (s === 0) {
			r = g = b = l; // achromatic
		} else {
			const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
			const p = 2 * l - q;
			r = HSLA._hue2rgb(p, q, h + 1 / 3);
			g = HSLA._hue2rgb(p, q, h);
			b = HSLA._hue2rgb(p, q, h - 1 / 3);
		}

		return new RGBA(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a);
	}
}

export class HSVA {

	_hsvaBrand: void = undefined;

	/**
	 * Hue: integer in [0, 360]
	 */
	readonly h: number;

	/**
	 * Saturation: float in [0, 1]
	 */
	readonly s: number;

	/**
	 * Value: float in [0, 1]
	 */
	readonly v: number;

	/**
	 * Alpha: float in [0, 1]
	 */
	readonly a: number;

	constructor(h: number, s: number, v: number, a: number) {
		this.h = Math.max(Math.min(360, h), 0) | 0;
		this.s = roundFloat(Math.max(Math.min(1, s), 0), 3);
		this.v = roundFloat(Math.max(Math.min(1, v), 0), 3);
		this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
	}

	static equals(a: HSVA, b: HSVA): boolean {
		return a.h === b.h && a.s === b.s && a.v === b.v && a.a === b.a;
	}

	// from http://www.rapidtables.com/convert/color/rgb-to-hsv.htm
	static fromRGBA(rgba: RGBA): HSVA {
		const r = rgba.r / 255;
		const g = rgba.g / 255;
		const b = rgba.b / 255;
		const cmax = Math.max(r, g, b);
		const cmin = Math.min(r, g, b);
		const delta = cmax - cmin;
		const s = cmax === 0 ? 0 : (delta / cmax);
		let m: number;

		if (delta === 0) {
			m = 0;
		} else if (cmax === r) {
			m = ((((g - b) / delta) % 6) + 6) % 6;
		} else if (cmax === g) {
			m = ((b - r) / delta) + 2;
		} else {
			m = ((r - g) / delta) + 4;
		}

		return new HSVA(Math.round(m * 60), s, cmax, rgba.a);
	}

	// from http://www.rapidtables.com/convert/color/hsv-to-rgb.htm
	static toRGBA(hsva: HSVA): RGBA {
		const { h, s, v, a } = hsva;
		const c = v * s;
		const x = c * (1 - Math.abs((h / 60) % 2 - 1));
		const m = v - c;
		let [r, g, b] = [0, 0, 0];

		if (h < 60) {
			r = c;
			g = x;
		} else if (h < 120) {
			r = x;
			g = c;
		} else if (h < 180) {
			g = c;
			b = x;
		} else if (h < 240) {
			g = x;
			b = c;
		} else if (h < 300) {
			r = x;
			b = c;
		} else if (h <= 360) {
			r = c;
			b = x;
		}

		r = Math.round((r + m) * 255);
		g = Math.round((g + m) * 255);
		b = Math.round((b + m) * 255);

		return new RGBA(r, g, b, a);
	}
}

export class Color {

	static fromHex(hex: string): Color {
		return Color.Format.CSS.parseHex(hex) || Color.red;
	}

	static equals(a: Color | null, b: Color | null): boolean {
		if (!a && !b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.equals(b);
	}

	readonly rgba: RGBA;
	private _hsla?: HSLA;
	get hsla(): HSLA {
		if (this._hsla) {
			return this._hsla;
		} else {
			return HSLA.fromRGBA(this.rgba);
		}
	}

	private _hsva?: HSVA;
	get hsva(): HSVA {
		if (this._hsva) {
			return this._hsva;
		}
		return HSVA.fromRGBA(this.rgba);
	}

	constructor(arg: RGBA | HSLA | HSVA) {
		if (!arg) {
			throw new Error('Color needs a value');
		} else if (arg instanceof RGBA) {
			this.rgba = arg;
		} else if (arg instanceof HSLA) {
			this._hsla = arg;
			this.rgba = HSLA.toRGBA(arg);
		} else if (arg instanceof HSVA) {
			this._hsva = arg;
			this.rgba = HSVA.toRGBA(arg);
		} else {
			throw new Error('Invalid color ctor argument');
		}
	}

	equals(other: Color | null): boolean {
		return !!other && RGBA.equals(this.rgba, other.rgba) && HSLA.equals(this.hsla, other.hsla) && HSVA.equals(this.hsva, other.hsva);
	}

	/**
	 * http://www.w3.org/TR/WCAG20/#relativeluminancedef
	 * Returns the number in the set [0, 1]. O => Darkest Black. 1 => Lightest white.
	 */
	getRelativeLuminance(): number {
		const R = Color._relativeLuminanceForComponent(this.rgba.r);
		const G = Color._relativeLuminanceForComponent(this.rgba.g);
		const B = Color._relativeLuminanceForComponent(this.rgba.b);
		const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;

		return roundFloat(luminance, 4);
	}

	/**
	 * Reduces the "foreground" color on this "background" color unti it is
	 * below the relative luminace ratio.
	 * @returns the new foreground color
	 * @see https://github.com/xtermjs/xterm.js/blob/44f9fa39ae03e2ca6d28354d88a399608686770e/src/common/Color.ts#L315
	 */
	reduceRelativeLuminace(foreground: Color, ratio: number): Color {
		// This is a naive but fast approach to reducing luminance as converting to
		// HSL and back is expensive
		let { r: fgR, g: fgG, b: fgB } = foreground.rgba;

		let cr = this.getContrastRatio(foreground);
		while (cr < ratio && (fgR > 0 || fgG > 0 || fgB > 0)) {
			// Reduce by 10% until the ratio is hit
			fgR -= Math.max(0, Math.ceil(fgR * 0.1));
			fgG -= Math.max(0, Math.ceil(fgG * 0.1));
			fgB -= Math.max(0, Math.ceil(fgB * 0.1));
			cr = this.getContrastRatio(new Color(new RGBA(fgR, fgG, fgB)));
		}

		return new Color(new RGBA(fgR, fgG, fgB));
	}

	/**
	 * Increases the "foreground" color on this "background" color unti it is
	 * below the relative luminace ratio.
	 * @returns the new foreground color
	 * @see https://github.com/xtermjs/xterm.js/blob/44f9fa39ae03e2ca6d28354d88a399608686770e/src/common/Color.ts#L335
	 */
	increaseRelativeLuminace(foreground: Color, ratio: number): Color {
		// This is a naive but fast approach to reducing luminance as converting to
		// HSL and back is expensive
		let { r: fgR, g: fgG, b: fgB } = foreground.rgba;
		let cr = this.getContrastRatio(foreground);
		while (cr < ratio && (fgR < 0xFF || fgG < 0xFF || fgB < 0xFF)) {
			fgR = Math.min(0xFF, fgR + Math.ceil((255 - fgR) * 0.1));
			fgG = Math.min(0xFF, fgG + Math.ceil((255 - fgG) * 0.1));
			fgB = Math.min(0xFF, fgB + Math.ceil((255 - fgB) * 0.1));
			cr = this.getContrastRatio(new Color(new RGBA(fgR, fgG, fgB)));
		}

		return new Color(new RGBA(fgR, fgG, fgB));
	}

	private static _relativeLuminanceForComponent(color: number): number {
		const c = color / 255;
		return (c <= 0.03928) ? c / 12.92 : Math.pow(((c + 0.055) / 1.055), 2.4);
	}

	/**
	 * http://www.w3.org/TR/WCAG20/#contrast-ratiodef
	 * Returns the contrast ration number in the set [1, 21].
	 */
	getContrastRatio(another: Color): number {
		const lum1 = this.getRelativeLuminance();
		const lum2 = another.getRelativeLuminance();
		return lum1 > lum2 ? (lum1 + 0.05) / (lum2 + 0.05) : (lum2 + 0.05) / (lum1 + 0.05);
	}

	/**
	 *	http://24ways.org/2010/calculating-color-contrast
	 *  Return 'true' if darker color otherwise 'false'
	 */
	isDarker(): boolean {
		const yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1000;
		return yiq < 128;
	}

	/**
	 *	http://24ways.org/2010/calculating-color-contrast
	 *  Return 'true' if lighter color otherwise 'false'
	 */
	isLighter(): boolean {
		const yiq = (this.rgba.r * 299 + this.rgba.g * 587 + this.rgba.b * 114) / 1000;
		return yiq >= 128;
	}

	isLighterThan(another: Color): boolean {
		const lum1 = this.getRelativeLuminance();
		const lum2 = another.getRelativeLuminance();
		return lum1 > lum2;
	}

	isDarkerThan(another: Color): boolean {
		const lum1 = this.getRelativeLuminance();
		const lum2 = another.getRelativeLuminance();
		return lum1 < lum2;
	}

	/**
	 * Based on xterm.js: https://github.com/xtermjs/xterm.js/blob/44f9fa39ae03e2ca6d28354d88a399608686770e/src/common/Color.ts#L288
	 *
	 * Given a foreground color and a background color, either increase or reduce the luminance of the
	 * foreground color until the specified contrast ratio is met. If pure white or black is hit
	 * without the contrast ratio being met, go the other direction using the background color as the
	 * foreground color and take either the first or second result depending on which has the higher
	 * contrast ratio.
	 *
	 * @param foreground The foreground color.
	 * @param ratio The contrast ratio to achieve.
	 * @returns The adjusted foreground color.
	 */
	ensureConstrast(foreground: Color, ratio: number): Color {
		const bgL = this.getRelativeLuminance();
		const fgL = foreground.getRelativeLuminance();
		const cr = this.getContrastRatio(foreground);
		if (cr < ratio) {
			if (fgL < bgL) {
				const resultA = this.reduceRelativeLuminace(foreground, ratio);
				const resultARatio = this.getContrastRatio(resultA);
				if (resultARatio < ratio) {
					const resultB = this.increaseRelativeLuminace(foreground, ratio);
					const resultBRatio = this.getContrastRatio(resultB);
					return resultARatio > resultBRatio ? resultA : resultB;
				}
				return resultA;
			}
			const resultA = this.increaseRelativeLuminace(foreground, ratio);
			const resultARatio = this.getContrastRatio(resultA);
			if (resultARatio < ratio) {
				const resultB = this.reduceRelativeLuminace(foreground, ratio);
				const resultBRatio = this.getContrastRatio(resultB);
				return resultARatio > resultBRatio ? resultA : resultB;
			}
			return resultA;
		}

		return foreground;
	}

	lighten(factor: number): Color {
		return new Color(new HSLA(this.hsla.h, this.hsla.s, this.hsla.l + this.hsla.l * factor, this.hsla.a));
	}

	darken(factor: number): Color {
		return new Color(new HSLA(this.hsla.h, this.hsla.s, this.hsla.l - this.hsla.l * factor, this.hsla.a));
	}

	transparent(factor: number): Color {
		const { r, g, b, a } = this.rgba;
		return new Color(new RGBA(r, g, b, a * factor));
	}

	isTransparent(): boolean {
		return this.rgba.a === 0;
	}

	isOpaque(): boolean {
		return this.rgba.a === 1;
	}

	opposite(): Color {
		return new Color(new RGBA(255 - this.rgba.r, 255 - this.rgba.g, 255 - this.rgba.b, this.rgba.a));
	}

	blend(c: Color): Color {
		const rgba = c.rgba;

		// Convert to 0..1 opacity
		const thisA = this.rgba.a;
		const colorA = rgba.a;

		const a = thisA + colorA * (1 - thisA);
		if (a < 1e-6) {
			return Color.transparent;
		}

		const r = this.rgba.r * thisA / a + rgba.r * colorA * (1 - thisA) / a;
		const g = this.rgba.g * thisA / a + rgba.g * colorA * (1 - thisA) / a;
		const b = this.rgba.b * thisA / a + rgba.b * colorA * (1 - thisA) / a;

		return new Color(new RGBA(r, g, b, a));
	}

	/**
	 * Mixes the current color with the provided color based on the given factor.
	 * @param color The color to mix with
	 * @param factor The factor of mixing (0 means this color, 1 means the input color, 0.5 means equal mix)
	 * @returns A new color representing the mix
	 */
	mix(color: Color, factor: number = 0.5): Color {
		const normalize = Math.min(Math.max(factor, 0), 1);
		const thisRGBA = this.rgba;
		const otherRGBA = color.rgba;

		const r = thisRGBA.r + (otherRGBA.r - thisRGBA.r) * normalize;
		const g = thisRGBA.g + (otherRGBA.g - thisRGBA.g) * normalize;
		const b = thisRGBA.b + (otherRGBA.b - thisRGBA.b) * normalize;
		const a = thisRGBA.a + (otherRGBA.a - thisRGBA.a) * normalize;

		return new Color(new RGBA(r, g, b, a));
	}

	makeOpaque(opaqueBackground: Color): Color {
		if (this.isOpaque() || opaqueBackground.rgba.a !== 1) {
			// only allow to blend onto a non-opaque color onto a opaque color
			return this;
		}

		const { r, g, b, a } = this.rgba;

		// https://stackoverflow.com/questions/12228548/finding-equivalent-color-with-opacity
		return new Color(new RGBA(
			opaqueBackground.rgba.r - a * (opaqueBackground.rgba.r - r),
			opaqueBackground.rgba.g - a * (opaqueBackground.rgba.g - g),
			opaqueBackground.rgba.b - a * (opaqueBackground.rgba.b - b),
			1
		));
	}

	flatten(...backgrounds: Color[]): Color {
		const background = backgrounds.reduceRight((accumulator, color) => {
			return Color._flatten(color, accumulator);
		});
		return Color._flatten(this, background);
	}

	private static _flatten(foreground: Color, background: Color) {
		const backgroundAlpha = 1 - foreground.rgba.a;
		return new Color(new RGBA(
			backgroundAlpha * background.rgba.r + foreground.rgba.a * foreground.rgba.r,
			backgroundAlpha * background.rgba.g + foreground.rgba.a * foreground.rgba.g,
			backgroundAlpha * background.rgba.b + foreground.rgba.a * foreground.rgba.b
		));
	}

	private _toString?: string;
	toString(): string {
		if (!this._toString) {
			this._toString = Color.Format.CSS.format(this);
		}
		return this._toString;
	}

	private _toNumber32Bit?: number;
	toNumber32Bit(): number {
		if (!this._toNumber32Bit) {
			this._toNumber32Bit = (
				this.rgba.r /*  */ << 24 |
				this.rgba.g /*  */ << 16 |
				this.rgba.b /*  */ << 8 |
				this.rgba.a * 0xFF << 0
			) >>> 0;
		}
		return this._toNumber32Bit;
	}

	static getLighterColor(of: Color, relative: Color, factor?: number): Color {
		if (of.isLighterThan(relative)) {
			return of;
		}
		factor = factor ? factor : 0.5;
		const lum1 = of.getRelativeLuminance();
		const lum2 = relative.getRelativeLuminance();
		factor = factor * (lum2 - lum1) / lum2;
		return of.lighten(factor);
	}

	static getDarkerColor(of: Color, relative: Color, factor?: number): Color {
		if (of.isDarkerThan(relative)) {
			return of;
		}
		factor = factor ? factor : 0.5;
		const lum1 = of.getRelativeLuminance();
		const lum2 = relative.getRelativeLuminance();
		factor = factor * (lum1 - lum2) / lum1;
		return of.darken(factor);
	}

	static readonly white = new Color(new RGBA(255, 255, 255, 1));
	static readonly black = new Color(new RGBA(0, 0, 0, 1));
	static readonly red = new Color(new RGBA(255, 0, 0, 1));
	static readonly blue = new Color(new RGBA(0, 0, 255, 1));
	static readonly green = new Color(new RGBA(0, 255, 0, 1));
	static readonly cyan = new Color(new RGBA(0, 255, 255, 1));
	static readonly lightgrey = new Color(new RGBA(211, 211, 211, 1));
	static readonly transparent = new Color(new RGBA(0, 0, 0, 0));
}

export namespace Color {
	export namespace Format {
		export namespace CSS {

			export function formatRGB(color: Color): string {
				if (color.rgba.a === 1) {
					return `rgb(${color.rgba.r}, ${color.rgba.g}, ${color.rgba.b})`;
				}

				return Color.Format.CSS.formatRGBA(color);
			}

			export function formatRGBA(color: Color): string {
				return `rgba(${color.rgba.r}, ${color.rgba.g}, ${color.rgba.b}, ${+(color.rgba.a).toFixed(2)})`;
			}

			export function formatHSL(color: Color): string {
				if (color.hsla.a === 1) {
					return `hsl(${color.hsla.h}, ${Math.round(color.hsla.s * 100)}%, ${Math.round(color.hsla.l * 100)}%)`;
				}

				return Color.Format.CSS.formatHSLA(color);
			}

			export function formatHSLA(color: Color): string {
				return `hsla(${color.hsla.h}, ${Math.round(color.hsla.s * 100)}%, ${Math.round(color.hsla.l * 100)}%, ${color.hsla.a.toFixed(2)})`;
			}

			function _toTwoDigitHex(n: number): string {
				const r = n.toString(16);
				return r.length !== 2 ? '0' + r : r;
			}

			/**
			 * Formats the color as #RRGGBB
			 */
			export function formatHex(color: Color): string {
				return `#${_toTwoDigitHex(color.rgba.r)}${_toTwoDigitHex(color.rgba.g)}${_toTwoDigitHex(color.rgba.b)}`;
			}

			/**
			 * Formats the color as #RRGGBBAA
			 * If 'compact' is set, colors without transparancy will be printed as #RRGGBB
			 */
			export function formatHexA(color: Color, compact = false): string {
				if (compact && color.rgba.a === 1) {
					return Color.Format.CSS.formatHex(color);
				}

				return `#${_toTwoDigitHex(color.rgba.r)}${_toTwoDigitHex(color.rgba.g)}${_toTwoDigitHex(color.rgba.b)}${_toTwoDigitHex(Math.round(color.rgba.a * 255))}`;
			}

			/**
			 * The default format will use HEX if opaque and RGBA otherwise.
			 */
			export function format(color: Color): string {
				if (color.isOpaque()) {
					return Color.Format.CSS.formatHex(color);
				}

				return Color.Format.CSS.formatRGBA(color);
			}

			/**
			 * Parse a CSS color and return a {@link Color}.
			 * @param css The CSS color to parse.
			 * @see https://drafts.csswg.org/css-color/#typedef-color
			 */
			export function parse(css: string): Color | null {
				if (css === 'transparent') {
					return Color.transparent;
				}
				if (css.startsWith('#')) {
					return parseHex(css);
				}
				if (css.startsWith('rgba(')) {
					const color = css.match(/rgba\((?<r>(?:\+|-)?\d+), *(?<g>(?:\+|-)?\d+), *(?<b>(?:\+|-)?\d+), *(?<a>(?:\+|-)?\d+(\.\d+)?)\)/);
					if (!color) {
						throw new Error('Invalid color format ' + css);
					}
					const r = parseInt(color.groups?.r ?? '0');
					const g = parseInt(color.groups?.g ?? '0');
					const b = parseInt(color.groups?.b ?? '0');
					const a = parseFloat(color.groups?.a ?? '0');
					return new Color(new RGBA(r, g, b, a));
				}
				if (css.startsWith('rgb(')) {
					const color = css.match(/rgb\((?<r>(?:\+|-)?\d+), *(?<g>(?:\+|-)?\d+), *(?<b>(?:\+|-)?\d+)\)/);
					if (!color) {
						throw new Error('Invalid color format ' + css);
					}
					const r = parseInt(color.groups?.r ?? '0');
					const g = parseInt(color.groups?.g ?? '0');
					const b = parseInt(color.groups?.b ?? '0');
					return new Color(new RGBA(r, g, b));
				}
				// TODO: Support more formats as needed
				return parseNamedKeyword(css);
			}

			function parseNamedKeyword(css: string): Color | null {
				// https://drafts.csswg.org/css-color/#named-colors
				switch (css) {
					case 'aliceblue': return new Color(new RGBA(240, 248, 255, 1));
					case 'antiquewhite': return new Color(new RGBA(250, 235, 215, 1));
					case 'aqua': return new Color(new RGBA(0, 255, 255, 1));
					case 'aquamarine': return new Color(new RGBA(127, 255, 212, 1));
					case 'azure': return new Color(new RGBA(240, 255, 255, 1));
					case 'beige': return new Color(new RGBA(245, 245, 220, 1));
					case 'bisque': return new Color(new RGBA(255, 228, 196, 1));
					case 'black': return new Color(new RGBA(0, 0, 0, 1));
					case 'blanchedalmond': return new Color(new RGBA(255, 235, 205, 1));
					case 'blue': return new Color(new RGBA(0, 0, 255, 1));
					case 'blueviolet': return new Color(new RGBA(138, 43, 226, 1));
					case 'brown': return new Color(new RGBA(165, 42, 42, 1));
					case 'burlywood': return new Color(new RGBA(222, 184, 135, 1));
					case 'cadetblue': return new Color(new RGBA(95, 158, 160, 1));
					case 'chartreuse': return new Color(new RGBA(127, 255, 0, 1));
					case 'chocolate': return new Color(new RGBA(210, 105, 30, 1));
					case 'coral': return new Color(new RGBA(255, 127, 80, 1));
					case 'cornflowerblue': return new Color(new RGBA(100, 149, 237, 1));
					case 'cornsilk': return new Color(new RGBA(255, 248, 220, 1));
					case 'crimson': return new Color(new RGBA(220, 20, 60, 1));
					case 'cyan': return new Color(new RGBA(0, 255, 255, 1));
					case 'darkblue': return new Color(new RGBA(0, 0, 139, 1));
					case 'darkcyan': return new Color(new RGBA(0, 139, 139, 1));
					case 'darkgoldenrod': return new Color(new RGBA(184, 134, 11, 1));
					case 'darkgray': return new Color(new RGBA(169, 169, 169, 1));
					case 'darkgreen': return new Color(new RGBA(0, 100, 0, 1));
					case 'darkgrey': return new Color(new RGBA(169, 169, 169, 1));
					case 'darkkhaki': return new Color(new RGBA(189, 183, 107, 1));
					case 'darkmagenta': return new Color(new RGBA(139, 0, 139, 1));
					case 'darkolivegreen': return new Color(new RGBA(85, 107, 47, 1));
					case 'darkorange': return new Color(new RGBA(255, 140, 0, 1));
					case 'darkorchid': return new Color(new RGBA(153, 50, 204, 1));
					case 'darkred': return new Color(new RGBA(139, 0, 0, 1));
					case 'darksalmon': return new Color(new RGBA(233, 150, 122, 1));
					case 'darkseagreen': return new Color(new RGBA(143, 188, 143, 1));
					case 'darkslateblue': return new Color(new RGBA(72, 61, 139, 1));
					case 'darkslategray': return new Color(new RGBA(47, 79, 79, 1));
					case 'darkslategrey': return new Color(new RGBA(47, 79, 79, 1));
					case 'darkturquoise': return new Color(new RGBA(0, 206, 209, 1));
					case 'darkviolet': return new Color(new RGBA(148, 0, 211, 1));
					case 'deeppink': return new Color(new RGBA(255, 20, 147, 1));
					case 'deepskyblue': return new Color(new RGBA(0, 191, 255, 1));
					case 'dimgray': return new Color(new RGBA(105, 105, 105, 1));
					case 'dimgrey': return new Color(new RGBA(105, 105, 105, 1));
					case 'dodgerblue': return new Color(new RGBA(30, 144, 255, 1));
					case 'firebrick': return new Color(new RGBA(178, 34, 34, 1));
					case 'floralwhite': return new Color(new RGBA(255, 250, 240, 1));
					case 'forestgreen': return new Color(new RGBA(34, 139, 34, 1));
					case 'fuchsia': return new Color(new RGBA(255, 0, 255, 1));
					case 'gainsboro': return new Color(new RGBA(220, 220, 220, 1));
					case 'ghostwhite': return new Color(new RGBA(248, 248, 255, 1));
					case 'gold': return new Color(new RGBA(255, 215, 0, 1));
					case 'goldenrod': return new Color(new RGBA(218, 165, 32, 1));
					case 'gray': return new Color(new RGBA(128, 128, 128, 1));
					case 'green': return new Color(new RGBA(0, 128, 0, 1));
					case 'greenyellow': return new Color(new RGBA(173, 255, 47, 1));
					case 'grey': return new Color(new RGBA(128, 128, 128, 1));
					case 'honeydew': return new Color(new RGBA(240, 255, 240, 1));
					case 'hotpink': return new Color(new RGBA(255, 105, 180, 1));
					case 'indianred': return new Color(new RGBA(205, 92, 92, 1));
					case 'indigo': return new Color(new RGBA(75, 0, 130, 1));
					case 'ivory': return new Color(new RGBA(255, 255, 240, 1));
					case 'khaki': return new Color(new RGBA(240, 230, 140, 1));
					case 'lavender': return new Color(new RGBA(230, 230, 250, 1));
					case 'lavenderblush': return new Color(new RGBA(255, 240, 245, 1));
					case 'lawngreen': return new Color(new RGBA(124, 252, 0, 1));
					case 'lemonchiffon': return new Color(new RGBA(255, 250, 205, 1));
					case 'lightblue': return new Color(new RGBA(173, 216, 230, 1));
					case 'lightcoral': return new Color(new RGBA(240, 128, 128, 1));
					case 'lightcyan': return new Color(new RGBA(224, 255, 255, 1));
					case 'lightgoldenrodyellow': return new Color(new RGBA(250, 250, 210, 1));
					case 'lightgray': return new Color(new RGBA(211, 211, 211, 1));
					case 'lightgreen': return new Color(new RGBA(144, 238, 144, 1));
					case 'lightgrey': return new Color(new RGBA(211, 211, 211, 1));
					case 'lightpink': return new Color(new RGBA(255, 182, 193, 1));
					case 'lightsalmon': return new Color(new RGBA(255, 160, 122, 1));
					case 'lightseagreen': return new Color(new RGBA(32, 178, 170, 1));
					case 'lightskyblue': return new Color(new RGBA(135, 206, 250, 1));
					case 'lightslategray': return new Color(new RGBA(119, 136, 153, 1));
					case 'lightslategrey': return new Color(new RGBA(119, 136, 153, 1));
					case 'lightsteelblue': return new Color(new RGBA(176, 196, 222, 1));
					case 'lightyellow': return new Color(new RGBA(255, 255, 224, 1));
					case 'lime': return new Color(new RGBA(0, 255, 0, 1));
					case 'limegreen': return new Color(new RGBA(50, 205, 50, 1));
					case 'linen': return new Color(new RGBA(250, 240, 230, 1));
					case 'magenta': return new Color(new RGBA(255, 0, 255, 1));
					case 'maroon': return new Color(new RGBA(128, 0, 0, 1));
					case 'mediumaquamarine': return new Color(new RGBA(102, 205, 170, 1));
					case 'mediumblue': return new Color(new RGBA(0, 0, 205, 1));
					case 'mediumorchid': return new Color(new RGBA(186, 85, 211, 1));
					case 'mediumpurple': return new Color(new RGBA(147, 112, 219, 1));
					case 'mediumseagreen': return new Color(new RGBA(60, 179, 113, 1));
					case 'mediumslateblue': return new Color(new RGBA(123, 104, 238, 1));
					case 'mediumspringgreen': return new Color(new RGBA(0, 250, 154, 1));
					case 'mediumturquoise': return new Color(new RGBA(72, 209, 204, 1));
					case 'mediumvioletred': return new Color(new RGBA(199, 21, 133, 1));
					case 'midnightblue': return new Color(new RGBA(25, 25, 112, 1));
					case 'mintcream': return new Color(new RGBA(245, 255, 250, 1));
					case 'mistyrose': return new Color(new RGBA(255, 228, 225, 1));
					case 'moccasin': return new Color(new RGBA(255, 228, 181, 1));
					case 'navajowhite': return new Color(new RGBA(255, 222, 173, 1));
					case 'navy': return new Color(new RGBA(0, 0, 128, 1));
					case 'oldlace': return new Color(new RGBA(253, 245, 230, 1));
					case 'olive': return new Color(new RGBA(128, 128, 0, 1));
					case 'olivedrab': return new Color(new RGBA(107, 142, 35, 1));
					case 'orange': return new Color(new RGBA(255, 165, 0, 1));
					case 'orangered': return new Color(new RGBA(255, 69, 0, 1));
					case 'orchid': return new Color(new RGBA(218, 112, 214, 1));
					case 'palegoldenrod': return new Color(new RGBA(238, 232, 170, 1));
					case 'palegreen': return new Color(new RGBA(152, 251, 152, 1));
					case 'paleturquoise': return new Color(new RGBA(175, 238, 238, 1));
					case 'palevioletred': return new Color(new RGBA(219, 112, 147, 1));
					case 'papayawhip': return new Color(new RGBA(255, 239, 213, 1));
					case 'peachpuff': return new Color(new RGBA(255, 218, 185, 1));
					case 'peru': return new Color(new RGBA(205, 133, 63, 1));
					case 'pink': return new Color(new RGBA(255, 192, 203, 1));
					case 'plum': return new Color(new RGBA(221, 160, 221, 1));
					case 'powderblue': return new Color(new RGBA(176, 224, 230, 1));
					case 'purple': return new Color(new RGBA(128, 0, 128, 1));
					case 'rebeccapurple': return new Color(new RGBA(102, 51, 153, 1));
					case 'red': return new Color(new RGBA(255, 0, 0, 1));
					case 'rosybrown': return new Color(new RGBA(188, 143, 143, 1));
					case 'royalblue': return new Color(new RGBA(65, 105, 225, 1));
					case 'saddlebrown': return new Color(new RGBA(139, 69, 19, 1));
					case 'salmon': return new Color(new RGBA(250, 128, 114, 1));
					case 'sandybrown': return new Color(new RGBA(244, 164, 96, 1));
					case 'seagreen': return new Color(new RGBA(46, 139, 87, 1));
					case 'seashell': return new Color(new RGBA(255, 245, 238, 1));
					case 'sienna': return new Color(new RGBA(160, 82, 45, 1));
					case 'silver': return new Color(new RGBA(192, 192, 192, 1));
					case 'skyblue': return new Color(new RGBA(135, 206, 235, 1));
					case 'slateblue': return new Color(new RGBA(106, 90, 205, 1));
					case 'slategray': return new Color(new RGBA(112, 128, 144, 1));
					case 'slategrey': return new Color(new RGBA(112, 128, 144, 1));
					case 'snow': return new Color(new RGBA(255, 250, 250, 1));
					case 'springgreen': return new Color(new RGBA(0, 255, 127, 1));
					case 'steelblue': return new Color(new RGBA(70, 130, 180, 1));
					case 'tan': return new Color(new RGBA(210, 180, 140, 1));
					case 'teal': return new Color(new RGBA(0, 128, 128, 1));
					case 'thistle': return new Color(new RGBA(216, 191, 216, 1));
					case 'tomato': return new Color(new RGBA(255, 99, 71, 1));
					case 'turquoise': return new Color(new RGBA(64, 224, 208, 1));
					case 'violet': return new Color(new RGBA(238, 130, 238, 1));
					case 'wheat': return new Color(new RGBA(245, 222, 179, 1));
					case 'white': return new Color(new RGBA(255, 255, 255, 1));
					case 'whitesmoke': return new Color(new RGBA(245, 245, 245, 1));
					case 'yellow': return new Color(new RGBA(255, 255, 0, 1));
					case 'yellowgreen': return new Color(new RGBA(154, 205, 50, 1));
					default: return null;
				}
			}

			/**
			 * Converts an Hex color value to a Color.
			 * returns r, g, and b are contained in the set [0, 255]
			 * @param hex string (#RGB, #RGBA, #RRGGBB or #RRGGBBAA).
			 */
			export function parseHex(hex: string): Color | null {
				const length = hex.length;

				if (length === 0) {
					// Invalid color
					return null;
				}

				if (hex.charCodeAt(0) !== CharCode.Hash) {
					// Does not begin with a #
					return null;
				}

				if (length === 7) {
					// #RRGGBB format
					const r = 16 * _parseHexDigit(hex.charCodeAt(1)) + _parseHexDigit(hex.charCodeAt(2));
					const g = 16 * _parseHexDigit(hex.charCodeAt(3)) + _parseHexDigit(hex.charCodeAt(4));
					const b = 16 * _parseHexDigit(hex.charCodeAt(5)) + _parseHexDigit(hex.charCodeAt(6));
					return new Color(new RGBA(r, g, b, 1));
				}

				if (length === 9) {
					// #RRGGBBAA format
					const r = 16 * _parseHexDigit(hex.charCodeAt(1)) + _parseHexDigit(hex.charCodeAt(2));
					const g = 16 * _parseHexDigit(hex.charCodeAt(3)) + _parseHexDigit(hex.charCodeAt(4));
					const b = 16 * _parseHexDigit(hex.charCodeAt(5)) + _parseHexDigit(hex.charCodeAt(6));
					const a = 16 * _parseHexDigit(hex.charCodeAt(7)) + _parseHexDigit(hex.charCodeAt(8));
					return new Color(new RGBA(r, g, b, a / 255));
				}

				if (length === 4) {
					// #RGB format
					const r = _parseHexDigit(hex.charCodeAt(1));
					const g = _parseHexDigit(hex.charCodeAt(2));
					const b = _parseHexDigit(hex.charCodeAt(3));
					return new Color(new RGBA(16 * r + r, 16 * g + g, 16 * b + b));
				}

				if (length === 5) {
					// #RGBA format
					const r = _parseHexDigit(hex.charCodeAt(1));
					const g = _parseHexDigit(hex.charCodeAt(2));
					const b = _parseHexDigit(hex.charCodeAt(3));
					const a = _parseHexDigit(hex.charCodeAt(4));
					return new Color(new RGBA(16 * r + r, 16 * g + g, 16 * b + b, (16 * a + a) / 255));
				}

				// Invalid color
				return null;
			}

			function _parseHexDigit(charCode: CharCode): number {
				switch (charCode) {
					case CharCode.Digit0: return 0;
					case CharCode.Digit1: return 1;
					case CharCode.Digit2: return 2;
					case CharCode.Digit3: return 3;
					case CharCode.Digit4: return 4;
					case CharCode.Digit5: return 5;
					case CharCode.Digit6: return 6;
					case CharCode.Digit7: return 7;
					case CharCode.Digit8: return 8;
					case CharCode.Digit9: return 9;
					case CharCode.a: return 10;
					case CharCode.A: return 10;
					case CharCode.b: return 11;
					case CharCode.B: return 11;
					case CharCode.c: return 12;
					case CharCode.C: return 12;
					case CharCode.d: return 13;
					case CharCode.D: return 13;
					case CharCode.e: return 14;
					case CharCode.E: return 14;
					case CharCode.f: return 15;
					case CharCode.F: return 15;
				}
				return 0;
			}
		}
	}
}
