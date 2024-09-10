/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Color } from '../../../../../base/common/color.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { LanguageFeatureRegistry } from '../../../../common/languageFeatureRegistry.js';
import { DocumentColorProvider, IColorInformation } from '../../../../common/languages.js';
import { IEditorHoverRenderContext } from '../../../hover/browser/hoverTypes.js';
import { getColors } from '../color.js';
import { ColorDetector } from '../colorDetector.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { createColorHover, renderHoverParts, updateColorPresentations, updateEditorModel } from '../colorPickerParticipantUtils.js';
import { ColorPickerWidget } from '../hoverColorPicker/hoverColorPickerWidget.js';
import { Range } from '../../../../common/core/range.js';

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
		return { colorHover: await createColorHover(this, this._editor.getModel(), colorInfo, colorProvider), foundInEditor: foundInEditor };
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
		return renderHoverParts(this, this._editor, this._themeService, hoverParts, context);
	}

	public set color(color: Color | null) {
		this._color = color;
	}

	public get color(): Color | null {
		return this._color;
	}
}
