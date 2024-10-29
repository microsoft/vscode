/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { IActiveCodeEditor } from '../../../browser/editorBrowser.js';
import { ISingleEditOperation } from '../../../common/core/editOperation.js';
import { DocumentColorProvider, IColorInformation } from '../../../common/languages.js';
import { ITextModel, TrackedRangeStickiness } from '../../../common/model.js';
import { getColorPresentations } from './color.js';
import { ColorPickerModel } from './colorPickerModel.js';
import { Range } from '../../../common/core/range.js';

export interface BaseColor {
	readonly range: Range;
	readonly model: ColorPickerModel;
	readonly provider: DocumentColorProvider;
}

export async function createColorHover(editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<BaseColor> {
	const originalText = editorModel.getValueInRange(colorInfo.range);
	const { red, green, blue, alpha } = colorInfo.color;
	const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
	const color = new Color(rgba);

	const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
	const model = new ColorPickerModel(color, [], 0);
	model.colorPresentations = colorPresentations || [];
	model.guessColorPresentation(color, originalText);

	return {
		range: Range.lift(colorInfo.range),
		model,
		provider
	};
}

export function updateEditorModel(editor: IActiveCodeEditor, range: Range, model: ColorPickerModel): Range {
	const textEdits: ISingleEditOperation[] = [];
	const edit = model.presentation.textEdit ?? { range, text: model.presentation.label, forceMoveMarkers: false };
	textEdits.push(edit);

	if (model.presentation.additionalTextEdits) {
		textEdits.push(...model.presentation.additionalTextEdits);
	}
	const replaceRange = Range.lift(edit.range);
	const trackedRange = editor.getModel()._setTrackedRange(null, replaceRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
	editor.executeEdits('colorpicker', textEdits);
	editor.pushUndoStop();
	return editor.getModel()._getTrackedRange(trackedRange) ?? replaceRange;
}

export async function updateColorPresentations(editorModel: ITextModel, colorPickerModel: ColorPickerModel, color: Color, range: Range, colorHover: BaseColor): Promise<void> {
	const colorPresentations = await getColorPresentations(editorModel, {
		range: range,
		color: {
			red: color.rgba.r / 255,
			green: color.rgba.g / 255,
			blue: color.rgba.b / 255,
			alpha: color.rgba.a
		}
	}, colorHover.provider, CancellationToken.None);
	colorPickerModel.colorPresentations = colorPresentations || [];
}
