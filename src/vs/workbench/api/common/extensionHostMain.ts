/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as errors from '../../../base/common/errors.js';
import * as performance from '../../../base/common/performance.js';
import { URI } from '../../../base/common/uri.js';
import { IURITransformer } from '../../../base/common/uriIpc.js';
import { IMessagePassingProtocol } from '../../../base/parts/ipc/common/ipc.js';
import { MainContext, MainThreadConsoleShape } from './extHost.protocol.js';
import { IExtensionHostInitData } from '../../services/extensions/common/extensionHostProtocol.js';
import { RPCProtocol } from '../../services/extensions/common/rpcProtocol.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { getSingletonServiceDescriptors } from '../../../platform/instantiation/common/extensions.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { InstantiationService } from '../../../platform/instantiation/common/instantiationService.js';
import { IInstantiationService, ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService, ExtHostRpcService } from './extHostRpcService.js';
import { IURITransformerService, URITransformerService } from './extHostUriTransformerService.js';
import { IExtHostExtensionService, IHostUtils } from './extHostExtensionService.js';
import { IExtHostTelemetry } from './extHostTelemetry.js';
import { Mutable } from '../../../base/common/types.js';

export interface IExitFn {
	(code?: number): any;
}

export interface IConsolePatchFn {
	(mainThreadConsole: MainThreadConsoleShape): any;
}

export abstract class ErrorHandler {

	static async installEarlyHandler(accessor: ServicesAccessor): Promise<void> {

		// increase number of stack frames (from 10, https://github.com/v8/v8/wiki/Stack-Trace-API)
		Error.stackTraceLimit = 100;

		// does NOT dependent of extension information, can be installed immediately, and simply forwards
		// to the log service and main thread errors
		const logService = accessor.get(ILogService);
		const rpcService = accessor.get(IExtHostRpcService);
		const mainThreadErrors = rpcService.getProxy(MainContext.MainThreadErrors);

		errors.setUnexpectedErrorHandler(err => {
			logService.error(err);
			const data = errors.transformErrorForSerialization(err);
			mainThreadErrors.$onUnexpectedError(data);
		});
	}

	static async installFullHandler(accessor: ServicesAccessor): Promise<void> {
		// uses extension knowledges to correlate errors with extensions

		const logService = accessor.get(ILogService);
		const rpcService = accessor.get(IExtHostRpcService);
		const extensionService = accessor.get(IExtHostExtensionService);
		const extensionTelemetry = accessor.get(IExtHostTelemetry);

		const mainThreadExtensions = rpcService.getProxy(MainContext.MainThreadExtensionService);
		const mainThreadErrors = rpcService.getProxy(MainContext.MainThreadErrors);

		const map = await extensionService.getExtensionPathIndex();
		const extensionErrors = new WeakMap<Error, { extensionIdentifier: ExtensionIdentifier | undefined; stack: string }>();

		// PART 1
		// set the prepareStackTrace-handle and use it as a side-effect to associate errors
		// with extensions - this works by looking up callsites in the extension path index
		function prepareStackTraceAndFindExtension(error: Error, stackTrace: errors.V8CallSite[]) {
			if (extensionErrors.has(error)) {
				return extensionErrors.get(error)!.stack;
			}
			let stackTraceMessage = '';
			let extension: IExtensionDescription | undefined;
			let fileName: string | null;
			for (const call of stackTrace) {
				stackTraceMessage += `\n\tat ${call.toString()}`;
				fileName = call.getFileName();
				if (!extension && fileName) {
					extension = map.findSubstr(URI.file(fileName));
				}
			}
			const result = `${error.name || 'Error'}: ${error.message || ''}${stackTraceMessage}`;
			extensionErrors.set(error, { extensionIdentifier: extension?.identifier, stack: result });
			return result;
		}

		const _wasWrapped = Symbol('prepareStackTrace wrapped');
		let _prepareStackTrace = prepareStackTraceAndFindExtension;

		Object.defineProperty(Error, 'prepareStackTrace', {
			configurable: false,
			get() {
				return _prepareStackTrace;
			},
			set(v) {
				if (v === prepareStackTraceAndFindExtension || !v || v[_wasWrapped]) {
					_prepareStackTrace = v || prepareStackTraceAndFindExtension;
					return;
				}

				_prepareStackTrace = function (error, stackTrace) {
					prepareStackTraceAndFindExtension(error, stackTrace);
					return v.call(Error, error, stackTrace);
				};

				Object.assign(_prepareStackTrace, { [_wasWrapped]: true });
			},
		});

		// PART 2
		// set the unexpectedErrorHandler and check for extensions that have been identified as
		// having caused the error. Note that the runtime order is actually reversed, the code
		// below accesses the stack-property which triggers the code above
		errors.setUnexpectedErrorHandler(err => {
			logService.error(err);

			const errorData = errors.transformErrorForSerialization(err);
			const stackData = extensionErrors.get(err);
			if (!stackData?.extensionIdentifier) {
				mainThreadErrors.$onUnexpectedError(errorData);
				return;
			}

			mainThreadExtensions.$onExtensionRuntimeError(stackData.extensionIdentifier, errorData);
			const reported = extensionTelemetry.onExtensionError(stackData.extensionIdentifier, err);
			logService.trace('forwarded error to extension?', reported, stackData);
		});
	}
}

