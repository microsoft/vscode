/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Color, HSLA } from '../../../base/common/color.js';
import { IPosition } from '../core/position.js';
import { IRange } from '../core/range.js';
import { IColor, IColorInformation } from '../languages.js';

// Matches oklab(L a b) / oklab(L a b / alpha) and oklch(L C H) / oklch(L C H / alpha).
// Lightness accepts percentage or unitless number; components accept signed decimals with
// optional percentage; hue optionally carries a `deg` suffix. Matching is intentionally
// lenient on spacing — the value is handed to Color.Format.CSS.parseOK* for strict parsing.
const OKLAB_OR_OKLCH_REGEX = /\b(oklab|oklch)\(\s*[+-]?(?:\d+\.?\d*|\.\d+)%?\s+[+-]?(?:\d+\.?\d*|\.\d+)%?\s+[+-]?(?:\d+\.?\d*|\.\d+)(?:deg)?\s*(?:\/\s*[+-]?(?:\d+\.?\d*|\.\d+)%?\s*)?\)/gi;

export interface IDocumentColorComputerTarget {
	getValue(): string;
	positionAt(offset: number): IPosition;
	findMatches(regex: RegExp): RegExpMatchArray[];
}

function _parseCaptureGroups(captureGroups: IterableIterator<string>) {
	const values = [];
	for (const captureGroup of captureGroups) {
		const parsedNumber = Number(captureGroup);
		if (parsedNumber || parsedNumber === 0 && captureGroup.replace(/\s/g, '') !== '') {
			values.push(parsedNumber);
		}
	}
	return values;
}

function _toIColor(r: number, g: number, b: number, a: number): IColor {
	return {
		red: r / 255,
		blue: b / 255,
		green: g / 255,
		alpha: a
	};
}

function _findRange(model: IDocumentColorComputerTarget, match: RegExpMatchArray): IRange | undefined {
	const index = match.index;
	const length = match[0].length;
	if (index === undefined) {
		return;
	}
	const startPosition = model.positionAt(index);
	const range: IRange = {
		startLineNumber: startPosition.lineNumber,
		startColumn: startPosition.column,
		endLineNumber: startPosition.lineNumber,
		endColumn: startPosition.column + length
	};
	return range;
}

function _findHexColorInformation(range: IRange | undefined, hexValue: string) {
	if (!range) {
		return;
	}
	const parsedHexColor = Color.Format.CSS.parseHex(hexValue);
	if (!parsedHexColor) {
		return;
	}
	return {
		range: range,
		color: _toIColor(parsedHexColor.rgba.r, parsedHexColor.rgba.g, parsedHexColor.rgba.b, parsedHexColor.rgba.a)
	};
}

function _findRGBColorInformation(range: IRange | undefined, matches: RegExpMatchArray[], isAlpha: boolean) {
	if (!range || matches.length !== 1) {
		return;
	}
	const match = matches[0];
	const captureGroups = match.values();
	const parsedRegex = _parseCaptureGroups(captureGroups);
	return {
		range: range,
		color: _toIColor(parsedRegex[0], parsedRegex[1], parsedRegex[2], isAlpha ? parsedRegex[3] : 1)
	};
}

function _findHSLColorInformation(range: IRange | undefined, matches: RegExpMatchArray[], isAlpha: boolean) {
	if (!range || matches.length !== 1) {
		return;
	}
	const match = matches[0];
	const captureGroups = match.values();
	const parsedRegex = _parseCaptureGroups(captureGroups);
	const colorEquivalent = new Color(new HSLA(parsedRegex[0], parsedRegex[1] / 100, parsedRegex[2] / 100, isAlpha ? parsedRegex[3] : 1));
	return {
		range: range,
		color: _toIColor(colorEquivalent.rgba.r, colorEquivalent.rgba.g, colorEquivalent.rgba.b, colorEquivalent.rgba.a)
	};
}

function _findOKColorInformation(range: IRange | undefined, css: string, scheme: 'oklab' | 'oklch') {
	if (!range) {
		return;
	}
	const parsed = scheme === 'oklab' ? Color.Format.CSS.parseOKLab(css) : Color.Format.CSS.parseOKLCh(css);
	if (!parsed) {
		return;
	}
	return {
		range: range,
		color: _toIColor(parsed.rgba.r, parsed.rgba.g, parsed.rgba.b, parsed.rgba.a)
	};
}

