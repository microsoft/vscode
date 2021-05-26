/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IColorPresentation, DocumentColorProvider, IColor } from 'vs/editor/common/modes';
import { IIdentifiedSingleEditOperation, IModelDecoration, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IEditorHover, IEditorHoverParticipant, IHoverPart } from 'vs/editor/contrib/hover/modesContentHover';
import { CancellationToken } from 'vs/base/common/cancellation';
import { getColorPresentations } from 'vs/editor/contrib/colorPicker/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/colorDetector';
import { Color, RGBA } from 'vs/base/common/color';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/colorPickerModel';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/colorPickerWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class ColorHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<ColorHover>,
		public readonly range: Range,
		public readonly color: IColor,
		public readonly colorPresentations: IColorPresentation[],
		public readonly shouldUpdateColorPresentations: boolean,
		public readonly provider: DocumentColorProvider
	) { }

	equals(other: IHoverPart): boolean {
		return false;
	}
}

export class ColorHoverParticipant implements IEditorHoverParticipant<ColorHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public computeSync(hoverRange: Range, lineDecorations: IModelDecoration[]): ColorHover[] {
		return [];
	}

	public async computeAsync(range: Range, lineDecorations: IModelDecoration[], token: CancellationToken): Promise<ColorHover[]> {
		if (!this._editor.hasModel()) {
			return [];
		}
		const colorDetector = ColorDetector.get(this._editor);
		for (const d of lineDecorations) {
			const colorData = colorDetector.getColorData(d.range.getStartPosition());
			if (colorData) {
				const { color, range } = colorData.colorInfo;
				const colorHover = await this._createColorHover(this._editor.getModel(), Range.lift(range), color, colorData.provider);
				return [colorHover];
			}
		}
		return [];
	}

	private async _createColorHover(editorModel: ITextModel, range: Range, color: IColor, provider: DocumentColorProvider): Promise<ColorHover> {
		const colorInfo = { range: range, color: color };
		const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
		return new ColorHover(this, range, color, colorPresentations || [], false, provider);
	}

	public renderHoverParts(hoverParts: ColorHover[], fragment: DocumentFragment): IDisposable {
		if (hoverParts.length === 0 || !this._editor.hasModel()) {
			return Disposable.None;
		}

		const disposables = new DisposableStore();
		const colorHover = hoverParts[0];
		const editorModel = this._editor.getModel();

		const { red, green, blue, alpha } = colorHover.color;
		const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
		const color = new Color(rgba);

		let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);

		// create blank olor picker model and widget first to ensure it's positioned correctly.
		const model = new ColorPickerModel(color, [], 0);
		const widget = disposables.add(new ColorPickerWidget(fragment, model, this._editor.getOption(EditorOption.pixelRatio), this._themeService));

		model.colorPresentations = colorHover.colorPresentations || [];
		const originalText = editorModel.getValueInRange(colorHover.range);
		model.guessColorPresentation(color, originalText);

		const updateEditorModel = () => {
			let textEdits: IIdentifiedSingleEditOperation[];
			let newRange: Range;
			if (model.presentation.textEdit) {
				textEdits = [model.presentation.textEdit as IIdentifiedSingleEditOperation];
				newRange = new Range(
					model.presentation.textEdit.range.startLineNumber,
					model.presentation.textEdit.range.startColumn,
					model.presentation.textEdit.range.endLineNumber,
					model.presentation.textEdit.range.endColumn
				);
				const trackedRange = this._editor.getModel()!._setTrackedRange(null, newRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
				this._editor.pushUndoStop();
				this._editor.executeEdits('colorpicker', textEdits);
				newRange = this._editor.getModel()!._getTrackedRange(trackedRange) || newRange;
			} else {
				textEdits = [{ identifier: null, range, text: model.presentation.label, forceMoveMarkers: false }];
				newRange = range.setEndPosition(range.endLineNumber, range.startColumn + model.presentation.label.length);
				this._editor.pushUndoStop();
				this._editor.executeEdits('colorpicker', textEdits);
			}

			if (model.presentation.additionalTextEdits) {
				textEdits = [...model.presentation.additionalTextEdits as IIdentifiedSingleEditOperation[]];
				this._editor.executeEdits('colorpicker', textEdits);
				this._hover.hide();
			}
			this._editor.pushUndoStop();
			range = newRange;
		};

		const updateColorPresentations = (color: Color) => {
			return getColorPresentations(editorModel, {
				range: range,
				color: {
					red: color.rgba.r / 255,
					green: color.rgba.g / 255,
					blue: color.rgba.b / 255,
					alpha: color.rgba.a
				}
			}, colorHover.provider, CancellationToken.None).then((colorPresentations) => {
				model.colorPresentations = colorPresentations || [];
			});
		};

		disposables.add(model.onColorFlushed((color: Color) => {
			updateColorPresentations(color).then(updateEditorModel);
		}));
		disposables.add(model.onDidChangeColor(updateColorPresentations));

		if (colorHover.shouldUpdateColorPresentations) {
			updateColorPresentations(color);
		}

		this._hover.setColorPicker(widget);

		return disposables;
	}
}
