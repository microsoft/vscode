/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as crypto from 'crypto';
import nls = require('vs/nls');
import pfs = require('vs/base/node/pfs');
import { TPromise } from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import { createApiFactory, defineAPI } from 'vs/workbench/api/node/extHost.api.impl';
import { IMainProcessExtHostIPC } from 'vs/platform/extensions/common/ipcRemoteCom';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtHostThreadService } from 'vs/workbench/services/thread/common/extHostThreadService';
import { RemoteTelemetryService } from 'vs/workbench/api/node/extHostTelemetry';
import { IWorkspaceContextService, WorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInitData, IEnvironment, MainContext } from 'vs/workbench/api/node/extHost.protocol';
import * as errors from 'vs/base/common/errors';

const nativeExit = process.exit.bind(process);
process.exit = function () {
	const err = new Error('An extension called process.exit() and this was prevented.');
	console.warn((<any>err).stack);
};
export function exit(code?: number) {
	nativeExit(code);
}

interface ITestRunner {
	run(testsRoot: string, clb: (error: Error, failures?: number) => void): void;
}

export class ExtensionHostMain {

	private _isTerminating: boolean;
	private _contextService: IWorkspaceContextService;
	private _environment: IEnvironment;
	private _extensionService: ExtHostExtensionService;

	constructor(remoteCom: IMainProcessExtHostIPC, initData: IInitData) {
		this._isTerminating = false;

		this._environment = initData.environment;

		this._contextService = new WorkspaceContextService(initData.contextService.workspace);
		const workspaceStoragePath = this._getOrCreateWorkspaceStoragePath();

		const threadService = new ExtHostThreadService(remoteCom);

		const telemetryService = new RemoteTelemetryService('pluginHostTelemetry', threadService);

		this._extensionService = new ExtHostExtensionService(initData.extensions, threadService, telemetryService, { _serviceBrand: 'optionalArgs', workspaceStoragePath });

		// Error forwarding
		const mainThreadErrors = threadService.get(MainContext.MainThreadErrors);
		errors.setUnexpectedErrorHandler(err => mainThreadErrors.onUnexpectedExtHostError(errors.transformErrorForSerialization(err)));

		// Create the ext host API
		const factory = createApiFactory(initData, threadService, this._extensionService, this._contextService);
		defineAPI(factory, this._extensionService);
	}

	private _getOrCreateWorkspaceStoragePath(): string {
		let workspaceStoragePath: string;

		const workspace = this._contextService.getWorkspace();

		function rmkDir(directory: string): boolean {
			try {
				fs.mkdirSync(directory);
				return true;
			} catch (err) {
				if (err.code === 'ENOENT') {
					if (rmkDir(paths.dirname(directory))) {
						fs.mkdirSync(directory);
						return true;
					}
				} else {
					return fs.statSync(directory).isDirectory();
				}
			}
		}

		if (workspace) {
			const hash = crypto.createHash('md5');
			hash.update(workspace.resource.fsPath);
			if (workspace.uid) {
				hash.update(workspace.uid.toString());
			}
			workspaceStoragePath = paths.join(this._environment.appSettingsHome, 'workspaceStorage', hash.digest('hex'));
			if (!fs.existsSync(workspaceStoragePath)) {
				try {
					if (rmkDir(workspaceStoragePath)) {
						fs.writeFileSync(paths.join(workspaceStoragePath, 'meta.json'), JSON.stringify({
							workspacePath: workspace.resource.fsPath,
							uid: workspace.uid ? workspace.uid : null
						}, null, 4));
					} else {
						workspaceStoragePath = undefined;
					}
				} catch (err) {
					workspaceStoragePath = undefined;
				}
			}
		}

		return workspaceStoragePath;
	}

	public start(): TPromise<void> {
		return this.handleEagerExtensions().then(() => this.handleExtensionTests());
	}

