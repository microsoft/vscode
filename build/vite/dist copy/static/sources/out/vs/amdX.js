/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileAccess, nodeModulesAsarPath, nodeModulesPath, Schemas, VSCODE_AUTHORITY } from './base/common/network.js';
import * as platform from './base/common/platform.js';
import { URI } from './base/common/uri.js';
import { generateUuid } from './base/common/uuid.js';
export const canASAR = false; // TODO@esm: ASAR disabled in ESM
class DefineCall {
    constructor(id, dependencies, callback) {
        this.id = id;
        this.dependencies = dependencies;
        this.callback = callback;
    }
}
var AMDModuleImporterState;
(function (AMDModuleImporterState) {
    AMDModuleImporterState[AMDModuleImporterState["Uninitialized"] = 1] = "Uninitialized";
    AMDModuleImporterState[AMDModuleImporterState["InitializedInternal"] = 2] = "InitializedInternal";
    AMDModuleImporterState[AMDModuleImporterState["InitializedExternal"] = 3] = "InitializedExternal";
})(AMDModuleImporterState || (AMDModuleImporterState = {}));
class AMDModuleImporter {
    static { this.INSTANCE = new AMDModuleImporter(); }
    constructor() {
        this._isWebWorker = (typeof self === 'object' && self.constructor && self.constructor.name === 'DedicatedWorkerGlobalScope');
        this._isRenderer = typeof document === 'object';
        this._defineCalls = [];
        this._state = AMDModuleImporterState.Uninitialized;
    }
    _initialize() {
        if (this._state === AMDModuleImporterState.Uninitialized) {
            if (globalThis.define) {
                this._state = AMDModuleImporterState.InitializedExternal;
                return;
            }
        }
        else {
            return;
        }
        this._state = AMDModuleImporterState.InitializedInternal;
        globalThis.define = (id, dependencies, callback) => {
            if (typeof id !== 'string') {
                callback = dependencies;
                dependencies = id;
                id = null;
            }
            if (typeof dependencies !== 'object' || !Array.isArray(dependencies)) {
                callback = dependencies;
                dependencies = null;
            }
            // if (!dependencies) {
            // 	dependencies = ['require', 'exports', 'module'];
            // }
            this._defineCalls.push(new DefineCall(id, dependencies, callback));
        };
        globalThis.define.amd = true;
        if (this._isRenderer) {
            this._amdPolicy = globalThis._VSCODE_WEB_PACKAGE_TTP ?? window.trustedTypes?.createPolicy('amdLoader', {
                createScriptURL(value) {
                    if (value.startsWith(window.location.origin)) {
                        return value;
                    }
                    if (value.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}`)) {
                        return value;
                    }
                    throw new Error(`[trusted_script_src] Invalid script url: ${value}`);
                }
            });
        }
        else if (this._isWebWorker) {
            this._amdPolicy = globalThis._VSCODE_WEB_PACKAGE_TTP ?? globalThis.trustedTypes?.createPolicy('amdLoader', {
                createScriptURL(value) {
                    return value;
                }
            });
        }
    }
    async load(scriptSrc) {
        this._initialize();
        if (this._state === AMDModuleImporterState.InitializedExternal) {
            return new Promise(resolve => {
                const tmpModuleId = generateUuid();
                globalThis.define(tmpModuleId, [scriptSrc], function (moduleResult) {
                    resolve(moduleResult);
                });
            });
        }
        const defineCall = await (this._isWebWorker ? this._workerLoadScript(scriptSrc) : this._isRenderer ? this._rendererLoadScript(scriptSrc) : this._nodeJSLoadScript(scriptSrc));
        if (!defineCall) {
            console.warn(`Did not receive a define call from script ${scriptSrc}`);
            return undefined;
        }
        // TODO@esm require, module
        const exports = {};
        const dependencyObjs = [];
        const dependencyModules = [];
        if (Array.isArray(defineCall.dependencies)) {
            for (const mod of defineCall.dependencies) {
                if (mod === 'exports') {
                    dependencyObjs.push(exports);
                }
                else {
                    dependencyModules.push(mod);
                }
            }
        }
        if (dependencyModules.length > 0) {
            throw new Error(`Cannot resolve dependencies for script ${scriptSrc}. The dependencies are: ${dependencyModules.join(', ')}`);
        }
        if (typeof defineCall.callback === 'function') {
            return defineCall.callback(...dependencyObjs) ?? exports;
        }
        else {
            return defineCall.callback;
        }
    }
    _rendererLoadScript(scriptSrc) {
        return new Promise((resolve, reject) => {
            const scriptElement = document.createElement('script');
            scriptElement.setAttribute('async', 'async');
            scriptElement.setAttribute('type', 'text/javascript');
            const unbind = () => {
                scriptElement.removeEventListener('load', loadEventListener);
                scriptElement.removeEventListener('error', errorEventListener);
            };
            const loadEventListener = (e) => {
                unbind();
                resolve(this._defineCalls.pop());
            };
            const errorEventListener = (e) => {
                unbind();
                reject(e);
            };
            scriptElement.addEventListener('load', loadEventListener);
            scriptElement.addEventListener('error', errorEventListener);
            if (this._amdPolicy) {
                scriptSrc = this._amdPolicy.createScriptURL(scriptSrc);
            }
            scriptElement.setAttribute('src', scriptSrc);
            window.document.getElementsByTagName('head')[0].appendChild(scriptElement);
        });
    }
    async _workerLoadScript(scriptSrc) {
        if (this._amdPolicy) {
            scriptSrc = this._amdPolicy.createScriptURL(scriptSrc);
        }
        await import(/* webpackIgnore: true */ /* @vite-ignore */ scriptSrc);
        return this._defineCalls.pop();
    }
    async _nodeJSLoadScript(scriptSrc) {
        try {
            const fs = (await import(/* webpackIgnore: true */ /* @vite-ignore */ `${'fs'}`)).default;
            const vm = (await import(/* webpackIgnore: true */ /* @vite-ignore */ `${'vm'}`)).default;
            const module = (await import(/* webpackIgnore: true */ /* @vite-ignore */ `${'module'}`)).default;
            const filePath = URI.parse(scriptSrc).fsPath;
            const content = fs.readFileSync(filePath).toString();
            const scriptSource = module.wrap(content.replace(/^#!.*/, ''));
            const script = new vm.Script(scriptSource);
            const compileWrapper = script.runInThisContext();
            compileWrapper.apply();
            return this._defineCalls.pop();
        }
        catch (error) {
            throw error;
        }
    }
}
const cache = new Map();
/**
 * Utility for importing an AMD node module. This util supports AMD and ESM contexts and should be used while the ESM adoption
 * is on its way.
 *
 * e.g. pass in `vscode-textmate/release/main.js`
 */
export async function importAMDNodeModule(nodeModuleName, pathInsideNodeModule, isBuilt) {
    if (isBuilt === undefined) {
        const product = globalThis._VSCODE_PRODUCT_JSON;
        isBuilt = Boolean((product ?? globalThis.vscode?.context?.configuration()?.product)?.commit);
    }
    const nodeModulePath = pathInsideNodeModule ? `${nodeModuleName}/${pathInsideNodeModule}` : nodeModuleName;
    if (cache.has(nodeModulePath)) {
        return cache.get(nodeModulePath);
    }
    let scriptSrc;
    if (/^\w[\w\d+.-]*:\/\//.test(nodeModulePath)) {
        // looks like a URL
        // bit of a special case for: src/vs/workbench/services/languageDetection/browser/languageDetectionWebWorker.ts
        scriptSrc = nodeModulePath;
    }
    else {
        const useASAR = (canASAR && isBuilt && !platform.isWeb);
        const actualNodeModulesPath = (useASAR ? nodeModulesAsarPath : nodeModulesPath);
        const resourcePath = `${actualNodeModulesPath}/${nodeModulePath}`;
        scriptSrc = FileAccess.asBrowserUri(resourcePath).toString(true);
    }
    const result = AMDModuleImporter.INSTANCE.load(scriptSrc);
    cache.set(nodeModulePath, result);
    return result;
}
export function resolveAmdNodeModulePath(nodeModuleName, pathInsideNodeModule) {
    const product = globalThis._VSCODE_PRODUCT_JSON;
    const isBuilt = Boolean((product ?? globalThis.vscode?.context?.configuration()?.product)?.commit);
    const useASAR = (canASAR && isBuilt && !platform.isWeb);
    const nodeModulePath = `${nodeModuleName}/${pathInsideNodeModule}`;
    const actualNodeModulesPath = (useASAR ? nodeModulesAsarPath : nodeModulesPath);
    const resourcePath = `${actualNodeModulesPath}/${nodeModulePath}`;
    return FileAccess.asBrowserUri(resourcePath).toString(true);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW1kWC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2FtZFgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFtQixVQUFVLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3hJLE9BQU8sS0FBSyxRQUFRLE1BQU0sMkJBQTJCLENBQUM7QUFFdEQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVyRCxNQUFNLENBQUMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLENBQUMsaUNBQWlDO0FBTy9ELE1BQU0sVUFBVTtJQUNmLFlBQ2lCLEVBQTZCLEVBQzdCLFlBQXlDLEVBQ3pDLFFBQWE7UUFGYixPQUFFLEdBQUYsRUFBRSxDQUEyQjtRQUM3QixpQkFBWSxHQUFaLFlBQVksQ0FBNkI7UUFDekMsYUFBUSxHQUFSLFFBQVEsQ0FBSztJQUMxQixDQUFDO0NBQ0w7QUFFRCxJQUFLLHNCQUlKO0FBSkQsV0FBSyxzQkFBc0I7SUFDMUIscUZBQWlCLENBQUE7SUFDakIsaUdBQW1CLENBQUE7SUFDbkIsaUdBQW1CLENBQUE7QUFDcEIsQ0FBQyxFQUpJLHNCQUFzQixLQUF0QixzQkFBc0IsUUFJMUI7QUFFRCxNQUFNLGlCQUFpQjthQUNSLGFBQVEsR0FBRyxJQUFJLGlCQUFpQixFQUFFLEFBQTFCLENBQTJCO0lBU2pEO1FBUGlCLGlCQUFZLEdBQUcsQ0FBQyxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksS0FBSyw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3hILGdCQUFXLEdBQUcsT0FBTyxRQUFR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