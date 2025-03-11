/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeMcpDiscoveryData, NativeMcpDiscoveryHelperChannelName } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IMcpRegistry } from '../mcpRegistryTypes.js';
import { FilesystemMpcDiscovery } from './nativeMcpDiscoveryAbstract.js';

/**
 * Discovers MCP servers on the remote filesystem, if any.
 */
export class RemoteNativeMpcDiscovery extends FilesystemMpcDiscovery {
	constructor(
		@IRemoteAgentService private readonly remoteAgent: IRemoteAgentService,
		@ILogService private readonly logService: ILogService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpRegistry mcpRegistry: IMcpRegistry,
	) {
		super(remoteAgent.getConnection()?.remoteAuthority || null, labelService, fileService, instantiationService, mcpRegistry);
	}

	public override async start() {
		const connection = this.remoteAgent.getConnection();
		if (!connection) {
			return this.setDetails(undefined);
		}

		connection.withChannel(NativeMcpDiscoveryHelperChannelName, channel =>
			channel.call<Dto<INativeMcpDiscoveryData>>('load', undefined))

			.then(
				data => this.setDetails(data),
				err => {
					this.logService.warn('Error getting remote process MCP environment', err);
					this.setDetails(undefined);
				}
			);
	}
}
