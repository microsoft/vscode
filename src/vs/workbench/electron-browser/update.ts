/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {Action} from 'vs/base/common/actions';
import {ipcRenderer as ipc, shell} from 'electron';
import {IMessageService} from 'vs/platform/message/common/message';
import product from 'vs/platform/product';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ReleaseNotesInput } from 'vs/workbench/parts/update/electron-browser/releaseNotesInput';

interface IUpdate {
	releaseNotes: string;
	version: string;
	date: string;
}

const ApplyUpdateAction = new Action(
	'update.applyUpdate',
	nls.localize('updateNow', "Update Now"),
	null,
	true,
	() => { ipc.send('vscode:update-apply'); return TPromise.as(true); }
);

const NotNowAction = new Action(
	'update.later',
	nls.localize('later', "Later"),
	null,
	true,
	() => TPromise.as(true)
);

export class ShowReleaseNotesAction extends Action {

	constructor(
		private returnValue: boolean,
		private version: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super('update.showReleaseNotes', nls.localize('releaseNotes', "Release Notes"), null, true);
	}

	run(): TPromise<boolean> {
		return this.editorService.openEditor(this.instantiationService.createInstance(ReleaseNotesInput, this.version))
			.then(() => this.returnValue);
	}
}

export const DownloadAction = (url: string) => new Action(
	'update.download',
	nls.localize('downloadNow', "Download Now"),
	null,
	true,
	() => { shell.openExternal(url); return TPromise.as(true); }
);

export class Update {

	constructor(
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		ipc.on('vscode:update-downloaded', (event, update: IUpdate) => {
			const releaseNotesAction = this.instantiationService.createInstance(ShowReleaseNotesAction, false, update.version);

			this.messageService.show(severity.Info, {
				message: nls.localize('updateAvailable', "{0} will be updated after it restarts.", product.nameLong),
				actions: [ApplyUpdateAction, NotNowAction, releaseNotesAction]
			});
		});

		ipc.on('vscode:update-available', (event, url: string, version: string) => {
			const releaseNotesAction = this.instantiationService.createInstance(ShowReleaseNotesAction, false, version);

			this.messageService.show(severity.Info, {
				message: nls.localize('thereIsUpdateAvailable', "There is an available update."),
				actions: [DownloadAction(url), NotNowAction, releaseNotesAction]
			});
		});

		ipc.on('vscode:update-not-available', () => {
			this.messageService.show(severity.Info, nls.localize('noUpdatesAvailable', "There are no updates currently available."));
		});
	}
}