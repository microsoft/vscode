/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from '../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { NativeFilesystemMcpDiscovery } from '../common/discovery/nativeMcpDiscoveryAbstract.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';

export class NativeMcpDiscovery extends NativeFilesystemMcpDiscovery {
	constructor(
		@IMainProcessService private readonly mainProcess: IMainProcessService,
		@ILogService private readonly logService: ILogService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpRegistry mcpRegistry: IMcpRegistry,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(null, labelService, fileService, instantiationService, mcpRegistry, configurationService);
	}

	public override start(): void {
		const service = ProxyChannel.toService<INativeMcpDiscoveryHelperService>(
			this.mainProcess.getChannel(NativeMcpDiscoveryHelperChannelName));

		service.load().then(
			data => this.setDetails(data),
			err => {
				this.logService.warn('Error getting main process MCP environment', err);
				this.setDetails(undefined);
			}
		);
	}
}
