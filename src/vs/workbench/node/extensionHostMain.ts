/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import pfs = require('vs/base/node/pfs');
import { TPromise } from 'vs/base/common/winjs.base';
import { join } from 'path';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { QueryType, ISearchQuery } from 'vs/platform/search/common/search';
import { DiskSearch } from 'vs/workbench/services/search/node/searchService';
import { IInitData, IEnvironment, IWorkspaceData, MainContext } from 'vs/workbench/api/node/extHost.protocol';
import * as errors from 'vs/base/common/errors';
import * as watchdog from 'native-watchdog';
import * as glob from 'vs/base/common/glob';
import { ExtensionActivatedByEvent } from 'vs/workbench/api/node/extHostExtensionActivator';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';
import URI from 'vs/base/common/uri';
import { ExtHostLogService } from 'vs/workbench/api/node/extHostLogService';

// const nativeExit = process.exit.bind(process);
function patchProcess(allowExit: boolean) {
	process.exit = function (code) {
		if (allowExit) {
			exit(code);
		} else {
			const err = new Error('An extension called process.exit() and this was prevented.');
			console.warn(err.stack);
		}
	};

	process.crash = function () {
		const err = new Error('An extension called process.crash() and this was prevented.');
		console.warn(err.stack);
	};
}
export function exit(code?: number) {
	//nativeExit(code);

	// TODO@electron
	// See https://github.com/Microsoft/vscode/issues/32990
	// calling process.exit() does not exit the process when the process is being debugged
	// It waits for the debugger to disconnect, but in our version, the debugger does not
	// receive an event that the process desires to exit such that it can disconnect.

	// Do exactly what node.js would have done, minus the wait for the debugger part

	if (code || code === 0) {
		process.exitCode = code;
	}

	if (!(<any>process)._exiting) {
		(<any>process)._exiting = true;
		process.emit('exit', process.exitCode || 0);
	}
	watchdog.exit(process.exitCode || 0);
}

interface ITestRunner {
	run(testsRoot: string, clb: (error: Error, failures?: number) => void): void;
}

export class ExtensionHostMain {

	private _isTerminating: boolean = false;
	private _diskSearch: DiskSearch;
	private _workspace: IWorkspaceData;
	private _environment: IEnvironment;
	private _extensionService: ExtHostExtensionService;
	private _extHostConfiguration: ExtHostConfiguration;
	private _extHostLogService: ExtHostLogService;
	private disposables: IDisposable[] = [];

	constructor(protocol: IMessagePassingProtocol, initData: IInitData) {
		this._environment = initData.environment;
		this._workspace = initData.workspace;

		const allowExit = !!this._environment.extensionTestsPath; // to support other test frameworks like Jasmin that use process.exit (https://github.com/Microsoft/vscode/issues/37708)
		patchProcess(allowExit);

		// services
		const rpcProtocol = new RPCProtocol(protocol);
		const environmentService = new EnvironmentService(initData.args, initData.execPath);
		this._extHostLogService = new ExtHostLogService(initData.windowId, initData.logLevel, environmentService);
		this.disposables.push(this._extHostLogService);
		const extHostWorkspace = new ExtHostWorkspace(rpcProtocol, initData.workspace, this._extHostLogService);

		this._extHostLogService.info('extension host started');
		this._extHostLogService.trace('initData', initData);

		this._extHostConfiguration = new ExtHostConfiguration(rpcProtocol.getProxy(MainContext.MainThreadConfiguration), extHostWorkspace, initData.configuration);
		this._extensionService = new ExtHostExtensionService(initData, rpcProtocol, extHostWorkspace, this._extHostConfiguration, this._extHostLogService, environmentService);

		// error forwarding and stack trace scanning
		Error.stackTraceLimit = 100; // increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
		const extensionErrors = new WeakMap<Error, IExtensionDescription>();
		this._extensionService.getExtensionPathIndex().then(map => {
			(<any>Error).prepareStackTrace = (error: Error, stackTrace: errors.V8CallSite[]) => {
				let stackTraceMessage = '';
				let extension: IExtensionDescription;
				let fileName: string;
				for (const call of stackTrace) {
					stackTraceMessage += `\n\tat ${call.toString()}`;
					fileName = call.getFileName();
					if (!extension && fileName) {
						extension = map.findSubstr(fileName);
					}

				}
				extensionErrors.set(error, extension);
				return `${error.name || 'Error'}: ${error.message || ''}${stackTraceMessage}`;
			};
		});
		const mainThreadExtensions = rpcProtocol.getProxy(MainContext.MainThreadExtensionService);
		const mainThreadErrors = rpcProtocol.getProxy(MainContext.MainThreadErrors);
		errors.setUnexpectedErrorHandler(err => {
			const data = errors.transformErrorForSerialization(err);
			const extension = extensionErrors.get(err);
			if (extension) {
				mainThreadExtensions.$onExtensionRuntimeError(extension.id, data);
			} else {
				mainThreadErrors.$onUnexpectedError(data);
			}
		});

		// Configure the watchdog to kill our process if the JS event loop is unresponsive for more than 10s
		// if (!initData.environment.isExtensionDevelopmentDebug) {
		// 	watchdog.start(10000);
		// }
	}