function _findMatches(model: IDocumentColorComputerTarget | string, regex: RegExp): RegExpMatchArray[] {
	if (typeof model === 'string') {
		return [...model.matchAll(regex)];
	} else {
		return model.findMatches(regex);
	}
}

function computeColors(model: IDocumentColorComputerTarget): IColorInformation[] {
	const result: IColorInformation[] = [];
	// Early validation for RGB and HSL (including CSS Level 4 syntax with / separator)
	const initialValidationRegex = /\b(rgb|rgba|hsl|hsla)(\([0-9\s,.\%\/]*\))|^(#)([A-Fa-f0-9]{3})\b|^(#)([A-Fa-f0-9]{4})\b|^(#)([A-Fa-f0-9]{6})\b|^(#)([A-Fa-f0-9]{8})\b|(?<=['"\s])(#)([A-Fa-f0-9]{3})\b|(?<=['"\s])(#)([A-Fa-f0-9]{4})\b|(?<=['"\s])(#)([A-Fa-f0-9]{6})\b|(?<=['"\s])(#)([A-Fa-f0-9]{8})\b/gm;
	const initialValidationMatches = _findMatches(model, initialValidationRegex);

	// Potential colors have been found, validate the parameters
	if (initialValidationMatches.length > 0) {
		for (const initialMatch of initialValidationMatches) {
			const initialCaptureGroups = initialMatch.filter(captureGroup => captureGroup !== undefined);
			const colorScheme = initialCaptureGroups[1];
			const colorParameters = initialCaptureGroups[2];
			if (!colorParameters) {
				continue;
			}
			let colorInformation;
			if (colorScheme === 'rgb') {
				// Supports both comma-separated (rgb(255, 0, 0)) and CSS Level 4 space-separated syntax (rgb(255 0 0))
				const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*\)$/gm;
				colorInformation = _findRGBColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
			} else if (colorScheme === 'rgba') {
				// Supports both comma-separated (rgba(255, 0, 0, 0.5)) and CSS Level 4 syntax (rgba(255 0 0 / 0.5))
				const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*[\s,]\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*(?:[\s,]|[\s]*\/)\s*(0[.][0-9]+|[.][0-9]+|[01][.]|[01])\s*\)$/gm;
				colorInformation = _findRGBColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
			} else if (colorScheme === 'hsl') {
				const regexParameters = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*\)$/gm;
				colorInformation = _findHSLColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
			} else if (colorScheme === 'hsla') {
				// Supports both comma-separated (hsla(253, 100%, 50%, 0.5)) and CSS Level 4 syntax (hsla(253 100% 50% / 0.5))
				const regexParameters = /^\(\s*((?:360(?:\.0+)?|(?:36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(?:\.\d+)?))\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*[\s,]\s*(100(?:\.0+)?|\d{1,2}[.]\d*|\d{1,2})%\s*(?:[\s,]|[\s]*\/)\s*(0[.][0-9]+|[.][0-9]+|[01][.]0*|[01])\s*\)$/gm;
				colorInformation = _findHSLColorInformation(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
			} else if (colorScheme === '#') {
				colorInformation = _findHexColorInformation(_findRange(model, initialMatch), colorScheme + colorParameters);
			}
			if (colorInformation) {
				result.push(colorInformation);
			}
		}
	}

	// Detect CSS Color Level 4 oklab() / oklch() separately — their grammar differs
	// enough from legacy rgb/hsl that piggy-backing on the validation regex above would
	// hurt readability. Parsing the whole function string via Color.Format.CSS keeps
	// this cheap and in sync with the serializer used for the color picker cycle.
	const okMatches = _findMatches(model, OKLAB_OR_OKLCH_REGEX);
	for (const match of okMatches) {
		const css = match[0];
		const scheme = (match[1] || '').toLowerCase() as 'oklab' | 'oklch';
		const colorInformation = _findOKColorInformation(_findRange(model, match), css, scheme);
		if (colorInformation) {
			result.push(colorInformation);
		}
	}

	return result;
}

/**
 * Returns an array of all default document colors in the provided document
 */
export function computeDefaultDocumentColors(model: IDocumentColorComputerTarget): IColorInformation[] {
	if (!model || typeof model.getValue !== 'function' || typeof model.positionAt !== 'function') {
		// Unknown caller!
		return [];
	}
	return computeColors(model);
}