	public terminate(): void {
		if (this._isTerminating) {
			// we are already shutting down...
			return;
		}
		this._isTerminating = true;

		errors.setUnexpectedErrorHandler((err) => {
			// TODO: write to log once we have one
		});

		let allPromises: TPromise<void>[] = [];
		try {
			let allExtensions = this._extensionService.getAllExtensionDescriptions();
			let allExtensionsIds = allExtensions.map(ext => ext.id);
			let activatedExtensions = allExtensionsIds.filter(id => this._extensionService.isActivated(id));

			allPromises = activatedExtensions.map((extensionId) => {
				return this._extensionService.deactivate(extensionId);
			});
		} catch (err) {
			// TODO: write to log once we have one
		}

		let extensionsDeactivated = TPromise.join(allPromises).then<void>(() => void 0);

		// Give extensions 1 second to wrap up any async dispose, then exit
		setTimeout(() => {
			TPromise.any<void>([TPromise.timeout(4000), extensionsDeactivated]).then(() => exit(), () => exit());
		}, 1000);
	}

	// Handle "eager" activation extensions
	private handleEagerExtensions(): TPromise<void> {
		this._extensionService.activateByEvent('*').then(null, (err) => {
			console.error(err);
		});
		return this.handleWorkspaceContainsEagerExtensions();
	}

	private handleWorkspaceContainsEagerExtensions(): TPromise<void> {
		let workspace = this._contextService.getWorkspace();
		if (!workspace || !workspace.resource) {
			return TPromise.as(null);
		}

		const folderPath = workspace.resource.fsPath;

		const desiredFilesMap: {
			[filename: string]: boolean;
		} = {};

		this._extensionService.getAllExtensionDescriptions().forEach((desc) => {
			let activationEvents = desc.activationEvents;
			if (!activationEvents) {
				return;
			}

			for (let i = 0; i < activationEvents.length; i++) {
				if (/^workspaceContains:/.test(activationEvents[i])) {
					let fileName = activationEvents[i].substr('workspaceContains:'.length);
					desiredFilesMap[fileName] = true;
				}
			}
		});

		const fileNames = Object.keys(desiredFilesMap);

		return TPromise.join(fileNames.map(f => pfs.exists(paths.join(folderPath, f)))).then(exists => {
			fileNames
				.filter((f, i) => exists[i])
				.forEach(fileName => {
					const activationEvent = `workspaceContains:${fileName}`;

					this._extensionService.activateByEvent(activationEvent)
						.done(null, err => console.error(err));
				});
		});
	}

	private handleExtensionTests(): TPromise<void> {
		if (!this._environment.extensionTestsPath || !this._environment.extensionDevelopmentPath) {
			return TPromise.as(null);
		}

		// Require the test runner via node require from the provided path
		let testRunner: ITestRunner;
		let requireError: Error;
		try {
			testRunner = <any>require.__$__nodeRequire(this._environment.extensionTestsPath);
		} catch (error) {
			requireError = error;
		}

		// Execute the runner if it follows our spec
		if (testRunner && typeof testRunner.run === 'function') {
			return new TPromise<void>((c, e) => {
				testRunner.run(this._environment.extensionTestsPath, (error, failures) => {
					if (error) {
						e(error.toString());
					} else {
						c(null);
					}

					// after tests have run, we shutdown the host
					this.gracefulExit(failures && failures > 0 ? 1 /* ERROR */ : 0 /* OK */);
				});
			});
		}

		// Otherwise make sure to shutdown anyway even in case of an error
		else {
			this.gracefulExit(1 /* ERROR */);
		}

		return TPromise.wrapError<void>(requireError ? requireError.toString() : nls.localize('extensionTestError', "Path {0} does not point to a valid extension test runner.", this._environment.extensionTestsPath));
	}

	private gracefulExit(code: number): void {
		// to give the PH process a chance to flush any outstanding console
		// messages to the main process, we delay the exit() by some time
		setTimeout(() => exit(code), 500);
	}
}
