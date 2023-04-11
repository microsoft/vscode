/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { IRange } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { DocumentColorProvider, IColor, IColorInformation, IColorPresentation, ProviderResult } from 'vs/editor/common/languages';

// TODO: clean the code, make it correct
// TODO: clean the code so that the header is the corerct size when using the standalone color picker widget
// TODO: make the standalone color picker widget bigger by default, so that the hsla can fit inside of the color header
// TODO: Look into the CSS extension for how to use HSL values

export class DefaultDocumentColorProviderForStandaloneColorPicker implements DocumentColorProvider {

	constructor() { }

	private _findRange(model: ITextModel, match: RegExpMatchArray): IRange | undefined {
		const index = match.index;
		const length = match[0].length;
		if (!index) {
			return;
		}
		const startPosition = model.getPositionAt(index);
		const endPosition = model.getPositionAt(index + length);
		const range: IRange = {
			startLineNumber: startPosition.lineNumber,
			startColumn: startPosition.column,
			endLineNumber: endPosition.lineNumber,
			endColumn: endPosition.column
		};
		return range;
	}

	private _findRGBColorInformation(matches: RegExpMatchArray[], isAlpha: boolean, model: ITextModel) {
		const result: IColorInformation[] = [];
		for (const match of matches) {
			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}
			const regexNumbers = [];
			for (const captureGroup of match) {
				const parsedNumber = Number(captureGroup);
				if (parsedNumber) {
					regexNumbers.push(parsedNumber);
				} else if (captureGroup === '0') {
					regexNumbers.push(0);
				}
			}
			const red = regexNumbers[0] / 255;
			const green = regexNumbers[1] / 255;
			const blue = regexNumbers[2] / 255;
			const alpha = isAlpha ? regexNumbers[3] : 1;
			const color: IColor = {
				red: red,
				blue: blue,
				green: green,
				alpha: alpha
			};
			const colorInformation = {
				range: range,
				color: color
			};
			result.push(colorInformation);
		}
		return result;
	}

	private _findHexColorInformation(matches: RegExpMatchArray[], model: ITextModel) {
		const result: IColorInformation[] = [];
		for (const match of matches) {
			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}
			const hexValue = match.at(0);
			if (!hexValue) {
				return [];
			}
			const parsedHexColor = Color.Format.CSS.parseHex(hexValue);
			if (!parsedHexColor) {
				return [];
			}
			const parsedHexIColor = {
				red: parsedHexColor.rgba.r / 255,
				green: parsedHexColor.rgba.g / 255,
				blue: parsedHexColor.rgba.b / 255,
				alpha: parsedHexColor.rgba.a
			};
			const colorInformation = {
				range: range,
				color: parsedHexIColor
			};
			result.push(colorInformation);
		}
		return result;
	}

	private _findHSLColorInformation(matches: RegExpMatchArray[], isAlpha: boolean, model: ITextModel) {
		const result: IColorInformation[] = [];
		for (const match of matches) {
			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}
			const regexNumbers = [];
			for (const element of match) {
				const parsedNumber = Number(element);
				if (parsedNumber) {
					regexNumbers.push(parsedNumber);
				} else if (element === '0') {
					regexNumbers.push(0);
				}
			}
			const h = regexNumbers[0];
			const s = regexNumbers[1];
			const l = regexNumbers[2];
			const alpha = isAlpha ? regexNumbers[3] : 1;

			const normalizedS = s / 100;
			const normalizedL = l / 100;
			const normalizedH = h / 60;

			const c = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS;
			const x = c * (1 - Math.abs(normalizedH % 2 - 1));

			let intermediaryResult;
			if (normalizedH >= 0 && normalizedH < 1) {
				intermediaryResult = [c, x, 0];
			} else if (normalizedH >= 1 && normalizedH < 2) {
				intermediaryResult = [x, c, 0];
			} else if (normalizedH >= 2 && normalizedH < 3) {
				intermediaryResult = [0, c, x];
			} else if (normalizedH >= 3 && normalizedH < 4) {
				intermediaryResult = [0, x, c];
			} else if (normalizedH >= 4 && normalizedH < 5) {
				intermediaryResult = [x, 0, c];
			} else if (normalizedH >= 5 && normalizedH <= 6) {
				intermediaryResult = [c, 0, x];
			} else {
				throw new Error('Invalid HSLA value');
			}

			const m = normalizedL - c / 2;
			const parsedHslaValue = {
				red: intermediaryResult[0] + m,
				green: intermediaryResult[1] + m,
				blue: intermediaryResult[2] + m,
				alpha: alpha
			};
			const colorInformation = {
				range: range,
				color: parsedHslaValue
			};
			result.push(colorInformation);
		}
		return result;
	}

	provideDocumentColors(model: ITextModel, token: CancellationToken): ProviderResult<IColorInformation[]> {

		let result: IColorInformation[] = [];

		// TODO: Following does not work?
		const initialRgbaRegex = `/rgba[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm`;
		const matches = model.findMatches(initialRgbaRegex, false, true, false, null, true);
		console.log('matches : ', matches);

		const text = model.getLinesContent().join('\n');

		// RGB and RGBA
		const rgbaRegex = /rgba[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
		const rgbRegex = /rgb[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*)[)]/gm;
		const rgbaMatches = [...text.matchAll(rgbaRegex)];
		const rgbMatches = [...text.matchAll(rgbRegex)];

		const rgbaColorInformation = this._findRGBColorInformation(rgbaMatches, true, model);
		result = result.concat(rgbaColorInformation);

		const rgbColorInformation = this._findRGBColorInformation(rgbMatches, false, model);
		result = result.concat(rgbColorInformation);

		// HEX and HEXA
		const hexaRegex = /#([A-Fa-f0-9]{8}(?![A-Fa-f0-9]))/gm;
		const hexRegex = /#([A-Fa-f0-9]{6}(?![A-Fa-f0-9]))/gm;
		const hexaMatches = [...text.matchAll(hexaRegex)];
		const hexMatches = [...text.matchAll(hexRegex)];

		const hexaColorInformation = this._findHexColorInformation(hexaMatches, model);
		result = result.concat(hexaColorInformation);
		const hexColorInformation = this._findHexColorInformation(hexMatches, model);
		result = result.concat(hexColorInformation);

		// HSL and HSLA
		const hslaRegex = /hsla[(](\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
		const hslRegex = /hsl[(](\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*)[)]/gm;
		const hslaMatches = [...text.matchAll(hslaRegex)];
		const hslMatches = [...text.matchAll(hslRegex)];

		const hslaColorInformation = this._findHSLColorInformation(hslaMatches, true, model);
		result = result.concat(hslaColorInformation);
		const hslColorInformation = this._findHSLColorInformation(hslMatches, false, model);
		result = result.concat(hslColorInformation);

		return result;
	}

	provideColorPresentations(model: ITextModel, colorInfo: IColorInformation, _token: CancellationToken): ProviderResult<IColorPresentation[]> {

		const range = colorInfo.range;
		const colorFromInfo: IColor = colorInfo.color;
		const alpha = colorFromInfo.alpha;
		const color = new Color(new RGBA(Math.round(255 * colorFromInfo.red), Math.round(255 * colorFromInfo.green), Math.round(255 * colorFromInfo.blue), alpha));

		const isAlpha = alpha === 1;
		const rgb = isAlpha ? Color.Format.CSS.formatRGB(color) : Color.Format.CSS.formatRGBA(color);
		const hsl = isAlpha ? Color.Format.CSS.formatHSL(color) : Color.Format.CSS.formatHSLA(color);
		const hex = isAlpha ? Color.Format.CSS.formatHex(color) : Color.Format.CSS.formatHexA(color);

		const colorPresentations: IColorPresentation[] = [];
		colorPresentations.push({ label: rgb, textEdit: { range: range, text: rgb } });
		colorPresentations.push({ label: hsl, textEdit: { range: range, text: hsl } });
		colorPresentations.push({ label: hex, textEdit: { range: range, text: hex } });
		return colorPresentations;
	}
}

