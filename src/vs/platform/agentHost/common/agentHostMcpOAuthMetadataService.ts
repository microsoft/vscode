/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fetchAuthorizationServerMetadata, IAuthorizationServerMetadata } from '../../../base/common/oauth.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { asText, IRequestService } from '../../request/common/request.js';

export const agentHostMcpOAuthMetadataChannelName = 'agentHostMcpOAuthMetadata';

export const IAgentHostMcpOAuthMetadataService = createDecorator<IAgentHostMcpOAuthMetadataService>('agentHostMcpOAuthMetadataService');

export interface IAgentHostMcpOAuthMetadata {
	readonly metadata: IAuthorizationServerMetadata;
	readonly discoveryUrl: string;
}

export interface IAgentHostMcpOAuthMetadataService {
	readonly _serviceBrand: undefined;

	fetch(authorizationServer: string): Promise<IAgentHostMcpOAuthMetadata>;
}

export class AgentHostMcpOAuthMetadataService implements IAgentHostMcpOAuthMetadataService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
	) { }

	async fetch(authorizationServer: string): Promise<IAgentHostMcpOAuthMetadata> {
		const { metadata, discoveryUrl } = await fetchAuthorizationServerMetadata(authorizationServer, {
			fetch: async (url, init) => {
				const context = await this.requestService.request({
					url,
					type: init.method,
					headers: init.headers,
					callSite: 'agentHostMcpAuthentication',
				}, CancellationToken.None);
				const body = await asText(context) ?? '';
				return {
					status: context.res.statusCode ?? 0,
					statusText: '',
					json: async () => JSON.parse(body),
					text: async () => body,
				};
			},
		});
		return { metadata, discoveryUrl };
	}
}
