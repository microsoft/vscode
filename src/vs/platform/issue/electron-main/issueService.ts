/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { BrowserWindow, ipcMain } from 'electron';
import { ILaunchService } from 'vs/code/electron-main/launch';
import { buildDiagnostics, DiagnosticInfo } from 'vs/code/electron-main/diagnostics';

export class IssueService implements IIssueService {
	_serviceBrand: any;
	_issueWindow: BrowserWindow;

	constructor(
		@ILaunchService private launchService: ILaunchService
	) { }

	openReporter(): TPromise<void> {
		ipcMain.on('issueInfoRequest', event => {
			this.getStatusInfo().then(msg => {
				event.sender.send('issueInfoResponse', msg);
			});
		});
		ipcMain.on('extensionInfoRequest', event => {
			// this.getExtensions().then(extensions => {
			// 	event.sender.send('extensionInfoResponse', extensions);
			// });
		});
		this._issueWindow = new BrowserWindow({});
		this._issueWindow.loadURL(this.getIssueReporterPath());
		this._issueWindow.webContents.openDevTools();

		return TPromise.as(null);
	}

	getStatusInfo(): Promise<DiagnosticInfo> {
		return new Promise((resolve, reject) => {
			this.launchService.getMainProcessInfo().then(info => {
				buildDiagnostics(info)
					.then(diagnosticInfo => {
						resolve(diagnosticInfo);
					})
					.catch(err => {
						reject(err);
					});
			});
		});
	}

	getRunningExtensions(): TPromise<any> {
		return Promise.as(null);
		// return this.extManagementService.getInstalled();
	}

	private getIssueReporterPath() {
		return `${require.toUrl('vs/issue/electron-browser/index.html')}`;
	}
}
