/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IModelDecoration, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { DocumentColorProvider, IColor, IColorInformation, IColorPresentation, ProviderResult } from 'vs/editor/common/languages';
import { getColorPresentations } from 'vs/editor/contrib/colorPicker/browser/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/browser/colorPickerModel';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';


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

	// TODO: Have a pop up which translates somewhow the RGBA to another format, on save, it adds another pannel
	// Then these are searched everywhere in the file and to provide the correct color presentations
	// Then you can also add a new color using the custom formatting, need a custom button for this however
	// TODO: Change the colors_data which is what I want to change in a difffernet way, directly in the code above
	provideDocumentColors(model: ITextModel, token: CancellationToken): ProviderResult<IColorInformation[]> {

		const result: IColorInformation[] = [];

		console.log('inside of provideDocumentColors of the DefaultDocumentColorProviderForStandaloneColorPicker');
		// Default are the custom CSS color formats
		// TODO: need to create an extension where this could be used otherwise it will not work
		const rgbaRegex = `/rgba[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm`;
		const matches = model.findMatches(rgbaRegex, false, true, false, null, true);
		console.log('matches : ', matches);

		// TODO: Not able to use the find Matches above with the regex below which works?

		/// RGBA done
		const allText = model.getLinesContent().join('\n');
		const rgbaRegexOther = /rgba[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
		const rgbRegexOther = /rgb[(](\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*),(\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\s*)[)]/gm;
		const rgbaMatches = [...allText.matchAll(rgbaRegexOther)];
		const rgbMatches = [...allText.matchAll(rgbRegexOther)];

		console.log('matchesOther : ', rgbaMatches);

		for (const match of rgbaMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}

			console.log('range : ', range);

			const finalNumbers = [];
			for (const element of match) {
				const parsedNumber = Number(element);
				if (parsedNumber) {
					finalNumbers.push(parsedNumber);
				}
			}
			console.log('finalNumbers : ', finalNumbers);

			const red = finalNumbers[0] / 255;
			const green = finalNumbers[1] / 255;
			const blue = finalNumbers[2] / 255;
			const alpha = finalNumbers[3];

			console.log('red : ', red);
			console.log('green : ', green);
			console.log('blue : ', blue);
			console.log('alpha : ', alpha);

			if (!(red && blue && green && alpha)) {
				return [];
			}
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

		for (const match of rgbMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}

			console.log('range : ', range);

			const finalNumbers = [];
			for (const element of match) {
				const parsedNumber = Number(element);
				if (parsedNumber) {
					finalNumbers.push(parsedNumber);
				}
			}
			console.log('finalNumbers : ', finalNumbers);

			const red = finalNumbers[0] / 255;
			const green = finalNumbers[1] / 255;
			const blue = finalNumbers[2] / 255;

			console.log('red : ', red);
			console.log('green : ', green);
			console.log('blue : ', blue);

			if (!(red && blue && green)) {
				return;
			}
			const color: IColor = {
				red: red,
				blue: blue,
				green: green,
				alpha: 1
			};
			const colorInformation = {
				range: range,
				color: color
			};
			result.push(colorInformation);
		}

		// HEXA
		console.log('Inside of Hexa');

		// Using a negative look ahead to make sure that the next character is not a hex digit
		const hexaRegex = /#([A-Fa-f0-9]{8}(?![A-Fa-f0-9]))/gm;
		const hexRegex = /#([A-Fa-f0-9]{6}(?![A-Fa-f0-9]))/gm;
		const hexaMatches = [...allText.matchAll(hexaRegex)];
		const hexMatches = [...allText.matchAll(hexRegex)];
		console.log('hexaMatches : ', hexaMatches);

		for (const match of hexaMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}

			console.log('range : ', range);

			const hexValue = match.at(0);

			console.log('hexValue : ', hexValue);

			if (!hexValue) {
				console.log('early return');
				return [];
			}

			const parsedHexColor = Color.Format.CSS.parseHex(hexValue);
			console.log('parsedHexColor : ', parsedHexColor);

			if (!parsedHexColor) {
				console.log('early return');
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

		for (const match of hexMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}

			console.log('range : ', range);

			const hexValue = match.at(0);

			console.log('hexValue : ', hexValue);

			if (!hexValue) {
				console.log('early return');
				return [];
			}

			const parsedHexColor = Color.Format.CSS.parseHex(hexValue);
			console.log('parsedHexColor : ', parsedHexColor);

			if (!parsedHexColor) {
				console.log('early return');
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

		// ------------
		const hslaRegex = /hsla[(](\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\s*)[)]/gm;
		const hslRegex = /hsl[(](\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*),(\s*)(100|\d{1,2}|\d{1,2}[.]\d*)%(\s*)[)]/gm;
		const hslaMatches = [...allText.matchAll(hslaRegex)];
		const hslMatches = [...allText.matchAll(hslRegex)];

		console.log('hslaMatches : ', hslaMatches);

		for (const match of hslaMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}

			console.log('range : ', range);

			const hslaValue = match.at(0);

			console.log('hslaValue : ', hslaValue);

			const finalNumbers = [];
			for (const element of match) {
				const parsedNumber = Number(element);
				if (parsedNumber) {
					finalNumbers.push(parsedNumber);
				}
			}

			const h = finalNumbers[0];
			const s = finalNumbers[1];
			const l = finalNumbers[2];
			const alpha = finalNumbers[3];

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

		for (const match of hslMatches) {

			console.log('match : ', match);

			const range = this._findRange(model, match);
			if (!range) {
				return [];
			}

			console.log('range : ', range);

			const hslaValue = match.at(0);

			console.log('hslaValue : ', hslaValue);

			const finalNumbers = [];
			for (const element of match) {
				const parsedNumber = Number(element);
				if (parsedNumber) {
					finalNumbers.push(parsedNumber);
				}
			}

			const h = finalNumbers[0];
			const s = finalNumbers[1];
			const l = finalNumbers[2];

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
				alpha: 1
			};

			const colorInformation = {
				range: range,
				color: parsedHslaValue
			};
			result.push(colorInformation);
		}

		console.log('result : ', result);
		return result;
	}

	provideColorPresentations(model: ITextModel, colorInfo: IColorInformation, token: CancellationToken): ProviderResult<IColorPresentation[]> {
		console.log('inside of provideColorPresentations of the DefaultDocumentColorProvider');
		console.log('colorInfo : ', colorInfo);

		const languageId = model.getLanguageId();
		console.log('languageId : ', languageId);
		// Using the CSS color format as the default
		// Allow the user to be able to define other custom color formats
		const range = colorInfo.range;
		const colorFromInfo: IColor = colorInfo.color;

		const alpha = colorFromInfo.alpha;
		const color = new Color(new RGBA(Math.round(255 * colorFromInfo.red), Math.round(255 * colorFromInfo.green), Math.round(255 * colorFromInfo.blue), alpha));

		let rgb;
		let hsl;
		let hex;

		// if alpha is 1, don't need to use the alpha channel
		if (alpha === 1) {
			rgb = Color.Format.CSS.formatRGB(color);
			hsl = Color.Format.CSS.formatHSL(color);
			hex = Color.Format.CSS.formatHex(color);
		}
		// otherwise need to use the alpha channel
		else {
			rgb = Color.Format.CSS.formatRGBA(color);
			hsl = Color.Format.CSS.formatHSLA(color);
			hex = Color.Format.CSS.formatHexA(color);
		}

		const colorPresentations: IColorPresentation[] = [];
		colorPresentations.push({ label: rgb, textEdit: { range: range, text: rgb } });
		colorPresentations.push({ label: hsl, textEdit: { range: range, text: hsl } });
		colorPresentations.push({ label: hex, textEdit: { range: range, text: hex } });
		return colorPresentations;
	}
}

