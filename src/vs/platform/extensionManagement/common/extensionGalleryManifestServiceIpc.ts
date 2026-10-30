/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { equals } from '../../../base/common/objects.js';
import { IChannel, IChannelServer, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IExtensionGalleryManifest, IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from './extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from './extensionGalleryManifestService.js';

export class ExtensionGalleryAuthorizationChannel implements IServerChannel<unknown> {

	static readonly ChannelName = 'extensionGalleryAuthorization';

	constructor(private readonly service: IExtensionGalleryManifestService) { }

	listen<T>(): Event<T> {
		return Event.None;
	}

	async call<T>(_context: unknown, command: string, args?: { targetUrl?: unknown; accessToken?: unknown }): Promise<T> {
		if (command !== 'refreshAccessToken' || typeof args?.targetUrl !== 'string' || typeof args.accessToken !== 'string') {
			throw new Error('Invalid marketplace authorization request');
		}
		return await this.service.refreshAccessToken(args.targetUrl, args.accessToken) as T;
	}
}

export class ExtensionGalleryManifestIPCService<TContext> extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	declare readonly _serviceBrand: undefined;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

	private _extensionGalleryManifest: IExtensionGalleryManifest | null | undefined;
	private readonly barrier = new Barrier();
	private getAuthorizationChannel: (() => IChannel | undefined) | undefined;

	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus {
		return this._extensionGalleryManifest ? ExtensionGalleryManifestStatus.Available : ExtensionGalleryManifestStatus.Unavailable;
	}

	constructor(
		server: IChannelServer<TContext>,
		getClientChannel: (context: TContext) => IChannel | undefined,
		@ILogService private readonly logService: ILogService,
		@IProductService productService: IProductService,
	) {
		super(productService);
		server.registerChannel('extensionGalleryManifest', {
			listen: () => Event.None,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			call: async (context: TContext, command: string, args?: any): Promise<any> => {
				switch (command) {
					case 'setExtensionGalleryManifest':
						this.getAuthorizationChannel = () => getClientChannel(context);
						return Promise.resolve(this.setExtensionGalleryManifest(args[0], args[1], args[2]));
				}
				throw new Error('Invalid call');
			}
		});
	}

	override async getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		await this.barrier.wait();
		return this._extensionGalleryManifest ?? null;
	}

	private setExtensionGalleryManifest(manifest: IExtensionGalleryManifest | null, accessToken: string | undefined, serviceIndexUrl: string | undefined): void {
		this.logService.trace(`[Marketplace] Setting manifest ${manifest ? 'available' : 'unavailable'}`);
		const previousStatus = this.extensionGalleryManifestStatus;
		const initializing = this._extensionGalleryManifest === undefined;
		const manifestChanged = !equals(this._extensionGalleryManifest, manifest);
		this.setAuthorization(manifest ? accessToken : undefined, manifest ? serviceIndexUrl : undefined);
		this._extensionGalleryManifest = manifest;
		if (manifestChanged) {
			this._onDidChangeExtensionGalleryManifest.fire(manifest);
		}
		if (initializing || previousStatus !== this.extensionGalleryManifestStatus) {
			this._onDidChangeExtensionGalleryManifestStatus.fire(this.extensionGalleryManifestStatus);
		}
		this.barrier.open();
	}

	override async refreshAccessToken(targetUrl: string, rejectedAccessToken: string): Promise<boolean> {
		if (!await this.getAccessToken(targetUrl)) {
			return false;
		}
		const channel = this.getAuthorizationChannel?.();
		if (!channel) {
			this.logService.warn('[Marketplace] The authorization owner is no longer connected');
			return false;
		}
		try {
			return await channel.call<boolean>('refreshAccessToken', { targetUrl, accessToken: rejectedAccessToken });
		} catch (error) {
			this.logService.error('[Marketplace] Unable to refresh marketplace authorization', error);
			return false;
		}
	}
}
