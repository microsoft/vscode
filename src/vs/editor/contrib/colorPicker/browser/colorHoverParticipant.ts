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
import { getColorPresentations, getColors } from 'vs/editor/contrib/colorPicker/browser/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/browser/colorPickerModel';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { Dimension } from 'vs/base/browser/dom';

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

	public computeSync(_anchor: HoverAnchor, _lineDecorations: IModelDecoration[]): ColorHover[] {
		return [];
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<ColorHover> {
		return AsyncIterableObject.fromPromise(this._computeAsync(anchor, lineDecorations, token));
	}

	private async _computeAsync(_anchor: HoverAnchor, lineDecorations: IModelDecoration[], _token: CancellationToken): Promise<ColorHover[]> {
		if (!this._editor.hasModel()) {
			return [];
		}
		const colorDetector = ColorDetector.get(this._editor);
		if (!colorDetector) {
			return [];
		}
		for (const d of lineDecorations) {
			if (!colorDetector.isColorDecoration(d)) {
				continue;
			}

			const colorData = colorDetector.getColorData(d.range.getStartPosition());
			if (colorData) {
				const colorHover = await _createColorHover(this, this._editor.getModel(), colorData.colorInfo, colorData.provider);
				return [colorHover];
			}

		}
		return [];
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IDisposable {
		return renderHoverParts(this, this._editor, this._themeService, hoverParts, context);
	}
}

export class StandaloneColorPickerHover {
	constructor(
		public readonly owner: StandaloneColorPickerParticipant,
		public readonly range: Range,
		public readonly model: ColorPickerModel,
		public readonly provider: DocumentColorProvider
	) { }
}

export class StandaloneColorPickerParticipant {

	public readonly hoverOrdinal: number = 2;
	private _color: Color | null = null;

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public async createColorHover(defaultColorInfo: IColorInformation, defaultColorProvider: DocumentColorProvider, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>): Promise<{ colorHover: StandaloneColorPickerHover; foundInEditor: boolean } | null> {
		if (!this._editor.hasModel()) {
			return null;
		}
		const colorDetector = ColorDetector.get(this._editor);
		if (!colorDetector) {
			return null;
		}
		const colors = await getColors(colorProviderRegistry, this._editor.getModel(), CancellationToken.None);
		let foundColorInfo: IColorInformation | null = null;
		let foundColorProvider: DocumentColorProvider | null = null;
		for (const colorData of colors) {
			const colorInfo = colorData.colorInfo;
			if (Range.containsRange(colorInfo.range, defaultColorInfo.range)) {
				foundColorInfo = colorInfo;
				foundColorProvider = colorData.provider;
			}
		}
		const colorInfo = foundColorInfo ?? defaultColorInfo;
		const colorProvider = foundColorProvider ?? defaultColorProvider;
		const foundInEditor = !!foundColorInfo;
		return { colorHover: await _createColorHover(this, this._editor.getModel(), colorInfo, colorProvider), foundInEditor: foundInEditor };
	}

	public async updateEditorModel(colorHoverData: StandaloneColorPickerHover): Promise<void> {
		if (!this._editor.hasModel()) {
			return;
		}
		const colorPickerModel = colorHoverData.model;
		let range = new Range(colorHoverData.range.startLineNumber, colorHoverData.range.startColumn, colorHoverData.range.endLineNumber, colorHoverData.range.endColumn);
		if (this._color) {
			await _updateColorPresentations(this._editor.getModel(), colorPickerModel, this._color, range, colorHoverData);
			range = _updateEditorModel(this._editor, range, colorPickerModel);
		}
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[] | StandaloneColorPickerHover[]): IDisposable {
		return renderHoverParts(this, this._editor, this._themeService, hoverParts, context);
	}

	public set color(color: Color | null) {
		this._color = color;
	}

	public get color(): Color | null {
		return this._color;
	}
}

async function _createColorHover<T extends ColorHoverParticipant | StandaloneColorPickerParticipant>(participant: T, editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<T extends ColorHoverParticipant ? ColorHover : StandaloneColorPickerHover>;
async function _createColorHover(participant: ColorHoverParticipant | StandaloneColorPickerParticipant, editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<ColorHover | StandaloneColorPickerHover> {
	const originalText = editorModel.getValueInRange(colorInfo.range);
	const { red, green, blue, alpha } = colorInfo.color;
	const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
	const color = new Color(rgba);

	const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
	const model = new ColorPickerModel(color, [], 0);
	model.colorPresentations = colorPresentations || [];
	model.guessColorPresentation(color, originalText);

	if (participant instanceof ColorHoverParticipant) {
		return new ColorHover(participant, Range.lift(colorInfo.range), model, provider);
	} else {
		return new StandaloneColorPickerHover(participant, Range.lift(colorInfo.range), model, provider);
	}
}

function renderHoverParts(participant: ColorHoverParticipant | StandaloneColorPickerParticipant, editor: ICodeEditor, themeService: IThemeService, hoverParts: ColorHover[] | StandaloneColorPickerHover[], context: IEditorHoverRenderContext) {
	if (hoverParts.length === 0 || !editor.hasModel()) {
		return Disposable.None;
	}
	if (context.setMinimumDimensions) {
		const minimumHeight = editor.getOption(EditorOption.lineHeight) + 8;
		context.setMinimumDimensions(new Dimension(302, minimumHeight));
	}

	const disposables = new DisposableStore();
	const colorHover = hoverParts[0];
	const editorModel = editor.getModel();
	const model = colorHover.model;
	const widget = disposables.add(new ColorPickerWidget(context.fragment, model, editor.getOption(EditorOption.pixelRatio), themeService, participant instanceof StandaloneColorPickerParticipant));
	context.setColorPicker(widget);

	let editorUpdatedByColorPicker = false;
	let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);
	if (participant instanceof StandaloneColorPickerParticipant) {
		const color = hoverParts[0].model.color;
		participant.color = color;
		_updateColorPresentations(editorModel, model, color, range, colorHover);
		disposables.add(model.onColorFlushed((color: Color) => {
			participant.color = color;
		}));
	} else {
		disposables.add(model.onColorFlushed(async (color: Color) => {
			await _updateColorPresentations(editorModel, model, color, range, colorHover);
			editorUpdatedByColorPicker = true;
			range = _updateEditorModel(editor, range, model, context);
		}));
	}
	disposables.add(model.onDidChangeColor((color: Color) => {
		_updateColorPresentations(editorModel, model, color, range, colorHover);
	}));
	disposables.add(editor.onDidChangeModelContent((e) => {
		if (editorUpdatedByColorPicker) {
			editorUpdatedByColorPicker = false;
		} else {
			context.hide();
			editor.focus();
		}
	}));
	return disposables;
}

function _updateEditorModel(editor: ICodeEditor, range: Range, model: ColorPickerModel, context?: IEditorHoverRenderContext) {
	let textEdits: ISingleEditOperation[];
	let newRange: Range;
	if (model.presentation.textEdit) {
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
		if (context) {
			context.hide();
		}
	}
	editor.pushUndoStop();
	return newRange;
}

async function _updateColorPresentations(editorModel: ITextModel, colorPickerModel: ColorPickerModel, color: Color, range: Range, colorHover: ColorHover | StandaloneColorPickerHover) {
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
