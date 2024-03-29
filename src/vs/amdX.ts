/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isESM } from 'vs/base/common/amd';
import { nodeModulesAsarPath, nodeModulesPath } from 'vs/base/common/network';
import * as platform from 'vs/base/common/platform';
import { IProductConfiguration } from 'vs/base/common/product';
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


	}

	public async load<T>(scriptSrc: string): Promise<T> {
		this._initialize();
		const defineCall = await (this._isWebWorker ? this._workerLoadScript(scriptSrc) : this._isRenderer ? this._rendererLoadScript(scriptSrc) : this._nodeJSLoadScript(scriptSrc));
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


	private async _import(scriptSrc: string): Promise<DefineCall | undefined> {
		try {
			await import(scriptSrc);
			return this._defineCalls.pop();
		} catch (error) {
			throw new Error(`Failed to import ${scriptSrc}: ${error}`);
		}
	}

	private async _rendererLoadScript(scriptSrc: string): Promise<DefineCall | undefined> {
		return this._import(scriptSrc);
	}

	private async _workerLoadScript(scriptSrc: string): Promise<DefineCall | undefined> {
		return this._import(scriptSrc);
	}

	private async _nodeJSLoadScript(scriptSrc: string): Promise<DefineCall | undefined> {
		// TODO investigate if can just use import here
		try {
			const fs = <typeof import('fs')>globalThis._VSCODE_NODE_MODULES['fs'];
			const vm = <typeof import('vm')>globalThis._VSCODE_NODE_MODULES['vm'];
			const module = <typeof import('module')>globalThis._VSCODE_NODE_MODULES['module'];

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

let _paths: Record<string, string> = {};
if (typeof globalThis.require === 'object') {
	_paths = (<Record<string, any>>globalThis.require).paths ?? {};
}

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
			isBuilt = Boolean((product ?? (<any>globalThis).vscode?.context?.configuration()?.product)?.commit);
		}

		if (_paths[nodeModuleName]) {
			nodeModuleName = _paths[nodeModuleName];
		}

		const nodeModulePath = `${nodeModuleName}/${pathInsideNodeModule}`;
		if (cache.has(nodeModulePath)) {
			return cache.get(nodeModulePath)!;
		}
		let scriptSrc: string;
		if (/^\w[\w\d+.-]*:\/\//.test(nodeModulePath)) {
			// looks like a URL
			// bit of a special case for: src/vs/workbench/services/languageDetection/browser/languageDetectionSimpleWorker.ts
			scriptSrc = nodeModulePath;
		} else {
			const useASAR = (isBuilt && !platform.isWeb);
			const actualNodeModulesPath = (useASAR ? nodeModulesAsarPath : nodeModulesPath);
			const resourcePath: string = `${actualNodeModulesPath}/${nodeModulePath}`;
			scriptSrc = resourcePath;
		}
		const result = AMDModuleImporter.INSTANCE.load<T>(scriptSrc);
		cache.set(nodeModulePath, result);
		return result;
	} else {
		return await import(nodeModuleName);
	}
}
