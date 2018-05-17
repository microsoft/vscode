/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { INextEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/nextEditorService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TPromise } from 'vs/base/common/winjs.base';

export class CodeEditorService extends CodeEditorServiceImpl {

	constructor(
		@INextEditorService private editorService: INextEditorService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);
	}

	getActiveCodeEditor(): ICodeEditor {
		let activeEditor = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeEditor)) {
			return activeEditor;
		}

		if (isDiffEditor(activeEditor)) {
			return activeEditor.getModifiedEditor();
		}

		return null;
	}

	openCodeEditor(input: IResourceInput, source: ICodeEditor, sideBySide?: boolean): TPromise<ICodeEditor> {
		return this.editorService.openEditor(input, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(control => {
			if (control) {
				const widget = control.getControl();
				if (isCodeEditor(widget)) {
					return widget;
				}
			}

			return null;
		});
	}
}