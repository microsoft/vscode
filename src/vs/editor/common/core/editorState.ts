/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Strings = require('vs/base/common/strings');
import EditorCommon = require('vs/editor/common/editorCommon');

export class EditorState implements EditorCommon.ICodeEditorState {

	private flags:EditorCommon.CodeEditorStateFlag[];

	private position:EditorCommon.IEditorPosition;
	private selection:EditorCommon.IEditorRange;
	private modelVersionId:string;
	private scrollLeft:number;
	private scrollTop:number;

	constructor(editor:EditorCommon.ICommonCodeEditor, flags:EditorCommon.CodeEditorStateFlag[]) {
		this.flags = flags;

		flags.forEach((flag) => {
			switch(flag) {
				case EditorCommon.CodeEditorStateFlag.Value:
					var model = editor.getModel();
					this.modelVersionId = model ? Strings.format('{0}#{1}', model.getAssociatedResource().toString(), model.getVersionId()) : null;
					break;
				case EditorCommon.CodeEditorStateFlag.Position:
					this.position = editor.getPosition();
					break;
				case EditorCommon.CodeEditorStateFlag.Selection:
					this.selection = editor.getSelection();
					break;
				case EditorCommon.CodeEditorStateFlag.Scroll:
					this.scrollLeft = editor.getScrollLeft();
					this.scrollTop = editor.getScrollTop();
					break;
			}
		});
	}

	private _equals(other:any):boolean {

		if(!(other instanceof EditorState)) {
			return false;
		}
		var state = <EditorState> other;

		if(this.modelVersionId !== state.modelVersionId) {
			return false;
		}
		if(this.scrollLeft !== state.scrollLeft || this.scrollTop !== state.scrollTop) {
			return false;
		}
		if(!this.position && state.position || this.position && !state.position || this.position && state.position && !this.position.equals(state.position)) {
			return false;
		}
		if(!this.selection && state.selection || this.selection && !state.selection || this.selection && state.selection && !this.selection.equalsRange(state.selection)) {
			return false;
		}
		return true;
	}

	public validate(editor:EditorCommon.ICommonCodeEditor):boolean {
		return this._equals(new EditorState(editor, this.flags));
	}
}
