/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { EditorWorkerClient } from '../../browser/services/editorWorkerService.js';
import { IModelService } from '../../common/services/model.js';

/**
 * Create a new web worker that has model syncing capabilities built in.
 * Specify an AMD module to load that will `create` an object that will be proxied.
 */
export function createWebWorker<T extends object>(modelService: IModelService, opts: IInternalWebWorkerOptions): MonacoWebWorker<T> {
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
	getProxy(): Promise<T>;
	/**
	 * Synchronize (send) the models at `resources` to the web worker,
	 * making them available in the monaco.worker.getMirrorModels().
	 */
	withSyncedResources(resources: URI[]): Promise<T>;
}

export interface IInternalWebWorkerOptions {
	/**
	 * The worker.
	 */
	worker: Worker;
	/**
	 * An object that can be used by the web worker to make calls back to the main thread.
	 */
	host?: any;
	/**
	 * Keep idle models.
	 * Defaults to false, which means that idle models will stop syncing after a while.
	 */
	keepIdleModels?: boolean;
}

class MonacoWebWorkerImpl<T extends object> extends EditorWorkerClient implements MonacoWebWorker<T> {

	private readonly _foreignModuleHost: { [method: string]: Function } | null;
	private _foreignProxy: Promise<T>;

	constructor(modelService: IModelService, opts: IInternalWebWorkerOptions) {
		super(opts.worker, opts.keepIdleModels || false, modelService);
		this._foreignModuleHost = opts.host || null;
		this._foreignProxy = this._getProxy().then(proxy => {
			return new Proxy({}, {
				get(target, prop, receiver) {
					if (typeof prop !== 'string') {
						throw new Error(`Not supported`);
					}
					return (...args: any[]) => {
						return proxy.$fmr(prop, args);
					};
				}
			}) as T;
		});
	}

	// foreign host request
	public override fhr(method: string, args: any[]): Promise<any> {
		if (!this._foreignModuleHost || typeof this._foreignModuleHost[method] !== 'function') {
			return Promise.reject(new Error('Missing method ' + method + ' or missing main thread foreign host.'));
		}

		try {
			return Promise.resolve(this._foreignModuleHost[method].apply(this._foreignModuleHost, args));
		} catch (e) {
			return Promise.reject(e);
		}
	}

	public getProxy(): Promise<T> {
		return this._foreignProxy;
	}

	public withSyncedResources(resources: URI[]): Promise<T> {
		return this.workerWithSyncedResources(resources).then(_ => this.getProxy());
	}
}