	public start(): TPromise<void> {
		return this._extensionService.onExtensionAPIReady()
			.then(() => this.handleEagerExtensions())
			.then(() => this.handleExtensionTests())
			.then(() => {
				this._extHostLogService.info(`eager extensions activated`);
			});
	}

	public terminate(): void {
		if (this._isTerminating) {
			// we are already shutting down...
			return;
		}
		this._isTerminating = true;

		this.disposables = dispose(this.disposables);

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
		this._extensionService.activateByEvent('*', true).then(null, (err) => {
			console.error(err);
		});
		return this.handleWorkspaceContainsEagerExtensions();
	}

	private handleWorkspaceContainsEagerExtensions(): TPromise<void> {
		if (!this._workspace || this._workspace.folders.length === 0) {
			return TPromise.as(null);
		}

		return TPromise.join(
			this._extensionService.getAllExtensionDescriptions().map((desc) => {
				return this.handleWorkspaceContainsEagerExtension(desc);
			})
		).then(() => { });
	}

	private handleWorkspaceContainsEagerExtension(desc: IExtensionDescription): TPromise<void> {
		let activationEvents = desc.activationEvents;
		if (!activationEvents) {
			return TPromise.as(void 0);
		}

		const fileNames: string[] = [];
		const globPatterns: string[] = [];

		for (let i = 0; i < activationEvents.length; i++) {
			if (/^workspaceContains:/.test(activationEvents[i])) {
				let fileNameOrGlob = activationEvents[i].substr('workspaceContains:'.length);
				if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0) {
					globPatterns.push(fileNameOrGlob);
				} else {
					fileNames.push(fileNameOrGlob);
				}
			}
		}

		if (fileNames.length === 0 && globPatterns.length === 0) {
			return TPromise.as(void 0);
		}

		let fileNamePromise = TPromise.join(fileNames.map((fileName) => this.activateIfFileName(desc.id, fileName))).then(() => { });
		let globPatternPromise = this.activateIfGlobPatterns(desc.id, globPatterns);

		return TPromise.join([fileNamePromise, globPatternPromise]).then(() => { });
	}

	private async activateIfFileName(extensionId: string, fileName: string): TPromise<void> {
		// find exact path

		for (const { uri } of this._workspace.folders) {
			if (await pfs.exists(join(URI.revive(uri).fsPath, fileName))) {
				// the file was found
				return (
					this._extensionService.activateById(extensionId, new ExtensionActivatedByEvent(true, `workspaceContains:${fileName}`))
						.done(null, err => console.error(err))
				);
			}
		}

		return undefined;
	}

	private async activateIfGlobPatterns(extensionId: string, globPatterns: string[]): TPromise<void> {
		this._extHostLogService.trace(`extensionHostMain#activateIfGlobPatterns: fileSearch, extension: ${extensionId}, entryPoint: workspaceContains`);

		if (globPatterns.length === 0) {
			return TPromise.as(void 0);
		}

		if (!this._diskSearch) {
			// Shut down this search process after 1s
			this._diskSearch = new DiskSearch(false, 1000);
		}

		let includes: glob.IExpression = {};
		globPatterns.forEach((globPattern) => {
			includes[globPattern] = true;
		});

		const folderQueries = this._workspace.folders.map(folder => ({ folder: URI.revive(folder.uri) }));
		const config = this._extHostConfiguration.getConfiguration('search');
		const useRipgrep = config.get('useRipgrep', true);
		const followSymlinks = config.get('followSymlinks', true);

		const query: ISearchQuery = {
			folderQueries,
			type: QueryType.File,
			exists: true,
			includePattern: includes,
			useRipgrep,
			ignoreSymlinks: !followSymlinks
		};

		let result = await this._diskSearch.search(query);
		if (result.limitHit) {
			// a file was found matching one of the glob patterns
			return (
				this._extensionService.activateById(extensionId, new ExtensionActivatedByEvent(true, `workspaceContains:${globPatterns.join(',')}`))
					.done(null, err => console.error(err))
			);
		}

		return TPromise.as(void 0);
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

		return TPromise.wrapError<void>(new Error(requireError ? requireError.toString() : nls.localize('extensionTestError', "Path {0} does not point to a valid extension test runner.", this._environment.extensionTestsPath)));
	}

	private gracefulExit(code: number): void {
		// to give the PH process a chance to flush any outstanding console
		// messages to the main process, we delay the exit() by some time
		setTimeout(() => exit(code), 500);
	}
}
