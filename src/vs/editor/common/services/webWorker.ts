/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ShallowCancelThenPromise } from 'vs/base/common/async';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditorWorkerClient } from 'vs/editor/common/services/editorWorkerServiceImpl';

/**
 * Create a new web worker that has model syncing capabilities built in.
 * Specify an AMD module to load that will `create` an object that will be proxied.
 */
export function createWebWorker<T>(modelService: IModelService, opts: IWebWorkerOptions): MonacoWebWorker<T> {
	return new MonacoWebWorkerImpl<T>(modelService, opts);
}

/**
 * A web worker that can provide a proxy to an arbitrary file.
 */
export interface MonacoWebWorker<T> {
	/**
	 * Terminate the web worker, thus invalidating the returned proxy.
	 */
	dispose(): void;
	/**
	 * Get a proxy to the arbitrary loaded code.
	 */
	getProxy(): TPromise<T>;
	/**
	 * Synchronize (send) the models at `resources` to the web worker,
	 * making them available in the monaco.worker.getMirrorModels().
	 */
	withSyncedResources(resources: URI[]): TPromise<T>;
}

export interface IWebWorkerOptions {
	/**
	 * The AMD moduleId to load.
	 * It should export a function `create` that should return the exported proxy.
	 */
	moduleId: string;
	/**
	 * The data to send over when calling create on the module.
	 */
	createData?: any;
	/**
	 * A label to be used to identify the web worker for debugging purposes.
	 */
	label?: string;
}

class MonacoWebWorkerImpl<T> extends EditorWorkerClient implements MonacoWebWorker<T> {

	private _foreignModuleId: string;
	private _foreignModuleCreateData: any;
	private _foreignProxy: TPromise<T>;

	constructor(modelService: IModelService, opts: IWebWorkerOptions) {
		super(modelService, opts.label);
		this._foreignModuleId = opts.moduleId;
		this._foreignModuleCreateData = opts.createData || null;
		this._foreignProxy = null;
	}

	private _getForeignProxy(): TPromise<T> {
		if (!this._foreignProxy) {
			this._foreignProxy = new ShallowCancelThenPromise(this._getProxy().then((proxy) => {
				return proxy.loadForeignModule(this._foreignModuleId, this._foreignModuleCreateData).then((foreignMethods) => {
					this._foreignModuleId = null;
					this._foreignModuleCreateData = null;

					let proxyMethodRequest = (method: string, args: any[]): TPromise<any> => {
						return proxy.fmr(method, args);
					};

					let createProxyMethod = (method: string, proxyMethodRequest: (method: string, args: any[]) => TPromise<any>): Function => {
						return function () {
							let args = Array.prototype.slice.call(arguments, 0);
							return proxyMethodRequest(method, args);
						};
					};

					let foreignProxy = <T><any>{};
					for (let i = 0; i < foreignMethods.length; i++) {
						foreignProxy[foreignMethods[i]] = createProxyMethod(foreignMethods[i], proxyMethodRequest);
					}

					return foreignProxy;
				});
			}));
		}
		return this._foreignProxy;
	}

	public getProxy(): TPromise<T> {
		return this._getForeignProxy();
	}

	public withSyncedResources(resources: URI[]): TPromise<T> {
		return this._withSyncedResources(resources).then(_ => this.getProxy());
	}
}
