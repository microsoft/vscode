/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IWindowService, IWindowConfiguration, INativeOpenDialogOptions, IEnterWorkspaceResult, IURIToOpen, IMessageBoxResult, IPath, IPathsToWaitFor } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ExportData } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';

export class SimpleWindowConfiguration implements IWindowConfiguration {
	_: any[];
	machineId: string;
	windowId: number;
	logLevel: LogLevel;

	mainPid: number;

	appRoot: string;
	execPath: string;
	isInitialStartup?: boolean;

	userEnv: IProcessEnvironment;
	nodeCachedDataDir?: string;

	backupPath?: string;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	remoteAuthority?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	frameless?: boolean;
	accessibilitySupport?: boolean;
	partsSplashPath?: string;

	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
	perfEntries: ExportData;

	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;
}

export class SimpleWindowService implements IWindowService {

	_serviceBrand: any;

	readonly onDidChangeFocus: Event<boolean> = Event.None;
	readonly onDidChangeMaximize: Event<boolean> = Event.None;

	hasFocus = true;

	private configuration: IWindowConfiguration = new SimpleWindowConfiguration();

	isFocused(): Promise<boolean> {
		return Promise.resolve(false);
	}

	isMaximized(): Promise<boolean> {
		return Promise.resolve(false);
	}

	getConfiguration(): IWindowConfiguration {
		return this.configuration;
	}

	getCurrentWindowId(): number {
		return 0;
	}

	pickFileFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFileAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickWorkspaceAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	reloadWindow(): Promise<void> {
		return Promise.resolve();
	}

	openDevTools(): Promise<void> {
		return Promise.resolve();
	}

	toggleDevTools(): Promise<void> {
		return Promise.resolve();
	}

	closeWorkspace(): Promise<void> {
		return Promise.resolve();
	}

	enterWorkspace(_path: URI): Promise<IEnterWorkspaceResult | undefined> {
		return Promise.resolve(undefined);
	}

	toggleFullScreen(): Promise<void> {
		return Promise.resolve();
	}

	setRepresentedFilename(_fileName: string): Promise<void> {
		return Promise.resolve();
	}

	getRecentlyOpened(): Promise<IRecentlyOpened> {
		return Promise.resolve({
			workspaces: [],
			files: []
		});
	}

	focusWindow(): Promise<void> {
		return Promise.resolve();
	}

	maximizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	unmaximizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	minimizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	openWindow(_uris: IURIToOpen[], _options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	closeWindow(): Promise<void> {
		return Promise.resolve();
	}

	setDocumentEdited(_flag: boolean): Promise<void> {
		return Promise.resolve();
	}

	onWindowTitleDoubleClick(): Promise<void> {
		return Promise.resolve();
	}

	show(): Promise<void> {
		return Promise.resolve();
	}

	showMessageBox(_options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		return Promise.resolve({ button: 0 });
	}

	showSaveDialog(_options: Electron.SaveDialogOptions): Promise<string> {
		throw new Error('not implemented');
	}

	showOpenDialog(_options: Electron.OpenDialogOptions): Promise<string[]> {
		throw new Error('not implemented');
	}

	updateTouchBar(_items: ISerializableCommandAction[][]): Promise<void> {
		return Promise.resolve();
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}
}