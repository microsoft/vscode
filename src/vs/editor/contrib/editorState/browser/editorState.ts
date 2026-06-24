/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../../base/common/strings.js';
import { ICodeEditor, IActiveCodeEditor } from '../../../browser/editorBrowser.js';
import { Position } from '../../../common/core/position.js';
import { Range, IRange } from '../../../common/core/range.js';
import { CancellationTokenSource, CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../common/model.js';
import { EditorKeybindingCancellationTokenSource } from './keybindingCancellation.js';

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
			const model = editor.getModel();
			this.modelVersionId = model ? strings.format('{0}#{1}', model.uri.toString(), model.getVersionId()) : null;
		} else {
			this.modelVersionId = null;
		}
		if ((this.flags & CodeEditorStateFlag.Position) !== 0) {
			this.position = editor.getPosition();
		} else {
			this.position = null;
		}
		if ((this.flags & CodeEditorStateFlag.Selection) !== 0) {
			this.selection = editor.getSelection();
		} else {
			this.selection = null;
		}
		if ((this.flags & CodeEditorStateFlag.Scroll) !== 0) {
			this.scrollLeft = editor.getScrollLeft();
			this.scrollTop = editor.getScrollTop();
		} else {
			this.scrollLeft = -1;
			this.scrollTop = -1;
		}
	}

	private _equals(other: unknown): boolean {

		if (!(other instanceof EditorState)) {
			return false;
		}
		const state = other;

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

/**
 * A cancellation token source that cancels when the editor changes as expressed
 * by the provided flags
 * @param range If provided, changes in position and selection within this range will not trigger cancellation
 */
export class EditorStateCancellationTokenSource extends EditorKeybindingCancellationTokenSource implements IDisposable {

	private readonly _listener = new DisposableStore();

	constructor(editor: IActiveCodeEditor, flags: CodeEditorStateFlag, range?: IRange, parent?: CancellationToken) {
		super(editor, parent);

		if (flags & CodeEditorStateFlag.Position) {
			this._listener.add(editor.onDidChangeCursorPosition(e => {
				if (!range || !Range.containsPosition(range, e.position)) {
					this.cancel();
				}
			}));
		}
		if (flags & CodeEditorStateFlag.Selection) {
			this._listener.add(editor.onDidChangeCursorSelection(e => {
				if (!range || !Range.containsRange(range, e.selection)) {
					this.cancel();
				}
			}));
		}
		if (flags & CodeEditorStateFlag.Scroll) {
			this._listener.add(editor.onDidScrollChange(_ => this.cancel()));
		}
		if (flags & CodeEditorStateFlag.Value) {
			this._listener.add(editor.onDidChangeModel(_ => this.cancel()));
			this._listener.add(editor.onDidChangeModelContent(_ => this.cancel()));
		}
	}

	override dispose() {
		this._listener.dispose();
		super.dispose();
	}
}

/**
 * A cancellation token source that cancels when the provided model changes
 */
export class TextModelCancellationTokenSource extends CancellationTokenSource implements IDisposable {

	private _listener: IDisposable;

	constructor(model: ITextModel, parent?: CancellationToken) {
		super(parent);
		this._listener = model.onDidChangeContent(() => this.cancel());
	}

	override dispose() {
		this._listener.dispose();
		super.dispose();
	}
}
