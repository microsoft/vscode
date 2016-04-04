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
import {isLinux} from 'vs/base/common/platform';
import {IMessageService} from 'vs/platform/message/common/message';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IRequestService} from 'vs/platform/request/common/request';

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

export class Update {

	constructor(
		@IWorkspaceContextService private contextService : IWorkspaceContextService,
		@IMessageService private messageService : IMessageService,
		@IRequestService private requestService : IRequestService
	) {
		const env = this.contextService.getConfiguration().env;

		ipc.on('vscode:update-downloaded', (event, update: IUpdate) => {
			this.messageService.show(severity.Info, {
				message: nls.localize('updateAvailable', "{0} will be updated after it restarts.", env.appName),
				actions: [ShowReleaseNotesAction(env.releaseNotesUrl), NotNowAction, ApplyUpdateAction]
			});
		});

		ipc.on('vscode:update-not-available', () => {
			this.messageService.show(severity.Info, nls.localize('noUpdatesAvailable', "There are no updates currently available."));
		});

		const updateFeedUrl = env.updateFeedUrl;

		// manually check for update on linux
		if (isLinux && updateFeedUrl) {
			this.requestService.makeRequest({ url: updateFeedUrl }).done(res => {
				if (res.status !== 200) {
					return; // no update available
				}

				this.messageService.show(severity.Info, {
					message: nls.localize('noUpdateLinux', "This version of {0} is outdated and can\'t be updated automatically. Please download and install the latest version manually.", env.appName),
					actions: [
						new Action('pleaseUpdate', nls.localize('downloadLatestAction', "Download Latest"), '', true, () => {
							shell.openExternal(env.productDownloadUrl);
							return TPromise.as(true);
						}),
						new Action('releaseNotes', nls.localize('releaseNotesAction', "Release Notes"), '', true, () => {
							shell.openExternal(env.releaseNotesUrl);
							return TPromise.as(false);
						})
					]
				});
			});
		}
	}
}