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
import {assign} from 'vs/base/common/objects';
import uri from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {EventService} from 'vs/platform/event/common/eventService';
import {WorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IWorkspace, IConfiguration, IEnvironment} from 'vs/platform/workspace/common/workspace';
import {ConfigurationService} from 'vs/workbench/services/configuration/node/configurationService';

import path = require('path');
import fs = require('fs');

import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

const timers = (<any>window).MonacoEnvironment.timers;

function domContentLoaded(): winjs.Promise {
	return new winjs.Promise((c, e) => {
		var readyState = document.readyState;
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

	// Inherit the user environment
	// TODO@Joao: this inheritance should **not** happen here!
	if (process.env['VSCODE_CLI'] !== '1') {
		assign(process.env, environment.userEnv);
	}

	// Shell Configuration
	let shellConfiguration: IConfiguration = {
		env: environment
	};

	// Shell Options
	let filesToOpen = environment.filesToOpen && environment.filesToOpen.length ? toInputs(environment.filesToOpen) : null;
	let filesToCreate = environment.filesToCreate && environment.filesToCreate.length ? toInputs(environment.filesToCreate) : null;
	let filesToDiff = environment.filesToDiff && environment.filesToDiff.length ? toInputs(environment.filesToDiff) : null;
	let shellOptions: IOptions = {
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
		let input = <IResourceInput>{
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

	let workspaceResource = uri.file(realWorkspacePath);
	let folderName = path.basename(realWorkspacePath) || realWorkspacePath;
	let folderStat = fs.statSync(realWorkspacePath);

	let workspace: IWorkspace = {
		'resource': workspaceResource,
		'id': platform.isLinux ? realWorkspacePath : realWorkspacePath.toLowerCase(),
		'name': folderName,
		'uid': platform.isLinux ? folderStat.ino : folderStat.birthtime.getTime(), // On Linux, birthtime is ctime, so we cannot use it! We use the ino instead!
		'mtime': folderStat.mtime.getTime()
	};

	return workspace;
}

function openWorkbench(workspace: IWorkspace, configuration: IConfiguration, options: IOptions): winjs.TPromise<void> {
	let eventService = new EventService();
	let contextService = new WorkspaceContextService(eventService, workspace, configuration, options);
	let configurationService = new ConfigurationService(contextService, eventService);

	// Since the configuration service is one of the core services that is used in so many places, we initialize it
	// right before startup of the workbench shell to have its data ready for consumers
	return configurationService.initialize().then(() => {
		timers.beforeReady = new Date();

		return domContentLoaded().then(() => {
			timers.afterReady = new Date();

			// Open Shell
			let beforeOpen = new Date();
			let shell = new WorkbenchShell(document.body, workspace, {
				configurationService,
				eventService,
				contextService
			}, configuration, options);
			shell.open();

			shell.joinCreation().then(() => {
				timer.start(timer.Topic.STARTUP, 'Open Shell, Viewlet & Editor', beforeOpen, 'Workbench has opened after this event with viewlet and editor restored').stop();
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