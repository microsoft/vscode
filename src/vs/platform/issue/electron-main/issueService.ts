/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { IIssueService, IssueReporterStyles } from 'vs/platform/issue/common/issue';
import { BrowserWindow, ipcMain } from 'electron';
import { ILaunchService } from 'vs/code/electron-main/launch';
import { buildDiagnostics, DiagnosticInfo } from 'vs/code/electron-main/diagnostics';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

const DEFAULT_BACKGROUND_COLOR = '#1E1E1E';

export class IssueService implements IIssueService {
	_serviceBrand: any;
	_issueWindow: BrowserWindow;

	constructor(
		private machineId: string,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILaunchService private launchService: ILaunchService
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
			title: localize('issueReporter', "Issue Reporter"),
			parent: BrowserWindow.getFocusedWindow(),
			backgroundColor: theme && theme.backgroundColor || DEFAULT_BACKGROUND_COLOR
		});

		this._issueWindow.setMenuBarVisibility(false); // workaround for now, until a menu is implemented

		this._issueWindow.loadURL(this.getIssueReporterPath());

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
		return `${require.toUrl('vs/code/electron-browser/issue/issueReporter.html')}?config=${encodeURIComponent(JSON.stringify(config))}`;
	}
}
