/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as performance from '../../../base/common/performance.js';
import type * as vscode from 'vscode';
import { createApiFactoryAndRegisterActors } from '../common/extHost.api.impl.js';
import { INodeModuleFactory, RequireInterceptor } from '../common/extHostRequireInterceptor.js';
import { ExtensionActivationTimesBuilder } from '../common/extHostExtensionActivator.js';
import { connectProxyResolver } from './proxyResolver.js';
import { AbstractExtHostExtensionService } from '../common/extHostExtensionService.js';
import { ExtHostDownloadService } from './extHostDownloadService.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtensionRuntime } from '../common/extHostTypes.js';
import { CLIServer } from './extHostCLIServer.js';
import { realpathSync } from '../../../base/node/extpath.js';
import { ExtHostConsoleForwarder } from './extHostConsoleForwarder.js';
import { ExtHostDiskFileSystemProvider } from './extHostDiskFileSystemProvider.js';
import nodeModule from 'node:module';
import { assertType } from '../../../base/common/types.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { BidirectionalMap } from '../../../base/common/map.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';

const require = nodeModule.createRequire(import.meta.url);

class NodeModuleRequireInterceptor extends RequireInterceptor {

	protected _installInterceptor(): void {
		const that = this;
		const node_module = require('module');
		const originalLoad = node_module._load;
		node_module._load = function load(request: string, parent: { filename: string }, isMain: boolean) {
			request = applyAlternatives(request);
			if (!that._factories.has(request)) {
				return originalLoad.apply(this, arguments);
			}
			return that._factories.get(request)!.load(
				request,
				URI.file(realpathSync(parent.filename)),
				request => originalLoad.apply(this, [request, parent, isMain])
			);
		};

		const originalLookup = node_module._resolveLookupPaths;
		node_module._resolveLookupPaths = (request: string, parent: unknown) => {
			return originalLookup.call(this, applyAlternatives(request), parent);
		};

		const originalResolveFilename = node_module._resolveFilename;
		node_module._resolveFilename = function resolveFilename(request: string, parent: unknown, isMain: boolean, options?: { paths?: string[] }) {
			if (request === 'vsda' && Array.isArray(options?.paths) && options.paths.length === 0) {
				// ESM: ever since we moved to ESM, `require.main` will be `undefined` for extensions
				// Some extensions have been using `require.resolve('vsda', { paths: require.main.paths })`
				// to find the `vsda` module in our app root. To be backwards compatible with this pattern,
				// we help by filling in the `paths` array with the node modules paths of the current module.
				options.paths = node_module._nodeModulePaths(import.meta.dirname);
			}
			return originalResolveFilename.call(this, request, parent, isMain, options);
		};

		const applyAlternatives = (request: string) => {
			for (const alternativeModuleName of that._alternatives) {
				const alternative = alternativeModuleName(request);
				if (alternative) {
					request = alternative;
					break;
				}
			}
			return request;
		};
	}
}

class NodeModuleESMInterceptor extends RequireInterceptor {

	private static _createDataUri(scriptContent: string): string {
		return `data:text/javascript;base64,${Buffer.from(scriptContent).toString('base64')}`;
	}

	// This string is a script that runs in the loader thread of NodeJS.
	private static _loaderScript = `
	let lookup;
	export const initialize = async (context) => {
		let requestIds = 0;
		const { port } = context;
		const pendingRequests = new Map();
		port.onmessage = (event) => {
			const { id, url } = event.data;
			pendingRequests.get(id)?.(url);
		};
		lookup = url => {
			// debugger;
			const myId = requestIds++;
			return new Promise((resolve) => {
				pendingRequests.set(myId, resolve);
				port.postMessage({ id: myId, url, });
			});
		};
	};
	export const resolve = async (specifier, context, nextResolve) => {
		if (specifier !== 'vscode' || !context.parentURL) {
			return nextResolve(specifier, context);
		}
		const otherUrl = await lookup(context.parentURL);
		return {
			url: otherUrl,
			shortCircuit: true,
		};
	};`;

	private static _vscodeImportFnName = `_VSCODE_IMPORT_VSCODE_API`;

	private readonly _store = new DisposableStore();

	dispose(): void {
		this._store.dispose();
	}

