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
		id:string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
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
		id:string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
		if (fileInput) {
			clipboard.writeText(labels.getPathLabel(fileInput.getResource()));
			this.editorService.focusEditor(); // focus back to editor
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

export const OPEN_FILE_ID = 'workbench.action.files.openFile';
export const OPEN_FILE_LABEL = nls.localize('openFile', "Open File...");

export class OpenFileAction extends BaseOpenAction {

	constructor(id: string, label: string) {
		super(id, label, 'vscode:openFilePicker');
	}
}

export const OPEN_FOLDER_ID = 'workbench.action.files.openFolder';
export const OPEN_FOLDER_LABEL = nls.localize('openFolder', "Open Folder...");

export class OpenFolderAction extends BaseOpenAction {

	constructor(id: string, label: string) {
		super(id, label, 'vscode:openFolderPicker');
	}

}

export const OPEN_FILE_FOLDER_ID = 'workbench.action.files.openFileFolder';
export const OPEN_FILE_FOLDER_LABEL = nls.localize('openFileFolder', "Open...");

export class OpenFileFolderAction extends BaseOpenAction {

	constructor(id: string, label: string) {
		super(id, label, 'vscode:openFileFolderPicker');
	}
}

export class ShowOpenedFileInNewWindow extends Action {

	public static ID = 'workbench.action.files.showOpenedFileInNewWindow';
	public static LABEL = nls.localize('openFileInNewWindow', "Open Active File in New Window");

	constructor(
		id:string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
		if (fileInput) {
			ipc.send('vscode:windowOpen', [fileInput.getResource().fsPath], true /* force new window */); // handled from browser process
		} else {
			this.messageService.show(severity.Info, nls.localize('openFileToShow', "Open a file first to open in new window"));
		}

		return TPromise.as(true);
	}
}