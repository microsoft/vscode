/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { IIssueService, IssueReporterStyles } from 'vs/platform/issue/common/issue';
import { BrowserWindow, ipcMain } from 'electron';
import { ILaunchService } from 'vs/code/electron-main/launch';
import { buildDiagnostics, DiagnosticInfo } from 'vs/code/electron-main/diagnostics';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class IssueService implements IIssueService {
	_serviceBrand: any;
	_issueWindow: BrowserWindow;

	constructor(
		@ILaunchService private launchService: ILaunchService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		private machineId: string
	) { }

	openReporter(theme?: IssueReporterStyles): TPromise<void> {
		ipcMain.on('issueInfoRequest', event => {
			this.getStatusInfo().then(msg => {
				event.sender.send('issueInfoResponse', msg);
			});
		});

		// When launching from cli, no theme is provided. Match theme if passed from workbench.
		if (theme) {
			ipcMain.on('issueStyleRequest', event => {
				event.sender.send('issueStyleResponse', theme);
			});
		}

		this._issueWindow = new BrowserWindow({
			width: 800,
			height: 900,
			title: 'Issue Reporter',
			alwaysOnTop: true
		});

		this._issueWindow.loadURL(this.getIssueReporterPath());
		this._issueWindow.webContents.openDevTools();

		return TPromise.as(null);
	}

	private getStatusInfo(): TPromise<DiagnosticInfo> {
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

	private getIssueReporterPath() {
		const config = {
			appRoot: this.environmentService.appRoot,
			nodeCachedDataDir: this.environmentService.nodeCachedDataDir,
			windowId: this._issueWindow.id,
			machineId: this.machineId
		};
		return `${require.toUrl('vs/issue/electron-browser/index.html')}?config=${encodeURIComponent(JSON.stringify(config))}`;
	}
}
