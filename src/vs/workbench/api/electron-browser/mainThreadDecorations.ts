/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI, { UriComponents } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ExtHostContext, MainContext, IExtHostContext, MainThreadDecorationsShape, ExtHostDecorationsShape, DecorationData, DecorationRequest } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IDecorationsService, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';

class DecorationRequestsQueue {

	private _idPool = 0;
	private _requests: DecorationRequest[] = [];
	private _resolver: { [id: number]: Function } = Object.create(null);

	private _timer: number;

	constructor(
		private _proxy: ExtHostDecorationsShape
	) {
		//
	}

	enqueue(handle: number, uri: URI): Thenable<DecorationData> {
		return new Promise((resolve, reject) => {
			const id = ++this._idPool;
			this._requests.push({ id, handle, uri });
			this._resolver[id] = resolve;
			this._processQueue();
		});
	}

	private _processQueue(): void {
		if (typeof this._timer === 'number') {
			// already queued
			return;
		}
		this._timer = setTimeout(() => {
			// make request
			const requests = this._requests;
			const resolver = this._resolver;
			this._proxy.$provideDecorations(requests).then(data => {
				for (const id in resolver) {
					resolver[id](data[id]);
				}
			});

			// reset
			this._requests = [];
			this._resolver = [];
			this._timer = void 0;
		}, 0);
	}
}

@extHostNamedCustomer(MainContext.MainThreadDecorations)
export class MainThreadDecorations implements MainThreadDecorationsShape {

	private readonly _provider = new Map<number, [Emitter<URI[]>, IDisposable]>();
	private readonly _proxy: ExtHostDecorationsShape;
	private readonly _requestQueue: DecorationRequestsQueue;

	constructor(
		context: IExtHostContext,
		@IDecorationsService private readonly _decorationsService: IDecorationsService
	) {
		this._proxy = context.getProxy(ExtHostContext.ExtHostDecorations);
		this._requestQueue = new DecorationRequestsQueue(this._proxy);
	}

	dispose() {
		this._provider.forEach(value => dispose(value));
		this._provider.clear();
	}

	$registerDecorationProvider(handle: number, label: string): void {
		const emitter = new Emitter<URI[]>();
		const registration = this._decorationsService.registerDecorationsProvider({
			label,
			onDidChange: emitter.event,
			provideDecorations: (uri) => {
				return this._requestQueue.enqueue(handle, uri).then(data => {
					if (!data) {
						return undefined;
					}
					const [weight, bubble, tooltip, letter, themeColor, source] = data;
					return <IDecorationData>{
						weight: weight || 0,
						bubble: bubble || false,
						color: themeColor && themeColor.id,
						tooltip,
						letter,
						source,
					};
				});
			}
		});
		this._provider.set(handle, [emitter, registration]);
	}

	$onDidChange(handle: number, resources: UriComponents[]): void {
		const [emitter] = this._provider.get(handle);
		emitter.fire(resources && resources.map(URI.revive));
	}

	$unregisterDecorationProvider(handle: number): void {
		if (this._provider.has(handle)) {
			dispose(this._provider.get(handle));
			this._provider.delete(handle);
		}
	}
}
