/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMcpGalleryManifestService, IMcpGalleryManifest, McpGalleryManifestStatus } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { McpGalleryManifestService as McpGalleryManifestService } from '../../../../platform/mcp/common/mcpGalleryManifestService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { mcpGalleryServiceUrlConfig } from '../../../../platform/mcp/common/mcpManagement.js';

export class WorkbenchMcpGalleryManifestService extends McpGalleryManifestService implements IMcpGalleryManifestService {

	private mcpGalleryManifest: IMcpGalleryManifest | null = null;

	private _onDidChangeMcpGalleryManifest = this._register(new Emitter<IMcpGalleryManifest | null>());
	override readonly onDidChangeMcpGalleryManifest = this._onDidChangeMcpGalleryManifest.event;

	private currentStatus: McpGalleryManifestStatus = McpGalleryManifestStatus.Unavailable;
	override get mcpGalleryManifestStatus(): McpGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeMcpGalleryManifestStatus = this._register(new Emitter<McpGalleryManifestStatus>());
	override readonly onDidChangeMcpGalleryManifestStatus = this._onDidChangeMcpGalleryManifestStatus.event;

	constructor(
		@IProductService productService: IProductService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(productService);

		const channels = [sharedProcessService.getChannel('mcpGalleryManifest')];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push(remoteConnection.getChannel('mcpGalleryManifest'));
		}
		this.getMcpGalleryManifest().then(manifest => {
			channels.forEach(channel => channel.call('setMcpGalleryManifest', [manifest]));
		});
	}

	private mcpGalleryManifestPromise: Promise<void> | undefined;
	override async getMcpGalleryManifest(): Promise<IMcpGalleryManifest | null> {
		if (!this.mcpGalleryManifestPromise) {
			this.mcpGalleryManifestPromise = this.doGetMcpGalleryManifest();
		}
		await this.mcpGalleryManifestPromise;
		return this.mcpGalleryManifest;
	}

	private async doGetMcpGalleryManifest(): Promise<void> {
		if (this.productService.quality === 'stable') {
			return;
		}
		const configuredServiceUrl = this.configurationService.getValue<string>(mcpGalleryServiceUrlConfig);
		if (configuredServiceUrl) {
			this.update(this.createMcpGalleryManifest(configuredServiceUrl));
		} else {
			this.update(await super.getMcpGalleryManifest());
		}
	}

	private update(manifest: IMcpGalleryManifest | null): void {
		this.mcpGalleryManifest = manifest;
		this.currentStatus = manifest ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
		this._onDidChangeMcpGalleryManifest.fire(manifest);
		this._onDidChangeMcpGalleryManifestStatus.fire(this.currentStatus);
	}

}

registerSingleton(IMcpGalleryManifestService, WorkbenchMcpGalleryManifestService, InstantiationType.Eager);
