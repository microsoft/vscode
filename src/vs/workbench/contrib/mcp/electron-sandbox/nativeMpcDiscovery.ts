/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeMcpDiscoveryData, NativeMcpDiscoveryHelperChannelName } from '../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { Dto } from '../../../services/extensions/common/proxyIdentifier.js';
import { FilesystemMpcDiscovery } from '../common/discovery/nativeMcpDiscoveryAbstract.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';

export class NativeMcpDiscovery extends FilesystemMpcDiscovery {
	constructor(
		@IMainProcessService private readonly mainProcess: IMainProcessService,
		@ILogService private readonly logService: ILogService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMcpRegistry mcpRegistry: IMcpRegistry,
	) {
		super(null, labelService, fileService, instantiationService, mcpRegistry);
	}

	public override start(): void {
		this.mainProcess.getChannel(NativeMcpDiscoveryHelperChannelName)
			.call<Dto<INativeMcpDiscoveryData>>('load', undefined)
			.then(
				data => this.setDetails(data),
				err => {
					this.logService.warn('Error getting main process MCP environment', err);
					this.setDetails(undefined);
				}
			);
	}
}
