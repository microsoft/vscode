/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isESM, canASAR } from 'vs/base/common/amd';
import { AppResourcePath, FileAccess, nodeModulesAsarPath, nodeModulesPath, Schemas, VSCODE_AUTHORITY } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';
import { IProductConfiguration } from 'vs/base/common/product';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';

class DefineCall {
	constructor(
		public readonly id: string | null | undefined,
		public readonly dependencies: string[] | null | undefined,
		public readonly callback: any
	) { }
}

class AMDModuleImporter {
	public static INSTANCE = new AMDModuleImporter();

	private readonly _isWebWorker = (typeof self === 'object' && self.constructor && self.constructor.name === 'DedicatedWorkerGlobalScope');
	private readonly _isRenderer = typeof document === 'object';

	private readonly _defineCalls: DefineCall[] = [];
	private _initialized = false;
	private _amdPolicy: Pick<TrustedTypePolicy<{
		createScriptURL(value: string): string;
	}>, 'name' | 'createScriptURL'> | undefined;

	constructor() { }

	private _initialize(): void {
		if (this._initialized) {
			return;
		}
		this._initialized = true;

		(globalThis as any).define = (id: any, dependencies: any, callback: any) => {
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

		(globalThis as any).define.amd = true;

		if (this._isRenderer) {
			// eslint-disable-next-line no-restricted-globals
			this._amdPolicy = (globalThis as any)._VSCODE_WEB_PACKAGE_TTP ?? window.trustedTypes?.createPolicy('amdLoader', {
				createScriptURL(value) {
					// eslint-disable-next-line no-restricted-globals
					if (value.startsWith(window.location.origin)) {
						return value;
					}
					if (value.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}`)) {
						return value;
					}
					throw new Error(`[trusted_script_src] Invalid script url: ${value}`);
				}
			});
		} else if (this._isWebWorker) {
			this._amdPolicy = (globalThis as any)._VSCODE_WEB_PACKAGE_TTP ?? (globalThis as any).trustedTypes?.createPolicy('amdLoader', {
				createScriptURL(value: string) {
					return value;
				}
			});
		}
	}

	public async load<T>(scriptSrc: string): Promise<T> {
		this._initialize();
		const defineCall = await (this._isWebWorker ? this._workerLoadScript(scriptSrc) : this._isRenderer ? this._rendererLoadScript(scriptSrc) : this._nodeJSLoadScript(scriptSrc));
		if (!defineCall) {
			// throw new Error(`Did not receive a define call from script ${scriptSrc}`);
			console.warn(`Did not receive a define call from script ${scriptSrc}`);
			return <T>undefined;
		}
		// TODO require, module
		const exports = {};
		const dependencyObjs: any[] = [];
		const dependencyModules: string[] = [];

		if (Array.isArray(defineCall.dependencies)) {

			for (const mod of defineCall.dependencies) {
				if (mod === 'exports') {
					dependencyObjs.push(exports);
				} else {
					dependencyModules.push(mod);
				}
			}
		}

		if (dependencyModules.length > 0) {
			throw new Error(`Cannot resolve dependencies for script ${scriptSrc}. The dependencies are: ${dependencyModules.join(', ')}`);
		}
		if (typeof defineCall.callback === 'function') {
			return defineCall.callback(...dependencyObjs) ?? exports;
		} else {
			return defineCall.callback;
		}
	}

	private _rendererLoadScript(scriptSrc: string): Promise<DefineCall | undefined> {
		return new Promise<DefineCall | undefined>((resolve, reject) => {
			const scriptElement = document.createElement('script');
			scriptElement.setAttribute('async', 'async');
			scriptElement.setAttribute('type', 'text/javascript');

			const unbind = () => {
				scriptElement.removeEventListener('load', loadEventListener);
				scriptElement.removeEventListener('error', errorEventListener);
			};

			const loadEventListener = (e: any) => {
				unbind();
				resolve(this._defineCalls.pop());
			};

			const errorEventListener = (e: any) => {
				unbind();
				reject(e);
			};

			scriptElement.addEventListener('load', loadEventListener);
			scriptElement.addEventListener('error', errorEventListener);
			if (this._amdPolicy) {
				scriptSrc = this._amdPolicy.createScriptURL(scriptSrc) as any as string;
			}
			scriptElement.setAttribute('src', scriptSrc);
			// eslint-disable-next-line no-restricted-globals
			window.document.getElementsByTagName('head')[0].appendChild(scriptElement);
		});
	}

	private async _workerLoadScript(scriptSrc: string): Promise<DefineCall | undefined> {
		if (this._amdPolicy) {
			scriptSrc = this._amdPolicy.createScriptURL(scriptSrc) as any as string;
		}
		if (isESM) {
			await import(scriptSrc);
		} else {
			importScripts(scriptSrc);
		}
		return this._defineCalls.pop();
	}

	private async _nodeJSLoadScript(scriptSrc: string): Promise<DefineCall | undefined> {
		try {
			const fs = (globalThis as any)._VSCODE_NODE_MODULES['fs'];
			const vm = (globalThis as any)._VSCODE_NODE_MODULES['vm'];
			const module = (globalThis as any)._VSCODE_NODE_MODULES['module'];

			const filePath = URI.parse(scriptSrc).fsPath;
			const content = fs.readFileSync(filePath).toString();
			const scriptSource = module.wrap(content.replace(/^#!.*/, ''));
			const script = new vm.Script(scriptSource);
			const compileWrapper = script.runInThisContext();
			compileWrapper.apply();
			return this._defineCalls.pop();

		} catch (error) {
			throw error;
		}
	}
}

const cache = new Map<string, Promise<any>>();

/**
 * Utility for importing an AMD node module. This util supports AMD and ESM contexts and should be used while the ESM adoption
 * is on its way.
 *
 * e.g. pass in `vscode-textmate/release/main.js`
 */
export async function importAMDNodeModule<T>(nodeModuleName: string, pathInsideNodeModule: string, isBuilt?: boolean): Promise<T> {
	if (isESM) {

		if (isBuilt === undefined) {
			const product = globalThis._VSCODE_PRODUCT_JSON as unknown as IProductConfiguration;
			isBuilt = Boolean((product ?? (globalThis as any).vscode?.context?.configuration()?.product)?.commit);
		}

		const nodeModulePath = pathInsideNodeModule ? `${nodeModuleName}/${pathInsideNodeModule}` : nodeModuleName;
		if (cache.has(nodeModulePath)) {
			return cache.get(nodeModulePath)!;
		}
		let scriptSrc: string;
		if (/^\w[\w\d+.-]*:\/\//.test(nodeModulePath)) {
			// looks like a URL
			// bit of a special case for: src/vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker.ts
			scriptSrc = nodeModulePath;
		} else {
			const useASAR = (canASAR && isBuilt && !platform.isWeb);
			const actualNodeModulesPath = (useASAR ? nodeModulesAsarPath : nodeModulesPath);
			const resourcePath: AppResourcePath = `${actualNodeModulesPath}/${nodeModulePath}`;
			scriptSrc = FileAccess.asBrowserUri(resourcePath).toString(true);
		}
		const result = AMDModuleImporter.INSTANCE.load<T>(scriptSrc);
		cache.set(nodeModulePath, result);
		return result;
	} else {
		return await import(nodeModuleName);
	}
}

export function resolveAmdNodeModulePath(nodeModuleName: string, pathInsideNodeModule: string): string {
	assertType(isESM);

	const product = globalThis._VSCODE_PRODUCT_JSON as unknown as IProductConfiguration;
	const isBuilt = Boolean((product ?? (globalThis as any).vscode?.context?.configuration()?.product)?.commit);
	const useASAR = (canASAR && isBuilt && !platform.isWeb);

	const nodeModulePath = `${nodeModuleName}/${pathInsideNodeModule}`;
	const actualNodeModulesPath = (useASAR ? nodeModulesAsarPath : nodeModulesPath);
	const resourcePath: AppResourcePath = `${actualNodeModulesPath}/${nodeModulePath}`;
	return FileAccess.asBrowserUri(resourcePath).toString(true);
}