	protected override _installInterceptor(): void {

		type Message = { id: string; url: string };

		const apiInstances = new BidirectionalMap<typeof vscode, string>();
		const apiImportDataUrl = new Map<string, string>();

		// define a global function that can be used to get API instances given a random key
		Object.defineProperty(globalThis, NodeModuleESMInterceptor._vscodeImportFnName, {
			enumerable: false,
			configurable: false,
			writable: false,
			value: (key: string) => {
				return apiInstances.getKey(key);
			}
		});

		const { port1, port2 } = new MessageChannel();

		let apiModuleFactory: INodeModuleFactory | undefined;

		// this is a workaround for the fact that the layer checker does not understand
		// that onmessage is NodeJS API here
		const port1LayerCheckerWorkaround: any = port1;

		port1LayerCheckerWorkaround.onmessage = (e: { data: Message }) => {

			// Get the vscode-module factory - which is the same logic that's also used by
			// the CommonJS require interceptor
			if (!apiModuleFactory) {
				apiModuleFactory = this._factories.get('vscode');
				assertType(apiModuleFactory);
			}

			const { id, url } = e.data;
			const uri = URI.parse(url);

			// Get or create the API instance. The interface is per extension and extensions are
			// looked up by the uri (e.data.url) and path containment.
			const apiInstance = apiModuleFactory.load('_not_used', uri, () => { throw new Error('CANNOT LOAD MODULE from here.'); });
			let key = apiInstances.get(apiInstance);
			if (!key) {
				key = generateUuid();
				apiInstances.set(apiInstance, key);
			}

			// Create and cache a data-url which is the import script for the API instance
			let scriptDataUrlSrc = apiImportDataUrl.get(key);
			if (!scriptDataUrlSrc) {
				const jsCode = `const _vscodeInstance = globalThis.${NodeModuleESMInterceptor._vscodeImportFnName}('${key}');\n\n${Object.keys(apiInstance).map((name => `export const ${name} = _vscodeInstance['${name}'];`)).join('\n')}`;
				scriptDataUrlSrc = NodeModuleESMInterceptor._createDataUri(jsCode);
				apiImportDataUrl.set(key, scriptDataUrlSrc);
			}

			port1.postMessage({
				id,
				url: scriptDataUrlSrc
			});
		};

		nodeModule.register(NodeModuleESMInterceptor._createDataUri(NodeModuleESMInterceptor._loaderScript), {
			parentURL: import.meta.url,
			data: { port: port2 },
			transferList: [port2],
		});

		this._store.add(toDisposable(() => {
			port1.close();
			port2.close();
		}));
	}
}

export class ExtHostExtensionService extends AbstractExtHostExtensionService {

	readonly extensionRuntime = ExtensionRuntime.Node;

	protected async _beforeAlmostReadyToRunExtensions(): Promise<void> {
		// make sure console.log calls make it to the render
		this._instaService.createInstance(ExtHostConsoleForwarder);

		// initialize API and register actors
		const extensionApiFactory = this._instaService.invokeFunction(createApiFactoryAndRegisterActors);

		// Register Download command
		this._instaService.createInstance(ExtHostDownloadService);

		// Register CLI Server for ipc
		if (this._initData.remote.isRemote && this._initData.remote.authority) {
			const cliServer = this._instaService.createInstance(CLIServer);
			process.env['VSCODE_IPC_HOOK_CLI'] = cliServer.ipcHandlePath;
		}

		// Register local file system shortcut
		this._instaService.createInstance(ExtHostDiskFileSystemProvider);

		// Module loading tricks
		await this._instaService.createInstance(NodeModuleRequireInterceptor, extensionApiFactory, { mine: this._myRegistry, all: this._globalRegistry })
			.install();

		// ESM loading tricks
		await this._store.add(this._instaService.createInstance(NodeModuleESMInterceptor, extensionApiFactory, { mine: this._myRegistry, all: this._globalRegistry }))
			.install();

		performance.mark('code/extHost/didInitAPI');

		// Do this when extension service exists, but extensions are not being activated yet.
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		await connectProxyResolver(this._extHostWorkspace, configProvider, this, this._logService, this._mainThreadTelemetryProxy, this._initData, this._store);
		performance.mark('code/extHost/didInitProxyResolver');
	}

	protected _getEntryPoint(extensionDescription: IExtensionDescription): string | undefined {
		return extensionDescription.main;
	}

	private async _doLoadModule<T>(extension: IExtensionDescription | null, module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder, mode: 'esm' | 'cjs'): Promise<T> {
		if (module.scheme !== Schemas.file) {
			throw new Error(`Cannot load URI: '${module}', must be of file-scheme`);
		}
		let r: T | null = null;
		activationTimesBuilder.codeLoadingStart();
		this._logService.trace(`ExtensionService#loadModule [${mode}] -> ${module.toString(true)}`);
		this._logService.flush();
		const extensionId = extension?.identifier.value;
		if (extension) {
			await this._extHostLocalizationService.initializeLocalizedMessages(extension);
		}
		try {
			if (extensionId) {
				performance.mark(`code/extHost/willLoadExtensionCode/${extensionId}`);
			}
			if (mode === 'esm') {
				r = <T>await import(module.toString(true));
			} else {
				r = <T>require(module.fsPath);
			}
		} finally {
			if (extensionId) {
				performance.mark(`code/extHost/didLoadExtensionCode/${extensionId}`);
			}
			activationTimesBuilder.codeLoadingStop();
		}
		return r;
	}

	protected async _loadCommonJSModule<T>(extension: IExtensionDescription | null, module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {
		return this._doLoadModule<T>(extension, module, activationTimesBuilder, 'cjs');
	}

	protected async _loadESMModule<T>(extension: IExtensionDescription | null, module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {
		return this._doLoadModule<T>(extension, module, activationTimesBuilder, 'esm');
	}

	public async $setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		if (!this._initData.remote.isRemote) {
			return;
		}

		for (const key in env) {
			const value = env[key];
			if (value === null) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}
