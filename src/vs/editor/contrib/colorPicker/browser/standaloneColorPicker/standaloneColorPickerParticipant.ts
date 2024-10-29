/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Color } from '../../../../../base/common/color.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { DocumentColorProvider, IColorInformation } from '../../../../common/languages.js';
import { IEditorHoverRenderContext } from '../../../hover/browser/hoverTypes.js';
import { getColors } from '../color.js';
import { ColorDetector } from '../colorDetector.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { BaseColor, createColorHover, updateColorPresentations, updateEditorModel } from '../colorPickerParticipantUtils.js';
import { ColorPickerWidget } from '../hoverColorPicker/hoverColorPickerWidget.js';
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

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: StandaloneColorPickerHover[]): { disposables: IDisposable; hoverPart: StandaloneColorPickerHover; colorPicker: ColorPickerWidget } | undefined {
		if (hoverParts.length === 0 || !this._editor.hasModel()) {
			return undefined;
		}
		if (context.setMinimumDimensions) {
			const minimumHeight = this._editor.getOption(EditorOption.lineHeight) + 8;
			context.setMinimumDimensions(new Dimension(302, minimumHeight));
		}

		const disposables = new DisposableStore();
		const colorHover = hoverParts[0];
		const editorModel = this._editor.getModel();
		const model = colorHover.model;
		const colorPicker = disposables.add(new ColorPickerWidget(context.fragment, model, this._editor.getOption(EditorOption.pixelRatio), this._themeService, true));

		let editorUpdatedByColorPicker = false;
		const range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);
		const color = colorHover.model.color;
		this._color = color;
		updateColorPresentations(editorModel, model, color, range, colorHover);
		disposables.add(model.onColorFlushed((color: Color) => {
			this._color = color;
		}));
		disposables.add(model.onDidChangeColor((color: Color) => {
			updateColorPresentations(editorModel, model, color, range, colorHover);
		}));
		disposables.add(this._editor.onDidChangeModelContent((e) => {
			if (editorUpdatedByColorPicker) {
				editorUpdatedByColorPicker = false;
			} else {
				context.hide();
				this._editor.focus();
			}
		}));
		return { hoverPart: colorHover, colorPicker, disposables };
	}
}
