/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as performance from '../../../base/common/performance.js';
import { createApiFactoryAndRegisterActors } from '../common/extHost.api.impl.js';
import { RequireInterceptor } from '../common/extHostRequireInterceptor.js';
import { connectProxyResolver } from './proxyResolver.js';
import { AbstractExtHostExtensionService } from '../common/extHostExtensionService.js';
import { ExtHostDownloadService } from './extHostDownloadService.js';
import { URI } from '../../../base/common/uri.js';
import { Schemas } from '../../../base/common/network.js';
import { ExtensionRuntime } from '../common/extHostTypes.js';
import { CLIServer } from './extHostCLIServer.js';
import { realpathSync } from '../../../base/node/pfs.js';
import { ExtHostConsoleForwarder } from './extHostConsoleForwarder.js';
import { ExtHostDiskFileSystemProvider } from './extHostDiskFileSystemProvider.js';
import nodeModule from 'node:module';
import { assertType } from '../../../base/common/types.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { BidirectionalMap } from '../../../base/common/map.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
const require = nodeModule.createRequire(import.meta.url);
class NodeModuleRequireInterceptor extends RequireInterceptor {
    _installInterceptor() {
        const that = this;
        const node_module = require('module');
        const originalLoad = node_module._load;
        node_module._load = function load(request, parent, isMain) {
            request = applyAlternatives(request);
            if (!that._factories.has(request)) {
                return originalLoad.apply(this, arguments);
            }
            return that._factories.get(request).load(request, URI.file(realpathSync(parent.filename)), request => originalLoad.apply(this, [request, parent, isMain]));
        };
        const originalLookup = node_module._resolveLookupPaths;
        node_module._resolveLookupPaths = (request, parent) => {
            return originalLookup.call(this, applyAlternatives(request), parent);
        };
        const originalResolveFilename = node_module._resolveFilename;
        node_module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
            if (request === 'vsda' && Array.isArray(options?.paths) && options.paths.length === 0) {
                // ESM: ever since we moved to ESM, `require.main` will be `undefined` for extensions
                // Some extensions have been using `require.resolve('vsda', { paths: require.main.paths })`
                // to find the `vsda` module in our app root. To be backwards compatible with this pattern,
                // we help by filling in the `paths` array with the node modules paths of the current module.
                options.paths = node_module._nodeModulePaths(import.meta.dirname);
            }
            return originalResolveFilename.call(this, request, parent, isMain, options);
        };
        const applyAlternatives = (request) => {
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
    constructor() {
        super(...arguments);
        this._store = new DisposableStore();
    }
    static _createDataUri(scriptContent) {
        return `data:text/javascript;base64,${Buffer.from(scriptContent).toString('base64')}`;
    }
    // This string is a script that runs in the loader thread of NodeJS.
    static { this._loaderScript = `
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
	};`; }
    static { this._vscodeImportFnName = `_VSCODE_IMPORT_VSCODE_API`; }
    dispose() {
        this._store.dispose();
    }
    _installInterceptor() {
        const apiInstances = new BidirectionalMap();
        const apiImportDataUrl = new Map();
        // define a global function that can be used to get API instances given a random key
        Object.defineProperty(globalThis, NodeModuleESMInterceptor._vscodeImportFnName, {
            enumerable: false,
            configurable: false,
            writable: false,
            value: (key) => {
                return apiInstances.getKey(key);
            }
        });
        const { port1, port2 } = new MessageChannel();
        let apiModuleFactory;
        // this is a workaround for the fact that the layer checker does not understand
        // that onmessage is NodeJS API here
        const port1LayerCheckerWorkaround = port1;
        port1LayerCheckerWorkaround.onmessage = (e) => {
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
    constructor() {
        super(...arguments);
        this.extensionRuntime = ExtensionRuntime.Node;
    }
    async _beforeAlmostReadyToRunExtensions() {
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
    _getEntryPoint(extensionDescription) {
        return extensionDescription.main;
    }
    async _doLoadModule(extension, module, activationTimesBuilder, mode) {
        if (module.scheme !== Schemas.file) {
            throw new Error(`Cannot load URI: '${module}', must be of file-scheme`);
        }
        let r = null;
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
                r = await import(module.toString(true));
            }
            else {
                r = require(module.fsPath);
            }
        }
        finally {
            if (extensionId) {
                performance.mark(`code/extHost/didLoadExtensionCode/${extensionId}`);
            }
            activationTimesBuilder.codeLoadingStop();
        }
        return r;
    }
    async _loadCommonJSModule(extension, module, activationTimesBuilder) {
        return this._doLoadModule(extension, module, activationTimesBuilder, 'cjs');
    }
    async _loadESMModule(extension, module, activationTimesBuilder) {
        return this._doLoadModule(extension, module, activationTimesBuilder, 'esm');
    }
    async $setRemoteEnvironment(env) {
        if (!this._initData.remote.isRemote) {
            return;
        }
        for (const key in env) {
            const value = env[key];
            if (value === null) {
                delete process.env[key];
            }
            else {
                process.env[key] = value;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEV4dGVuc2lvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0SG9zdEV4dGVuc2lvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLFdBQVcsTUFBTSxxQ0FBcUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRixPQUFPLEVBQXNCLGtCQUFrQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDMUQsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUUxRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3pELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25GLE9BQU8sVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDM0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFbEYsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRTFELE1BQU0sNEJBQTZCLFNBQVEsa0JBQWtCO0lBRWxELG1CQUFtQjtRQUM1QixNQUFNLElBQUksR0FBRyxJQUFJLENBQUM7UUFDbEIsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sWUFBWSxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUM7UUFDdkMsV0FBVyxDQUFDLEtBQUssR0FBRyxTQUFTLElBQUksQ0FBQyxPQUFlLEVBQUUsTUFBNEIsRUFBRSxNQUFlO1lBQy9GLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztZQUM1QyxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUUsQ0FBQyxJQUFJLENBQ3hDLE9BQU8sRUFDUCxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsRUFDdkMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FDOUQsQ0FBQztRQUNILENBQUMsQ0FBQztRQUVGLE1BQU0sY0FBYyxHQUFHLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQztRQUN2RCxXQUFXLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxPQUFlLEVBQUUsTUFBZSxFQUFFLEVBQUU7WUFDdEUsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN0RSxDQUFDLENBQUM7UUFFRixNQUFNLHVCQUF1QixHQUFHLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQztRQUM3RCxXQUFXLENBQUMsZ0JBQWdCLEdBQUcsU0FBUyxlQUFlLENBQUMsT0FBZSxFQUFFLE1BQWUsRUFBRSxNQUFlLEVBQUUsT0FBOEI7WUFDeEksSUFBSSxPQUFPLEtBQUssTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN2RixxRkFBcUY7Z0JBQ3JGLDJGQUEyRjtnQkFDM0YsMkZBQTJGO2dCQUMzRiw2RkFBNkY7Z0JBQzdGLE9BQU8sQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbkUsQ0FBQztZQUNELE9BQU8sdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM3RSxDQUFDLENBQUM7UUFFRixNQUFNLGlCQUFpQixHQUFHLENBQUMsT0FBZSxFQUFFLEVBQUU7WUFDN0MsS0FBSyxNQUFNLHFCQUFxQixJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDeEQsTUFBTSxXQUFXLEdBQUcscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ25ELElBQUksV0FBVyxFQUFFLENBQUM7b0JBQ2pCLE9BQU8sR0FBRyxXQUFXLENBQUM7b0JBQ3RCLE1BQU07Z0JBQ1AsQ0FBQztZQUNGLENBQUM7WUFDRCxPQUFPLE9BQU8sQ0FBQztRQUNoQixDQUFDLENBQUM7SUFDSCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLHdCQUF5QixTQUFRLGtCQUFrQjtJQUF6RDs7UUF1Q2tCLFdBQU0sR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBNkVqRCxDQUFDO0lBbEhRLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBcUI7UUFDbEQsT0FBTywrQkFBK0IsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztJQUN2RixDQUFDO0lBRUQsb0VBQW9FO2FBQ3JELGtCQUFhLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7SUE0QjVCLEFBNUJ5QixDQTRCeEI7YUFFVyx3QkFBbUIsR0FBRywyQkFBMkIsQUFBOUIsQ0FBK0I7SUFJakUsT0FBTztRQUNOLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQztJQUVrQixtQkFBbUI7UUFJckMsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQkFBZ0IsRUFBeUIsQ0FBQztRQUNuRSxNQUFNLGdCQUFnQixHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBRW5ELG9GQUFvRjtRQUNwRixNQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsRUFBRSx3QkFBd0IsQ0FBQyxtQkFBbUIsRUFBRTtZQUMvRSxVQUFVLEVBQUUsS0FBSztZQUNqQixZQUFZLEVBQUUsS0FBSztZQUNuQixRQUFRLEVBQUUsS0FBSztZQUNmLEtBQUssRUFBRSxDQUFDLEdBQVcsRUFBRSxFQUFFO2dCQUN0QixPQUFPLFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDakMsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUU5QyxJQUFJLGdCQUFnRCxDQUFDO1FBRXJELCtFQUErRTtRQUMvRSxvQ0FBb0M7UUFDcEMsTUFBTSwyQkFBMkIsR0FBUSxLQUFLLENBQUM7UUFFL0MsMkJBQTJCLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBb0IsRUFBRSxFQUFFO1lBRWhFLDhFQUE4RTtZQUM5RSxtQ0FBbUM7WUFDbkMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3ZCLGdCQUFnQixHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNqRCxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUM5QixDQUFDO1lBRUQsTUFBTSxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQzNCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFM0Isb0ZBQW9GO1lBQ3BGLDBEQUEwRDtZQUMxRCxNQUFNLFdBQVcsR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxNQUFNLElBQUksS0FBSyxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6SCxJQUFJLEdBQUcsR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDVixHQUFHLEdBQUcsWUFBWSxFQUFFLENBQUM7Z0JBQ3JCLFlBQVksQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3BDLENBQUM7WUFFRCw4RUFBOEU7WUFDOUUsSUFBSSxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3ZCLE1BQU0sTUFBTSxHQUFHLHNDQUFzQyx3QkFBd0IsQ0FBQyxtQkFBbUIsS0FBSyxHQUFHLFVBQVUsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixJQUFJLHVCQUF1QixJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQzdOLGdCQUFnQixHQUFHLHdCQUF3QixDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDbkUsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQzdDLENBQUM7WUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDO2dCQUNqQixFQUFFO2dCQUNGLEdBQUcsRUFBRSxnQkFBZ0I7YUFDckIsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDO1FBRUYsVUFBVSxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLEVBQUU7WUFDcEcsU0FBUyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRztZQUMxQixJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFO1lBQ3JCLFlBQVksRUFBRSxDQUFDLEtBQUssQ0FBQztTQUNyQixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ2pDLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNkLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNmLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDOztBQUdGLE1BQU0sT0FBTyx1QkFBd0IsU0FBUSwrQkFBK0I7SUFBNUU7O1FBRVUscUJBQWdCLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO0lBNkZuRCxDQUFDO0lBM0ZVLEtBQUssQ0FBQyxpQ0FBaUM7UUFDaEQsb0RBQW9EO1FBQ3BELElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFFM0QscUNBQXFDO1FBQ3JDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUVqRyw0QkFBNEI7UUFDNUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUUxRCw4QkFBOEI7UUFDOUIsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdkUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDL0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQUM7UUFDOUQsQ0FBQztRQUVELHNDQUFzQztRQUN0QyxJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRWpFLHdCQUF3QjtRQUN4QixNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLDRCQUE0QixFQUFFLG1CQUFtQixFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzthQUMvSSxPQUFPLEVBQUUsQ0FBQztRQUVaLHFCQUFxQjtRQUNyQixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLHdCQUF3QixFQUFFLG1CQUFtQixFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDO2FBQzVKLE9BQU8sRUFBRSxDQUFDO1FBRVosV0FBVyxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBRTVDLHFGQUFxRjtRQUNyRixNQUFNLGNBQWMsR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQzVFLE1BQU0sb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEosV0FBVyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFUyxjQUFjLENBQUMsb0JBQTJDO1FBQ25FLE9BQU8sb0JBQW9CLENBQUMsSUFBSSxDQUFDO0lBQ2xDLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYSxDQUFJLFNBQXVDLEVBQUUsTUFBVyxFQUFFLHNCQUF1RCxFQUFFLElBQW1CO1FBQ2hLLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDcEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsTUFBTSwyQkFBMkIsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7UUFDRCxJQUFJLENBQUMsR0FBYSxJQUFJLENBQUM7UUFDdkIsc0JBQXNCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUMxQyxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsSUFBSSxRQUFRLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDekIsTUFBTSxXQUFXLEdBQUcsU0FBUyxFQUFFLFVBQVUsQ0FBQyxLQUFLLENBQUM7UUFDaEQsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixDQUFDLDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQy9FLENBQUM7UUFDRCxJQUFJLENBQUM7WUFDSixJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNqQixXQUFXLENBQUMsSUFBSSxDQUFDLHNDQUFzQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZFLENBQUM7WUFDRCxJQUFJLElBQUksS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDcEIsQ0FBQyxHQUFNLE1BQU0sTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM1QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsQ0FBQyxHQUFNLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDL0IsQ0FBQztRQUNGLENBQUM7Z0JBQVMsQ0FBQztZQUNWLElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLFdBQVcsQ0FBQyxJQUFJLENBQUMscUNBQXFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDdEUsQ0FBQztZQUNELHNCQUFzQixDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFDRCxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFUyxLQUFLLENBQUMsbUJBQW1CLENBQUksU0FBdUMsRUFBRSxNQUFXLEVBQUUsc0JBQXVEO1FBQ25KLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBSSxTQUFTLEVBQUUsTUFBTSxFQUFFLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFUyxLQUFLLENBQUMsY0FBYyxDQUFJLFNBQXVDLEVBQUUsTUFBVyxFQUFFLHNCQUF1RDtRQUM5SSxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUksU0FBUyxFQUFFLE1BQU0sRUFBRSxzQkFBc0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRU0sS0FBSyxDQUFDLHFCQUFxQixDQUFDLEdBQXFDO1FBQ3ZFLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNyQyxPQUFPO1FBQ1IsQ0FBQztRQUVELEtBQUssTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7WUFDdkIsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZCLElBQUksS0FBSyxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUNwQixPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDekIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQzFCLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztDQUNEIn0=