export class ExtensionHostMain {

	private readonly _hostUtils: IHostUtils;
	private readonly _rpcProtocol: RPCProtocol;
	private readonly _extensionService: IExtHostExtensionService;
	private readonly _logService: ILogService;

	constructor(
		protocol: IMessagePassingProtocol,
		initData: IExtensionHostInitData,
		hostUtils: IHostUtils,
		uriTransformer: IURITransformer | null,
		messagePorts?: ReadonlyMap<string, MessagePort>
	) {
		this._hostUtils = hostUtils;
		this._rpcProtocol = new RPCProtocol(protocol, null, uriTransformer);

		// ensure URIs are transformed and revived
		initData = ExtensionHostMain._transform(initData, this._rpcProtocol);

		// bootstrap services
		const services = new ServiceCollection(...getSingletonServiceDescriptors());
		services.set(IExtHostInitDataService, { _serviceBrand: undefined, ...initData, messagePorts });
		services.set(IExtHostRpcService, new ExtHostRpcService(this._rpcProtocol));
		services.set(IURITransformerService, new URITransformerService(uriTransformer));
		services.set(IHostUtils, hostUtils);

		const instaService: IInstantiationService = new InstantiationService(services, true);

		instaService.invokeFunction(ErrorHandler.installEarlyHandler);

		// ugly self - inject
		this._logService = instaService.invokeFunction(accessor => accessor.get(ILogService));

		performance.mark(`code/extHost/didCreateServices`);
		if (this._hostUtils.pid) {
			this._logService.info(`Extension host with pid ${this._hostUtils.pid} started`);
		} else {
			this._logService.info(`Extension host started`);
		}
		this._logService.trace('initData', initData);

		// ugly self - inject
		// must call initialize *after* creating the extension service
		// because `initialize` itself creates instances that depend on it
		this._extensionService = instaService.invokeFunction(accessor => accessor.get(IExtHostExtensionService));
		this._extensionService.initialize();

		// install error handler that is extension-aware
		instaService.invokeFunction(ErrorHandler.installFullHandler);
	}

	async asBrowserUri(uri: URI): Promise<URI> {
		const mainThreadExtensionsProxy = this._rpcProtocol.getProxy(MainContext.MainThreadExtensionService);
		return URI.revive(await mainThreadExtensionsProxy.$asBrowserUri(uri));
	}

	terminate(reason: string): void {
		this._extensionService.terminate(reason);
	}

	private static _transform(initData: IExtensionHostInitData, rpcProtocol: RPCProtocol): IExtensionHostInitData {
		initData.extensions.allExtensions.forEach((ext) => {
			(<Mutable<IExtensionDescription>>ext).extensionLocation = URI.revive(rpcProtocol.transformIncomingURIs(ext.extensionLocation));
		});
		initData.environment.appRoot = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.appRoot));
		const extDevLocs = initData.environment.extensionDevelopmentLocationURI;
		if (extDevLocs) {
			initData.environment.extensionDevelopmentLocationURI = extDevLocs.map(url => URI.revive(rpcProtocol.transformIncomingURIs(url)));
		}
		initData.environment.extensionTestsLocationURI = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.extensionTestsLocationURI));
		initData.environment.globalStorageHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.globalStorageHome));
		initData.environment.workspaceStorageHome = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.workspaceStorageHome));
		initData.environment.extensionTelemetryLogResource = URI.revive(rpcProtocol.transformIncomingURIs(initData.environment.extensionTelemetryLogResource));
		initData.nlsBaseUrl = URI.revive(rpcProtocol.transformIncomingURIs(initData.nlsBaseUrl));
		initData.logsLocation = URI.revive(rpcProtocol.transformIncomingURIs(initData.logsLocation));
		initData.workspace = rpcProtocol.transformIncomingURIs(initData.workspace);
		return initData;
	}
}
