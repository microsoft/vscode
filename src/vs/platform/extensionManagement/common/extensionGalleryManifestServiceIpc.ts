/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IChannelServer } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IExtensionGalleryManifest, IExtensionGalleryManifestService, ExtensionGalleryManifestStatus } from './extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from './extensionGalleryManifestService.js';

export class ExtensionGalleryManifestIPCService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	declare readonly _serviceBrand: undefined;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private _onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter<ExtensionGalleryManifestStatus>());
	override readonly onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;

	private _extensionGalleryManifest: IExtensionGalleryManifest | null | undefined;
	private readonly barrier = new Barrier();

	override get extensionGalleryManifestStatus(): ExtensionGalleryManifestStatus {
		return this._extensionGalleryManifest ? ExtensionGalleryManifestStatus.Available : ExtensionGalleryManifestStatus.Unavailable;
	}

	constructor(
		server: IChannelServer<unknown>,
		@ILogService private readonly logService: ILogService,
		@IProductService productService: IProductService,
	) {
		super(productService);
		server.registerChannel('extensionGalleryManifest', {
			listen: () => Event.None,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			call: async (context: any, command: string, args?: any): Promise<any> => {
				switch (command) {
					case 'setExtensionGalleryManifest': return Promise.resolve(this.setExtensionGalleryManifest(args[0], args[1], args[2]));
				}
				throw new Error('Invalid call');
			}
		});
	}

	override async getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		await this.barrier.wait();
		return this._extensionGalleryManifest ?? null;
	}

	override async getAuthorizationHeaders(targetUrl: string): Promise<Record<string, string>> {
		await this.barrier.wait();
		return super.getAuthorizationHeaders(targetUrl);
	}

	private setExtensionGalleryManifest(manifest: IExtensionGalleryManifest | null, accessToken?: string, serviceIndexUrl?: string): void {
		this.logService.trace(`[Marketplace] Setting manifest ${manifest ? 'available' : 'unavailable'}`);
		this._extensionGalleryManifest = manifest;
		// This process never negotiates a token itself; it applies the one the window negotiated to
		// the marketplace requests it initiates — extension `getManifest`, VSIX download.
		this.marketplaceAccessToken = accessToken;
		this.marketplaceServiceIndexUrl = serviceIndexUrl;
		this._onDidChangeExtensionGalleryManifest.fire(manifest);
		this._onDidChangeExtensionGalleryManifestStatus.fire(this.extensionGalleryManifestStatus);
		this.barrier.open();
	}

}
