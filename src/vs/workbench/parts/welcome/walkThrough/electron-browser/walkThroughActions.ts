/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { WalkThroughPart } from 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThroughPart';

export class WalkThroughArrowUpAction extends Action {

	public static ID = 'workbench.action.interactivePlayground.arrowUp';
	public static LABEL = localize('editorWalkThrough.arrowUp', "Scroll Up (Line)");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const editor = this.editorService.getActiveEditor();
		if (editor instanceof WalkThroughPart) {
			editor.arrowUp();
		}
		return null;
	}
}

export class WalkThroughArrowDownAction extends Action {

	public static ID = 'workbench.action.interactivePlayground.arrowDown';
	public static LABEL = localize('editorWalkThrough.arrowDown', "Scroll Down (Line)");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const editor = this.editorService.getActiveEditor();
		if (editor instanceof WalkThroughPart) {
			editor.arrowDown();
		}
		return null;
	}
}

export class WalkThroughPageUpAction extends Action {

	public static ID = 'workbench.action.interactivePlayground.pageUp';
	public static LABEL = localize('editorWalkThrough.pageUp', "Scroll Up (Page)");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const editor = this.editorService.getActiveEditor();
		if (editor instanceof WalkThroughPart) {
			editor.pageUp();
		}
		return null;
	}
}

export class WalkThroughPageDownAction extends Action {

	public static ID = 'workbench.action.interactivePlayground.pageDown';
	public static LABEL = localize('editorWalkThrough.pageDown', "Scroll Down (Page)");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const editor = this.editorService.getActiveEditor();
		if (editor instanceof WalkThroughPart) {
			editor.pageDown();
		}
		return null;
	}
}