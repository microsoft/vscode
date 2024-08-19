/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration, ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';
import { DocumentColorProvider, IColorInformation } from 'vs/editor/common/languages';
import { getColorPresentations, getColors } from 'vs/editor/contrib/colorPicker/browser/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/browser/colorPickerModel';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { Dimension } from 'vs/base/browser/dom';
import * as nls from 'vs/nls';

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

	private _colorPicker: ColorPickerWidget | undefined;

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

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IRenderedHoverParts<ColorHover> {
		const renderedPart = renderHoverParts(this, this._editor, this._themeService, hoverParts, context);
		if (!renderedPart) {
			return new RenderedHoverParts([]);
		}
		this._colorPicker = renderedPart.colorPicker;
		const renderedHoverPart: IRenderedHoverPart<ColorHover> = {
			hoverPart: renderedPart.hoverPart,
			hoverElement: this._colorPicker.domNode,
			dispose() { renderedPart.disposables.dispose(); }
		};
		return new RenderedHoverParts([renderedHoverPart]);
	}

	public getAccessibleContent(hoverPart: ColorHover): string {
		return nls.localize('hoverAccessibilityColorParticipant', 'There is a color picker here.');
	}

	public handleResize(): void {
		this._colorPicker?.layout();
	}

	public isColorPickerVisible(): boolean {
		return !!this._colorPicker;
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

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: StandaloneColorPickerHover[]): { disposables: IDisposable; hoverPart: StandaloneColorPickerHover; colorPicker: ColorPickerWidget } | undefined {
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

function renderHoverParts<T extends (ColorHover | StandaloneColorPickerHover)>(participant: ColorHoverParticipant | StandaloneColorPickerParticipant, editor: ICodeEditor, themeService: IThemeService, hoverParts: T[], context: IEditorHoverRenderContext): { hoverPart: T; colorPicker: ColorPickerWidget; disposables: DisposableStore } | undefined {
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
		_updateColorPresentations(editorModel, model, color, range, colorHover);
		disposables.add(model.onColorFlushed((color: Color) => {
			participant.color = color;
		}));
	} else {
		disposables.add(model.onColorFlushed(async (color: Color) => {
			await _updateColorPresentations(editorModel, model, color, range, colorHover);
			editorUpdatedByColorPicker = true;
			range = _updateEditorModel(editor, range, model);
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
	return { hoverPart: colorHover, colorPicker, disposables };
}

function _updateEditorModel(editor: IActiveCodeEditor, range: Range, model: ColorPickerModel): Range {
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
