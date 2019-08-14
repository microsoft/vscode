/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createApiFactoryAndRegisterActors, IExtensionApiFactory } from 'vs/workbench/api/common/extHost.api.impl';
import { ExtensionActivationTimesBuilder } from 'vs/workbench/api/common/extHostExtensionActivator';
import { AbstractExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { endsWith } from 'vs/base/common/strings';
import { IExtensionDescription, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';
import * as vscode from 'vscode';
import { TernarySearchTree } from 'vs/base/common/map';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';

class ApiInstances {

	private readonly _apiInstances = new Map<string, typeof vscode>();

	constructor(
		private readonly _apiFactory: IExtensionApiFactory,
		private readonly _extensionPaths: TernarySearchTree<IExtensionDescription>,
		private readonly _extensionRegistry: ExtensionDescriptionRegistry,
		private readonly _configProvider: ExtHostConfigProvider,
	) {
		//
	}

	get(modulePath: string): typeof vscode {
		const extension = this._extensionPaths.findSubstr(modulePath) || nullExtensionDescription;
		const id = ExtensionIdentifier.toKey(extension.identifier);

		let apiInstance = this._apiInstances.get(id);
		if (!apiInstance) {
			apiInstance = this._apiFactory(extension, this._extensionRegistry, this._configProvider);
			this._apiInstances.set(id, apiInstance);
		}
		return apiInstance;
	}
}

export class ExtHostExtensionService extends AbstractExtHostExtensionService {

	private _apiInstances?: ApiInstances;

	protected async _beforeAlmostReadyToRunExtensions(): Promise<void> {
		// initialize API and register actors
		const apiFactory = this._instaService.invokeFunction(createApiFactoryAndRegisterActors);
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		const extensionPath = await this.getExtensionPathIndex();
		this._apiInstances = new ApiInstances(apiFactory, extensionPath, this._registry, configProvider);
	}

	protected _loadCommonJSModule<T>(module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {

		// make sure modulePath ends with `.js`
		const suffix = '.js';
		let modulePath = endsWith(module.fsPath, suffix) ? module.fsPath : module.fsPath + suffix;

		interface FakeCommonJSSelf {
			module?: object;
			exports?: object;
			require?: (module: string) => any;
			window?: object;
			__dirname: never;
			__filename: never;
		}

		// FAKE commonjs world that only collects exports
		const patchSelf: FakeCommonJSSelf = <any>self;
		const exports = Object.create(null);
		patchSelf.module = { exports };
		patchSelf.exports = exports;
		patchSelf.window = self; // <- that's improper but might help extensions that aren't authored correctly

		// FAKE require function that only works for the vscode-module
		patchSelf.require = (module: string) => {
			if (module !== 'vscode') {
				throw new Error(`Cannot load module '${module}'`);
			}
			return this._apiInstances!.get(modulePath);
		};

		try {
			// todo@joh this is a copy of `dom.ts#asDomUri`
			// build url of the things we resolve
			const url = isWeb
				? URI.parse(window.location.href).with({ path: '/vscode-remote', query: JSON.stringify(URI.file(modulePath)) }).toString(true)
				: modulePath;

			activationTimesBuilder.codeLoadingStart();
			importScripts(url);
		} finally {
			activationTimesBuilder.codeLoadingStop();
		}

		return Promise.resolve<T>(exports);
	}

	async $setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		throw new Error('Not supported');
	}
}
