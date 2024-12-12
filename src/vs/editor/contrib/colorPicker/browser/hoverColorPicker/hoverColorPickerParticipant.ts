/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { Range } from '../../../../common/core/range.js';
import { IModelDecoration } from '../../../../common/model.js';
import { DocumentColorProvider } from '../../../../common/languages.js';
import { ColorDetector } from '../colorDetector.js';
import { ColorPickerModel } from '../colorPickerModel.js';
import { ColorPickerWidget } from '../colorPickerWidget.js';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from '../../../hover/browser/hoverTypes.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import * as nls from '../../../../../nls.js';
import { BaseColor, ColorPickerWidgetType, createColorHover, updateColorPresentations, updateEditorModel } from '../colorPickerParticipantUtils.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Color } from '../../../../../base/common/color.js';
import { HoverStartSource } from '../../../hover/browser/hoverOperation.js';

export class ColorHover implements IHoverPart, BaseColor {

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

	public static fromBaseColor(owner: IEditorHoverParticipant<ColorHover>, color: BaseColor): ColorHover {
		return new ColorHover(owner, color.range, color.model, color.provider);
	}
}

export class HoverColorPickerParticipant implements IEditorHoverParticipant<ColorHover> {

	public readonly hoverOrdinal: number = 2;

	private _colorPicker: ColorPickerWidget | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public computeSync(_anchor: HoverAnchor, _lineDecorations: IModelDecoration[], source: HoverStartSource): ColorHover[] {
		return [];
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], source: HoverStartSource, token: CancellationToken): AsyncIterableObject<ColorHover> {
		return AsyncIterableObject.fromPromise(this._computeAsync(anchor, lineDecorations, source));
	}

	private async _computeAsync(_anchor: HoverAnchor, lineDecorations: IModelDecoration[], source: HoverStartSource): Promise<ColorHover[]> {
		if (!this._editor.hasModel()) {
			return [];
		}
		if (!this._isValidRequest(source)) {
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
				const colorHover = ColorHover.fromBaseColor(this, await createColorHover(this._editor.getModel(), colorData.colorInfo, colorData.provider));
				return [colorHover];
			}

		}
		return [];
	}

	private _isValidRequest(source: HoverStartSource): boolean {
		const decoratorActivatedOn = this._editor.getOption(EditorOption.colorDecoratorsActivatedOn);
		switch (source) {
			case HoverStartSource.Mouse:
				return decoratorActivatedOn === 'hover' || decoratorActivatedOn === 'clickAndHover';
			case HoverStartSource.Click:
				return decoratorActivatedOn === 'click' || decoratorActivatedOn === 'clickAndHover';
			case HoverStartSource.Keyboard:
				return true;
		}
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IRenderedHoverParts<ColorHover> {
		const editor = this._editor;
		if (hoverParts.length === 0 || !editor.hasModel()) {
			return new RenderedHoverParts([]);
		}
		const minimumHeight = editor.getOption(EditorOption.lineHeight) + 8;
		context.setMinimumDimensions(new Dimension(302, minimumHeight));

		const disposables = new DisposableStore();
		const colorHover = hoverParts[0];
		const editorModel = editor.getModel();
		const model = colorHover.model;
		this._colorPicker = disposables.add(new ColorPickerWidget(context.fragment, model, editor.getOption(EditorOption.pixelRatio), this._themeService, ColorPickerWidgetType.Hover));

		let editorUpdatedByColorPicker = false;
		let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);

		disposables.add(model.onColorFlushed(async (color: Color) => {
			await updateColorPresentations(editorModel, model, color, range, colorHover);
			editorUpdatedByColorPicker = true;
			range = updateEditorModel(editor, range, model);
		}));
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
		const renderedHoverPart: IRenderedHoverPart<ColorHover> = {
			hoverPart: ColorHover.fromBaseColor(this, colorHover),
			hoverElement: this._colorPicker.domNode,
			dispose() { disposables.dispose(); }
		};
		return new RenderedHoverParts([renderedHoverPart]);
	}

	public getAccessibleContent(hoverPart: ColorHover): string {
		return nls.localize('hoverAccessibilityColorParticipant', 'There is a color picker here.');
	}

	public handleResize(): void {
		this._colorPicker?.layout();
	}

	public handleHide(): void {
		this._colorPicker?.dispose();
		this._colorPicker = undefined;
	}

	public isColorPickerVisible(): boolean {
		return !!this._colorPicker;
	}
}
