/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { McpGalleryManifestService } from '../../../../platform/mcp/common/mcpGalleryManifestService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Emitter } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { getConfiguredCustomMcpGalleryUrl, isProductMcpGalleryEnabled, mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig } from '../../../../platform/mcp/common/mcpManagement.js';

export class WorkbenchMcpGalleryManifestService extends McpGalleryManifestService implements IMcpGalleryManifestService {

	private mcpGalleryManifest: IMcpGalleryManifest | null = null;
	private manifestUpdateCounter = 0;

	private _onDidChangeMcpGalleryManifest = this._register(new Emitter<IMcpGalleryManifest | null>());
	override readonly onDidChangeMcpGalleryManifest = this._onDidChangeMcpGalleryManifest.event;

	private currentStatus: McpGalleryManifestStatus = McpGalleryManifestStatus.Unavailable;
	override get mcpGalleryManifestStatus(): McpGalleryManifestStatus { return this.currentStatus; }
	private _onDidChangeMcpGalleryManifestStatus = this._register(new Emitter<McpGalleryManifestStatus>());
	override readonly onDidChangeMcpGalleryManifestStatus = this._onDidChangeMcpGalleryManifestStatus.event;

	constructor(
		@IProductService private readonly workbenchProductService: IProductService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(workbenchProductService, requestService, logService);
		const remoteConnection = remoteAgentService.getConnection();
		if (remoteConnection) {
			const channel = remoteConnection.getChannel('mcpGalleryManifest');
			this.getMcpGalleryManifest().then(manifest => {
				channel.call('setMcpGalleryManifest', [manifest]);
				this._register(this.onDidChangeMcpGalleryManifest(manifest => channel.call('setMcpGalleryManifest', [manifest])));
			});
		}
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
			if (e.affectsConfiguration(mcpGalleryServiceEnablementConfig)
				|| e.affectsConfiguration(mcpGalleryServiceUrlConfig)
				|| e.affectsConfiguration('chat.mcp.gallery.version')) {
				void this.getAndUpdateMcpGalleryManifest();
			}
		}));
	}

	private async getAndUpdateMcpGalleryManifest(): Promise<void> {
		const updateCounter = ++this.manifestUpdateCounter;
		const customMcpGalleryServiceUrl = getConfiguredCustomMcpGalleryUrl(this.configurationService, this.workbenchProductService);
		let manifest: IMcpGalleryManifest | null;
		if (customMcpGalleryServiceUrl) {
			const customMcpGalleryServiceVersion = this.configurationService.getValue<string>('chat.mcp.gallery.version');
			manifest = await this.createMcpGalleryManifest(customMcpGalleryServiceUrl, customMcpGalleryServiceVersion);
		} else if (isProductMcpGalleryEnabled(this.configurationService, this.workbenchProductService)) {
			manifest = await super.getMcpGalleryManifest();
		} else {
			manifest = null;
		}
		if (updateCounter === this.manifestUpdateCounter) {
			this.update(manifest);
		}
	}

	private update(manifest: IMcpGalleryManifest | null): void {
		if (this.mcpGalleryManifest?.url === manifest?.url && this.mcpGalleryManifest?.version === manifest?.version) {
			return;
		}

		this.mcpGalleryManifest = manifest;
		if (this.mcpGalleryManifest) {
			this.logService.trace('MCP Registry configured:', this.mcpGalleryManifest.url);
		} else {
			this.logService.trace('No MCP Registry configured');
		}
		this.currentStatus = this.mcpGalleryManifest ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
		this._onDidChangeMcpGalleryManifest.fire(this.mcpGalleryManifest);
		this._onDidChangeMcpGalleryManifestStatus.fire(this.currentStatus);
	}

}
