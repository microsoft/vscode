/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { IActiveCodeEditor } from '../../../browser/editorBrowser.js';
import { ISingleEditOperation } from '../../../common/core/editOperation.js';
import { DocumentColorProvider, IColorInformation } from '../../../common/languages.js';
import { TrackedRangeStickiness } from '../../../common/model.js';
import { getColorPresentations } from './color.js';
import { ColorPickerModel } from './colorPickerModel.js';
import { IRange, Range } from '../../../common/core/range.js';
import { EditorOption } from '../../../common/config/editorOptions.js';

export const enum ColorPickerWidgetType {
	Hover = 'hover',
	Standalone = 'standalone'
}

export interface BaseColor {
	readonly range: Range;
	readonly model: ColorPickerModel;
	readonly provider: DocumentColorProvider;
}

export async function createColorHover(editor: IActiveCodeEditor, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<BaseColor> {
	const editorModel = editor.getModel();
	const originalText = editorModel.getValueInRange(colorInfo.range);
	const { red, green, blue, alpha } = colorInfo.color;
	const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
	const color = new Color(rgba);

	const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None, editor.getOption(EditorOption.colorPickerUseModernSyntax));
	const model = new ColorPickerModel(color, [], 0);
	model.colorPresentations = colorPresentations || [];
	model.guessColorPresentation(color, originalText);

	return {
		range: Range.lift(colorInfo.range),
		model,
		provider
	};
}

export function updateEditorModel(editor: IActiveCodeEditor, range: Range, model: ColorPickerModel, insertionRanges?: IRange[]): Range {
	const textEdits: ISingleEditOperation[] = [];
	const edit = model.presentation.textEdit ?? { range, text: model.presentation.label, forceMoveMarkers: false };

	if (model.presentation.additionalTextEdits) {
		textEdits.push(...model.presentation.additionalTextEdits);
	}
	const replaceRange = Range.lift(edit.range);
	const trackedRange = editor.getModel()._setTrackedRange(null, replaceRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
	if (insertionRanges) {
		textEdits.push(...insertionRanges.map(insertionRange => ({ range: insertionRange, text: edit.text, forceMoveMarkers: false })));
	} else {
		textEdits.push(edit);
	}
	editor.executeEdits('colorpicker', textEdits);
	editor.pushUndoStop();
	return editor.getModel()._getTrackedRange(trackedRange) ?? replaceRange;
}

export async function updateColorPresentations(editor: IActiveCodeEditor, colorPickerModel: ColorPickerModel, color: Color, range: Range, colorHover: BaseColor): Promise<void> {
	const colorPresentations = await getColorPresentations(editor.getModel(), {
		range: range,
		color: {
			red: color.rgba.r / 255,
			green: color.rgba.g / 255,
			blue: color.rgba.b / 255,
			alpha: color.rgba.a
		}
	}, colorHover.provider, CancellationToken.None, editor.getOption(EditorOption.colorPickerUseModernSyntax));
	colorPickerModel.colorPresentations = colorPresentations || [];
}
