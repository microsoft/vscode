/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ExtHostContext, MainContext, IExtHostContext, MainThreadDecorationsShape, ExtHostDecorationsShape, DecorationData, DecorationRequest } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IDecorationsService, IDecorationData } from 'vs/workbench/services/decorations/browser/decorations';
import { values } from 'vs/base/common/collections';
import { CancellationToken } from 'vs/base/common/cancellation';

class DecorationRequestsQueue {

	private _idPool = 0;
	private _requests: { [id: number]: DecorationRequest } = Object.create(null);
	private _resolver: { [id: number]: (data: DecorationData) => any } = Object.create(null);

	private _timer: any;

	constructor(
		private readonly _proxy: ExtHostDecorationsShape
	) {
		//
	}

	enqueue(handle: number, uri: URI, token: CancellationToken): Promise<DecorationData> {
		const id = ++this._idPool;
		const result = new Promise<DecorationData>(resolve => {
			this._requests[id] = { id, handle, uri };
			this._resolver[id] = resolve;
			this._processQueue();
		});
		token.onCancellationRequested(() => {
			delete this._requests[id];
			delete this._resolver[id];
		});
		return result;
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
			this._proxy.$provideDecorations(values(requests), CancellationToken.None).then(data => {
				for (const id in resolver) {
					resolver[id](data[id]);
				}
			});

			// reset
			this._requests = [];
			this._resolver = [];
			this._timer = undefined;
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
			provideDecorations: (uri, token) => {
				return this._requestQueue.enqueue(handle, uri, token).then(data => {
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
		const provider = this._provider.get(handle);
		if (provider) {
			const [emitter] = provider;
			emitter.fire(resources && resources.map(r => URI.revive(r)));
		}
	}

	$unregisterDecorationProvider(handle: number): void {
		const provider = this._provider.get(handle);
		if (provider) {
			dispose(provider);
			this._provider.delete(handle);
		}
	}
}
