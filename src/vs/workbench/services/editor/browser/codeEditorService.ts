/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor, isCodeEditor, isDiffEditor, isCompositeEditor, getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TextEditorOptions } from 'vs/workbench/common/editor';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { isEqual } from 'vs/base/common/resources';

export class CodeEditorService extends CodeEditorServiceImpl {

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);
	}

	getActiveCodeEditor(): ICodeEditor | null {
		const activeTextEditorControl = this.editorService.activeTextEditorControl;
		if (isCodeEditor(activeTextEditorControl)) {
			return activeTextEditorControl;
		}

		if (isDiffEditor(activeTextEditorControl)) {
			return activeTextEditorControl.getModifiedEditor();
		}

		const activeControl = this.editorService.activeEditorPane?.getControl();
		if (isCompositeEditor(activeControl) && isCodeEditor(activeControl.activeCodeEditor)) {
			return activeControl.activeCodeEditor;
		}

		return null;
	}

	async openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null> {

		// Special case: If the active editor is a diff editor and the request to open originates and
		// targets the modified side of it, we just apply the request there to prevent opening the modified
		// side as separate editor.
		const activeTextEditorControl = this.editorService.activeTextEditorControl;
		if (
			!sideBySide &&																// we need the current active group to be the taret
			isDiffEditor(activeTextEditorControl) && 									// we only support this for active text diff editors
			input.options &&															// we need options to apply
			input.resource &&															// we need a request resource to compare with
			activeTextEditorControl.getModel() &&										// we need a target model to compare with
			source === activeTextEditorControl.getModifiedEditor() && 					// we need the source of this request to be the modified side of the diff editor
			isEqual(input.resource, activeTextEditorControl.getModel()!.modified.uri) 	// we need the input resources to match with modified side
		) {
			const targetEditor = activeTextEditorControl.getModifiedEditor();

			const textOptions = TextEditorOptions.create(input.options);
			textOptions.apply(targetEditor, ScrollType.Smooth);

			return targetEditor;
		}

		// Open using our normal editor service
		return this.doOpenCodeEditor(input, source, sideBySide);
	}

	private async doOpenCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null> {

		// Special case: we want to detect the request to open an editor that
		// is different from the current one to decide wether the current editor
		// should be pinned or not. This ensures that the source of a navigation
		// is not being replaced by the target. An example is "Goto definition"
		// that otherwise would replace the editor everytime the user navigates.
		if (
			source &&											// we need to know the origin of the navigation
			!input.options?.pinned &&							// we only need to look at preview editors that open
			!sideBySide &&										// we only need to care if editor opens in same group
			!isEqual(source.getModel()?.uri, input.resource)	// we only need to do this if the editor is about to change
		) {
			for (const visiblePane of this.editorService.visibleEditorPanes) {
				if (getCodeEditor(visiblePane.getControl()) === source) {
					visiblePane.group.pinEditor();
					break;
				}
			}
		}

		// Open as editor
		const control = await this.editorService.openEditor(input, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
		if (control) {
			const widget = control.getControl();
			if (isCodeEditor(widget)) {
				return widget;
			}

			if (isCompositeEditor(widget) && isCodeEditor(widget.activeCodeEditor)) {
				return widget.activeCodeEditor;
			}
		}

		return null;
	}
}

registerSingleton(ICodeEditorService, CodeEditorService, true);
