/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IChannelServer } from '../../../base/parts/ipc/common/ipc.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus } from './mcpGalleryManifest.js';

export class McpGalleryManifestIPCService extends Disposable implements IMcpGalleryManifestService {

	declare readonly _serviceBrand: undefined;

	private _onDidChangeMcpGalleryManifest = this._register(new Emitter<IMcpGalleryManifest | null>());
	readonly onDidChangeMcpGalleryManifest = this._onDidChangeMcpGalleryManifest.event;

	private _onDidChangeMcpGalleryManifestStatus = this._register(new Emitter<McpGalleryManifestStatus>());
	readonly onDidChangeMcpGalleryManifestStatus = this._onDidChangeMcpGalleryManifestStatus.event;

	private _mcpGalleryManifest: IMcpGalleryManifest | null | undefined;
	private readonly barrier = new Barrier();

	get mcpGalleryManifestStatus(): McpGalleryManifestStatus {
		return this._mcpGalleryManifest ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
	}

	constructor(server: IChannelServer<unknown>) {
		super();
		server.registerChannel('mcpGalleryManifest', {
			listen: () => Event.None,
			call: async <T>(context: unknown, command: string, args?: unknown): Promise<T> => {
				switch (command) {
					case 'setMcpGalleryManifest': {
						const manifest = Array.isArray(args) ? args[0] as IMcpGalleryManifest | null : null;
						return Promise.resolve(this.setMcpGalleryManifest(manifest)) as T;
					}
				}
				throw new Error('Invalid call');
			}
		});
	}

	async getMcpGalleryManifest(): Promise<IMcpGalleryManifest | null> {
		await this.barrier.wait();
		return this._mcpGalleryManifest ?? null;
	}

	private setMcpGalleryManifest(manifest: IMcpGalleryManifest | null): void {
		this._mcpGalleryManifest = manifest;
		this._onDidChangeMcpGalleryManifest.fire(manifest);
		this._onDidChangeMcpGalleryManifestStatus.fire(this.mcpGalleryManifestStatus);
		this.barrier.open();
	}

}
