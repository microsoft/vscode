/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createApiFactoryAndRegisterActors } from 'vs/workbench/api/common/extHost.api.impl';
import { ExtensionActivationTimesBuilder } from 'vs/workbench/api/common/extHostExtensionActivator';
import { AbstractExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { endsWith, startsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { RequireInterceptor } from 'vs/workbench/api/common/extHostRequireInterceptor';

class ExportsTrap {

	static readonly Instance = new ExportsTrap();

	private readonly _names: string[] = [];
	private readonly _exports = new Map<string, any>();

	private constructor() {

		const exportsProxy = new Proxy({}, {
			set: (target: any, p: PropertyKey, value: any) => {
				// store in target
				target[p] = value;
				// store in named-bucket
				const name = this._names[this._names.length - 1];
				this._exports.get(name)![p] = value;
				return true;
			}
		});


		const moduleProxy = new Proxy({}, {

			get: (target: any, p: PropertyKey) => {
				if (p === 'exports') {
					return exportsProxy;
				}

				return target[p];
			},

			set: (target: any, p: PropertyKey, value: any) => {
				// store in target
				target[p] = value;

				// override bucket
				if (p === 'exports') {
					const name = this._names[this._names.length - 1];
					this._exports.set(name, value);
				}
				return true;
			}
		});

		(<any>self).exports = exportsProxy;
		(<any>self).module = moduleProxy;
	}

	add(name: string) {
		this._exports.set(name, Object.create(null));
		this._names.push(name);

		return {
			claim: () => {
				const result = this._exports.get(name);
				this._exports.delete(name);
				this._names.pop();
				return result;
			}
		};
	}
}

class WorkerRequireInterceptor extends RequireInterceptor {

	_installInterceptor() { }

	getModule(request: string, parent: URI): undefined | any {
		for (let alternativeModuleName of this._alternatives) {
			let alternative = alternativeModuleName(request);
			if (alternative) {
				request = alternative;
				break;
			}
		}

		if (this._factories.has(request)) {
			return this._factories.get(request)!.load(request, parent, () => { throw new Error('CANNOT LOAD MODULE from here.'); });
		}
		return undefined;
	}
}

export class ExtHostExtensionService extends AbstractExtHostExtensionService {

	private _fakeModules: WorkerRequireInterceptor;

	protected async _beforeAlmostReadyToRunExtensions(): Promise<void> {
		// initialize API and register actors
		const apiFactory = this._instaService.invokeFunction(createApiFactoryAndRegisterActors);
		this._fakeModules = this._instaService.createInstance(WorkerRequireInterceptor, apiFactory, this._registry);
		await this._fakeModules.install();
	}

	protected _loadCommonJSModule<T>(module: URI, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {

		(<any>self).window = self; // <- that's improper but might help extensions that aren't authored correctly

		// FAKE require function that only works for the vscode-module
		const moduleStack: URI[] = [];
		(<any>self).require = (mod: string) => {

			const parent = moduleStack[moduleStack.length - 1];
			const result = this._fakeModules.getModule(mod, parent);

			if (result !== undefined) {
				return result;
			}

			if (!startsWith(mod, '.')) {
				throw new Error(`Cannot load module '${mod}'`);
			}

			const next = joinPath(parent, '..', ensureSuffix(mod, '.js'));
			moduleStack.push(next);
			const trap = ExportsTrap.Instance.add(next.toString());
			importScripts(asDomUri(next).toString(true));
			moduleStack.pop();

			return trap.claim();
		};

		try {
			activationTimesBuilder.codeLoadingStart();
			module = module.with({ path: ensureSuffix(module.path, '.js') });
			moduleStack.push(module);
			const trap = ExportsTrap.Instance.add(module.toString());
			importScripts(asDomUri(module).toString(true));
			moduleStack.pop();
			return Promise.resolve<T>(trap.claim());

		} finally {
			activationTimesBuilder.codeLoadingStop();
		}
	}

	async $setRemoteEnvironment(_env: { [key: string]: string | null }): Promise<void> {
		throw new Error('Not supported');
	}
}

// todo@joh this is a copy of `dom.ts#asDomUri`
function asDomUri(uri: URI): URI {
	if (Schemas.vscodeRemote === uri.scheme) {
		// rewrite vscode-remote-uris to uris of the window location
		// so that they can be intercepted by the service worker
		return URI.parse(window.location.href).with({ path: '/vscode-remote', query: JSON.stringify(uri) });
	}
	return uri;
}

function ensureSuffix(path: string, suffix: string): string {
	return endsWith(path, suffix) ? path : path + suffix;
}
