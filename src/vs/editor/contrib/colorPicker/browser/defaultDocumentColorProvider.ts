/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, HSLA, RGBA } from 'vs/base/common/color';
import { FindMatch, ITextModel } from 'vs/editor/common/model';
import { DocumentColorProvider, IColor, IColorInformation, IColorPresentation, ProviderResult } from 'vs/editor/common/languages';

export class DefaultDocumentColorProvider implements DocumentColorProvider {

	constructor() { }

	private _parseCaptureGroups(captureGroups: string[]) {
		const values = [];
		for (const captureGroup of captureGroups) {
			const parsedNumber = Number(captureGroup);
			if (parsedNumber || parsedNumber === 0 && captureGroup.replace(/\s/g, '') !== '') {
				values.push(parsedNumber);
			}
		}
		return values;
	}

	private _toIColor(r: number, g: number, b: number, a: number): IColor {
		return {
			red: r / 255,
			blue: b / 255,
			green: g / 255,
			alpha: a
		};
	}

	private _findRGBColorInformation(matches: FindMatch[], isAlpha: boolean, _model: ITextModel) {
		const result: IColorInformation[] = [];
		for (const match of matches) {
			const range = match.range;
			const captureGroups = match.matches;
			if (!range || !captureGroups) {
				continue;
			}
			const parsedRegex = this._parseCaptureGroups(captureGroups);
			result.push({
				range: range,
				color: this._toIColor(parsedRegex[0], parsedRegex[1], parsedRegex[2], isAlpha ? parsedRegex[3] : 1)
			});
		}
		return result;
	}

	private _findHexColorInformation(matches: FindMatch[], _model: ITextModel) {
		const result: IColorInformation[] = [];
		for (const match of matches) {
			const range = match.range;
			const captureGroups = match.matches;
			if (!range || !captureGroups) {
				continue;
			}
			const parsedHexColor = Color.Format.CSS.parseHex(captureGroups[0]);
			if (!parsedHexColor) {
				continue;
			}
			result.push({
				range: range,
				color: this._toIColor(parsedHexColor.rgba.r, parsedHexColor.rgba.g, parsedHexColor.rgba.b, parsedHexColor.rgba.a)
			});
		}
		return result;
	}

	private _findHSLColorInformation(matches: FindMatch[], isAlpha: boolean, _model: ITextModel) {
		const result: IColorInformation[] = [];
		for (const match of matches) {
			const range = match.range;
			const captureGroups = match.matches;
			if (!range || !captureGroups) {
				continue;
			}
			const parsedRegex = this._parseCaptureGroups(captureGroups);
			const colorEquivalent = new Color(new HSLA(parsedRegex[0], parsedRegex[1] / 100, parsedRegex[2] / 100, isAlpha ? parsedRegex[3] : 1));
			result.push({
				range: range,
				color: this._toIColor(colorEquivalent.rgba.r, colorEquivalent.rgba.g, colorEquivalent.rgba.b, colorEquivalent.rgba.a)
			});
		}
		return result;
	}

	private _findMatches(model: ITextModel, regex: string): FindMatch[] {
		return model.findMatches(regex, false, true, false, null, true);
	}

	provideDocumentColors(model: ITextModel, _token: CancellationToken): ProviderResult<IColorInformation[]> {

		let result: IColorInformation[] = [];

		// RGB and RGBA
		const rgbaRegex = `rgba[(](\\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\s*),(\\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\s*),(\\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\s*),(\\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\\s*)[)]`;
		const rgbRegex = `rgb[(](\\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\s*),(\\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\s*),(\\s*)([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])(\\s*)[)]`;
		const rgbaMatches = this._findMatches(model, rgbaRegex);
		const rgbMatches = this._findMatches(model, rgbRegex);
		result = result.concat(this._findRGBColorInformation(rgbaMatches, true, model));
		result = result.concat(this._findRGBColorInformation(rgbMatches, false, model));

		// HEX and HEXA
		const hexaRegex = `#([A-Fa-f0-9]{8}(?![A-Fa-f0-9]))`;
		const hexRegex = `#([A-Fa-f0-9]{6}(?![A-Fa-f0-9]))`;
		const hexaMatches = this._findMatches(model, hexaRegex);
		const hexMatches = this._findMatches(model, hexRegex);
		result = result.concat(this._findHexColorInformation(hexaMatches, model));
		result = result.concat(this._findHexColorInformation(hexMatches, model));

		// HSL and HSLA
		const hslaRegex = `hsla[(](\\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\\s*),(\\s*)(100|\\d{1,2}|\\d{1,2}[.]\\d*)%(\\s*),(\\s*)(100|\\d{1,2}|\\d{1,2}[.]\\d*)%(\\s*),(\\s*)([01][.]|[01]|[.][0-9]+|[0][.][0-9]*)(\\s*)[)]`;
		const hslRegex = `hsl[(](\\s*)(36[0]|3[0-5][0-9]|[12][0-9][0-9]|[1-9]?[0-9])(\\s*),(\\s*)(100|\\d{1,2}|\\d{1,2}[.]\\d*)%(\\s*),(\\s*)(100|\\d{1,2}|\\d{1,2}[.]\\d*)%(\\s*)[)]`;
		const hslaMatches = this._findMatches(model, hslaRegex);
		const hslMatches = this._findMatches(model, hslRegex);
		result = result.concat(this._findHSLColorInformation(hslaMatches, true, model));
		result = result.concat(this._findHSLColorInformation(hslMatches, false, model));

		return result;
	}

	provideColorPresentations(_model: ITextModel, colorInfo: IColorInformation, _token: CancellationToken): ProviderResult<IColorPresentation[]> {

		const range = colorInfo.range;
		const colorFromInfo: IColor = colorInfo.color;
		const alpha = colorFromInfo.alpha;
		const color = new Color(new RGBA(Math.round(255 * colorFromInfo.red), Math.round(255 * colorFromInfo.green), Math.round(255 * colorFromInfo.blue), alpha));

		const rgb = alpha ? Color.Format.CSS.formatRGB(color) : Color.Format.CSS.formatRGBA(color);
		const hsl = alpha ? Color.Format.CSS.formatHSL(color) : Color.Format.CSS.formatHSLA(color);
		const hex = alpha ? Color.Format.CSS.formatHex(color) : Color.Format.CSS.formatHexA(color);

		const colorPresentations: IColorPresentation[] = [];
		colorPresentations.push({ label: rgb, textEdit: { range: range, text: rgb } });
		colorPresentations.push({ label: hsl, textEdit: { range: range, text: hsl } });
		colorPresentations.push({ label: hex, textEdit: { range: range, text: hex } });
		return colorPresentations;
	}
}

