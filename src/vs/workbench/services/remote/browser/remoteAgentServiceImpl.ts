/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteAgentConnection } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { AbstractRemoteAgentService } from 'vs/workbench/services/remote/common/abstractRemoteAgentService';
import { IProductService } from 'vs/platform/product/common/product';

export class RemoteAgentService extends AbstractRemoteAgentService {

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IProductService productService: IProductService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService
	) {
		super(environmentService);
	}

	getConnection(): IRemoteAgentConnection | null {
		return null;
	}
}
