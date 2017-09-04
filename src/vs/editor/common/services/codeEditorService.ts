/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonCodeEditor, ICommonDiffEditor, isCommonCodeEditor, isCommonDiffEditor, IDecorationRenderOptions, IModelDecorationOptions, IModel } from 'vs/editor/common/editorCommon';
import { IEditor } from 'vs/platform/editor/common/editor';

export var ICodeEditorService = createDecorator<ICodeEditorService>('codeEditorService');

export interface ICodeEditorService {
	_serviceBrand: any;

	onCodeEditorAdd: Event<ICommonCodeEditor>;
	onCodeEditorRemove: Event<ICommonCodeEditor>;

	onDiffEditorAdd: Event<ICommonDiffEditor>;
	onDiffEditorRemove: Event<ICommonDiffEditor>;

	addCodeEditor(editor: ICommonCodeEditor): void;
	removeCodeEditor(editor: ICommonCodeEditor): void;
	getCodeEditor(editorId: string): ICommonCodeEditor;
	listCodeEditors(): ICommonCodeEditor[];

	addDiffEditor(editor: ICommonDiffEditor): void;
	removeDiffEditor(editor: ICommonDiffEditor): void;
	getDiffEditor(editorId: string): ICommonDiffEditor;
	listDiffEditors(): ICommonDiffEditor[];

	/**
	 * Returns the current focused code editor (if the focus is in the editor or in an editor widget) or null.
	 */
	getFocusedCodeEditor(): ICommonCodeEditor;

	registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
	removeDecorationType(key: string): void;
	resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions;

	setTransientModelProperty(model: IModel, key: string, value: any): void;
	getTransientModelProperty(model: IModel, key: string): any;
}

/**
 * Uses `editor.getControl()` and returns either a `codeEditor` or a `diffEditor` or nothing.
 */
export function getCodeOrDiffEditor(editor: IEditor): { codeEditor: ICommonCodeEditor; diffEditor: ICommonDiffEditor } {
	if (editor) {
		let control = editor.getControl();
		if (control) {
			if (isCommonCodeEditor(control)) {
				return {
					codeEditor: control,
					diffEditor: null
				};
			}
			if (isCommonDiffEditor(control)) {
				return {
					codeEditor: null,
					diffEditor: control
				};
			}
		}
	}

	return {
		codeEditor: null,
		diffEditor: null
	};
}

/**
 * Uses `editor.getControl()` and returns either the code editor, or the modified editor of a diff editor or nothing.
 */
export function getCodeEditor(editor: IEditor): ICommonCodeEditor {
	let r = getCodeOrDiffEditor(editor);
	return r.codeEditor || (r.diffEditor && r.diffEditor.getModifiedEditor()) || null;
}
