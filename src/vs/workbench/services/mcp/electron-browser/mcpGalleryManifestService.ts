/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IMcpGalleryManifestService } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { WorkbenchMcpGalleryManifestService } from '../browser/mcpGalleryManifestService.js';

export class McpGalleryManifestService extends WorkbenchMcpGalleryManifestService implements IMcpGalleryManifestService {

	constructor(
		@IProductService productService: IProductService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(productService, remoteAgentService, requestService, logService, configurationService);

		const channel = sharedProcessService.getChannel('mcpGalleryManifest');
		this.getMcpGalleryManifest().then(manifest => {
			channel.call('setMcpGalleryManifest', [manifest]);
			this._register(this.onDidChangeMcpGalleryManifest(manifest => channel.call('setMcpGalleryManifest', [manifest])));
		});
	}

}

registerSingleton(IMcpGalleryManifestService, McpGalleryManifestService, InstantiationType.Eager);
