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
import { ColorPickerWidget } from './hoverColorPickerWidget.js';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from '../../../hover/browser/hoverTypes.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import * as nls from '../../../../../nls.js';
import { createColorHover, renderHoverParts } from '../colorPickerParticipantUtils.js';

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

export class HoverColorPickerParticipant implements IEditorHoverParticipant<ColorHover> {

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
				const colorHover = await createColorHover(this, this._editor.getModel(), colorData.colorInfo, colorData.provider);
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
