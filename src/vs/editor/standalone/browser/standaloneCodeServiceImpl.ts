/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IResourceInput } from 'vs/platform/editor/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor, IDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { IEditor, ScrollType } from 'vs/editor/common/editorCommon';
import { windowOpenNoOpener } from 'vs/base/browser/dom';
import { Schemas } from 'vs/base/common/network';
import { IRange } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';

export class StandaloneCodeEditorServiceImpl extends CodeEditorServiceImpl {
	private editor: IEditor;

	addCodeEditor(editor: ICodeEditor): void {
		super.addCodeEditor(editor);

		if (!this.editor) {
			this.editor = editor;
		}
	}

	addDiffEditor(editor: IDiffEditor): void {
		super.addDiffEditor(editor);

		if (!this.editor) {
			this.editor = editor;
		}
	}

	public getActiveCodeEditor(): ICodeEditor {
		return null; // not supported in the standalone case
	}

	public openCodeEditor(typedData: IResourceInput, sideBySide?: boolean): TPromise<ICodeEditor> {
		return TPromise.as(withTypedEditor(this.editor,
			(editor) => this.doOpenEditor(editor, typedData),
			(diffEditor) => (
				this.doOpenEditor(diffEditor.getOriginalEditor(), typedData) ||
				this.doOpenEditor(diffEditor.getModifiedEditor(), typedData)
			)
		));
	}

	private doOpenEditor(editor: ICodeEditor, data: IResourceInput): ICodeEditor {
		let model = this.findModel(editor, data);
		if (!model) {
			if (data.resource) {

				let schema = data.resource.scheme;
				if (schema === Schemas.http || schema === Schemas.https) {
					// This is a fully qualified http or https URL
					windowOpenNoOpener(data.resource.toString());
					return editor;
				}
			}
			return null;
		}

		let selection = <IRange>data.options.selection;
		if (selection) {
			if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
				editor.setSelection(selection);
				editor.revealRangeInCenter(selection, ScrollType.Immediate);
			} else {
				let pos = {
					lineNumber: selection.startLineNumber,
					column: selection.startColumn
				};
				editor.setPosition(pos);
				editor.revealPositionInCenter(pos, ScrollType.Immediate);
			}
		}

		return editor;
	}

	private findModel(editor: ICodeEditor, data: IResourceInput): ITextModel {
		let model = editor.getModel();
		if (model.uri.toString() !== data.resource.toString()) {
			return null;
		}

		return model;
	}
}

function withTypedEditor<T>(widget: IEditor, codeEditorCallback: (editor: ICodeEditor) => T, diffEditorCallback: (editor: IDiffEditor) => T): T {
	if (isCodeEditor(widget)) {
		// Single Editor
		return codeEditorCallback(<ICodeEditor>widget);
	} else {
		// Diff Editor
		return diffEditorCallback(<IDiffEditor>widget);
	}
}