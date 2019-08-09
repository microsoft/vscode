/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createApiFactoryAndRegisterActors } from 'vs/workbench/api/common/extHost.api.impl';
import { ExtensionActivationTimesBuilder } from 'vs/workbench/api/common/extHostExtensionActivator';
import { AbstractExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { endsWith } from 'vs/base/common/strings';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';

export class ExtHostExtensionService extends AbstractExtHostExtensionService {

	protected async _beforeAlmostReadyToRunExtensions(): Promise<void> {
		// initialize API and register actors
		const factory = this._instaService.invokeFunction(createApiFactoryAndRegisterActors);

		// globally define the vscode module and share that for all extensions
		// todo@joh have an instance per extension, not a shared one....
		const sharedApiInstance = factory(nullExtensionDescription, this._registry, await this._extHostConfiguration.getConfigProvider());
		define('vscode', sharedApiInstance);
	}

	protected _loadCommonJSModule<T>(modulePath: string, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {
		// fake commonjs world
		const module = { exports: {} };
		//@ts-ignore
		self['module'] = module;
		//@ts-ignore
		self['exports'] = module.exports;
		// that's improper but might help extensions that aren't author correctly
		// @ts-ignore
		self['window'] = self;

		try {
			activationTimesBuilder.codeLoadingStart();
			// import the single (!) script, make sure it's a JS-file
			const suffix = '.js';
			if (endsWith(modulePath, suffix)) {
				importScripts(modulePath);
			} else {
				importScripts(modulePath + suffix);
			}
		} finally {
			activationTimesBuilder.codeLoadingStop();
		}

		// return what it exported
		return Promise.resolve(module.exports as T);
	}

	public async $setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		throw new Error('Not supported');
	}
}
