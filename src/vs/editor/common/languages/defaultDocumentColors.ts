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

function _findRGBColorInformation(model: IDocumentColorComputerTarget, matches: RegExpMatchArray[], isAlpha: boolean) {
	const result: IColorInformation[] = [];
	for (const match of matches) {
		const range = _findRange(model, match);
		const captureGroups = match.values();
		if (!range || !captureGroups) {
			continue;
		}
		const parsedRegex = _parseCaptureGroups(captureGroups);
		result.push({
			range: range,
			color: _toIColor(parsedRegex[0], parsedRegex[1], parsedRegex[2], isAlpha ? parsedRegex[3] : 1)
		});
	}
	return result;
}

function _findHexColorInformation(model: IDocumentColorComputerTarget, matches: RegExpMatchArray[]) {
	const result: IColorInformation[] = [];
	for (const match of matches) {
		const range = _findRange(model, match);
		const captureGroups = match.values();
		if (!range || !captureGroups) {
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

function _findHSLColorInformation(model: IDocumentColorComputerTarget, matches: RegExpMatchArray[], isAlpha: boolean) {
	const result: IColorInformation[] = [];
	for (const match of matches) {
		const range = _findRange(model, match);
		const captureGroups = match.values();
		if (!range || !captureGroups) {
			continue;
		}
		const parsedRegex = _parseCaptureGroups(captureGroups);
		const colorEquivalent = new Color(new HSLA(parsedRegex[0], parsedRegex[1] / 100, parsedRegex[2] / 100, isAlpha ? parsedRegex[3] : 1));
		result.push({
			range: range,
			color: _toIColor(colorEquivalent.rgba.r, colorEquivalent.rgba.g, colorEquivalent.rgba.b, colorEquivalent.rgba.a)
		});
	}
	return result;
}

function _findMatches(model: IDocumentColorComputerTarget, regex: RegExp): RegExpMatchArray[] {
	return [...model.getValue().matchAll(regex)];
}

function computeColors(model: IDocumentColorComputerTarget): IColorInformation[] {
	let result: IColorInformation[] = [];

	// RGB and RGBA
	const rgbaRegex = /rgba[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
	const rgbRegex = /rgb[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*)[)]/gm;
	const rgbaMatches = _findMatches(model, rgbaRegex);
	const rgbMatches = _findMatches(model, rgbRegex);
	result = result.concat(_findRGBColorInformation(model, rgbaMatches, true));
	result = result.concat(_findRGBColorInformation(model, rgbMatches, false));

	// HEX and HEXA
	const hexaRegex = /#([A-Fa-f0-9]{8}(?![A-Fa-f0-9]))/gm;
	const hexRegex = /#([A-Fa-f0-9]{6}(?![A-Fa-f0-9]))/gm;
	const hexaMatches = _findMatches(model, hexaRegex);
	const hexMatches = _findMatches(model, hexRegex);
	result = result.concat(_findHexColorInformation(model, hexaMatches));
	result = result.concat(_findHexColorInformation(model, hexMatches));

	// HSL and HSLA
	const hslaRegex = /hsla[(](\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
	const hslRegex = /hsl[(](\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*)[)]/gm;
	const hslaMatches = _findMatches(model, hslaRegex);
	const hslMatches = _findMatches(model, hslRegex);
	result = result.concat(_findHSLColorInformation(model, hslaMatches, true));
	result = result.concat(_findHSLColorInformation(model, hslMatches, false));

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
