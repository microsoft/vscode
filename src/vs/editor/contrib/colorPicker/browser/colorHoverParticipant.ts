/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { IModelDecoration, ITextModel, TrackedRangeStickiness } from '../../../common/model.js';
import { DocumentColorProvider, IColorInformation } from '../../../common/languages.js';
import { getColorPresentations, getColors } from './color.js';
import { ColorDetector } from './colorDetector.js';
import { ColorPickerModel } from './colorPickerModel.js';
import { ColorPickerWidget } from './colorPickerWidget.js';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from '../../hover/browser/hoverTypes.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ISingleEditOperation } from '../../../common/core/editOperation.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { Dimension } from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';

export interface IColorHover {
	readonly range: Range;
	readonly model: ColorPickerModel;
	readonly provider: DocumentColorProvider;
}

export class ColorHover implements IHoverPart, IColorHover {

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

	public static from(owner: IEditorHoverParticipant<ColorHover>, colorHover: IColorHover): ColorHover {
		return new ColorHover(owner, colorHover.range, colorHover.model, colorHover.provider);
	}
}

export class ColorHoverParticipant implements IEditorHoverParticipant<ColorHover> {

	public readonly hoverOrdinal: number = 2;

	private _colorPicker: HoverColorPicker | undefined;

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
				const colorHover = await createColorHover(this._editor.getModel(), colorData.colorInfo, colorData.provider);
				return [ColorHover.from(this, colorHover)];
			}

		}
		return [];
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IRenderedHoverParts<ColorHover> {
		if (hoverParts.length === 0 || !this._editor.hasModel()) {
			return new RenderedHoverParts([]);
		}
		this._colorPicker = new HoverColorPicker(this._editor, hoverParts[0], context, this._themeService);
		const colorPicker = this._colorPicker;
		const renderedHoverPart: IRenderedHoverPart<ColorHover> = {
			hoverPart: colorPicker.color,
			hoverElement: colorPicker.domNode,
			dispose() { colorPicker.dispose(); }
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

export class StandaloneColorPickerParticipant {

	public readonly hoverOrdinal: number = 2;
	private _colorPicker: StandaloneColorPicker | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public async createColorHover(defaultColorInfo: IColorInformation, defaultColorProvider: DocumentColorProvider, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>): Promise<{ colorHover: IColorHover; foundInEditor: boolean } | null> {
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
		const colorHover = await createColorHover(this._editor.getModel(), colorInfo, colorProvider);
		return { colorHover, foundInEditor };
	}

	public async updateEditorModel(colorHover: IColorHover): Promise<void> {
		this._colorPicker?.updateEditorModel(colorHover);
	}

	public renderColorPicker(context: IEditorHoverRenderContext, colorHover: IColorHover, foundInEditor: boolean): StandaloneColorPicker | undefined {
		if (!this._editor.hasModel()) {
			return;
		}
		this._colorPicker = new StandaloneColorPicker(this._editor, colorHover, foundInEditor, context, this._themeService);
		return this._colorPicker;
	}
}

async function createColorHover(editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<IColorHover> {
	const originalText = editorModel.getValueInRange(colorInfo.range);
	const { red, green, blue, alpha } = colorInfo.color;
	const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
	const color = new Color(rgba);

	const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
	const model = new ColorPickerModel(color, [], 0);
	model.colorPresentations = colorPresentations || [];
	model.guessColorPresentation(color, originalText);
	const range = Range.lift(colorInfo.range);
	return { range, model, provider };
}


