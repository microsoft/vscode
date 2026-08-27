/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { NativeFilesystemMcpDiscovery } from './nativeMcpDiscoveryAbstract.js';

/**
 * Discovers MCP servers on the remote filesystem, if any.
 */
export class RemoteNativeMpcDiscovery extends NativeFilesystemMcpDiscovery {
	constructor(
		@IRemoteAgentService private readonly remoteAgent: IRemoteAgentService,
		@ILogService private readonly logService: ILogService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpRegistry mcpRegistry: IMcpRegistry,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(remoteAgent.getConnection()?.remoteAuthority || null, labelService, fileService, instantiationService, mcpRegistry, configurationService);
	}

	public override async start() {
		const connection = this.remoteAgent.getConnection();
		if (!connection) {
			return this.setDetails(undefined);
		}

		try {
			await connection.withChannel(NativeMcpDiscoveryHelperChannelName, async channel => {
				const service = ProxyChannel.toService<INativeMcpDiscoveryHelperService>(channel);
				try {
					this.setDetails(await service.load());
				} catch (error) {
					this.logService.warn('Error getting remote process MCP environment', error);
					this.setDetails(undefined);
				}
			});
		} catch (error) {
			this.logService.warn('Error connecting to remote process MCP environment', error);
			this.setDetails(undefined);
		}
	}
}
