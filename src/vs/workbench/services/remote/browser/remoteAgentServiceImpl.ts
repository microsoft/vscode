/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IRemoteAgentConnection } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { AbstractRemoteAgentService, RemoteAgentConnection } from 'vs/workbench/services/remote/common/abstractRemoteAgentService';
import { IProductService } from 'vs/platform/product/common/product';
import { browserWebSocketFactory } from 'vs/platform/remote/browser/browserWebSocketFactory';
import { ISignService } from 'vs/platform/sign/common/sign';

export class RemoteAgentService extends AbstractRemoteAgentService {

	private readonly _connection: IRemoteAgentConnection | null = null;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ISignService signService: ISignService
	) {
		super(environmentService);

		this._connection = this._register(new RemoteAgentConnection(environmentService.configuration.remoteAuthority!, productService.commit, browserWebSocketFactory, environmentService, remoteAuthorityResolverService, signService));
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}
}
