/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IRemoteAgentConnection } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import product from 'vs/platform/product/node/product';
import { nodeWebSocketFactory } from 'vs/platform/remote/node/nodeWebSocketFactory';
import { AbstractRemoteAgentService, RemoteAgentConnection } from 'vs/workbench/services/remote/common/abstractRemoteAgentService';

export class RemoteAgentService extends AbstractRemoteAgentService {

	private readonly _connection: IRemoteAgentConnection | null = null;

	constructor({ remoteAuthority }: IWindowConfiguration,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService
	) {
		super(environmentService);
		if (remoteAuthority) {
			this._connection = this._register(new RemoteAgentConnection(remoteAuthority, product.commit, nodeWebSocketFactory, environmentService, remoteAuthorityResolverService));
		}
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}
}
