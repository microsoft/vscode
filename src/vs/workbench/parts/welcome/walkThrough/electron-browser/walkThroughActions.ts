/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { INextEditorService } from 'vs/workbench/services/editor/common/nextEditorService';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { WalkThroughPart } from 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThroughPart';

export class WalkThroughArrowUpAction extends Action {

	public static readonly ID = 'workbench.action.interactivePlayground.arrowUp';
	public static readonly LABEL = localize('editorWalkThrough.arrowUp', "Scroll Up (Line)");

	constructor(
		id: string,
		label: string,
		@INextEditorService private editorService: INextEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const activeControl = this.editorService.activeControl;
		if (activeControl instanceof WalkThroughPart) {
			activeControl.arrowUp();
		}
		return null;
	}
}

export class WalkThroughArrowDownAction extends Action {

	public static readonly ID = 'workbench.action.interactivePlayground.arrowDown';
	public static readonly LABEL = localize('editorWalkThrough.arrowDown', "Scroll Down (Line)");

	constructor(
		id: string,
		label: string,
		@INextEditorService private editorService: INextEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const activeControl = this.editorService.activeControl;
		if (activeControl instanceof WalkThroughPart) {
			activeControl.arrowDown();
		}
		return null;
	}
}

export class WalkThroughPageUpAction extends Action {

	public static readonly ID = 'workbench.action.interactivePlayground.pageUp';
	public static readonly LABEL = localize('editorWalkThrough.pageUp', "Scroll Up (Page)");

	constructor(
		id: string,
		label: string,
		@INextEditorService private editorService: INextEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const activeControl = this.editorService.activeControl;
		if (activeControl instanceof WalkThroughPart) {
			activeControl.pageUp();
		}
		return null;
	}
}

export class WalkThroughPageDownAction extends Action {

	public static readonly ID = 'workbench.action.interactivePlayground.pageDown';
	public static readonly LABEL = localize('editorWalkThrough.pageDown', "Scroll Down (Page)");

	constructor(
		id: string,
		label: string,
		@INextEditorService private editorService: INextEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const activeControl = this.editorService.activeControl;
		if (activeControl instanceof WalkThroughPart) {
			activeControl.pageDown();
		}
		return null;
	}
}