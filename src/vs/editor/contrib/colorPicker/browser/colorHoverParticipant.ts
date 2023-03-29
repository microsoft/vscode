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
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { DocumentColorProvider, IColorInformation } from 'vs/editor/common/languages';
import { getColorPresentations } from 'vs/editor/contrib/colorPicker/browser/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/browser/colorPickerModel';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';

export class ColorHover implements IHoverPart {

	/**
	 * Force the hover to always be rendered at this specific range,
	 * even in the case of multiple hover parts.
	 */
	public readonly forceShowAtRange: boolean = true;

	constructor(
		public readonly owner: IEditorHoverParticipant<ColorHover>,
		public readonly range: Range,
		public readonly model: ColorPickerModel,
		public readonly provider: DocumentColorProvider
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

export class ColorHoverParticipant implements IEditorHoverParticipant<ColorHover> {

	public readonly hoverOrdinal: number = 2;
	private _range: Range | null = null;
	private _color: Color | null = null;
	private _standaloneColorPickerWidget: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): ColorHover[] {
		console.log('inside of computeSync of the ColorHoverParticipant.ts');
		return [];
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<ColorHover> {
		console.log('inside of computeAsync of the ColorHoverParticipant.ts');
		return AsyncIterableObject.fromPromise(this._computeAsync(anchor, lineDecorations, token));
	}

	private async _computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): Promise<ColorHover[]> {
		console.log('inside of _computeAsync of the ColorHoverParticipant.ts');
		console.log('lineDecorations : ', lineDecorations);
		if (!this._editor.hasModel()) {
			return [];
		}
		const colorDetector = ColorDetector.get(this._editor);
		console.log('colorDetector : ', colorDetector);
		if (!colorDetector) {
			return [];
		}
		for (const d of lineDecorations) {
			if (!colorDetector.isColorDecoration(d)) {
				continue;
			}

			const colorData = colorDetector.getColorData(d.range.getStartPosition());
			console.log('colorData : ', colorData);
			if (colorData) {
				const colorHover = await this._createColorHover(this._editor.getModel(), colorData.colorInfo, colorData.provider);
				return [colorHover];
			}

		}
		return [];
	}

	public async createColorHover(colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<ColorHover | null> {
		if (!this._editor.hasModel()) {
			return null;
		}
		return await this._createColorHover(this._editor.getModel(), colorInfo, provider);
	}

	private async _createColorHover(editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<ColorHover> {
		console.log('inside of _createColorHover of the ColorHoverParticipant.ts');
		console.log('colorInfo : ', colorInfo);
		console.log('provider : ', provider);
		const originalText = editorModel.getValueInRange(colorInfo.range);
		const { red, green, blue, alpha } = colorInfo.color;
		const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
		const color = new Color(rgba);
		console.log('Before getColorPresentations');
		const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
		const model = new ColorPickerModel(color, [], 0);
		model.colorPresentations = colorPresentations || [];
		model.guessColorPresentation(color, originalText);

		return new ColorHover(this, Range.lift(colorInfo.range), model, provider);
	}

	public set range(range: Range) {
		this._range = range;
	}

	public set standaloneColorPickerWidget(value: boolean) {
		this._standaloneColorPickerWidget = value;
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IDisposable {
		console.log('Inside of rendeHoverParts of the ColorHoverParticipant.ts');

		if (hoverParts.length === 0 || !this._editor.hasModel()) {
			return Disposable.None;
		}

		const disposables = new DisposableStore();
		const colorHover = hoverParts[0];
		const editorModel = this._editor.getModel();
		const model = colorHover.model;

		console.log('model : ', model);
		console.log('context.fragment : ', context.fragment);

		const widget = disposables.add(new ColorPickerWidget(context.fragment, model, this._editor.getOption(EditorOption.pixelRatio), this._themeService, this._standaloneColorPickerWidget));

		console.log('before setting the color picker');
		let clientHeight = widget.body.domNode.clientHeight;
		let clientWidth = widget.body.domNode.clientWidth;
		console.log('clientHeight : ', clientHeight);
		console.log('clientWidth : ', clientWidth);

		context.setColorPicker(widget);

		console.log('after setting the color picker');
		clientHeight = widget.body.domNode.clientHeight;
		clientWidth = widget.body.domNode.clientWidth;
		console.log('clientHeight : ', clientHeight);
		console.log('clientWidth : ', clientWidth);

		let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);

		const updateEditorModel = () => {
			console.log('inside of update editor model');
			let textEdits: ISingleEditOperation[];
			let newRange: Range;
			if (model.presentation.textEdit) {
				if (this._range) {
					model.presentation.textEdit.range = this._range;
				}
				console.log('inside of the first if loop');
				textEdits = [model.presentation.textEdit];
				console.log('textEdits : ', textEdits);

				newRange = new Range(
					model.presentation.textEdit.range.startLineNumber,
					model.presentation.textEdit.range.startColumn,
					model.presentation.textEdit.range.endLineNumber,
					model.presentation.textEdit.range.endColumn
				);
				console.log('newRange : ', newRange);
				const trackedRange = this._editor.getModel()!._setTrackedRange(null, newRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
				this._editor.pushUndoStop();
				this._editor.executeEdits('colorpicker', textEdits);
				newRange = this._editor.getModel()!._getTrackedRange(trackedRange) || newRange;
			} else {
				console.log('inside of second if loop');
				textEdits = [{ range, text: model.presentation.label, forceMoveMarkers: false }];
				newRange = range.setEndPosition(range.endLineNumber, range.startColumn + model.presentation.label.length);
				this._editor.pushUndoStop();
				this._editor.executeEdits('colorpicker', textEdits);
			}

			if (model.presentation.additionalTextEdits) {
				console.log('inside of third if loop');
				textEdits = [...model.presentation.additionalTextEdits];
				this._editor.executeEdits('colorpicker', textEdits);
				context.hide();
			}
			this._editor.pushUndoStop();
			range = newRange;
		};

		const updateColorPresentations = (color: Color) => {
			console.log('inside of update color presentations of the renderHoverParts');
			return getColorPresentations(editorModel, {
				range: range,
				color: {
					red: color.rgba.r / 255,
					green: color.rgba.g / 255,
					blue: color.rgba.b / 255,
					alpha: color.rgba.a
				}
			}, colorHover.provider, CancellationToken.None).then((colorPresentations) => {
				console.log('colorPresentations : ', colorPresentations);
				model.colorPresentations = colorPresentations || [];
			});
		};

		if (this._standaloneColorPickerWidget) {
			console.log('inside of the second if loop of the renderHoverParts, should be called once when the initial rendering is done');
			// set an initial color to avoid the color picker to be empty
			const color: Color = new Color(new RGBA(0, 0, 0, 1));
			updateColorPresentations(color);
			this._color = color;
		}

		disposables.add(model.onColorFlushed((color: Color) => {
			// Call update editor model only when the enter key is pressed
			if (!this._standaloneColorPickerWidget) {
				updateColorPresentations(color).then(updateEditorModel);
			}
			this._color = color;
		}));
		disposables.add(model.onDidChangeColor(updateColorPresentations));

		console.log('before returning the disposables');
		clientHeight = widget.body.domNode.clientHeight;
		clientWidth = widget.body.domNode.clientWidth;
		console.log('clientHeight : ', clientHeight);
		console.log('clientWidth : ', clientWidth);

		return disposables;
	}

	public updateEditorModel(hoverParts: ColorHover[]): void {

		console.log('inside of update editor model wrapper');
		if (!this._editor.hasModel()) {
			return;
		}

		const colorHover = hoverParts[0];
		const editorModel = this._editor.getModel();
		const model = colorHover.model;
		let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);

		const updateEditorModel = () => {
			console.log('inside of update editor model');
			let textEdits: ISingleEditOperation[];
			let newRange: Range;
			if (model.presentation.textEdit) {
				if (this._range) {
					model.presentation.textEdit.range = this._range;
				}
				console.log('inside of the first if loop');
				textEdits = [model.presentation.textEdit];
				console.log('textEdits : ', textEdits);

				newRange = new Range(
					model.presentation.textEdit.range.startLineNumber,
					model.presentation.textEdit.range.startColumn,
					model.presentation.textEdit.range.endLineNumber,
					model.presentation.textEdit.range.endColumn
				);
				console.log('newRange : ', newRange);
				const trackedRange = this._editor.getModel()!._setTrackedRange(null, newRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
				this._editor.pushUndoStop();
				this._editor.executeEdits('colorpicker', textEdits);
				newRange = this._editor.getModel()!._getTrackedRange(trackedRange) || newRange;
			} else {
				console.log('inside of second if loop');
				textEdits = [{ range, text: model.presentation.label, forceMoveMarkers: false }];
				newRange = range.setEndPosition(range.endLineNumber, range.startColumn + model.presentation.label.length);
				this._editor.pushUndoStop();
				this._editor.executeEdits('colorpicker', textEdits);
			}

			if (model.presentation.additionalTextEdits) {
				console.log('inside of third if loop');
				textEdits = [...model.presentation.additionalTextEdits];
				this._editor.executeEdits('colorpicker', textEdits);
			}
			this._editor.pushUndoStop();
			range = newRange;
		};

		const updateColorPresentations = (color: Color) => {
			console.log('inside of update color presentations');
			return getColorPresentations(editorModel, {
				range: range,
				color: {
					red: color.rgba.r / 255,
					green: color.rgba.g / 255,
					blue: color.rgba.b / 255,
					alpha: color.rgba.a
				}
			}, colorHover.provider, CancellationToken.None).then((colorPresentations) => {
				console.log('colorPresentations : ', colorPresentations);
				model.colorPresentations = colorPresentations || [];
			});
		};

		if (this._color) {
			updateColorPresentations(this._color).then(updateEditorModel);
		}
	}
}
