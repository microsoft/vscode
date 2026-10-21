/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiRequestOptions, IApiRequestProvider } from '../client/request.js';
import { pathSegment } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { GitHubRequestError } from '../githubTypes.js';
import { ConnectorCatalog, ConnectorConnectionResult, ConnectorPlugin, ConnectorPluginContent, IConnectorsClient } from './connectors.js';

export class ConnectorsClient implements IConnectorsClient {
	constructor(private readonly provider?: IApiRequestProvider) { }

	async getCatalog(signal: AbortSignal, options?: ApiRequestOptions): Promise<ConnectorCatalog> {
		signal.throwIfAborted();
		if (!this.provider) {
			throw new GitHubRequestError('No approved Copilot connectors endpoint is configured for this client', 'validation');
		}
		const response = await this.provider.request({
			domain: 'connectors',
			method: 'GET',
			path: '/plugins',
			authentication: 'required',
			accept: 'application/json',
			expectedStatus: 200,
			options,
		}, signal, parseCatalog);
		return response.data;
	}

	async connect(name: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ConnectorConnectionResult> {
		signal.throwIfAborted();
		if (!this.provider) {
			throw new GitHubRequestError('No approved Copilot connectors endpoint is configured for this client', 'validation');
		}
		const response = await this.provider.request({
			domain: 'connectors',
			method: 'PUT',
			path: connectionPath(name),
			authentication: 'required',
			body: { client_source: 'VS_CODE' },
			accept: 'application/json',
			expectedStatus: 200,
			options,
		}, signal, parseConnection);
		return response.data;
	}

	async disconnect(name: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		signal.throwIfAborted();
		if (!this.provider) {
			throw new GitHubRequestError('No approved Copilot connectors endpoint is configured for this client', 'validation');
		}
		await this.provider.request({
			domain: 'connectors',
			method: 'DELETE',
			path: connectionPath(name),
			authentication: 'required',
			accept: 'application/json',
			expectedStatus: 204,
			responseBody: 'none',
			options,
		}, signal);
	}
}

function connectionPath(name: string): string {
	return `/connectors/managed/${pathSegment(name)}/connection`;
}

const parseContent = parse.object<ConnectorPluginContent>({
	name: parse.string,
	body: parse.string
});

const parsePlugin = parse.object<ConnectorPlugin>({
	name: parse.nonEmptyString,
	version: parse.string,
	description: parse.string,
	author: parse.object({
		name: parse.string,
		email: parse.string,
		url: parse.string
	}),
	homepage: parse.string,
	repository: parse.string,
	license: parse.string,
	logo: parse.string,
	keywords: parse.nullable(parse.strings),
	commands: parse.nullable(parse.arrayOf(parseContent)),
	agents: parse.nullable(parse.arrayOf(parseContent)),
	skills: parse.nullable(parse.arrayOf(parseContent)),
	mcpServers: parse.object({
		mcpServers: parse.dictionary(parse.object({
			type: parse.string,
			url: parse.string
		})),
	}),
	metadata: parse.object({
		displayName: parse.string,
		tier: parse.string,
		releaseTag: parse.string,
		capabilities: parse.nullable(parse.strings),
		isExportSupported: parse.boolean,
	}),
	connection: parse.object({
		status: parse.oneOf('not_connected', 'pending', 'connected', 'error'),
		protectedResourceMetadataUrl: parse.string,
		scopes: parse.strings,
	}),

});

const parseCatalog = parse.object<ConnectorCatalog>({
	plugins: parse.arrayOf(parsePlugin)
});

const parseConnection = parse.object<ConnectorConnectionResult>({
	status: parse.string,
	provisioning_state: parse.string,
	statuses: parse.optional(parse.arrayOf(parse.object({
		status: parse.string,
		target: parse.optional(parse.string),
		error: parse.optional(parse.object({
			code: parse.string,
			message: parse.string
		})),
	}))),
	consent_link: parse.optional(parse.string),
});
