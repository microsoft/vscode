/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TPromise } from 'vs/base/common/winjs.base';

export class WebviewSelectAllAction extends Action {

	public static ID = 'workbench.editor.webview.selectAll';
	public static LABEL = nls.localize('selectAll', 'Select All');

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		const activeEditor = <any>this.editorService.getActiveEditor();

		if (activeEditor.isWebviewEditor) {
			activeEditor.webview.selectAll();
		}

		return TPromise.as(true);
	}
}