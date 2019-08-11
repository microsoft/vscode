/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IRemoteAgentConnection, IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import product from 'vs/platform/product/node/product';
import { nodeSocketFactory } from 'vs/platform/remote/node/nodeSocketFactory';
import { AbstractRemoteAgentService, RemoteAgentConnection } from 'vs/workbench/services/remote/common/abstractRemoteAgentService';
import { ISignService } from 'vs/platform/sign/common/sign';
import { ISocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';

export class RemoteAgentService extends AbstractRemoteAgentService implements IRemoteAgentService {

	public readonly socketFactory: ISocketFactory;

	private readonly _connection: IRemoteAgentConnection | null = null;

	constructor({ remoteAuthority }: IWindowConfiguration,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ISignService signService: ISignService
	) {
		super(environmentService);
		this.socketFactory = nodeSocketFactory;
		if (remoteAuthority) {
			this._connection = this._register(new RemoteAgentConnection(remoteAuthority, product.commit, nodeSocketFactory, remoteAuthorityResolverService, signService));
		}
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}
}
