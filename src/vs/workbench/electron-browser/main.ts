/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { WorkbenchShell } from 'vs/workbench/electron-browser/shell';
import { IOptions } from 'vs/workbench/common/options';
import * as browser from 'vs/base/browser/browser';
import { domContentLoaded } from 'vs/base/browser/dom';
import errors = require('vs/base/common/errors');
import comparer = require('vs/base/common/comparers');
import platform = require('vs/base/common/platform');
import paths = require('vs/base/common/paths');
import uri from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import { WorkspaceConfigurationService } from 'vs/workbench/services/configuration/node/configuration';
import { realpath, stat, readFile } from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import path = require('path');
import gracefulFs = require('graceful-fs');
import { IInitData } from 'vs/workbench/services/timer/common/timerService';
import { TimerService } from 'vs/workbench/services/timer/node/timerService';
import { KeyboardMapperFactory } from "vs/workbench/services/keybinding/electron-browser/keybindingService";
import { IWindowConfiguration, IPath } from 'vs/platform/windows/common/windows';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { StorageService, inMemoryLocalStorageInstance } from 'vs/platform/storage/common/storageService';

import { webFrame } from 'electron';

import fs = require('fs');
import { createHash } from 'crypto';
gracefulFs.gracefulify(fs); // enable gracefulFs

export function startup(configuration: IWindowConfiguration): TPromise<void> {

	// Ensure others can listen to zoom level changes
	browser.setZoomFactor(webFrame.getZoomFactor());

	// See https://github.com/Microsoft/vscode/issues/26151
	// Can be trusted because we are not setting it ourselves.
	browser.setZoomLevel(webFrame.getZoomLevel(), true /* isTrusted */);

	browser.setFullscreen(!!configuration.fullscreen);

	KeyboardMapperFactory.INSTANCE._onKeyboardLayoutChanged(configuration.isISOKeyboard);

	browser.setAccessibilitySupport(configuration.accessibilitySupport ? platform.AccessibilitySupport.Enabled : platform.AccessibilitySupport.Disabled);

	// Setup Intl
	comparer.setFileNameComparer(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }));

	// Shell Options
	const filesToOpen = configuration.filesToOpen && configuration.filesToOpen.length ? toInputs(configuration.filesToOpen) : null;
	const filesToCreate = configuration.filesToCreate && configuration.filesToCreate.length ? toInputs(configuration.filesToCreate) : null;
	const filesToDiff = configuration.filesToDiff && configuration.filesToDiff.length ? toInputs(configuration.filesToDiff) : null;
	const shellOptions: IOptions = {
		filesToOpen,
		filesToCreate,
		filesToDiff
	};

	// Open workbench
	return openWorkbench(configuration, shellOptions);
}

function toInputs(paths: IPath[], isUntitledFile?: boolean): IResourceInput[] {
	return paths.map(p => {
		const input = <IResourceInput>{};

		if (isUntitledFile) {
			input.resource = uri.from({ scheme: 'untitled', path: p.filePath });
		} else {
			input.resource = uri.file(p.filePath);
		}

		input.options = {
			pinned: true // opening on startup is always pinned and not preview
		};

		if (p.lineNumber) {
			input.options.selection = {
				startLineNumber: p.lineNumber,
				startColumn: p.columnNumber
			};
		}

		return input;
	});
}

function openWorkbench(configuration: IWindowConfiguration, options: IOptions): TPromise<void> {
	return resolveWorkspaceData(configuration).then(workspaceData => {
		const environmentService = new EnvironmentService(configuration, configuration.execPath);
		const workspaceConfigurationService = new WorkspaceConfigurationService(environmentService, createMultiRootWorkspace(workspaceData));
		const timerService = new TimerService((<any>window).MonacoEnvironment.timers as IInitData, !!workspaceData);
		const storageService = createStorageService(workspaceData, configuration, environmentService);

		// Since the configuration service is one of the core services that is used in so many places, we initialize it
		// right before startup of the workbench shell to have its data ready for consumers
		return workspaceConfigurationService.initialize().then(() => {
			timerService.beforeDOMContentLoaded = Date.now();

			return domContentLoaded().then(() => {
				timerService.afterDOMContentLoaded = Date.now();

				// Open Shell
				timerService.beforeWorkbenchOpen = Date.now();
				const shell = new WorkbenchShell(document.body, {
					contextService: workspaceConfigurationService,
					configurationService: workspaceConfigurationService,
					environmentService,
					timerService,
					storageService
				}, configuration, options);
				shell.open();

				// Inform user about loading issues from the loader
				(<any>self).require.config({
					onError: (err: any) => {
						if (err.errorCode === 'load') {
							shell.onUnexpectedError(loaderError(err));
						}
					}
				});
			});
		});
	});
}

