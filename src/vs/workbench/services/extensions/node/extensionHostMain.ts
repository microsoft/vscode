/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import * as errors from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI, setUriThrowOnMissingScheme } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { IInitData, MainContext, MainThreadConsoleShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { ExtHostExtensionService, IHostUtils } from 'vs/workbench/api/node/extHostExtensionService';
import { ExtHostLogService } from 'vs/workbench/api/common/extHostLogService';
import { ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { RPCProtocol } from 'vs/workbench/services/extensions/common/rpcProtocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ILogService } from 'vs/platform/log/common/log';

// we don't (yet) throw when extensions parse
// uris that have no scheme
setUriThrowOnMissingScheme(false);

export interface IExitFn {
	(code?: number): any;
}

export interface IConsolePatchFn {
	(mainThreadConsole: MainThreadConsoleShape): any;
}

export interface ILogServiceFn {
	(initData: IInitData): ILogService;
}

export class ExtensionHostMain {

	private _isTerminating: boolean;
	private readonly _hostUtils: IHostUtils;
	private readonly _extensionService: ExtHostExtensionService;
	private readonly disposables = new DisposableStore();

	constructor(
		protocol: IMessagePassingProtocol,
		initData: IInitData,
		hostUtils: IHostUtils,
		consolePatchFn: IConsolePatchFn,
		logServiceFn: ILogServiceFn,
		uriTransformer: IURITransformer | null
	) {
		this._isTerminating = false;
		this._hostUtils = hostUtils;
		const rpcProtocol = new RPCProtocol(protocol, null, uriTransformer);

		// ensure URIs are transformed and revived
		initData = this.transform(initData, rpcProtocol);

		// allow to patch console
		consolePatchFn(rpcProtocol.getProxy(MainContext.MainThreadConsole));

		// services
		const extHostLogService = new ExtHostLogService(logServiceFn(initData), initData.logsLocation.fsPath);
		this.disposables.add(extHostLogService);

		const extHostWorkspace = new ExtHostWorkspace(rpcProtocol, extHostLogService, withNullAsUndefined(initData.workspace));

		extHostLogService.info('extension host started');
		extHostLogService.trace('initData', initData);

		const extHostConfiguraiton = new ExtHostConfiguration(rpcProtocol.getProxy(MainContext.MainThreadConfiguration), extHostWorkspace);
		this._extensionService = new ExtHostExtensionService(
			hostUtils,
			initData,
			rpcProtocol,
			extHostWorkspace,
			extHostConfiguraiton,
			initData.environment,
			extHostLogService,
			uriTransformer
		);

		// error forwarding and stack trace scanning
		Error.stackTraceLimit = 100; // increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
		const extensionErrors = new WeakMap<Error, IExtensionDescription>();
		this._extensionService.getExtensionPathIndex().then(map => {
			(<any>Error).prepareStackTrace = (error: Error, stackTrace: errors.V8CallSite[]) => {
				let stackTraceMessage = '';
				let extension: IExtensionDescription | undefined;
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

		this.disposables.dispose();

		errors.setUnexpectedErrorHandler((err) => {
			// TODO: write to log once we have one
		});

		const extensionsDeactivated = this._extensionService.deactivateAll();

		// Give extensions 1 second to wrap up any async dispose, then exit in at most 4 seconds
		setTimeout(() => {
			Promise.race([timeout(4000), extensionsDeactivated]).finally(() => this._hostUtils.exit());
		}, 1000);
	}

	private transform(initData: IInitData, rpcProtocol: RPCProtocol): IInitData {
		initData.extensions.forEach((ext) => (<any>ext).extensionLocation = URI.revive(rpcProtocol.transformIncomingURIs(ext.extensionLocation)));
		initData.environment.appRoot = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.appRoot));
		initData.environment.appSettingsHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.appSettingsHome));
		const extDevLocs = initData.environment.extensionDevelopmentLocationURI;
		if (extDevLocs) {
			initData.environment.extensionDevelopmentLocationURI = extDevLocs.map(url => URI.revive(rpcProtocol.transformIncomingURIs(url)));
		}
		initData.environment.extensionTestsLocationURI = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.extensionTestsLocationURI));
		initData.environment.globalStorageHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.globalStorageHome));
		initData.environment.userHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.userHome));
		initData.logsLocation = URI.revive(rpcProtocol.transformIncomingURIs(initData.logsLocation));
		initData.workspace = rpcProtocol.transformIncomingURIs(initData.workspace);
		return initData;
	}
}
