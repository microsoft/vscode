/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import pfs = require('vs/base/node/pfs');
import { TPromise } from 'vs/base/common/winjs.base';
import { join } from 'path';
import { RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtHostThreadService } from 'vs/workbench/services/thread/node/extHostThreadService';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { QueryType, ISearchQuery } from 'vs/platform/search/common/search';
import { DiskSearch } from 'vs/workbench/services/search/node/searchService';
import { IInitData, IEnvironment, IWorkspaceData, MainContext } from 'vs/workbench/api/node/extHost.protocol';
import * as errors from 'vs/base/common/errors';
import * as watchdog from 'native-watchdog';

// const nativeExit = process.exit.bind(process);
process.exit = function () {
	const err = new Error('An extension called process.exit() and this was prevented.');
	console.warn(err.stack);
};
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

	constructor(rpcProtocol: RPCProtocol, initData: IInitData) {
		this._environment = initData.environment;
		this._workspace = initData.workspace;

		// services
		const threadService = new ExtHostThreadService(rpcProtocol);
		this._extensionService = new ExtHostExtensionService(initData, threadService);

		// error forwarding and stack trace scanning
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
		const mainThreadErrors = threadService.get(MainContext.MainThreadErrors);
		errors.setUnexpectedErrorHandler(err => {
			const data = errors.transformErrorForSerialization(err);
			const extension = extensionErrors.get(err);
			mainThreadErrors.$onUnexpectedError(data, extension && extension.id);
		});

		// Configure the watchdog to kill our process if the JS event loop is unresponsive for more than 10s
		// if (!initData.environment.isExtensionDevelopmentDebug) {
		// 	watchdog.start(10000);
		// }
	}

	public start(): TPromise<void> {
		return this._extensionService.onExtensionAPIReady()
			.then(() => this.handleEagerExtensions())
			.then(() => this.handleExtensionTests());
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
		this._extensionService.activateByEvent('*', true).then(null, (err) => {
			console.error(err);
		});
		return this.handleWorkspaceContainsEagerExtensions();
	}

	private handleWorkspaceContainsEagerExtensions(): TPromise<void> {
		if (!this._workspace || this._workspace.roots.length === 0) {
			return TPromise.as(null);
		}

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

		const matchingPatterns = Object.keys(desiredFilesMap).map(p => {
			// TODO: This is a bit hacky -- maybe this should be implemented by using something like
			// `workspaceGlob` or something along those lines?
			if (p.indexOf('*') > -1 || p.indexOf('?') > -1) {
				if (!this._diskSearch) {
					// Shut down this search process after 1s
					this._diskSearch = new DiskSearch(false, 1000);
				}

				const query: ISearchQuery = {
					folderQueries: this._workspace.roots.map(root => ({ folder: root })),
					type: QueryType.File,
					maxResults: 1,
					includePattern: { [p]: true }
				};

				return this._diskSearch.search(query).then(result => result.results.length ? p : undefined);
			} else {
				// find exact path
				return (async resolve => {
					for (const { fsPath } of this._workspace.roots) {
						if (await pfs.exists(join(fsPath, p))) {
							return p;
						}
					}
					return undefined;
				})();
			}
		});

		return TPromise.join(matchingPatterns).then(patterns => {
			patterns
				.filter(p => p !== undefined)
				.forEach(p => {
					const activationEvent = `workspaceContains:${p}`;

					this._extensionService.activateByEvent(activationEvent, true)
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

		return TPromise.wrapError<void>(new Error(requireError ? requireError.toString() : nls.localize('extensionTestError', "Path {0} does not point to a valid extension test runner.", this._environment.extensionTestsPath)));
	}

	private gracefulExit(code: number): void {
		// to give the PH process a chance to flush any outstanding console
		// messages to the main process, we delay the exit() by some time
		setTimeout(() => exit(code), 500);
	}
}
