/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {ICommonCodeEditor, IDecorationRenderOptions, IModelDecorationOptions} from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';

export abstract class AbstractCodeEditorService implements ICodeEditorService {
	public _serviceBrand: any;
	private _onCodeEditorAdd: Emitter<ICommonCodeEditor>;
	private _onCodeEditorRemove: Emitter<ICommonCodeEditor>;
	private _codeEditors: {
		[editorId: string]: ICommonCodeEditor;
	};

	constructor() {
		this._codeEditors = Object.create(null);
		this._onCodeEditorAdd = new Emitter<ICommonCodeEditor>();
		this._onCodeEditorRemove = new Emitter<ICommonCodeEditor>();
	}

	public addCodeEditor(editor: ICommonCodeEditor): void {
		this._codeEditors[editor.getId()] = editor;
		this._onCodeEditorAdd.fire(editor);
	}

	public get onCodeEditorAdd(): Event<ICommonCodeEditor> {
		return this._onCodeEditorAdd.event;
	}

	public removeCodeEditor(editor: ICommonCodeEditor): void {
		if (delete this._codeEditors[editor.getId()]) {
			this._onCodeEditorRemove.fire(editor);
		}
	}

	public get onCodeEditorRemove(): Event<ICommonCodeEditor>{
		return this._onCodeEditorRemove.event;
	}

	public getCodeEditor(editorId: string): ICommonCodeEditor {
		return this._codeEditors[editorId] || null;
	}

	public listCodeEditors(): ICommonCodeEditor[] {
		return Object.keys(this._codeEditors).map(id => this._codeEditors[id]);
	}

	public getFocusedCodeEditor(): ICommonCodeEditor {
		let editorWithWidgetFocus: ICommonCodeEditor = null;

		let editors = this.listCodeEditors();
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];

			if (editor.isFocused()) {
				// bingo!
				return editor;
			}

			if (editor.hasWidgetFocus()) {
				editorWithWidgetFocus = editor;
			}
		}

		return editorWithWidgetFocus;
	}

	public abstract registerDecorationType(key:string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
	public abstract removeDecorationType(key:string): void;
	public abstract resolveDecorationOptions(decorationTypeKey:string, writable: boolean): IModelDecorationOptions;
}
