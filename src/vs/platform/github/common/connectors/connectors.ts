/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiRequestOptions } from '../client/request.js';

/** OAuth permission requested by VS Code for explicit Connector management actions. */
export const copilotConnectorsScope = 'write:plugin_gateway_connections';

/** Service-owned plugin manifest and the authenticated user's catalog connection state. */
export interface ConnectorPlugin {
	/** Canonical connector identifier used by the catalog and connection-management routes. */
	readonly name: string;
	/** Plugin manifest version, or an empty string when unspecified. */
	readonly version: string;
	/** Plugin description supplied by the manifest. */
	readonly description: string;
	/** Manifest author or publisher information; unspecified fields are empty strings. */
	readonly author: {
		/** Author or publisher display name. */
		readonly name: string;
		/** Author contact email address. */
		readonly email: string;
		/** Author or publisher website URL. */
		readonly url: string;
	};
	/** Plugin homepage or documentation URL, or an empty string when unspecified. */
	readonly homepage: string;
	/** Source repository URL declared by the manifest, or an empty string when unspecified. */
	readonly repository: string;
	/** License declared by the manifest, or an empty string when unspecified. */
	readonly license: string;
	/** Plugin logo URL supplied by the manifest. */
	readonly logo: string;
	/** Discovery keywords declared by the manifest, or null when not supplied. */
	readonly keywords: readonly string[] | null;
	/** Bundled command definitions, or null when not supplied. */
	readonly commands: readonly ConnectorPluginContent[] | null;
	/** Bundled agent definitions, or null when not supplied. */
	readonly agents: readonly ConnectorPluginContent[] | null;
	/** Bundled skill definitions, or null when not supplied. */
	readonly skills: readonly ConnectorPluginContent[] | null;
	/** MCP configuration advertised for this plugin. */
	readonly mcpServers: {
		/** MCP server definitions keyed by their manifest names. */
		readonly mcpServers: Readonly<Record<string, {
			/** Catalog transport identifier; the service currently advertises `http`. */
			readonly type: string;
			/** Service-selected MCP endpoint; consume it unchanged rather than deriving it from the connector name. */
			readonly url: string;
		}>>;
	};
	/** Connector presentation and capability metadata, separate from user-specific connection state. */
	readonly metadata: {
		/** Human-readable connector name. */
		readonly displayName: string;
		/** Service-defined connector tier, such as `Standard` or `Premium`. */
		readonly tier: string;
		/** Service-defined release classification, such as `Production`. */
		readonly releaseTag: string;
		/** Catalog capability labels, such as `actions`, or null when not supplied; not an MCP tool inventory. */
		readonly capabilities: readonly string[] | null;
		/** Whether the catalog marks the connector as exportable; independent of plugin tarball availability. */
		readonly isExportSupported: boolean;
	};
	/** The authenticated user's catalog status and the connector's OAuth resource metadata. */
	readonly connection: {
		/** User-specific catalog lifecycle state, distinct from raw API Hub connection statuses. */
		readonly status: 'not_connected' | 'pending' | 'connected' | 'error';
		/** RFC 9728 protected-resource metadata URL; empty while discovery is disabled for this connector. */
		readonly protectedResourceMetadataUrl: string;
		/** Required MCP resource scopes, not the user's granted scopes; empty while discovery is disabled. */
		readonly scopes: readonly string[];
	};
}

/** Named content embedded in a Connector plugin manifest. */
export interface ConnectorPluginContent {
	/** Component name used to determine its file or directory within the exported plugin. */
	readonly name: string;
	/** Text written to the bundled command, agent, or skill file. */
	readonly body: string;
}

/** Eligible plugins and user-specific statuses, returned even without Connector OAuth scope. */
export interface ConnectorCatalog {
	/** Plugins visible to the authenticated user, each annotated with that user's connection state. */
	readonly plugins: readonly ConnectorPlugin[];
}

/** Result of establishing or refreshing the authenticated user's connection. */
export interface ConnectorConnectionResult {
	/** API Hub connection status; required OAuth consent is reported as `Unauthenticated`. */
	readonly status: string;
	/** API Hub resource provisioning state, such as `Succeeded`, separate from authentication state. */
	readonly provisioning_state: string;
	/** Per-target API Hub status diagnostics; omitted when there are no entries. */
	readonly statuses?: readonly {
		/** Raw API Hub status for this diagnostic entry, such as `Error` or `Connected`. */
		readonly status: string;
		/** Affected connection component, such as `token`; omitted when unspecified. */
		readonly target?: string;
		/** Error associated with this status entry, when reported by API Hub. */
		readonly error?: {
			/** API Hub error code, such as `Unauthenticated`. */
			readonly code: string;
			/** Error description returned by API Hub. */
			readonly message: string;
		};
	}[];
	/** Service-issued URL present while consent is pending; open it in the user's browser, not server-side. */
	readonly consent_link?: string;
}

/** Connector catalog and connection management for an explicitly selected GitHub grant. */
export interface IConnectorsClient {
	/** GET /plugins: list eligible plugins and their connection status. */
	getCatalog(signal: AbortSignal, options?: ApiRequestOptions): Promise<ConnectorCatalog>;

	/** PUT /connectors/managed/{name}/connection: establish or refresh a connection, returning any required consent link. */
	connect(name: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<ConnectorConnectionResult>;

	/** DELETE /connectors/managed/{name}/connection: disconnect while leaving the connector available to reconnect. */
	disconnect(name: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<void>;
}
