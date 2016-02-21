/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {CodeEditorStateFlag, ICodeEditorState, ICommonCodeEditor, IEditorPosition, IEditorRange} from 'vs/editor/common/editorCommon';

export class EditorState implements ICodeEditorState {

	private flags:CodeEditorStateFlag[];

	private position:IEditorPosition;
	private selection:IEditorRange;
	private modelVersionId:string;
	private scrollLeft:number;
	private scrollTop:number;

	constructor(editor:ICommonCodeEditor, flags:CodeEditorStateFlag[]) {
		this.flags = flags;

		flags.forEach((flag) => {
			switch(flag) {
				case CodeEditorStateFlag.Value:
					var model = editor.getModel();
					this.modelVersionId = model ? strings.format('{0}#{1}', model.getAssociatedResource().toString(), model.getVersionId()) : null;
					break;
				case CodeEditorStateFlag.Position:
					this.position = editor.getPosition();
					break;
				case CodeEditorStateFlag.Selection:
					this.selection = editor.getSelection();
					break;
				case CodeEditorStateFlag.Scroll:
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

	public validate(editor:ICommonCodeEditor):boolean {
		return this._equals(new EditorState(editor, this.flags));
	}
}