function createMultiRootWorkspace(workspaceData: ISingleFolderWorkspaceData | IMultiRootWorkspaceData): Workspace {
	if (!workspaceData) {
		return null;
	}

	let id: string;
	let name: string;
	let folders: uri[];

	const singleFolderWorkspaceData = workspaceData as ISingleFolderWorkspaceData;
	if (singleFolderWorkspaceData.folderPath) {
		folders = [uri.file(singleFolderWorkspaceData.folderPath)];
		id = createHash('md5').update(folders[0].fsPath).update(singleFolderWorkspaceData.ctime ? String(singleFolderWorkspaceData.ctime) : '').digest('hex');
		name = path.basename(folders[0].fsPath);
	} else {
		const multiRootWorkspaceData = workspaceData as IMultiRootWorkspaceData;
		id = multiRootWorkspaceData.id;
		folders = multiRootWorkspaceData.folders.map(f => uri.parse(f));
		name = multiRootWorkspaceData.name;
	}

	return new Workspace(id, name, folders);
}

interface ISingleFolderWorkspaceData {
	folderPath: string;
	ctime: number;
}

interface IMultiRootWorkspaceData {
	id: string;
	name: string;
	folders: string[];
}

function resolveWorkspaceData(configuration: IWindowConfiguration): TPromise<ISingleFolderWorkspaceData | IMultiRootWorkspaceData> {
	if (configuration.workspaceConfigPath) {
		return resolveMultiRootWorkspaceData(configuration);
	}

	if (configuration.folderPath) {
		return resolveSingleFolderWorkspaceData(configuration);
	}

	return TPromise.as(null);
}

function resolveSingleFolderWorkspaceData(configuration: IWindowConfiguration): TPromise<ISingleFolderWorkspaceData> {
	return realpath(configuration.folderPath).then(realFolderPath => {

		// for some weird reason, node adds a trailing slash to UNC paths
		// we never ever want trailing slashes as our workspace path unless
		// someone opens root ("/").
		// See also https://github.com/nodejs/io.js/issues/1765
		if (paths.isUNC(realFolderPath) && strings.endsWith(realFolderPath, paths.nativeSep)) {
			realFolderPath = strings.rtrim(realFolderPath, paths.nativeSep);
		}

		// update config
		configuration.folderPath = realFolderPath;

		// resolve ctime of workspace
		return stat(realFolderPath).then(folderStat => {
			return {
				folderPath: realFolderPath,
				ctime: platform.isLinux ? folderStat.ino : folderStat.birthtime.getTime() // On Linux, birthtime is ctime, so we cannot use it! We use the ino instead!
			} as ISingleFolderWorkspaceData;
		});
	}, error => {
		errors.onUnexpectedError(error);

		return null; // treat invalid paths as empty window
	});
}

function resolveMultiRootWorkspaceData(configuration: IWindowConfiguration): TPromise<IMultiRootWorkspaceData> {
	return readFile(configuration.workspaceConfigPath).then(buffer => {
		const contents = buffer.toString('utf8');

		const res = JSON.parse(contents) as IMultiRootWorkspaceData;
		if (!res.name) {
			res.name = path.basename(configuration.workspaceConfigPath);
		}

		return res;
	}, error => {
		errors.onUnexpectedError(error);

		return null; // treat invalid paths as empty window
	});
}

function createStorageService(workspaceData: ISingleFolderWorkspaceData | IMultiRootWorkspaceData, configuration: IWindowConfiguration, environmentService: IEnvironmentService): IStorageService {
	let workspaceId: string;
	let secondaryWorkspaceId: number;

	const singleFolderWorkspaceData = workspaceData as ISingleFolderWorkspaceData;
	const multiRootWorkspaceData = workspaceData as IMultiRootWorkspaceData;

	// in multi root workspace mode we use the provided ID as key for workspace storage
	if (multiRootWorkspaceData && multiRootWorkspaceData.id) {
		workspaceId = uri.from({ path: multiRootWorkspaceData.id, scheme: 'root' }).toString();
	}

	// in single folder mode we use the path of the opened folder as key for workspace storage
	// the ctime is used as secondary workspace id to clean up stale UI state if necessary
	else if (singleFolderWorkspaceData && singleFolderWorkspaceData.folderPath) {
		workspaceId = uri.file(singleFolderWorkspaceData.folderPath).toString();
		secondaryWorkspaceId = singleFolderWorkspaceData.ctime;
	}

	// finaly, if we do not have a workspace open, we need to find another identifier for the window to store
	// workspace UI state. if we have a backup path in the configuration we can use that because this
	// will be a unique identifier per window that is stable between restarts as long as there are
	// dirty files in the workspace.
	// We use basename() to produce a short identifier, we do not need the full path. We use a custom
	// scheme so that we can later distinguish these identifiers from the workspace one.
	else if (configuration.backupPath) {
		workspaceId = uri.from({ path: path.basename(configuration.backupPath), scheme: 'empty' }).toString();
	}

	const disableStorage = !!environmentService.extensionTestsPath; // never keep any state when running extension tests!
	const storage = disableStorage ? inMemoryLocalStorageInstance : window.localStorage;

	return new StorageService(storage, storage, workspaceId, secondaryWorkspaceId);
}

function loaderError(err: Error): Error {
	if (platform.isWeb) {
		return new Error(nls.localize('loaderError', "Failed to load a required file. Either you are no longer connected to the internet or the server you are connected to is offline. Please refresh the browser to try again."));
	}

	return new Error(nls.localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err)));
}
