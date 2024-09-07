/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// ####################################
// ###                              ###
// ### !!! PLEASE DO NOT MODIFY !!! ###
// ###                              ###
// ####################################

// TODO@esm remove me once we stop supporting our web-esm-bridge

(function () {

	// #region Types
	type IGlobalDefine = {
		(moduleName: string, dependencies: string[], callback: (...args: any[]) => any): any;
		(moduleName: string, dependencies: string[], definition: any): any;
		(moduleName: string, callback: (...args: any[]) => any): any;
		(moduleName: string, definition: any): any;
		(dependencies: string[], callback: (...args: any[]) => any): any;
		(dependencies: string[], definition: any): any;
	};

	interface ILoaderPlugin {
		load: (pluginParam: string, parentRequire: IRelativeRequire, loadCallback: IPluginLoadCallback, options: IConfigurationOptions) => void;
		write?: (pluginName: string, moduleName: string, write: IPluginWriteCallback) => void;
		writeFile?: (pluginName: string, moduleName: string, req: IRelativeRequire, write: IPluginWriteFileCallback, config: IConfigurationOptions) => void;
		finishBuild?: (write: (filename: string, contents: string) => void) => void;
	}
	interface IRelativeRequire {
		(dependencies: string[], callback: Function, errorback?: (error: Error) => void): void;
		toUrl(id: string): string;
	}
	interface IPluginLoadCallback {
		(value: any): void;
		error(err: any): void;
	}
	interface IConfigurationOptions {
		isBuild: boolean | undefined;
		[key: string]: any;
	}
	interface IPluginWriteCallback {
		(contents: string): void;
		getEntryPoint(): string;
		asModule(moduleId: string, contents: string): void;
	}
	interface IPluginWriteFileCallback {
		(filename: string, contents: string): void;
		getEntryPoint(): string;
		asModule(moduleId: string, contents: string): void;
	}

	//#endregion

	const define: IGlobalDefine = (globalThis as any).define;
	const require: { getConfig?(): any } | undefined = (globalThis as any).require;

	if (!define || !require || typeof require.getConfig !== 'function') {
		throw new Error('Expected global define() and require() functions. Please only load this module in an AMD context!');
	}

	let baseUrl = require?.getConfig().baseUrl;
	if (!baseUrl) {
		throw new Error('Failed to determine baseUrl for loading AMD modules (tried require.getConfig().baseUrl)');
	}
	if (!baseUrl.endsWith('/')) {
		baseUrl = baseUrl + '/';
	}
	globalThis._VSCODE_FILE_ROOT = baseUrl;

	const trustedTypesPolicy: Pick<TrustedTypePolicy<{ createScriptURL(value: string): string }>, 'name' | 'createScriptURL'> | undefined = require.getConfig().trustedTypesPolicy;
	if (trustedTypesPolicy) {
		globalThis._VSCODE_WEB_PACKAGE_TTP = trustedTypesPolicy;
	}

	const promise = new Promise(resolve => {
		(globalThis as any).__VSCODE_WEB_ESM_PROMISE = resolve;
	});

	define('vs/web-api', [], () => {
		return {
			load: (_name, _req, _load, _config) => {
				const script: any = document.createElement('script');
				script.type = 'module';
				script.src = trustedTypesPolicy ? trustedTypesPolicy.createScriptURL(`${baseUrl}vs/workbench/workbench.web.main.internal.js`) as any as string : `${baseUrl}vs/workbench/workbench.web.main.internal.js`;
				document.head.appendChild(script);

				return promise.then(mod => _load(mod));
			}
		} as ILoaderPlugin;
	});

	define(
		'vs/workbench/workbench.web.main',
		['require', 'exports', 'vs/web-api!'],
		function (_require, exports, webApi) {
			Object.assign(exports, webApi);
		}
	);
})();
