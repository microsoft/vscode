/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import platform = require('vs/base/common/platform');
import uri from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {asFileEditorInput} from 'vs/workbench/common/editor';
import {IMessageService} from 'vs/platform/message/common/message';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

import {ipcRenderer as ipc, shell, clipboard} from 'electron';

export class RevealInOSAction extends Action {
	private resource: uri;

	constructor(resource: uri) {
		super('workbench.action.files.revealInWindows', platform.isWindows ? nls.localize('revealInWindows', "Reveal in Explorer") : (platform.isMacintosh ? nls.localize('revealInMac', "Reveal in Finder") : nls.localize('openContainer', "Open Containing Folder")));

		this.resource = resource;

		this.order = 45;
	}

	public run(): TPromise<any> {
		shell.showItemInFolder(paths.normalize(this.resource.fsPath, true));

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
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
		if (fileInput) {
			shell.showItemInFolder(paths.normalize(fileInput.getResource().fsPath, true));
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
		const fileInput = activeEditor ? asFileEditorInput(activeEditor.input, true) : void 0;
		if (fileInput) {
			clipboard.writeText(labels.getPathLabel(fileInput.getResource()));
			this.editorGroupService.focusGroup(activeEditor.position); // focus back to active editor group
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToCopy', "Open a file first to copy its path"));
		}

		return TPromise.as(true);
	}
}

export class BaseOpenAction extends Action {

	private ipcMsg: string;

	constructor(id: string, label: string, ipcMsg: string) {
		super(id, label);

		this.ipcMsg = ipcMsg;
	}

	public run(): TPromise<any> {
		ipc.send(this.ipcMsg); // Handle in browser process

		return TPromise.as(true);
	}
}

export class OpenFileAction extends Action {

	public static ID = 'workbench.action.files.openFile';
	public static LABEL = nls.localize('openFile', "Open File...");

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);

		// Handle in browser process
		if (fileInput) {
			ipc.send('vscode:openFilePicker', false, paths.dirname(fileInput.getResource().fsPath));
		} else {
			ipc.send('vscode:openFilePicker');
		}

		return TPromise.as(true);
	}
}

export class OpenFolderAction extends BaseOpenAction {

	public static ID = 'workbench.action.files.openFolder';
	public static LABEL = nls.localize('openFolder', "Open Folder...");

	constructor(id: string, label: string) {
		super(id, label, 'vscode:openFolderPicker');
	}
}

export class OpenFileFolderAction extends BaseOpenAction {

	public static ID = 'workbench.action.files.openFileFolder';
	public static LABEL = nls.localize('openFileFolder', "Open...");

	constructor(id: string, label: string) {
		super(id, label, 'vscode:openFileFolderPicker');
	}
}

export class ShowOpenedFileInNewWindow extends Action {

	public static ID = 'workbench.action.files.showOpenedFileInNewWindow';
	public static LABEL = nls.localize('openFileInNewWindow', "Open Active File in New Window");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
		if (fileInput) {
			ipc.send('vscode:windowOpen', [fileInput.getResource().fsPath], true /* force new window */); // handled from browser process
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToShow', "Open a file first to open in new window"));
		}

		return TPromise.as(true);
	}
}