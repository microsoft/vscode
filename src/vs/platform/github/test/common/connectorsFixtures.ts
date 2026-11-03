/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectorPlugin } from '../../common/connectors/connectors.js';

/** Builds the service's manifest shape, including fields emitted with empty or null values. */
export function createConnectorPlugin(overrides: Partial<Omit<ConnectorPlugin, 'author' | 'metadata' | 'connection'>> & {
	readonly author?: Partial<ConnectorPlugin['author']>;
	readonly metadata?: Partial<ConnectorPlugin['metadata']>;
	readonly connection?: Partial<ConnectorPlugin['connection']>;
} = {}): ConnectorPlugin {
	const name = overrides.name ?? 'mail';
	return {
		name,
		version: '',
		description: '',
		homepage: '',
		repository: '',
		license: '',
		logo: '',
		keywords: null,
		commands: null,
		agents: null,
		skills: null,
		mcpServers: { mcpServers: { [name]: { type: 'http', url: `https://example.com/${name}/mcp` } } },
		...overrides,
		author: { name: '', email: '', url: '', ...overrides.author },
		metadata: {
			displayName: name, tier: '', releaseTag: '', capabilities: null, isExportSupported: false,
			...overrides.metadata,
		},
		connection: {
			status: 'not_connected', protectedResourceMetadataUrl: '', scopes: [],
			...overrides.connection,
		},
	};
}
