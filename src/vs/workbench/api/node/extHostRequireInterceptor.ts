/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TernarySearchTree } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { MainThreadKeytarShape, IEnvironment, MainThreadWindowShape, MainThreadTelemetryShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import * as vscode from 'vscode';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { endsWith } from 'vs/base/common/strings';
import { IExtensionApiFactory } from 'vs/workbench/api/node/extHost.api.impl';


interface LoadFunction {
	(request: string, parent: { filename: string; }, isMain: any): any;
}

interface INodeModuleFactory {
	readonly nodeModuleName: string | string[];
	load(request: string, parent: { filename: string; }, isMain: any, original: LoadFunction): any;
	alternaiveModuleName?(name: string): string | undefined;
}

export class NodeModuleRequireInterceptor {
	public static INSTANCE = new NodeModuleRequireInterceptor();

	private readonly _factories: Map<string, INodeModuleFactory>;
	private readonly _alternatives: ((moduleName: string) => string | undefined)[];

	constructor() {
		this._factories = new Map<string, INodeModuleFactory>();
		this._alternatives = [];
		this._installInterceptor(this._factories, this._alternatives);
	}

	private _installInterceptor(factories: Map<string, INodeModuleFactory>, alternatives: ((moduleName: string) => string | undefined)[]): void {
		const node_module = <any>require.__$__nodeRequire('module');
		const original = node_module._load;
		node_module._load = function load(request: string, parent: { filename: string; }, isMain: any) {
			for (let alternativeModuleName of alternatives) {
				let alternative = alternativeModuleName(request);
				if (alternative) {
					request = alternative;
					break;
				}
			}
			if (!factories.has(request)) {
				return original.apply(this, arguments);
			}
			return factories.get(request)!.load(request, parent, isMain, original);
		};
	}

	public register(interceptor: INodeModuleFactory): void {
		if (Array.isArray(interceptor.nodeModuleName)) {
			for (let moduleName of interceptor.nodeModuleName) {
				this._factories.set(moduleName, interceptor);
			}
		} else {
			this._factories.set(interceptor.nodeModuleName, interceptor);
		}
		if (typeof interceptor.alternaiveModuleName === 'function') {
			this._alternatives.push((moduleName) => {
				return interceptor.alternaiveModuleName!(moduleName);
			});
		}
	}
}

export class VSCodeNodeModuleFactory implements INodeModuleFactory {
	public readonly nodeModuleName = 'vscode';

	private readonly _extApiImpl = new Map<string, typeof vscode>();
	private _defaultApiImpl: typeof vscode;

	constructor(
		private readonly _apiFactory: IExtensionApiFactory,
		private readonly _extensionPaths: TernarySearchTree<IExtensionDescription>,
		private readonly _extensionRegistry: ExtensionDescriptionRegistry,
		private readonly _configProvider: ExtHostConfigProvider
	) {
	}

	public load(request: string, parent: { filename: string; }): any {

		// get extension id from filename and api for extension
		const ext = this._extensionPaths.findSubstr(URI.file(parent.filename).fsPath);
		if (ext) {
			let apiImpl = this._extApiImpl.get(ExtensionIdentifier.toKey(ext.identifier));
			if (!apiImpl) {
				apiImpl = this._apiFactory(ext, this._extensionRegistry, this._configProvider);
				this._extApiImpl.set(ExtensionIdentifier.toKey(ext.identifier), apiImpl);
			}
			return apiImpl;
		}

		// fall back to a default implementation
		if (!this._defaultApiImpl) {
			let extensionPathsPretty = '';
			this._extensionPaths.forEach((value, index) => extensionPathsPretty += `\t${index} -> ${value.identifier.value}\n`);
			console.warn(`Could not identify extension for 'vscode' require call from ${parent.filename}. These are the extension path mappings: \n${extensionPathsPretty}`);
			this._defaultApiImpl = this._apiFactory(nullExtensionDescription, this._extensionRegistry, this._configProvider);
		}
		return this._defaultApiImpl;
	}
}

interface IKeytarModule {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	findPassword(service: string): Promise<string | null>;
}

export class KeytarNodeModuleFactory implements INodeModuleFactory {
	public readonly nodeModuleName: string = 'keytar';

	private alternativeNames: Set<string> | undefined;
	private _impl: IKeytarModule;

	constructor(mainThreadKeytar: MainThreadKeytarShape, environment: IEnvironment) {
		if (environment.appRoot) {
			let appRoot = environment.appRoot.fsPath;
			if (process.platform === 'win32') {
				appRoot = appRoot.replace(/\\/g, '/');
			}
			if (appRoot[appRoot.length - 1] === '/') {
				appRoot = appRoot.substr(0, appRoot.length - 1);
			}
			this.alternativeNames = new Set();
			this.alternativeNames.add(`${appRoot}/node_modules.asar/keytar`);
			this.alternativeNames.add(`${appRoot}/node_modules/keytar`);
		}
		this._impl = {
			getPassword: (service: string, account: string): Promise<string | null> => {
				return mainThreadKeytar.$getPassword(service, account);
			},
			setPassword: (service: string, account: string, password: string): Promise<void> => {
				return mainThreadKeytar.$setPassword(service, account, password);
			},
			deletePassword: (service: string, account: string): Promise<boolean> => {
				return mainThreadKeytar.$deletePassword(service, account);
			},
			findPassword: (service: string): Promise<string | null> => {
				return mainThreadKeytar.$findPassword(service);
			}
		};
	}

	public load(request: string, parent: { filename: string; }): any {
		return this._impl;
	}

	public alternaiveModuleName(name: string): string | undefined {
		const length = name.length;
		// We need at least something like: `?/keytar` which requires
		// more than 7 characters.
		if (length <= 7 || !this.alternativeNames) {
			return undefined;
		}
		const sep = length - 7;
		if ((name.charAt(sep) === '/' || name.charAt(sep) === '\\') && endsWith(name, 'keytar')) {
			name = name.replace(/\\/g, '/');
			if (this.alternativeNames.has(name)) {
				return 'keytar';
			}
		}
		return undefined;
	}
}

interface OpenOptions {
	wait: boolean;
	app: string | string[];
}

interface IOriginalOpen {
	(target: string, options?: OpenOptions): Thenable<any>;
}

interface IOpenModule {
	(target: string, options?: OpenOptions): Thenable<void>;
}

export class OpenNodeModuleFactory implements INodeModuleFactory {

	public readonly nodeModuleName: string[] = ['open', 'opn'];

	private _extensionId: string | undefined;
	private _original: IOriginalOpen;
	private _impl: IOpenModule;

	constructor(mainThreadWindow: MainThreadWindowShape, private _mainThreadTelemerty: MainThreadTelemetryShape, private readonly _extensionPaths: TernarySearchTree<IExtensionDescription>) {
		this._impl = (target, options) => {
			const uri: URI = URI.parse(target);
			// If we have options use the original method.
			if (options) {
				return this.callOriginal(target, options);
			}
			if (uri.scheme === 'http' || uri.scheme === 'https') {
				return mainThreadWindow.$openUri(uri, { allowTunneling: true });
			} else if (uri.scheme === 'mailto') {
				return mainThreadWindow.$openUri(uri, {});
			}
			return this.callOriginal(target, options);
		};
	}

	public load(request: string, parent: { filename: string; }, isMain: any, original: LoadFunction): any {
		// get extension id from filename and api for extension
		const extension = this._extensionPaths.findSubstr(URI.file(parent.filename).fsPath);
		if (extension) {
			this._extensionId = extension.identifier.value;
			this.sendShimmingTelemetry();
		}

		this._original = original(request, parent, isMain);
		return this._impl;
	}

	private callOriginal(target: string, options: OpenOptions | undefined): Thenable<any> {
		this.sendNoForwardTelemetry();
		return this._original(target, options);
	}

	private sendShimmingTelemetry(): void {
		if (!this._extensionId) {
			return;
		}
		type ShimmingOpenClassification = {
			extension: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};
		this._mainThreadTelemerty.$publicLog2<{ extension: string }, ShimmingOpenClassification>('shimming.open', { extension: this._extensionId });
	}

	private sendNoForwardTelemetry(): void {
		if (!this._extensionId) {
			return;
		}
		type ShimmingOpenCallNoForwardClassification = {
			extension: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};
		this._mainThreadTelemerty.$publicLog2<{ extension: string }, ShimmingOpenCallNoForwardClassification>('shimming.open.call.noForward', { extension: this._extensionId });
	}
}
