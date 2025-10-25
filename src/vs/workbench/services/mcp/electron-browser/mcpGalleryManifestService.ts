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
import { IMcpGalleryConfig, mcpGalleryServiceUrlConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../platform/request/common/request.js';

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
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(productService, requestService, logService);

		const channels = [sharedProcessService.getChannel('mcpGalleryManifest')];
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			channels.push(remoteConnection.getChannel('mcpGalleryManifest'));
		}
		this.getMcpGalleryManifest().then(manifest => {
			channels.forEach(channel => channel.call('setMcpGalleryManifest', [manifest]));
		});
	}

	private initPromise: Promise<void> | undefined;
	override async getMcpGalleryManifest(): Promise<IMcpGalleryManifest | null> {
		if (!this.initPromise) {
			this.initPromise = this.doGetMcpGalleryManifest();
		}
		await this.initPromise;
		return this.mcpGalleryManifest;
	}

	private async doGetMcpGalleryManifest(): Promise<void> {
		await this.getAndUpdateMcpGalleryManifest();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(mcpGalleryServiceUrlConfig) || e.affectsConfiguration('chat.mcp.gallery.version')) {
				this.getAndUpdateMcpGalleryManifest();
			}
		}));
	}

	private async getAndUpdateMcpGalleryManifest(): Promise<void> {
		const mcpGalleryConfig = this.configurationService.getValue<IMcpGalleryConfig | undefined>('chat.mcp.gallery');
		if (mcpGalleryConfig?.serviceUrl) {
			this.update(await this.createMcpGalleryManifest(mcpGalleryConfig.serviceUrl, mcpGalleryConfig.version));
		} else {
			this.update(await super.getMcpGalleryManifest());
		}
	}

	private update(manifest: IMcpGalleryManifest | null): void {
		if (this.mcpGalleryManifest?.url === manifest?.url && this.mcpGalleryManifest?.version === manifest?.version) {
			return;
		}

		this.mcpGalleryManifest = manifest;
		if (this.mcpGalleryManifest) {
			this.logService.info('MCP Registry configured:', this.mcpGalleryManifest.url);
		} else {
			this.logService.info('No MCP Registry configured');
		}
		this.currentStatus = this.mcpGalleryManifest ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
		this._onDidChangeMcpGalleryManifest.fire(this.mcpGalleryManifest);
		this._onDidChangeMcpGalleryManifestStatus.fire(this.currentStatus);
	}

}

registerSingleton(IMcpGalleryManifestService, WorkbenchMcpGalleryManifestService, InstantiationType.Eager);
