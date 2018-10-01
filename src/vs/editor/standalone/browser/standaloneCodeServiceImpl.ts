/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IResourceInput } from 'vs/platform/editor/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { windowOpenNoOpener } from 'vs/base/browser/dom';
import { Schemas } from 'vs/base/common/network';
import { IRange } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { URI } from 'vs/base/common/uri';

export class StandaloneCodeEditorServiceImpl extends CodeEditorServiceImpl {

	public getActiveCodeEditor(): ICodeEditor {
		return null; // not supported in the standalone case
	}

	public openCodeEditor(input: IResourceInput, source: ICodeEditor, sideBySide?: boolean): TPromise<ICodeEditor> {
		if (!source) {
			return TPromise.as(null);
		}

		return TPromise.as(this.doOpenEditor(source, input));
	}

	private doOpenEditor(editor: ICodeEditor, input: IResourceInput): ICodeEditor {
		const model = this.findModel(editor, input.resource);
		if (!model) {
			if (input.resource) {

				const schema = input.resource.scheme;
				if (schema === Schemas.http || schema === Schemas.https) {
					// This is a fully qualified http or https URL
					windowOpenNoOpener(input.resource.toString());
					return editor;
				}
			}
			return null;
		}

		const selection = <IRange>input.options.selection;
		if (selection) {
			if (typeof selection.endLineNumber === 'number' && typeof selection.endColumn === 'number') {
				editor.setSelection(selection);
				editor.revealRangeInCenter(selection, ScrollType.Immediate);
			} else {
				const pos = {
					lineNumber: selection.startLineNumber,
					column: selection.startColumn
				};
				editor.setPosition(pos);
				editor.revealPositionInCenter(pos, ScrollType.Immediate);
			}
		}

		return editor;
	}

	private findModel(editor: ICodeEditor, resource: URI): ITextModel {
		const model = editor.getModel();
		if (model.uri.toString() !== resource.toString()) {
			return null;
		}

		return model;
	}
}
