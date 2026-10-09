/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ActivationContext, EnvironmentKind } from './missionControl.js';

/** The operational state of an environment. */
export type EnvironmentStatus = 'online' | 'offline' | 'waking' | 'degraded' | 'draining';

/** Protocol surface and capacity advertised by an environment. */
export interface EnvironmentCapabilities {
	/** The Agent Host Protocol version advertised by the environment. */
	readonly ahp_version?: string;
	/** Optional features advertised by the environment. */
	readonly features?: readonly string[];
	/** Maximum concurrent sessions, or null when not advertised. */
	readonly max_sessions?: number | null;
	/** Number of active sessions, or null when not reported. */
	readonly current_sessions?: number | null;
}

/** Codespace-specific metadata supplied by the host at registration. */
export interface CodespaceMetadata {
	/** The unique Codespace name. */
	readonly codespace_name: string;
	/** The repository used to create the Codespace, in owner/name form. */
	readonly codespace_repo?: string;
	/** The Codespace machine specification label. */
	readonly machine_type?: string;
}

/** Opt-in lifecycle operations Mission Control may perform on an environment. */
export interface LifecycleCapabilities {
	/** Whether Mission Control is authorized to wake the environment from idle. */
	readonly wake?: boolean;
}

/** A public sealing key advertised by the host for encrypting values sent over the relay. */
export interface AdvertisedEncryptionKey {
	/** The stateless key fingerprint identifying the key in a sealed envelope. */
	readonly key_id: string;
	/** The key's trust domain, such as auth-token. */
	readonly use: string;
	/** The sealing scheme, currently x25519-sealedbox. */
	readonly algorithm: string;
	/** The recipient public key encoded in standard padded base64. */
	readonly public_key: string;
}

/** Named group identifiers for the daemon's environment-scoped channels. */
export interface WebPubSubGroupNames {
	/** The Mission Control to daemon control channel. */
	readonly control: string;
	/** The ingestion acknowledgement channel. */
	readonly ingest_ack: string;
	/** The daemon event publishing channel. */
	readonly events: string;
	/** The daemon lifecycle event channel. */
	readonly lifecycle: string;
}

/** Web PubSub bootstrap data for daemon connectivity, omitted when WPS is not configured. */
export interface EnvironmentWebPubSub {
	/** The WebSocket endpoint URL without an access_token query parameter. */
	readonly url: string;
	/** The Web PubSub hub name. */
	readonly hub: string;
	/** The WebSocket subprotocol to negotiate. */
	readonly subprotocol: string;
	/** A short-lived authentication JWT that must not be persisted or logged. */
	readonly access_token: string;
	/** The daemon's environment-scoped channel names. */
	readonly groups: WebPubSubGroupNames;
}

/** An environment record returned by environment list and get operations. */
export interface Environment {
	/** The stable unique environment identifier. */
	readonly id: string;
	/** The human-readable environment name. */
	readonly name: string;
	/** The class of compute backing the environment. */
	readonly kind: EnvironmentKind;
	/** The current operational state of the environment. */
	readonly status: EnvironmentStatus;
	/** The protocol surface and capacity advertised by the environment. */
	readonly capabilities?: EnvironmentCapabilities;
	/** How compute is sourced for a managed environment. */
	readonly provisioning_mode?: string;
	/** An opaque infrastructure health reference for a managed environment. */
	readonly infra_health_ref?: string;
	/** The deprecated compatibility alias for owner_id, which may identify an organization. */
	readonly user_id?: string;
	/** The owning user or organization ID, omitted for ownerless catalog environments. */
	readonly owner_id?: string;
	/** The account type owning the environment. */
	readonly owner_type?: 'user' | 'organization';
	/** The organization ID for a user-local environment. */
	readonly org_id?: string | null;
	/** Free-form metadata for a user-local environment. */
	readonly labels?: Readonly<Record<string, string>>;
	/** The most recent heartbeat timestamp, or null when unavailable. */
	readonly last_heartbeat_at?: string | null;
	/** Optional daemon connectivity bootstrap data, which contains credentials. */
	readonly webpubsub?: EnvironmentWebPubSub;
	/** Kind-specific metadata, currently supplied only by user-codespace environments. */
	readonly metadata?: CodespaceMetadata;
	/** Lifecycle operations Mission Control is authorized to perform. */
	readonly lifecycle_controls?: LifecycleCapabilities;
	/** Public sealing keys advertised by the most recent register or heartbeat. */
	readonly encryption_keys?: readonly AdvertisedEncryptionKey[];
}

