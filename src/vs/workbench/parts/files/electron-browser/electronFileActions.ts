/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import nls = require('vs/nls');
import labels = require('vs/base/common/labels');
import uri from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { IMessageService } from 'vs/platform/message/common/message';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { clipboard } from 'electron';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export const copyPathCommand = (accessor: ServicesAccessor, resource: uri) => {
	clipboard.writeText(labels.getPathLabel(resource));
};

export class CopyPathAction extends Action {

	public static LABEL = nls.localize('copyPath', "Copy Path");

	constructor(
		private resource: uri,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super('workbench.action.files.copyPath', CopyPathAction.LABEL);

		this.order = 140;
	}

	public run(): TPromise<any> {
		this.instantiationService.invokeFunction.apply(this.instantiationService, [copyPathCommand, this.resource]);

		return TPromise.as(true);
	}
}

export class GlobalCopyPathAction extends Action {

	public static ID = 'workbench.action.files.copyPathOfActiveFile';
	public static LABEL = nls.localize('copyPathOfActive', "Copy Path of Active File");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		const fileResource = activeEditor ? toResource(activeEditor.input, { supportSideBySide: true, filter: 'file' }) : void 0;
		if (fileResource) {
			this.instantiationService.invokeFunction.apply(this.instantiationService, [copyPathCommand, fileResource]);
			this.editorGroupService.focusGroup(activeEditor.position); // focus back to active editor group
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToCopy', "Open a file first to copy its path"));
		}

		return TPromise.as(true);
	}
}