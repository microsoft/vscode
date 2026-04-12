/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createApiFactoryAndRegisterActors } from '../common/extHost.api.impl.js';
import { AbstractExtHostExtensionService } from '../common/extHostExtensionService.js';
import { URI } from '../../../base/common/uri.js';
import { RequireInterceptor } from '../common/extHostRequireInterceptor.js';
import { ExtensionRuntime } from '../common/extHostTypes.js';
import { timeout } from '../../../base/common/async.js';
import { ExtHostConsoleForwarder } from './extHostConsoleForwarder.js';
import { extname } from '../../../base/common/path.js';
class WorkerRequireInterceptor extends RequireInterceptor {
    _installInterceptor() { }
    getModule(request, parent) {
        for (const alternativeModuleName of this._alternatives) {
            const alternative = alternativeModuleName(request);
            if (alternative) {
                request = alternative;
                break;
            }
        }
        if (this._factories.has(request)) {
            return this._factories.get(request).load(request, parent, () => { throw new Error('CANNOT LOAD MODULE from here.'); });
        }
        return undefined;
    }
}
export class ExtHostExtensionService extends AbstractExtHostExtensionService {
    constructor() {
        super(...arguments);
        this.extensionRuntime = ExtensionRuntime.Webworker;
    }
    async _beforeAlmostReadyToRunExtensions() {
        // make sure console.log calls make it to the render
        this._instaService.createInstance(ExtHostConsoleForwarder);
        // initialize API and register actors
        const apiFactory = this._instaService.invokeFunction(createApiFactoryAndRegisterActors);
        this._fakeModules = this._instaService.createInstance(WorkerRequireInterceptor, apiFactory, { mine: this._myRegistry, all: this._globalRegistry });
        await this._fakeModules.install();
        performance.mark('code/extHost/didInitAPI');
        await this._waitForDebuggerAttachment();
    }
    _getEntryPoint(extensionDescription) {
        return extensionDescription.browser;
    }
    async _loadCommonJSModule(extension, module, activationTimesBuilder) {
        module = module.with({ path: ensureSuffix(module.path, '.js') });
        const extensionId = extension?.identifier.value;
        if (extensionId) {
            performance.mark(`code/extHost/willFetchExtensionCode/${extensionId}`);
        }
        // First resolve the extension entry point URI to something we can load using `fetch`
        // This needs to be done on the main thread due to a potential `resourceUriProvider` (workbench api)
        // which is only available in the main thread
        const browserUri = URI.revive(await this._mainThreadExtensionsProxy.$asBrowserUri(module));
        const response = await fetch(browserUri.toString(true));
        if (extensionId) {
            performance.mark(`code/extHost/didFetchExtensionCode/${extensionId}`);
        }
        if (response.status !== 200) {
            throw new Error(response.statusText);
        }
        // fetch JS sources as text and create a new function around it
        const source = await response.text();
        // Here we append #vscode-extension to serve as a marker, such that source maps
        // can be adjusted for the extra wrapping function.
        const sourceURL = `${module.toString(true)}#vscode-extension`;
        const fullSource = `${source}\n//# sourceURL=${sourceURL}`;
        let initFn;
        try {
            initFn = new Function('module', 'exports', 'require', fullSource); // CodeQL [SM01632] js/eval-call there is no alternative until we move to ESM
        }
        catch (err) {
            if (extensionId) {
                console.error(`Loading code for extension ${extensionId} failed: ${err.message}`);
            }
            else {
                console.error(`Loading code failed: ${err.message}`);
            }
            console.error(`${module.toString(true)}${typeof err.line === 'number' ? ` line ${err.line}` : ''}${typeof err.column === 'number' ? ` column ${err.column}` : ''}`);
            console.error(err);
            throw err;
        }
        if (extension) {
            await this._extHostLocalizationService.initializeLocalizedMessages(extension);
        }
        // define commonjs globals: `module`, `exports`, and `require`
        const _exports = {};
        const _module = { exports: _exports };
        const _require = (request) => {
            const result = this._fakeModules.getModule(request, module);
            if (result === undefined) {
                throw new Error(`Cannot load module '${request}'`);
            }
            return result;
        };
        try {
            activationTimesBuilder.codeLoadingStart();
            if (extensionId) {
                performance.mark(`code/extHost/willLoadExtensionCode/${extensionId}`);
            }
            initFn(_module, _exports, _require);
            return (_module.exports !== _exports ? _module.exports : _exports);
        }
        finally {
            if (extensionId) {
                performance.mark(`code/extHost/didLoadExtensionCode/${extensionId}`);
            }
            activationTimesBuilder.codeLoadingStop();
        }
    }
    _loadESMModule(extension, module, activationTimesBuilder) {
        throw new Error('ESM modules are not supported in the web worker extension host');
    }
    async $setRemoteEnvironment(_env) {
        return;
    }
    async _waitForDebuggerAttachment(waitTimeout = 5000) {
        // debugger attaches async, waiting for it fixes #106698 and #99222
        if (!this._initData.environment.isExtensionDevelopmentDebug) {
            return;
        }
        const deadline = Date.now() + waitTimeout;
        while (Date.now() < deadline && !('__jsDebugIsReady' in globalThis)) {
            await timeout(10);
        }
    }
}
function ensureSuffix(path, suffix) {
    const extName = extname(path);
    return extName ? path : path + suffix;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEV4dGVuc2lvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3dvcmtlci9leHRIb3N0RXh0ZW5zaW9uU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUVsRixPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2RCxNQUFNLHdCQUF5QixTQUFRLGtCQUFrQjtJQUU5QyxtQkFBbUIsS0FBSyxDQUFDO0lBRW5DLFNBQVMsQ0FBQyxPQUFlLEVBQUUsTUFBVztRQUNyQyxLQUFLLE1BQU0scUJBQXFCLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3hELE1BQU0sV0FBVyxHQUFHLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELElBQUksV0FBVyxFQUFFLENBQUM7Z0JBQ2pCLE9BQU8sR0FBRyxXQUFXLENBQUM7Z0JBQ3RCLE1BQU07WUFDUCxDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNsQyxPQUFP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