/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, HSLA } from 'vs/base/common/color';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { IColor, IColorInformation } from 'vs/editor/common/languages';

interface IDocumentColorComputerTarget {
	getValue(): string;
	positionAt(offset: number): IPosition;
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
	if (!index) {
		return;
	}
	const startPosition = model.positionAt(index);
	const endPosition = model.positionAt(index + length);
	const range: IRange = {
		startLineNumber: startPosition.lineNumber,
		startColumn: startPosition.column,
		endLineNumber: endPosition.lineNumber,
		endColumn: endPosition.column
	};
	return range;
}

function _findHexColorInformation(model: IDocumentColorComputerTarget, matches: RegExpMatchArray[]) {
	const result: IColorInformation[] = [];
	for (const match of matches) {
		const range = _findRange(model, match);
		const captureGroups = match.values();
		if (!range) {
			continue;
		}
		const parsedHexColor = Color.Format.CSS.parseHex(captureGroups.next().value);
		if (!parsedHexColor) {
			continue;
		}
		result.push({
			range: range,
			color: _toIColor(parsedHexColor.rgba.r, parsedHexColor.rgba.g, parsedHexColor.rgba.b, parsedHexColor.rgba.a)
		});
	}
	return result;
}

function _findRGBColorInformationFromParameters(range: IRange | undefined, matches: RegExpMatchArray[], isAlpha: boolean) {
	if (!range || matches.length !== 1) {
		return;
	}
	const match = matches.at(0)!;
	const captureGroups = match.values();
	const parsedRegex = _parseCaptureGroups(captureGroups);
	return {
		range: range,
		color: _toIColor(parsedRegex[0], parsedRegex[1], parsedRegex[2], isAlpha ? parsedRegex[3] : 1)
	};
}

function _findHSLColorInformationFromParameters(range: IRange | undefined, matches: RegExpMatchArray[], isAlpha: boolean) {
	if (!range || matches.length !== 1) {
		return;
	}
	const match = matches.at(0)!;
	const captureGroups = match.values();
	const parsedRegex = _parseCaptureGroups(captureGroups);
	const colorEquivalent = new Color(new HSLA(parsedRegex[0], parsedRegex[1] / 100, parsedRegex[2] / 100, isAlpha ? parsedRegex[3] : 1));
	return {
		range: range,
		color: _toIColor(colorEquivalent.rgba.r, colorEquivalent.rgba.g, colorEquivalent.rgba.b, colorEquivalent.rgba.a)
	};
}

function _findMatches(model: IDocumentColorComputerTarget | string, regex: RegExp): RegExpMatchArray[] {
	if (typeof model === 'string') {
		return [...model.matchAll(regex)];
	} else {
		return [...model.getValue().matchAll(regex)];
	}

}

function computeColors(model: IDocumentColorComputerTarget): IColorInformation[] {
	let result: IColorInformation[] = [];

	// HEX and HEXA
	const hexaRegex = /#([A-Fa-f0-9]{8}(?![A-Fa-f0-9]))/gm;
	const hexRegex = /#([A-Fa-f0-9]{6}(?![A-Fa-f0-9]))/gm;
	result = result.concat(_findHexColorInformation(model, _findMatches(model, hexaRegex)));
	result = result.concat(_findHexColorInformation(model, _findMatches(model, hexRegex)));

	// Early validation for RGB and HSL
	const initialValidationRegex = /(rgb|rgba|hsl|hsla)(\([0-9\s,.\%]*\))/gm;
	const initialValidationMatches = _findMatches(model, initialValidationRegex);

	// Potential colors have been found, validate the parameters
	if (initialValidationMatches.length > 0) {
		for (const initialMatch of initialValidationMatches) {
			const colorScheme = initialMatch.at(1);
			const colorParameters = initialMatch.at(2);
			if (!colorParameters) {
				continue;
			}
			let colorInformation;
			if (colorScheme === 'rgb') {
				const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*\)$/gm;
				colorInformation = _findRGBColorInformationFromParameters(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
			} else if (colorScheme === 'rgba') {
				const regexParameters = /^\(\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\s*,\s*(0[.][0-9]+|[.][0-9]+|[01][.]|[01])\s*\)$/gm;
				colorInformation = _findRGBColorInformationFromParameters(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
			} else if (colorScheme === 'hsl') {
				const regexParameters = /^\(\s*(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])\s*,\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*,\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*\)$/gm;
				colorInformation = _findHSLColorInformationFromParameters(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), false);
			} else if (colorScheme === 'hsla') {
				const regexParameters = /^\(\s*(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])\s*,\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*,\s*(100|\d{1,2}[.]\d*|\d{1,2})%\s*,\s*(0[.][0-9]+|[.][0-9]+|[01][.]|[01])\s*\)$/gm;
				colorInformation = _findHSLColorInformationFromParameters(_findRange(model, initialMatch), _findMatches(colorParameters, regexParameters), true);
			}
			if (colorInformation) {
				result.push(colorInformation);
			}
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
	const colorInformation = computeColors(model);
	return colorInformation;
}
