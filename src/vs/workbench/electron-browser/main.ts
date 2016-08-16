/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import winjs = require('vs/base/common/winjs.base');
import {WorkbenchShell} from 'vs/workbench/electron-browser/shell';
import {IOptions, IGlobalSettings} from 'vs/workbench/common/options';
import errors = require('vs/base/common/errors');
import platform = require('vs/base/common/platform');
import paths = require('vs/base/common/paths');
import timer = require('vs/base/common/timer');
import uri from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {EventService} from 'vs/platform/event/common/eventService';
import {WorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IWorkspace, IConfiguration, IEnvironment} from 'vs/platform/workspace/common/workspace';
import {ConfigurationService} from 'vs/workbench/services/configuration/node/configurationService';
import {EnvironmentService} from 'vs/platform/environment/node/environmentService';
import path = require('path');
import fs = require('fs');
import gracefulFs = require('graceful-fs');

gracefulFs.gracefulify(fs); // enable gracefulFs

const timers = (<any>window).MonacoEnvironment.timers;

function domContentLoaded(): winjs.Promise {
	return new winjs.Promise((c, e) => {
		const readyState = document.readyState;
		if (readyState === 'complete' || (document && document.body !== null)) {
			window.setImmediate(c);
		} else {
			window.addEventListener('DOMContentLoaded', c, false);
		}
	});
}

export interface IPath {
	filePath: string;
	lineNumber?: number;
	columnNumber?: number;
}

export interface IMainEnvironment extends IEnvironment {
	workspacePath?: string;
	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
	extensionsToInstall?: string[];
	userEnv: { [key: string]: string; };
}

export function startup(environment: IMainEnvironment, globalSettings: IGlobalSettings): winjs.TPromise<void> {

	// Shell Configuration
	const shellConfiguration: IConfiguration = {
		env: environment
	};

	// Shell Options
	const filesToOpen = environment.filesToOpen && environment.filesToOpen.length ? toInputs(environment.filesToOpen) : null;
	const filesToCreate = environment.filesToCreate && environment.filesToCreate.length ? toInputs(environment.filesToCreate) : null;
	const filesToDiff = environment.filesToDiff && environment.filesToDiff.length ? toInputs(environment.filesToDiff) : null;
	const shellOptions: IOptions = {
		singleFileMode: !environment.workspacePath,
		filesToOpen: filesToOpen,
		filesToCreate: filesToCreate,
		filesToDiff: filesToDiff,
		extensionsToInstall: environment.extensionsToInstall,
		globalSettings: globalSettings
	};

	if (environment.enablePerformance) {
		timer.ENABLE_TIMER = true;
	}

	// Open workbench
	return openWorkbench(getWorkspace(environment), shellConfiguration, shellOptions);
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

function getWorkspace(environment: IMainEnvironment): IWorkspace {
	if (!environment.workspacePath) {
		return null;
	}

	let realWorkspacePath = path.normalize(fs.realpathSync(environment.workspacePath));
	if (paths.isUNC(realWorkspacePath) && strings.endsWith(realWorkspacePath, paths.nativeSep)) {
		// for some weird reason, node adds a trailing slash to UNC paths
		// we never ever want trailing slashes as our workspace path unless
		// someone opens root ("/").
		// See also https://github.com/nodejs/io.js/issues/1765
		realWorkspacePath = strings.rtrim(realWorkspacePath, paths.nativeSep);
	}

	const workspaceResource = uri.file(realWorkspacePath);
	const folderName = path.basename(realWorkspacePath) || realWorkspacePath;
	const folderStat = fs.statSync(realWorkspacePath);

	return <IWorkspace>{
		'resource': workspaceResource,
		'id': platform.isLinux ? realWorkspacePath : realWorkspacePath.toLowerCase(),
		'name': folderName,
		'uid': platform.isLinux ? folderStat.ino : folderStat.birthtime.getTime(), // On Linux, birthtime is ctime, so we cannot use it! We use the ino instead!
		'mtime': folderStat.mtime.getTime()
	};
}

function openWorkbench(workspace: IWorkspace, configuration: IConfiguration, options: IOptions): winjs.TPromise<void> {
	const eventService = new EventService();
	const environmentService = new EnvironmentService();
	const contextService = new WorkspaceContextService(eventService, workspace, configuration, options);
	const configurationService = new ConfigurationService(contextService, eventService);

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
			}, configuration, options);
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