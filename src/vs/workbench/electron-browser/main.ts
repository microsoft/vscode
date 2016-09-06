/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {WorkbenchShell} from 'vs/workbench/electron-browser/shell';
import {IOptions} from 'vs/workbench/common/options';
import {domContentLoaded} from 'vs/base/browser/dom';
import errors = require('vs/base/common/errors');
import platform = require('vs/base/common/platform');
import paths = require('vs/base/common/paths');
import timer = require('vs/base/common/timer');
import uri from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {EventService} from 'vs/platform/event/common/eventService';
import {LegacyWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IWorkspace} from 'vs/platform/workspace/common/workspace';
import {WorkspaceConfigurationService} from 'vs/workbench/services/configuration/node/configurationService';
import {ParsedArgs} from 'vs/platform/environment/node/argv';
import {realpath} from 'vs/base/node/pfs';
import {EnvironmentService} from 'vs/platform/environment/node/environmentService';
import path = require('path');
import fs = require('fs');
import gracefulFs = require('graceful-fs');
import {IPath, IOpenFileRequest} from 'vs/workbench/electron-browser/common';

gracefulFs.gracefulify(fs); // enable gracefulFs

const timers = (<any>window).MonacoEnvironment.timers;

export interface IWindowConfiguration extends ParsedArgs, IOpenFileRequest {
	appRoot: string;
	execPath: string;

	userEnv: any; /* vs/code/electron-main/env/IProcessEnvironment*/

	workspacePath?: string;

	extensionsToInstall?: string[];
}

export function startup(configuration: IWindowConfiguration): TPromise<void> {

	// Shell Options
	const filesToOpen = configuration.filesToOpen && configuration.filesToOpen.length ? toInputs(configuration.filesToOpen) : null;
	const filesToCreate = configuration.filesToCreate && configuration.filesToCreate.length ? toInputs(configuration.filesToCreate) : null;
	const filesToDiff = configuration.filesToDiff && configuration.filesToDiff.length ? toInputs(configuration.filesToDiff) : null;
	const shellOptions: IOptions = {
		filesToOpen,
		filesToCreate,
		filesToDiff,
		extensionsToInstall: configuration.extensionsToInstall
	};

	if (configuration.performance) {
		timer.ENABLE_TIMER = true;
	}

	// Resolve workspace
	return getWorkspace(configuration.workspacePath).then(workspace => {

		// Open workbench
		return openWorkbench(configuration, workspace, shellOptions);
	});
}

function toInputs(paths: IPath[]): IResourceInput[] {
	return paths.map(p => {
		const input = <IResourceInput>{
			resource: uri.file(p.filePath)
		};

		if (p.lineNumber) {
			input.options = {
				selection: {
					startLineNumber: p.lineNumber,
					startColumn: p.columnNumber
				}
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
		const folderStat = fs.statSync(realWorkspacePath);

		return <IWorkspace>{
			'resource': workspaceResource,
			'name': folderName,
			'uid': platform.isLinux ? folderStat.ino : folderStat.birthtime.getTime() // On Linux, birthtime is ctime, so we cannot use it! We use the ino instead!
		};
	}, (error) => {
		errors.onUnexpectedError(error);

		return null; // treat invalid paths as empty workspace
	});
}

function openWorkbench(environment: IWindowConfiguration, workspace: IWorkspace, options: IOptions): TPromise<void> {
	const eventService = new EventService();
	const environmentService = new EnvironmentService(environment, environment.execPath);
	const contextService = new LegacyWorkspaceContextService(workspace, options);
	const configurationService = new WorkspaceConfigurationService(contextService, eventService, environmentService);

	// Since the configuration service is one of the core services that is used in so many places, we initialize it
	// right before startup of the workbench shell to have its data ready for consumers
	return configurationService.initialize().then(() => {
		timers.beforeReady = new Date();

		return domContentLoaded().then(() => {
			timers.afterReady = new Date();

			// Open Shell
			const beforeOpen = new Date();
			const shell = new WorkbenchShell(document.body, workspace, {
				configurationService,
				eventService,
				contextService,
				environmentService
			}, options);
			shell.open();

			shell.joinCreation().then(() => {
				timer.start(timer.Topic.STARTUP, 'Open Shell, Viewconst & Editor', beforeOpen, 'Workbench has opened after this event with viewconst and editor restored').stop();
			});

			// Inform user about loading issues from the loader
			(<any>self).require.config({
				onError: (err: any) => {
					if (err.errorCode === 'load') {
						shell.onUnexpectedError(errors.loaderError(err));
					}
				}
			});
		});
	});
}