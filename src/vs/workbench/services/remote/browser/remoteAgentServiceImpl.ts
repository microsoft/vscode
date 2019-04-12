/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteAgentConnection } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { AbstractRemoteAgentService, RemoteAgentConnection } from 'vs/workbench/services/remote/common/abstractRemoteAgentService';
import { IProductService } from 'vs/platform/product/common/product';
import { browserWebSocketFactory } from 'vs/platform/remote/browser/browserWebSocketFactory';

export class RemoteAgentService extends AbstractRemoteAgentService {

	private readonly _connection: IRemoteAgentConnection | null = null;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IProductService productService: IProductService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService
	) {
		super(environmentService);
		const authority = document.location.host;
		this._connection = this._register(new RemoteAgentConnection(authority, productService.commit, browserWebSocketFactory, environmentService, remoteAuthorityResolverService));
	}

	getConnection(): IRemoteAgentConnection | null {
		return this._connection;
	}
}
