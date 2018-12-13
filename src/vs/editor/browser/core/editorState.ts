/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export const enum CodeEditorStateFlag {
	Value = 1,
	Selection = 2,
	Position = 4,
	Scroll = 8
}

export class EditorState {

	private readonly flags: number;

	private readonly position: Position | null;
	private readonly selection: Range | null;
	private readonly modelVersionId: string | null;
	private readonly scrollLeft: number;
	private readonly scrollTop: number;

	constructor(editor: ICodeEditor, flags: number) {
		this.flags = flags;

		if ((this.flags & CodeEditorStateFlag.Value) !== 0) {
			let model = editor.getModel();
			this.modelVersionId = model ? strings.format('{0}#{1}', model.uri.toString(), model.getVersionId()) : null;
		}
		if ((this.flags & CodeEditorStateFlag.Position) !== 0) {
			this.position = editor.getPosition();
		}
		if ((this.flags & CodeEditorStateFlag.Selection) !== 0) {
			this.selection = editor.getSelection();
		}
		if ((this.flags & CodeEditorStateFlag.Scroll) !== 0) {
			this.scrollLeft = editor.getScrollLeft();
			this.scrollTop = editor.getScrollTop();
		}
	}

	private _equals(other: any): boolean {

		if (!(other instanceof EditorState)) {
			return false;
		}
		let state = <EditorState>other;

		if (this.modelVersionId !== state.modelVersionId) {
			return false;
		}
		if (this.scrollLeft !== state.scrollLeft || this.scrollTop !== state.scrollTop) {
			return false;
		}
		if (!this.position && state.position || this.position && !state.position || this.position && state.position && !this.position.equals(state.position)) {
			return false;
		}
		if (!this.selection && state.selection || this.selection && !state.selection || this.selection && state.selection && !this.selection.equalsRange(state.selection)) {
			return false;
		}
		return true;
	}

	public validate(editor: ICodeEditor): boolean {
		return this._equals(new EditorState(editor, this.flags));
	}
}

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
		return new StableEditorScrollState(visiblePosition, visiblePositionScrollDelta);
	}

	constructor(
		private readonly _visiblePosition: Position | null,
		private readonly _visiblePositionScrollDelta: number
	) {
	}

	public restore(editor: ICodeEditor): void {
		if (this._visiblePosition) {
			const visiblePositionScrollTop = editor.getTopForPosition(this._visiblePosition.lineNumber, this._visiblePosition.column);
			editor.setScrollTop(visiblePositionScrollTop + this._visiblePositionScrollDelta);
		}
	}
}
