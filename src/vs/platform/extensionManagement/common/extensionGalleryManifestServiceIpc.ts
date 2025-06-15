/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IPCServer } from '../../../base/parts/ipc/common/ipc.js';
import { IProductService } from '../../product/common/productService.js';
import { IExtensionGalleryManifest, IExtensionGalleryManifestService } from './extensionGalleryManifest.js';
import { ExtensionGalleryManifestService } from './extensionGalleryManifestService.js';

export class ExtensionGalleryManifestIPCService extends ExtensionGalleryManifestService implements IExtensionGalleryManifestService {

	declare readonly _serviceBrand: undefined;

	private _onDidChangeExtensionGalleryManifest = this._register(new Emitter<IExtensionGalleryManifest | null>());
	override readonly onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;

	private extensionGalleryManifest: IExtensionGalleryManifest | null | undefined;
	private readonly barrier = new Barrier();

	constructor(
		server: IPCServer<any>,
		@IProductService productService: IProductService
	) {
		super(productService);
		server.registerChannel('extensionGalleryManifest', {
			listen: () => Event.None,
			call: async (context: any, command: string, args?: any): Promise<any> => {
				switch (command) {
					case 'setExtensionGalleryManifest': return Promise.resolve(this.setExtensionGalleryManifest(args[0]));
				}
				throw new Error('Invalid call');
			}
		});
	}

	override async getExtensionGalleryManifest(): Promise<IExtensionGalleryManifest | null> {
		await this.barrier.wait();
		return this.extensionGalleryManifest ?? null;
	}

	private setExtensionGalleryManifest(manifest: IExtensionGalleryManifest | null): void {
		this.extensionGalleryManifest = manifest;
		this._onDidChangeExtensionGalleryManifest.fire(manifest);
		this.barrier.open();
	}

}
