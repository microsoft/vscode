/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fetchAuthorizationServerMetadata, fetchResourceMetadata, IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata } from '../../../base/common/oauth.js';
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
	resolveResource(resource: string): Promise<IAuthorizationProtectedResourceMetadata>;
}

export class AgentHostMcpOAuthMetadataService implements IAgentHostMcpOAuthMetadataService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
	) { }

	async fetch(authorizationServer: string): Promise<IAgentHostMcpOAuthMetadata> {
		const { metadata, discoveryUrl } = await fetchAuthorizationServerMetadata(authorizationServer, {
			fetch: (url, init) => this.request(url, init),
		});
		const issuer = new URL(metadata.issuer);
		if (issuer.toString() !== new URL(authorizationServer).toString() || issuer.search || issuer.hash || issuer.username || issuer.password) {
			throw new Error('MCP authorization server metadata issuer does not match the requested authorization server');
		}
		for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint]) {
			if (!endpoint || !new URL(endpoint).host) {
				throw new Error('MCP authorization server metadata must advertise authorization and token endpoints');
			}
		}
		return { metadata, discoveryUrl };
	}

	async resolveResource(resource: string): Promise<IAuthorizationProtectedResourceMetadata> {
		let receivedMetadata = false;
		try {
			const { metadata } = await fetchResourceMetadata(resource, undefined, {
				fetch: async (url, init) => {
					const response = await this.request(url, init);
					receivedMetadata ||= response.status === 200;
					return response;
				},
			});
			if (!Array.isArray(metadata.authorization_servers) || !metadata.authorization_servers.length || !metadata.authorization_servers.every(server => typeof server === 'string')) {
				throw new Error('MCP protected resource metadata does not advertise authorization servers');
			}
			return metadata;
		} catch (error) {
			if (receivedMetadata) {
				throw error;
			}
		}

		// March 2025 MCP servers may omit protected resource metadata and use the MCP origin as issuer.
		return { resource, authorization_servers: [new URL(resource).origin] };
	}

	private async request(url: string, init: { method: string; headers: Record<string, string> }) {
		const context = await this.requestService.request({
			url,
			type: init.method,
			headers: init.headers,
			callSite: 'agentHostMcpAuthentication',
		}, CancellationToken.None);
		const body = asText(context);
		return {
			status: context.res.statusCode ?? 0,
			statusText: '',
			json: async () => JSON.parse(await body ?? ''),
			text: async () => await body ?? '',
		};
	}
}
