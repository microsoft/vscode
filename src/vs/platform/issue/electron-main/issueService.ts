/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import * as objects from 'vs/base/common/objects';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { IIssueService, IssueReporterData } from 'vs/platform/issue/common/issue';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { ILaunchService } from 'vs/code/electron-main/launch';
import { getPerformanceInfo, PerformanceInfo, getSystemInfo, SystemInfo } from 'vs/code/electron-main/diagnostics';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { isMacintosh } from 'vs/base/common/platform';

const DEFAULT_BACKGROUND_COLOR = '#1E1E1E';

export class IssueService implements IIssueService {
	_serviceBrand: any;
	_issueWindow: BrowserWindow;
	_parentWindow: BrowserWindow;

	constructor(
		private machineId: string,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILaunchService private launchService: ILaunchService
	) { }

	openReporter(data: IssueReporterData): TPromise<void> {
		ipcMain.on('issueSystemInfoRequest', event => {
			this.getSystemInformation().then(msg => {
				event.sender.send('issueSystemInfoResponse', msg);
			});
		});

		ipcMain.on('issuePerformanceInfoRequest', event => {
			this.getPerformanceInfo().then(msg => {
				event.sender.send('issuePerformanceInfoResponse', msg);
			});
		});

		ipcMain.on('workbenchCommand', (event, arg) => {
			this._parentWindow.webContents.send('vscode:runAction', { id: arg });
		});

		this._parentWindow = BrowserWindow.getFocusedWindow();
		const position = this.getWindowPosition();
		this._issueWindow = new BrowserWindow({
			width: position.width,
			height: position.height,
			x: position.x,
			y: position.y,
			title: localize('issueReporter', "Issue Reporter"),
			backgroundColor: data.styles.backgroundColor || DEFAULT_BACKGROUND_COLOR
		});

		this._issueWindow.setMenuBarVisibility(false); // workaround for now, until a menu is implemented

		this._issueWindow.loadURL(this.getIssueReporterPath(data));

		return TPromise.as(null);
	}

	private getWindowPosition() {
		// We want the new window to open on the same display that the parent is in
		let displayToUse: Electron.Display;
		const displays = screen.getAllDisplays();

		// Single Display
		if (displays.length === 1) {
			displayToUse = displays[0];
		}

		// Multi Display
		else {

			// on mac there is 1 menu per window so we need to use the monitor where the cursor currently is
			if (isMacintosh) {
				const cursorPoint = screen.getCursorScreenPoint();
				displayToUse = screen.getDisplayNearestPoint(cursorPoint);
			}

			// if we have a last active window, use that display for the new window
			if (!displayToUse && this._parentWindow) {
				displayToUse = screen.getDisplayMatching(this._parentWindow.getBounds());
			}

			// fallback to primary display or first display
			if (!displayToUse) {
				displayToUse = screen.getPrimaryDisplay() || displays[0];
			}
		}

		let state = {
			width: 750,
			height: 900,
			x: undefined,
			y: undefined
		};
		state.x = displayToUse.bounds.x + (displayToUse.bounds.width / 2) - (state.width / 2);
		state.y = displayToUse.bounds.y + (displayToUse.bounds.height / 2) - (state.height / 2);

		return state;
	}

	private getSystemInformation(): TPromise<SystemInfo> {
		return new Promise((resolve, reject) => {
			this.launchService.getMainProcessInfo().then(info => {
				resolve(getSystemInfo(info));
			});
		});
	}

	private getPerformanceInfo(): TPromise<PerformanceInfo> {
		return new Promise((resolve, reject) => {
			this.launchService.getMainProcessInfo().then(info => {
				getPerformanceInfo(info)
					.then(diagnosticInfo => {
						resolve(diagnosticInfo);
					})
					.catch(err => {
						reject(err);
					});
			});
		});
	}

	private getIssueReporterPath(data: IssueReporterData) {
		const windowConfiguration = {
			appRoot: this.environmentService.appRoot,
			nodeCachedDataDir: this.environmentService.nodeCachedDataDir,
			windowId: this._issueWindow.id,
			machineId: this.machineId,
			data
		};

		const environment = parseArgs(process.argv);
		const config = objects.assign(environment, windowConfiguration);
		for (let key in config) {
			if (config[key] === void 0 || config[key] === null || config[key] === '') {
				delete config[key]; // only send over properties that have a true value
			}
		}

		return `${require.toUrl('vs/code/electron-browser/issue/issueReporter.html')}?config=${encodeURIComponent(JSON.stringify(config))}`;
	}
}
