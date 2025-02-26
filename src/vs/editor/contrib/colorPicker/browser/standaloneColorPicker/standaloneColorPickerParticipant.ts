/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Color } from '../../../../../base/common/color.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../../browser/editorBrowser.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { DocumentColorProvider, IColorInformation } from '../../../../common/languages.js';
import { IEditorHoverRenderContext } from '../../../hover/browser/hoverTypes.js';
import { getColors } from '../color.js';
import { ColorDetector } from '../colorDetector.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { BaseColor, ColorPickerWidgetType, createColorHover, updateColorPresentations, updateEditorModel } from '../colorPickerParticipantUtils.js';
import { ColorPickerWidget } from '../colorPickerWidget.js';
import { Range } from '../../../../common/core/range.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Dimension } from '../../../../../base/browser/dom.js';

export class StandaloneColorPickerHover implements BaseColor {
	constructor(
		public readonly owner: StandaloneColorPickerParticipant,
		public readonly range: Range,
		public readonly model: ColorPickerModel,
		public readonly provider: DocumentColorProvider
	) { }

	public static fromBaseColor(owner: StandaloneColorPickerParticipant, color: BaseColor) {
		return new StandaloneColorPickerHover(owner, color.range, color.model, color.provider);
	}
}

export class StandaloneColorPickerRenderedParts extends Disposable {

	public color: Color;

	public colorPicker: ColorPickerWidget;

	constructor(editor: IActiveCodeEditor, context: IEditorHoverRenderContext, colorHover: StandaloneColorPickerHover, themeService: IThemeService) {
		super();
		const editorModel = editor.getModel();
		const colorPickerModel = colorHover.model;

		this.color = colorHover.model.color;
		this.colorPicker = this._register(new ColorPickerWidget(
			context.fragment,
			colorPickerModel,
			editor.getOption(EditorOption.pixelRatio),
			themeService,
			ColorPickerWidgetType.Standalone
		));

		this._register(colorPickerModel.onColorFlushed((color: Color) => {
			this.color = color;
		}));
		this._register(colorPickerModel.onDidChangeColor((color: Color) => {
			updateColorPresentations(editorModel, colorPickerModel, color, colorHover.range, colorHover);
		}));
		let editorUpdatedByColorPicker = false;
		this._register(editor.onDidChangeModelContent((e) => {
			if (editorUpdatedByColorPicker) {
				editorUpdatedByColorPicker = false;
			} else {
				context.hide();
				editor.focus();
			}
		}));
		updateColorPresentations(editorModel, colorPickerModel, this.color, colorHover.range, colorHover);
	}
}

export class StandaloneColorPickerParticipant {

	public readonly hoverOrdinal: number = 2;
	private _renderedParts: StandaloneColorPickerRenderedParts | undefined;

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
		const colorHover = StandaloneColorPickerHover.fromBaseColor(this, await createColorHover(this._editor.getModel(), colorInfo, colorProvider));
		return { colorHover, foundInEditor };
	}

	public async updateEditorModel(colorHoverData: StandaloneColorPickerHover): Promise<void> {
		if (!this._editor.hasModel()) {
			return;
		}
		const colorPickerModel = colorHoverData.model;
		let range = new Range(colorHoverData.range.startLineNumber, colorHoverData.range.startColumn, colorHoverData.range.endLineNumber, colorHoverData.range.endColumn);
		if (this._color) {
			await updateColorPresentations(this._editor.getModel(), colorPickerModel, this._color, range, colorHoverData);
			range = updateEditorModel(this._editor, range, colorPickerModel);
		}
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: StandaloneColorPickerHover[]): StandaloneColorPickerRenderedParts | undefined {
		if (hoverParts.length === 0 || !this._editor.hasModel()) {
			return undefined;
		}
		this._setMinimumDimensions(context);
		this._renderedParts = new StandaloneColorPickerRenderedParts(this._editor, context, hoverParts[0], this._themeService);
		return this._renderedParts;
	}

	private _setMinimumDimensions(context: IEditorHoverRenderContext): void {
		const minimumHeight = this._editor.getOption(EditorOption.lineHeight) + 8;
		context.setMinimumDimensions(new Dimension(302, minimumHeight));
	}

	private get _color(): Color | undefined {
		return this._renderedParts?.color;
	}
}
