/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TextEditorOptions } from 'vs/workbench/common/editor';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';

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

	openCodeEditor(input: IResourceInput, source: ICodeEditor | null, sideBySide?: boolean): TPromise<ICodeEditor> {

		// Special case: If the active editor is a diff editor and the request to open originates and
		// targets the modified side of it, we just apply the request there to prevent opening the modified
		// side as separate editor.
		const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
		if (
			!sideBySide &&							// we need the current active group to be the taret
			isDiffEditor(activeTextEditorWidget) && // we only support this for active text diff editors
			input.options &&						// we need options to apply
			input.resource &&						// we need a request resource to compare with
			activeTextEditorWidget.getModel() &&	// we need a target model to compare with
			source === activeTextEditorWidget.getModifiedEditor() && // we need the source of this request to be the modified side of the diff editor
			input.resource.toString() === activeTextEditorWidget.getModel().modified.uri.toString() // we need the input resources to match with modified side
		) {
			const targetEditor = activeTextEditorWidget.getModifiedEditor();

			const textOptions = TextEditorOptions.create(input.options);
			textOptions.apply(targetEditor, ScrollType.Smooth);

			return TPromise.as(targetEditor);
		}

		// Open using our normal editor service
		return this.doOpenCodeEditor(input, source, sideBySide);
	}

	private doOpenCodeEditor(input: IResourceInput, source: ICodeEditor, sideBySide?: boolean): TPromise<ICodeEditor> {
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