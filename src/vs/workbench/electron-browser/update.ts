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

export const ShowReleaseNotesAction = (releaseNotesUrl: string, returnValue = false) => new Action(
	'update.showReleaseNotes',
	nls.localize('releaseNotes', "Release Notes"),
	null,
	true,
	() => { shell.openExternal(releaseNotesUrl); return TPromise.as(returnValue); }
);

export const DownloadAction = (url: string) => new Action(
	'update.download',
	nls.localize('downloadNow', "Download Now"),
	null,
	true,
	() => { shell.openExternal(url); return TPromise.as(true); }
);

export class Update {

	constructor(
		@IMessageService private messageService: IMessageService
	) {
		ipc.on('vscode:update-downloaded', (event, update: IUpdate) => {
			this.messageService.show(severity.Info, {
				message: nls.localize('updateAvailable', "{0} will be updated after it restarts.", product.nameLong),
				actions: [ApplyUpdateAction, NotNowAction, ShowReleaseNotesAction(product.releaseNotesUrl)]
			});
		});

		ipc.on('vscode:update-available', (event, url: string) => {
			this.messageService.show(severity.Info, {
				message: nls.localize('thereIsUpdateAvailable', "There is an available update."),
				actions: [DownloadAction(url), NotNowAction, ShowReleaseNotesAction(product.releaseNotesUrl)]
			});
		});

		ipc.on('vscode:update-not-available', () => {
			this.messageService.show(severity.Info, nls.localize('noUpdatesAvailable', "There are no updates currently available."));
		});
	}
}