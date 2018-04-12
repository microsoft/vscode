/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import * as objects from 'vs/base/common/objects';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { IIssueService, IssueReporterData, IssueReporterFeatures, ProcessExplorerData } from 'vs/platform/issue/common/issue';
import { BrowserWindow, ipcMain, screen } from 'electron';
import { ILaunchService } from 'vs/code/electron-main/launch';
import { getPerformanceInfo, PerformanceInfo, getSystemInfo, SystemInfo } from 'vs/code/electron-main/diagnostics';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { isMacintosh, IProcessEnvironment } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';

const DEFAULT_BACKGROUND_COLOR = '#1E1E1E';

export class IssueService implements IIssueService {
	_serviceBrand: any;
	_issueWindow: BrowserWindow;
	_issueParentWindow: BrowserWindow;
	_processExplorerWindow: BrowserWindow;

	constructor(
		private machineId: string,
		private userEnv: IProcessEnvironment,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILaunchService private launchService: ILaunchService,
		@ILogService private logService: ILogService,
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
			this._issueParentWindow.webContents.send('vscode:runAction', { id: arg, from: 'issueReporter' });
		});

		this._issueParentWindow = BrowserWindow.getFocusedWindow();
		const position = this.getWindowPosition(this._issueParentWindow, 800, 900);
		this._issueWindow = new BrowserWindow({
			width: position.width,
			height: position.height,
			minWidth: 300,
			minHeight: 200,
			x: position.x,
			y: position.y,
			title: localize('issueReporter', "Issue Reporter"),
			backgroundColor: data.styles.backgroundColor || DEFAULT_BACKGROUND_COLOR
		});

		this._issueWindow.setMenuBarVisibility(false); // workaround for now, until a menu is implemented

		// Modified when testing UI
		const features: IssueReporterFeatures = {};

		this.logService.trace('issueService#openReporter: opening issue reporter');
		this._issueWindow.loadURL(this.getIssueReporterPath(data, features));

		return TPromise.as(null);
	}

	openProcessExplorer(data: ProcessExplorerData): TPromise<void> {
		// Create as singleton
		if (!this._processExplorerWindow) {
			const position = this.getWindowPosition(BrowserWindow.getFocusedWindow(), 800, 300);
			this._processExplorerWindow = new BrowserWindow({
				skipTaskbar: true,
				resizable: true,
				width: position.width,
				height: position.height,
				minWidth: 300,
				minHeight: 200,
				x: position.x,
				y: position.y,
				backgroundColor: data.styles.backgroundColor,
				title: localize('processExplorer', "Process Explorer")
			});

			this._processExplorerWindow.setMenuBarVisibility(false);

			const windowConfiguration = {
				appRoot: this.environmentService.appRoot,
				nodeCachedDataDir: this.environmentService.nodeCachedDataDir,
				windowId: this._processExplorerWindow.id,
				userEnv: this.userEnv,
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

			this._processExplorerWindow.loadURL(`${require.toUrl('vs/code/electron-browser/processExplorer/processExplorer.html')}?config=${encodeURIComponent(JSON.stringify(config))}`);

			this._processExplorerWindow.on('close', () => this._processExplorerWindow = void 0);
		}

		// Focus
		this._processExplorerWindow.focus();

		return TPromise.as(null);
	}

	private getWindowPosition(parentWindow: BrowserWindow, defaultWidth: number, defaultHeight: number) {
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
			if (!displayToUse && parentWindow) {
				displayToUse = screen.getDisplayMatching(parentWindow.getBounds());
			}

			// fallback to primary display or first display
			if (!displayToUse) {
				displayToUse = screen.getPrimaryDisplay() || displays[0];
			}
		}

		let state = {
			width: defaultWidth,
			height: defaultHeight,
			x: undefined,
			y: undefined
		};

		const displayBounds = displayToUse.bounds;
		state.x = displayBounds.x + (displayBounds.width / 2) - (state.width / 2);
		state.y = displayBounds.y + (displayBounds.height / 2) - (state.height / 2);

		if (displayBounds.width > 0 && displayBounds.height > 0 /* Linux X11 sessions sometimes report wrong display bounds */) {
			if (state.x < displayBounds.x) {
				state.x = displayBounds.x; // prevent window from falling out of the screen to the left
			}

			if (state.y < displayBounds.y) {
				state.y = displayBounds.y; // prevent window from falling out of the screen to the top
			}

			if (state.x > (displayBounds.x + displayBounds.width)) {
				state.x = displayBounds.x; // prevent window from falling out of the screen to the right
			}

			if (state.y > (displayBounds.y + displayBounds.height)) {
				state.y = displayBounds.y; // prevent window from falling out of the screen to the bottom
			}

			if (state.width > displayBounds.width) {
				state.width = displayBounds.width; // prevent window from exceeding display bounds width
			}

			if (state.height > displayBounds.height) {
				state.height = displayBounds.height; // prevent window from exceeding display bounds height
			}
		}

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
						this.logService.warn('issueService#getPerformanceInfo ', err.message);
						reject(err);
					});
			});
		});
	}

	private getIssueReporterPath(data: IssueReporterData, features: IssueReporterFeatures) {
		const windowConfiguration = {
			appRoot: this.environmentService.appRoot,
			nodeCachedDataDir: this.environmentService.nodeCachedDataDir,
			windowId: this._issueWindow.id,
			machineId: this.machineId,
			userEnv: this.userEnv,
			data,
			features
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
