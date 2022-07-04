/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';

export class StableEditorScrollState {

	public static capture(editor: ICodeEditor): StableEditorScrollState {
		let visiblePosition: Position | null = null;
		let visiblePositionScrollDelta = 0;
		if (editor.getScrollTop() !== 0) {
			const visibleRanges = editor.getVisibleRanges();
			if (visibleRanges.length > 0) {
				visiblePosition = visibleRanges[0].getStartPosition();
				const visiblePositionScrollTop = editor.getTopForPosition(visiblePosition.lineNumber, visiblePosition.column);
				visiblePositionScrollDelta = editor.getScrollTop() - visiblePositionScrollTop;
			}
		}
		return new StableEditorScrollState(visiblePosition, visiblePositionScrollDelta, editor.getPosition());
	}

	constructor(
		private readonly _visiblePosition: Position | null,
		private readonly _visiblePositionScrollDelta: number,
		private readonly _cursorPosition: Position | null
	) {
	}

	public restore(editor: ICodeEditor): void {
		if (this._visiblePosition) {
			const visiblePositionScrollTop = editor.getTopForPosition(this._visiblePosition.lineNumber, this._visiblePosition.column);
			editor.setScrollTop(visiblePositionScrollTop + this._visiblePositionScrollDelta);
		}
	}

	public restoreRelativeVerticalPositionOfCursor(editor: ICodeEditor): void {
		const currentCursorPosition = editor.getPosition();

		if (!this._cursorPosition || !currentCursorPosition) {
			return;
		}

		const offset = editor.getTopForLineNumber(currentCursorPosition.lineNumber) - editor.getTopForLineNumber(this._cursorPosition.lineNumber);
		editor.setScrollTop(editor.getScrollTop() + offset);
	}
}
