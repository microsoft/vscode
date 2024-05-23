/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import * as nls from 'vs/nls';

class EditorFontZoomIn extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.fontZoomIn',
			label: nls.localize('EditorFontZoomIn.label', "Increase Editor Font Size"),
			alias: 'Increase Editor Font Size',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		EditorZoom.setZoomLevel(EditorZoom.getZoomLevel() + 1);
	}
}

class EditorFontZoomOut extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.fontZoomOut',
			label: nls.localize('EditorFontZoomOut.label', "Decrease Editor Font Size"),
			alias: 'Decrease Editor Font Size',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		EditorZoom.setZoomLevel(EditorZoom.getZoomLevel() - 1);
	}
}

class EditorFontZoomReset extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.fontZoomReset',
			label: nls.localize('EditorFontZoomReset.label', "Reset Editor Font Size"),
			alias: 'Reset Editor Font Size',
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		EditorZoom.setZoomLevel(0);
	}
}

registerEditorAction(EditorFontZoomIn);
registerEditorAction(EditorFontZoomOut);
registerEditorAction(EditorFontZoomReset);
