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
import { Position } from 'vs/editor/common/core/position';

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

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): ColorHover[] {
		return [];
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<ColorHover> {
		return AsyncIterableObject.fromPromise(this._computeAsync(anchor, lineDecorations, token));
	}

	private async _computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): Promise<ColorHover[]> {
		return _computeAsync(this, this._editor, lineDecorations);
	}

	public async createColorHover(colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<{ colorHover: ColorHover; foundInMap: boolean } | null> {
		return createColorHover(this, this._editor, colorInfo, provider);
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IDisposable {
		return renderHoverParts(this, this._themeService, hoverParts, context, this._editor);
	}
}

export class StandaloneColorPickerParticipant implements IEditorHoverParticipant<ColorHover> {

	public readonly hoverOrdinal: number = 2;
	private _range: Range | null = null;
	private _color: Color | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): ColorHover[] {
		return [];
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<ColorHover> {
		return AsyncIterableObject.fromPromise(this._computeAsync(anchor, lineDecorations, token));
	}

	private async _computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): Promise<ColorHover[]> {
		return _computeAsync(this, this._editor, lineDecorations);
	}

	public async createColorHover(colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<{ colorHover: ColorHover; foundInMap: boolean } | null> {
		return createColorHover(this, this._editor, colorInfo, provider);
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IDisposable {
		return renderHoverParts(this, this._themeService, hoverParts, context, this._editor);
	}

	public updateEditorModel(colorHoverData: ColorHover[]): void {
		updateEditorModel(this, colorHoverData, this._editor);
	}

	public set range(range: Range | null) {
		this._range = range;
	}

	public get range(): Range | null {
		return this._range;
	}

	public set color(color: Color | null) {
		this._color = color;
	}

	public get color(): Color | null {
		return this._color;
	}
}

async function _computeAsync(owner: IEditorHoverParticipant<ColorHover>, editor: ICodeEditor, lineDecorations: IModelDecoration[]) {
	if (!editor.hasModel()) {
		return [];
	}
	const colorDetector = ColorDetector.get(editor);
	if (!colorDetector) {
		return [];
	}
	for (const d of lineDecorations) {
		if (!colorDetector.isColorDecoration(d)) {
			continue;
		}
		const colorData = colorDetector.getColorData(d.range.getStartPosition());
		if (colorData) {
			const colorHover = await _createColorHover(owner, editor.getModel(), colorData.colorInfo, colorData.provider);
			return [colorHover];
		}
	}
	return [];
}

async function createColorHover(owner: IEditorHoverParticipant<ColorHover>, editor: ICodeEditor, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<{ colorHover: ColorHover; foundInMap: boolean } | null> {
	if (!editor.hasModel()) {
		return null;
	}
	const colorDetector = ColorDetector.get(editor);
	if (!colorDetector) {
		return null;
	}
	let finalColorInfo = colorInfo;
	const colorDetectorData = colorDetector.getColorData(new Position(colorInfo.range.startLineNumber, colorInfo.range.startColumn));

	let foundInMap = false;
	if (colorDetectorData) {
		foundInMap = true;
		finalColorInfo = colorDetectorData.colorInfo;
	}

	const colorHover = await _createColorHover(owner, editor.getModel(), finalColorInfo, provider);
	return { colorHover: colorHover, foundInMap: foundInMap };
}

async function _createColorHover(owner: IEditorHoverParticipant<ColorHover>, editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider) {
	const originalText = editorModel.getValueInRange(colorInfo.range);
	const { red, green, blue, alpha } = colorInfo.color;
	const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
	const color = new Color(rgba);
	const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
	const model = new ColorPickerModel(color, [], 0);
	model.colorPresentations = colorPresentations || [];
	model.guessColorPresentation(color, originalText);
	return new ColorHover(owner, Range.lift(colorInfo.range), model, provider);
}

function renderHoverParts(owner: ColorHoverParticipant | StandaloneColorPickerParticipant, themeService: IThemeService, hoverParts: ColorHover[], context: IEditorHoverRenderContext, editor: ICodeEditor) {
	if (hoverParts.length === 0 || !editor.hasModel()) {
		return Disposable.None;
	}

	const disposables = new DisposableStore();
	const colorHover = hoverParts[0];
	const editorModel = editor.getModel();
	const model = colorHover.model;
	const widget = disposables.add(new ColorPickerWidget(context.fragment, model, editor.getOption(EditorOption.pixelRatio), themeService, owner instanceof StandaloneColorPickerParticipant));
	context.setColorPicker(widget);

	let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);

	const updateEditorModel = () => {

		let textEdits: ISingleEditOperation[];
		let newRange: Range;

		if (model.presentation.textEdit) {
			if (owner instanceof StandaloneColorPickerParticipant && owner.range) {
				model.presentation.textEdit.range = owner.range;
			}
			textEdits = [model.presentation.textEdit];
			newRange = new Range(
				model.presentation.textEdit.range.startLineNumber,
				model.presentation.textEdit.range.startColumn,
				model.presentation.textEdit.range.endLineNumber,
				model.presentation.textEdit.range.endColumn
			);

			const trackedRange = editor.getModel()!._setTrackedRange(null, newRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
			editor.pushUndoStop();
			editor.executeEdits('colorpicker', textEdits);
			newRange = editor.getModel()!._getTrackedRange(trackedRange) || newRange;
		} else {
			textEdits = [{ range, text: model.presentation.label, forceMoveMarkers: false }];
			newRange = range.setEndPosition(range.endLineNumber, range.startColumn + model.presentation.label.length);
			editor.pushUndoStop();
			editor.executeEdits('colorpicker', textEdits);
		}

		if (model.presentation.additionalTextEdits) {
			textEdits = [...model.presentation.additionalTextEdits];
			editor.executeEdits('colorpicker', textEdits);
			context.hide();
		}
		editor.pushUndoStop();
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

	if (owner instanceof StandaloneColorPickerParticipant) {
		const color = hoverParts[0].model.color;
		updateColorPresentations(color);
		owner.color = color;
		disposables.add(model.onColorFlushed((color: Color) => {
			owner.color = color;
		}));
	} else {
		disposables.add(model.onColorFlushed((color: Color) => {
			updateColorPresentations(color).then(updateEditorModel);
		}));
	}
	disposables.add(model.onDidChangeColor(updateColorPresentations));
	return disposables;
}

function updateEditorModel(owner: ColorHoverParticipant | StandaloneColorPickerParticipant, colorHoverData: ColorHover[], editor: ICodeEditor): void {
	if (!editor.hasModel()) {
		return;
	}

	const colorHover = colorHoverData[0];
	const editorModel = editor.getModel();
	const model = colorHover.model;
	let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);

	const updateEditorModel = () => {

		console.log('Inside of inner update editor model');

		let textEdits: ISingleEditOperation[];
		let newRange: Range;
		if (model.presentation.textEdit) {
			if (owner instanceof StandaloneColorPickerParticipant && owner.range) {
				model.presentation.textEdit.range = owner.range;
			}
			textEdits = [model.presentation.textEdit];

			newRange = new Range(
				model.presentation.textEdit.range.startLineNumber,
				model.presentation.textEdit.range.startColumn,
				model.presentation.textEdit.range.endLineNumber,
				model.presentation.textEdit.range.endColumn
			);
			const trackedRange = editor.getModel()!._setTrackedRange(null, newRange, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
			editor.pushUndoStop();
			editor.executeEdits('colorpicker', textEdits);
			newRange = editor.getModel()!._getTrackedRange(trackedRange) || newRange;
		} else {
			textEdits = [{ range, text: model.presentation.label, forceMoveMarkers: false }];
			newRange = range.setEndPosition(range.endLineNumber, range.startColumn + model.presentation.label.length);
			editor.pushUndoStop();
			editor.executeEdits('colorpicker', textEdits);
		}
		if (model.presentation.additionalTextEdits) {
			textEdits = [...model.presentation.additionalTextEdits];
			editor.executeEdits('colorpicker', textEdits);
		}
		editor.pushUndoStop();
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

	if (owner instanceof StandaloneColorPickerParticipant && owner.color) {
		updateColorPresentations(owner.color).then(updateEditorModel);
	}
}
