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
import {IEnv} from 'vs/base/node/env';
import {IWorkspace, IConfiguration, IEnvironment} from 'vs/platform/workspace/common/workspace';

import path = require('path');
import fs = require('fs');

import gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

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
	userEnv: IEnv;
}

export function startup(environment: IMainEnvironment, globalSettings: IGlobalSettings): winjs.TPromise<void> {

	// Inherit the user environment
	assign(process.env, environment.userEnv);

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
	(<any>window).MonacoEnvironment.timers.beforeReady = new Date();

	return (<any>winjs).Utilities.ready(() => {
		(<any>window).MonacoEnvironment.timers.afterReady = new Date();

		// Monaco Workbench Shell
		let beforeOpen = new Date();
		let shell = new WorkbenchShell(document.body, workspace, configuration, options);
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
	}, true);
}