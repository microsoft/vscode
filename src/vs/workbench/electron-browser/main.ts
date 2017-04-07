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
import { IWorkspace, WorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { WorkspaceConfigurationService } from 'vs/workbench/services/configuration/node/configurationService';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { realpath, stat } from 'vs/base/node/pfs';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import path = require('path');
import gracefulFs = require('graceful-fs');
import { IPath, IOpenFileRequest } from 'vs/workbench/electron-browser/common';
import { IInitData } from 'vs/workbench/services/timer/common/timerService';
import { TimerService } from 'vs/workbench/services/timer/node/timerService';

import { webFrame } from 'electron';

import fs = require('fs');
gracefulFs.gracefulify(fs); // enable gracefulFs

export interface IWindowConfiguration extends ParsedArgs, IOpenFileRequest {
	appRoot: string;
	execPath: string;

	userEnv: any; /* vs/code/electron-main/env/IProcessEnvironment*/

	workspacePath?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
}

export function startup(configuration: IWindowConfiguration): TPromise<void> {

	// Ensure others can listen to zoom level changes
	browser.setZoomFactor(webFrame.getZoomFactor());
	browser.setZoomLevel(webFrame.getZoomLevel());
	browser.setFullscreen(!!configuration.fullscreen);

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

	// Resolve workspace
	return getWorkspace(configuration.workspacePath).then(workspace => {

		// Open workbench
		return openWorkbench(configuration, workspace, shellOptions);
	});
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

function getWorkspace(workspacePath: string): TPromise<IWorkspace> {
	if (!workspacePath) {
		return TPromise.as(null);
	}

	return realpath(workspacePath).then(realWorkspacePath => {

		// for some weird reason, node adds a trailing slash to UNC paths
		// we never ever want trailing slashes as our workspace path unless
		// someone opens root ("/").
		// See also https://github.com/nodejs/io.js/issues/1765
		if (paths.isUNC(realWorkspacePath) && strings.endsWith(realWorkspacePath, paths.nativeSep)) {
			realWorkspacePath = strings.rtrim(realWorkspacePath, paths.nativeSep);
		}

		const workspaceResource = uri.file(realWorkspacePath);
		const folderName = path.basename(realWorkspacePath) || realWorkspacePath;

		return stat(realWorkspacePath).then(folderStat => {
			return <IWorkspace>{
				'resource': workspaceResource,
				'name': folderName,
				'uid': platform.isLinux ? folderStat.ino : folderStat.birthtime.getTime() // On Linux, birthtime is ctime, so we cannot use it! We use the ino instead!
			};
		});
	}, (error) => {
		errors.onUnexpectedError(error);

		return null; // treat invalid paths as empty workspace
	});
}

function openWorkbench(environment: IWindowConfiguration, workspace: IWorkspace, options: IOptions): TPromise<void> {
	const environmentService = new EnvironmentService(environment, environment.execPath);
	const contextService = new WorkspaceContextService(workspace);
	const configurationService = new WorkspaceConfigurationService(contextService, environmentService);
	const timerService = new TimerService((<any>window).MonacoEnvironment.timers as IInitData, !contextService.hasWorkspace());

	// Since the configuration service is one of the core services that is used in so many places, we initialize it
	// right before startup of the workbench shell to have its data ready for consumers
	return configurationService.initialize().then(() => {
		timerService.beforeDOMContentLoaded = Date.now();

		return domContentLoaded().then(() => {
			timerService.afterDOMContentLoaded = Date.now();

			// Open Shell
			timerService.beforeWorkbenchOpen = Date.now();
			const shell = new WorkbenchShell(document.body, {
				configurationService,
				contextService,
				environmentService,
				timerService
			}, options);
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
}

function loaderError(err: Error): Error {
	if (platform.isWeb) {
		return new Error(nls.localize('loaderError', "Failed to load a required file. Either you are no longer connected to the internet or the server you are connected to is offline. Please refresh the browser to try again."));
	}

	return new Error(nls.localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err)));
}
