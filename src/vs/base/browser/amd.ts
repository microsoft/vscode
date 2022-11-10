/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isESM } from 'vs/base/common/amd';
import { AppResourcePath, FileAccess, nodeModulesAsarPath, nodeModulesPath } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';

class DefineCall {
	constructor(
		public readonly id: string | null | undefined,
		public readonly dependencies: string[] | null | undefined,
		public readonly callback: any
	) { }
}

class AMDModuleImporter {
	public static INSTANCE = new AMDModuleImporter();

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

		(<any>globalThis).define = (id: any, dependencies: any, callback: any) => {
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

		(<any>globalThis).define.amd = true;

		this._amdPolicy = window.trustedTypes?.createPolicy('amdLoader', {
			createScriptURL(value) {
				if (value.startsWith(window.location.origin)) {
					return value;
				}
				throw new Error(`Invalid script url: ${value}`);
			}
		});
	}

	public async load<T>(scriptSrc: string): Promise<T> {
		this._initialize();
		const defineCall = await this.loadScript(scriptSrc);
		if (!defineCall) {
			throw new Error(`Did not receive a define call from script ${scriptSrc}`);
		}
		// TODO require, exports, module
		if (Array.isArray(defineCall.dependencies) && defineCall.dependencies.length > 0) {
			throw new Error(`Cannot resolve dependencies for script ${scriptSrc}. The dependencies are: ${defineCall.dependencies.join(', ')}`);
		}
		if (typeof defineCall.callback === 'function') {
			return defineCall.callback([]);
		} else {
			return defineCall.callback;
		}
	}

	private loadScript(scriptSrc: string): Promise<DefineCall | undefined> {
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
			document.getElementsByTagName('head')[0].appendChild(scriptElement);
		});
	}
}

const cache = new Map<string, Promise<any>>();

/**
 * e.g. pass in `vscode-textmate/release/main.js`
 */
export async function importAMDNodeModule<T>(nodeModuleName: string, pathInsideNodeModule: string, isBuilt: boolean): Promise<T> {
	if (isESM) {
		const nodeModulePath = `${nodeModuleName}/${pathInsideNodeModule}`;
		if (cache.has(nodeModulePath)) {
			return cache.get(nodeModulePath)!;
		}
		const useASAR = (isBuilt && !platform.isWeb);
		const actualNodeModulesPath = (useASAR ? nodeModulesAsarPath : nodeModulesPath);
		const resourcePath: AppResourcePath = `${actualNodeModulesPath}/${nodeModulePath}`;
		const scriptSrc = FileAccess.asBrowserUri(resourcePath).toString(true);
		const result = AMDModuleImporter.INSTANCE.load<T>(scriptSrc);
		cache.set(nodeModulePath, result);
		return result;
	} else {
		return await import(nodeModuleName);
	}
}
