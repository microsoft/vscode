/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import platform = require('vs/base/common/platform');
import uri from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { IMessageService } from 'vs/platform/message/common/message';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { clipboard } from 'electron';

export class RevealInOSAction extends Action {
	private resource: uri;

	constructor(
		resource: uri,
		@IWindowsService private windowsService: IWindowsService
	) {
		super('workbench.action.files.revealInWindows', platform.isWindows ? nls.localize('revealInWindows', "Reveal in Explorer") : (platform.isMacintosh ? nls.localize('revealInMac', "Reveal in Finder") : nls.localize('openContainer', "Open Containing Folder")));

		this.resource = resource;

		this.order = 45;
	}

	public run(): TPromise<any> {
		this.windowsService.showItemInFolder(paths.normalize(this.resource.fsPath, true));

		return TPromise.as(true);
	}
}

export class GlobalRevealInOSAction extends Action {

	public static ID = 'workbench.action.files.revealActiveFileInWindows';
	public static LABEL = platform.isWindows ? nls.localize('revealActiveFileInWindows', "Reveal Active File in Windows Explorer") : (platform.isMacintosh ? nls.localize('revealActiveFileInMac', "Reveal Active File in Finder") : nls.localize('openActiveFileContainer', "Open Containing Folder of Active File"));

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWindowsService private windowsService: IWindowsService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileResource = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
		if (fileResource) {
			this.windowsService.showItemInFolder(paths.normalize(fileResource.fsPath, true));
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToReveal', "Open a file first to reveal"));
		}

		return TPromise.as(true);
	}
}

export class CopyPathAction extends Action {
	private resource: uri;

	constructor(resource: uri) {
		super('workbench.action.files.copyPath', nls.localize('copyPath', "Copy Path"));

		this.resource = resource;

		this.order = 140;
	}

	public run(): TPromise<any> {
		clipboard.writeText(labels.getPathLabel(this.resource));

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
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		const fileResource = activeEditor ? toResource(activeEditor.input, { supportSideBySide: true, filter: 'file' }) : void 0;
		if (fileResource) {
			clipboard.writeText(labels.getPathLabel(fileResource));
			this.editorGroupService.focusGroup(activeEditor.position); // focus back to active editor group
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToCopy', "Open a file first to copy its path"));
		}

		return TPromise.as(true);
	}
}

export class OpenFileAction extends Action {

	static ID = 'workbench.action.files.openFile';
	static LABEL = nls.localize('openFile', "Open File...");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		const fileResource = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });

		// Handle in browser process
		if (fileResource) {
			return this.windowService.openFilePicker(false, paths.dirname(fileResource.fsPath));
		}

		return this.windowService.openFilePicker();
	}
}

export class ShowOpenedFileInNewWindow extends Action {

	public static ID = 'workbench.action.files.showOpenedFileInNewWindow';
	public static LABEL = nls.localize('openFileInNewWindow', "Open Active File in New Window");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileResource = toResource(this.editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
		if (fileResource) {
			this.windowsService.windowOpen([fileResource.fsPath], true);
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToShow', "Open a file first to open in new window"));
		}

		return TPromise.as(true);
	}
}