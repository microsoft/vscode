/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Counter } from 'vs/base/common/numbers';
import { URI, setUriThrowOnMissingScheme } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { IEnvironment, IInitData, MainContext } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtHostLogService } from 'vs/workbench/api/node/extHostLogService';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { RPCProtocol } from 'vs/workbench/services/extensions/node/rpcProtocol';

// we don't (yet) throw when extensions parse
// uris that have no scheme
setUriThrowOnMissingScheme(false);

const nativeExit = process.exit.bind(process);
function patchProcess(allowExit: boolean) {
	process.exit = function (code?: number) {
		if (allowExit) {
			exit(code);
		} else {
			const err = new Error('An extension called process.exit() and this was prevented.');
			console.warn(err.stack);
		}
	} as (code?: number) => never;

	process.crash = function () {
		const err = new Error('An extension called process.crash() and this was prevented.');
		console.warn(err.stack);
	};
}

export function exit(code?: number) {
	nativeExit(code);
}

export class ExtensionHostMain {


	private _isTerminating: boolean;
	private readonly _environment: IEnvironment;
	private readonly _extensionService: ExtHostExtensionService;
	private readonly _extHostConfiguration: ExtHostConfiguration;
	private readonly _extHostLogService: ExtHostLogService;
	private disposables: IDisposable[] = [];

	private _searchRequestIdProvider: Counter;

	constructor(protocol: IMessagePassingProtocol, initData: IInitData) {
		this._isTerminating = false;
		const uriTransformer: IURITransformer = null;
		const rpcProtocol = new RPCProtocol(protocol, null, uriTransformer);

		// ensure URIs are transformed and revived
		initData = this.transform(initData, rpcProtocol);
		this._environment = initData.environment;

		const allowExit = !!this._environment.extensionTestsPath; // to support other test frameworks like Jasmin that use process.exit (https://github.com/Microsoft/vscode/issues/37708)
		patchProcess(allowExit);

		// services
		this._extHostLogService = new ExtHostLogService(initData.logLevel, initData.logsLocation.fsPath);
		this.disposables.push(this._extHostLogService);

		this._searchRequestIdProvider = new Counter();
		const extHostWorkspace = new ExtHostWorkspace(rpcProtocol, initData.workspace, this._extHostLogService, this._searchRequestIdProvider);

		this._extHostLogService.info('extension host started');
		this._extHostLogService.trace('initData', initData);

		this._extHostConfiguration = new ExtHostConfiguration(rpcProtocol.getProxy(MainContext.MainThreadConfiguration), extHostWorkspace, initData.configuration);
		this._extensionService = new ExtHostExtensionService(nativeExit, initData, rpcProtocol, extHostWorkspace, this._extHostConfiguration, this._extHostLogService);

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
				mainThreadExtensions.$onExtensionRuntimeError(extension.identifier, data);
			} else {
				mainThreadErrors.$onUnexpectedError(data);
			}
		});
	}

	terminate(): void {
		if (this._isTerminating) {
			// we are already shutting down...
			return;
		}
		this._isTerminating = true;

		this.disposables = dispose(this.disposables);

		errors.setUnexpectedErrorHandler((err) => {
			// TODO: write to log once we have one
		});

		const extensionsDeactivated = this._extensionService.deactivateAll();

		// Give extensions 1 second to wrap up any async dispose, then exit in at most 4 seconds
		setTimeout(() => {
			Promise.race([timeout(4000), extensionsDeactivated]).then(() => exit(), () => exit());
		}, 1000);
	}

	private transform(initData: IInitData, rpcProtocol: RPCProtocol): IInitData {
		initData.extensions.forEach((ext) => (<any>ext).extensionLocation = URI.revive(rpcProtocol.transformIncomingURIs(ext.extensionLocation)));
		initData.environment.appRoot = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.appRoot));
		initData.environment.appSettingsHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.appSettingsHome));
		initData.environment.extensionDevelopmentLocationURI = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.extensionDevelopmentLocationURI));
		initData.environment.globalStorageHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.globalStorageHome));
		initData.logsLocation = URI.revive(rpcProtocol.transformIncomingURIs(initData.logsLocation));
		initData.workspace = rpcProtocol.transformIncomingURIs(initData.workspace);
		return initData;
	}
}
