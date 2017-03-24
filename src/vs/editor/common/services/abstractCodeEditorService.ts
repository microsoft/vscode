/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { ICommonCodeEditor, ICommonDiffEditor, IDecorationRenderOptions, IModelDecorationOptions } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';

export abstract class AbstractCodeEditorService implements ICodeEditorService {

	_serviceBrand: any;

	private _onCodeEditorAdd: Emitter<ICommonCodeEditor>;
	private _onCodeEditorRemove: Emitter<ICommonCodeEditor>;
	private _codeEditors: { [editorId: string]: ICommonCodeEditor; };

	private _onDiffEditorAdd: Emitter<ICommonDiffEditor>;
	private _onDiffEditorRemove: Emitter<ICommonDiffEditor>;
	private _diffEditors: { [editorId: string]: ICommonDiffEditor; };

	constructor() {
		this._codeEditors = Object.create(null);
		this._diffEditors = Object.create(null);
		this._onCodeEditorAdd = new Emitter<ICommonCodeEditor>();
		this._onCodeEditorRemove = new Emitter<ICommonCodeEditor>();
		this._onDiffEditorAdd = new Emitter<ICommonDiffEditor>();
		this._onDiffEditorRemove = new Emitter<ICommonDiffEditor>();
	}

	addCodeEditor(editor: ICommonCodeEditor): void {
		this._codeEditors[editor.getId()] = editor;
		this._onCodeEditorAdd.fire(editor);
	}

	get onCodeEditorAdd(): Event<ICommonCodeEditor> {
		return this._onCodeEditorAdd.event;
	}

	removeCodeEditor(editor: ICommonCodeEditor): void {
		if (delete this._codeEditors[editor.getId()]) {
			this._onCodeEditorRemove.fire(editor);
		}
	}

	get onCodeEditorRemove(): Event<ICommonCodeEditor> {
		return this._onCodeEditorRemove.event;
	}

	getCodeEditor(editorId: string): ICommonCodeEditor {
		return this._codeEditors[editorId] || null;
	}

	listCodeEditors(): ICommonCodeEditor[] {
		return Object.keys(this._codeEditors).map(id => this._codeEditors[id]);
	}

	addDiffEditor(editor: ICommonDiffEditor): void {
		this._diffEditors[editor.getId()] = editor;
		this._onDiffEditorAdd.fire(editor);
	}

	get onDiffEditorAdd(): Event<ICommonDiffEditor> {
		return this._onDiffEditorAdd.event;
	}

	removeDiffEditor(editor: ICommonDiffEditor): void {
		if (delete this._diffEditors[editor.getId()]) {
			this._onDiffEditorRemove.fire(editor);
		}
	}

	get onDiffEditorRemove(): Event<ICommonDiffEditor> {
		return this._onDiffEditorRemove.event;
	}

	getDiffEditor(editorId: string): ICommonDiffEditor {
		return this._diffEditors[editorId] || null;
	}

	listDiffEditors(): ICommonDiffEditor[] {
		return Object.keys(this._diffEditors).map(id => this._diffEditors[id]);
	}

	getFocusedCodeEditor(): ICommonCodeEditor {
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

	abstract registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
	abstract removeDecorationType(key: string): void;
	abstract resolveDecorationOptions(decorationTypeKey: string, writable: boolean): IModelDecorationOptions;
}
