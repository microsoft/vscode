/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { ISingleEditOperation } from '../../../common/core/editOperation.js';
import { DocumentColorProvider, IColorInformation } from '../../../common/languages.js';
import { ITextModel, TrackedRangeStickiness } from '../../../common/model.js';
import { getColorPresentations } from './color.js';
import { ColorHover, HoverColorPickerParticipant } from './hoverColorPicker/hoverColorPickerParticipant.js';
import { ColorPickerModel } from './colorPickerModel.js';
import { ColorPickerWidget } from './hoverColorPicker/hoverColorPickerWidget.js';
import { StandaloneColorPickerHover, StandaloneColorPickerParticipant } from './standaloneColorPicker/standaloneColorPickerParticipant.js';
import { Range } from '../../../common/core/range.js';
import { IEditorHoverRenderContext } from '../../hover/browser/hoverTypes.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';

export async function createColorHover<T extends HoverColorPickerParticipant | StandaloneColorPickerParticipant>(participant: T, editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<T extends HoverColorPickerParticipant ? ColorHover : StandaloneColorPickerHover>;
export async function createColorHover(participant: HoverColorPickerParticipant | StandaloneColorPickerParticipant, editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<ColorHover | StandaloneColorPickerHover> {
	const originalText = editorModel.getValueInRange(colorInfo.range);
	const { red, green, blue, alpha } = colorInfo.color;
	const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
	const color = new Color(rgba);

	const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
	const model = new ColorPickerModel(color, [], 0);
	model.colorPresentations = colorPresentations || [];
	model.guessColorPresentation(color, originalText);

	if (participant instanceof HoverColorPickerParticipant) {
		return new ColorHover(participant, Range.lift(colorInfo.range), model, provider);
	} else {
		return new StandaloneColorPickerHover(participant, Range.lift(colorInfo.range), model, provider);
	}
}

export function renderHoverParts<T extends (ColorHover | StandaloneColorPickerHover)>(participant: HoverColorPickerParticipant | StandaloneColorPickerParticipant, editor: ICodeEditor, themeService: IThemeService, hoverParts: T[], context: IEditorHoverRenderContext): { hoverPart: T; colorPicker: ColorPickerWidget; disposables: DisposableStore } | undefined {
	if (hoverParts.length === 0 || !editor.hasModel()) {
		return undefined;
	}
	if (context.setMinimumDimensions) {
		const minimumHeight = editor.getOption(EditorOption.lineHeight) + 8;
		context.setMinimumDimensions(new Dimension(302, minimumHeight));
	}

	const disposables = new DisposableStore();
	const colorHover = hoverParts[0];
	const editorModel = editor.getModel();
	const model = colorHover.model;
	const colorPicker = disposables.add(new ColorPickerWidget(context.fragment, model, editor.getOption(EditorOption.pixelRatio), themeService, participant instanceof StandaloneColorPickerParticipant));

	let editorUpdatedByColorPicker = false;
	let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);
	if (participant instanceof StandaloneColorPickerParticipant) {
		const color = colorHover.model.color;
		participant.color = color;
		updateColorPresentations(editorModel, model, color, range, colorHover);
		disposables.add(model.onColorFlushed((color: Color) => {
			participant.color = color;
		}));
	} else {
		disposables.add(model.onColorFlushed(async (color: Color) => {
			await updateColorPresentations(editorModel, model, color, range, colorHover);
			editorUpdatedByColorPicker = true;
			range = updateEditorModel(editor, range, model);
		}));
	}
	disposables.add(model.onDidChangeColor((color: Color) => {
		updateColorPresentations(editorModel, model, color, range, colorHover);
	}));
	disposables.add(editor.onDidChangeModelContent((e) => {
		if (editorUpdatedByColorPicker) {
			editorUpdatedByColorPicker = false;
		} else {
			context.hide();
			editor.focus();
		}
	}));
	return { hoverPart: colorHover, colorPicker, disposables };
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

export async function updateColorPresentations(editorModel: ITextModel, colorPickerModel: ColorPickerModel, color: Color, range: Range, colorHover: ColorHover | StandaloneColorPickerHover) {
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