/** Filters for the authenticated account's environment inventory. */
export interface ListEnvironmentsOptions {
	/** Filter by the class of compute backing the environment. */
	readonly kind?: EnvironmentKind;
	/** Filter by the environment's operational state. */
	readonly status?: EnvironmentStatus;
}

/** Named group identifiers for a client's session-scoped and environment-wide channels. */
export interface ClientGroupNames {
	/** The daemon-to-all-clients broadcast channel for the session. */
	readonly broadcast: string;
	/** The daemon-to-this-client unicast channel. */
	readonly to_client: string;
	/** The publish-only client-to-daemon upstream channel. */
	readonly to_host: string;
	/** The environment-wide Mission Control channel for all clients. */
	readonly clients: string;
}

/** Short-lived connection credentials returned by a successful connect or reconnect request. */
export interface ClientTokenResponse {
	/** The short-lived Web PubSub JWT, which must not be persisted or logged. */
	readonly access_token: string;
	/** The RFC 3339 timestamp when the token expires. */
	readonly expires_at: string;
	/** The WebSocket endpoint URL for the Web PubSub hub. */
	readonly wps_endpoint: string;
	/** The Web PubSub hub name. */
	readonly hub: string;
	/** The WebSocket subprotocol to negotiate. */
	readonly subprotocol: string;
	/** The Mission Control client identity to retain for reconnect requests. */
	readonly client_id: string;
	/** The environment's status when the token was minted. */
	readonly environment_status: EnvironmentStatus;
	/** The provisioning or wake activation that established the current host. */
	readonly activation_context?: ActivationContext;
	/** The channel names assigned to the client connection. */
	readonly groups: ClientGroupNames;
	/** The sealed GitHub credential, forwarded opaquely to the host without logging or persisting it. */
	readonly encrypted_github_token?: string;
	/** The scope of the sealed credential, present exactly when encrypted_github_token is present. */
	readonly encrypted_github_token_scope?: 'repository' | 'user';
	/** The public host key used to seal encrypted_github_token. */
	readonly host_encryption_key?: AdvertisedEncryptionKey;
}

/** The response body when connection setup is waiting for an environment to wake. */
export interface WakingResponse {
	/** The environment is waking from idle. */
	readonly environment_status: 'waking';
	/** The in-progress activation context, stable across repeated polls when available. */
	readonly activation_context?: ActivationContext;
}

/** Session context shared by connect and reconnect requests. */
export interface EnvironmentConnectionOptions {
	/** The session used to resolve the repository when minting a scoped token. */
	readonly session_id?: string;
}

/** Query parameters for creating a new logical client connection. */
export interface ConnectEnvironmentOptions extends EnvironmentConnectionOptions {
	/** Request an observer-only client; explicit false conflicts when policy requires passive access. */
	readonly passive?: boolean;
}

/** A single credential request's outcome; a waking response must be retried by the caller. */
export type EnvironmentConnectResult =
	| {
		/** Credentials were successfully minted. */
		readonly status: 200;
		/** The short-lived connection credentials. */
		readonly data: ClientTokenResponse;
	}
	| {
		/** Connection setup is pending and no credentials have been issued. */
		readonly status: 202;
		/** The waking environment and optional activation context. */
		readonly data: WakingResponse;
		/** The Retry-After delay in seconds, omitted if the service supplied no delay. */
		readonly retryAfterSeconds?: number;
	};

/** Environment inventory and credential-minting REST operations. */
export interface IEnvironmentsClient {
	/** GET /agents/environments: list the authenticated account's environments with optional filters. */
	list(signal: AbortSignal, options?: ListEnvironmentsOptions): Promise<readonly Environment[]>;

	/** GET /agents/environments/{environment_id}: read an environment owned by the authenticated account. */
	get(environmentId: string, signal: AbortSignal): Promise<Environment>;

	/** GET /agents/environments/{environment_id}/connect: mint credentials once without caching or retrying the request. */
	connect(environmentId: string, signal: AbortSignal, options?: ConnectEnvironmentOptions): Promise<EnvironmentConnectResult>;

	/** GET /agents/environments/{environment_id}/reconnect: refresh an existing client's credentials without caching or retrying. */
	reconnect(environmentId: string, clientId: string, signal: AbortSignal, options?: EnvironmentConnectionOptions): Promise<EnvironmentConnectResult>;
}
