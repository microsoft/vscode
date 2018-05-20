/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TPromise } from 'vs/base/common/winjs.base';

export class CodeEditorService extends CodeEditorServiceImpl {

	constructor(
		@IEditorService private editorService: IEditorService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);
	}

	getActiveCodeEditor(): ICodeEditor {
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (isCodeEditor(activeTextEditorWidget)) {
			return activeTextEditorWidget;
		}

		if (isDiffEditor(activeTextEditorWidget)) {
			return activeTextEditorWidget.getModifiedEditor();
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