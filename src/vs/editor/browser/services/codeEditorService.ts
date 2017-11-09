/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { isCommonCodeEditor, isCommonDiffEditor, IDecorationRenderOptions, IModelDecorationOptions, IModel } from 'vs/editor/common/editorCommon';
import { IEditor } from 'vs/platform/editor/common/editor';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';

export const ICodeEditorService = createDecorator<ICodeEditorService>('codeEditorService');

export interface ICodeEditorService {
	_serviceBrand: any;

	onCodeEditorAdd: Event<ICodeEditor>;
	onCodeEditorRemove: Event<ICodeEditor>;

	onDiffEditorAdd: Event<IDiffEditor>;
	onDiffEditorRemove: Event<IDiffEditor>;

	addCodeEditor(editor: ICodeEditor): void;
	removeCodeEditor(editor: ICodeEditor): void;
	getCodeEditor(editorId: string): ICodeEditor;
	listCodeEditors(): ICodeEditor[];

	addDiffEditor(editor: IDiffEditor): void;
	removeDiffEditor(editor: IDiffEditor): void;
	getDiffEditor(editorId: string): IDiffEditor;
	listDiffEditors(): IDiffEditor[];

	/**
	 * Returns the current focused code editor (if the focus is in the editor or in an editor widget) or null.
	 */
	getFocusedCodeEditor(): ICodeEditor;

	registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void;
	removeDecorationType(key: string): void;
	resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions;

	setTransientModelProperty(model: IModel, key: string, value: any): void;
	getTransientModelProperty(model: IModel, key: string): any;
}

/**
 * Uses `editor.getControl()` and returns either a `codeEditor` or a `diffEditor` or nothing.
 */
export function getCodeOrDiffEditor(editor: IEditor): { codeEditor: ICodeEditor; diffEditor: IDiffEditor } {
	if (editor) {
		let control = editor.getControl();
		if (control) {
			if (isCommonCodeEditor(control)) {
				return {
					codeEditor: <ICodeEditor>control,
					diffEditor: null
				};
			}
			if (isCommonDiffEditor(control)) {
				return {
					codeEditor: null,
					diffEditor: <IDiffEditor>control
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
export function getCodeEditor(editor: IEditor): ICodeEditor {
	let r = getCodeOrDiffEditor(editor);
	return r.codeEditor || (r.diffEditor && <ICodeEditor>r.diffEditor.getModifiedEditor()) || null;
}
