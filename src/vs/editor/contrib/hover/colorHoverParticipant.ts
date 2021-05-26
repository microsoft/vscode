/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IColorPresentation, DocumentColorProvider, IColor } from 'vs/editor/common/modes';
import { IModelDecoration, ITextModel } from 'vs/editor/common/model';
import { IEditorHover, IEditorHoverParticipant, IHoverPart } from 'vs/editor/contrib/hover/modesContentHover';
import { CancellationToken } from 'vs/base/common/cancellation';
import { getColorPresentations } from 'vs/editor/contrib/colorPicker/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/colorDetector';

export class ColorHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<ColorHover>,
		public readonly range: Range,
		public readonly color: IColor,
		public readonly colorPresentations: IColorPresentation[],
		public readonly provider: DocumentColorProvider
	) { }

	equals(other: IHoverPart): boolean {
		return false;
	}
}

export class ColorHoverParticipant implements IEditorHoverParticipant<ColorHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		hover: IEditorHover,
	) { }

	public computeSync(hoverRange: Range, lineDecorations: IModelDecoration[]): ColorHover[] {
		return [];
	}

	public async computeAsync(range: Range, lineDecorations: IModelDecoration[], token: CancellationToken): Promise<ColorHover[]> {
		if (!this._editor.hasModel()) {
			return [];
		}
		const colorDetector = ColorDetector.get(this._editor);
		for (const d of lineDecorations) {
			const colorData = colorDetector.getColorData(d.range.getStartPosition());
			if (colorData) {
				const { color, range } = colorData.colorInfo;
				const colorHover = await this._createColorHover(this._editor.getModel(), Range.lift(range), color, colorData.provider);
				return [colorHover];
			}
		}
		return [];
	}

	private async _createColorHover(editorModel: ITextModel, range: Range, color: IColor, provider: DocumentColorProvider): Promise<ColorHover> {
		const colorInfo = { range: range, color: color };
		const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
		return new ColorHover(this, range, color, colorPresentations || [], provider);
	}

	public renderHoverParts(hoverParts: ColorHover[], fragment: DocumentFragment): IDisposable {
		return Disposable.None;
	}
}
