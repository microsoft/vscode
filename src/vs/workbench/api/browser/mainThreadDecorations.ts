/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from '../../../base/common/uri.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ExtHostContext, MainContext, MainThreadDecorationsShape, ExtHostDecorationsShape, DecorationData, DecorationRequest } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { IDecorationsService, IDecorationData } from '../../services/decorations/common/decorations.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';

class DecorationRequestsQueue extends Disposable {

	private readonly _cancellation = this._register(new CancellationTokenSource());

	private _idPool = 0;
	private _requests = new Map<number, DecorationRequest>();
	private readonly _resolver = new Map<number, DeferredPromise<DecorationData>>();

	private _isScheduled = false;

	constructor(
		private readonly _proxy: ExtHostDecorationsShape,
		private readonly _handle: number
	) {
		super();
	}

	override dispose(): void {
		this._cancellation.cancel();
		for (const defer of this._resolver.values()) {
			defer.error(new CancellationError());
		}
		this._resolver.clear();
		this._requests.clear();
		super.dispose();
	}

	async enqueue(uri: URI, token: CancellationToken): Promise<DecorationData> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const id = ++this._idPool;

		const defer = new DeferredPromise<DecorationData>();
		this._requests.set(id, { id, uri });
		this._resolver.set(id, defer);
		void this._processQueue();

		const sub = token.onCancellationRequested(() => {
			this._requests.delete(id);
			this._resolver.delete(id);
			defer.error(new CancellationError());
		});
		try {
			return await defer.p;
		} finally {
			sub.dispose();
		}
	}

	private async _processQueue(): Promise<void> {
		if (this._isScheduled) {
			// already queued
			return;
		}
		this._isScheduled = true;
		try {
			await timeout(0, this._cancellation.token);
		} catch {
			return;
		} finally {
			this._isScheduled = false;
		}

		const requests = this._requests;
		this._requests = new Map();
		try {
			const data = await this._proxy.$provideDecorations(this._handle, [...requests.values()], this._cancellation.token);
			for (const id of requests.keys()) {
				this._resolver.get(id)?.complete(data[id]);
				this._resolver.delete(id);
			}
		} catch (err) {
			for (const id of requests.keys()) {
				this._resolver.get(id)?.error(err);
				this._resolver.delete(id);
			}
		}
	}
}

class MainThreadDecorationsEntry extends Disposable {

	readonly emitter = this._register(new Emitter<URI[]>());
	readonly queue: DecorationRequestsQueue;

	constructor(
		proxy: ExtHostDecorationsShape,
		handle: number,
		label: string,
		decorationsService: IDecorationsService
	) {
		super();
		this.queue = this._register(new DecorationRequestsQueue(proxy, handle));
		this._register(decorationsService.registerDecorationsProvider({
			label,
			onDidChange: this.emitter.event,
			provideDecorations: async (uri, token): Promise<IDecorationData | undefined> => {
				const data = await this.queue.enqueue(uri, token);
				if (!data) {
					return undefined;
				}
				const [bubble, tooltip, letter, themeColor] = data;
				return {
					weight: 10,
					bubble: bubble ?? false,
					color: themeColor?.id,
					tooltip,
					letter
				};
			}
		}));
	}
}

@extHostNamedCustomer(MainContext.MainThreadDecorations)
export class MainThreadDecorations extends Disposable implements MainThreadDecorationsShape {

	private readonly _provider = this._register(new DisposableMap<number, MainThreadDecorationsEntry>());
	private readonly _proxy: ExtHostDecorationsShape;

	constructor(
		context: IExtHostContext,
		@IDecorationsService private readonly _decorationsService: IDecorationsService
	) {
		super();
		this._proxy = context.getProxy(ExtHostContext.ExtHostDecorations);
	}

	$registerDecorationProvider(handle: number, label: string): void {
		this._provider.set(handle, new MainThreadDecorationsEntry(this._proxy, handle, label, this._decorationsService));
	}

	$onDidChange(handle: number, resources: UriComponents[]): void {
		const provider = this._provider.get(handle);
		if (provider) {
			provider.emitter.fire(resources && resources.map(r => URI.revive(r)));
		}
	}

	$unregisterDecorationProvider(handle: number): void {
		this._provider.deleteAndDispose(handle);
	}
}
