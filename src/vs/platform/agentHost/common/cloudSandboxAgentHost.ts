/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Contracts for connecting to Copilot cloud "sandbox" sessions (agent slug
// `copilot-developer-cli`), which run the Copilot agent runtime (`copilotd`) inside a Mission
// Control managed sandbox and speak the Agent Host Protocol over an Azure Web PubSub relay.
//
// Like `tunnelAgentHost.ts` / `sshRemoteAgentHost.ts` / `wslRemoteAgentHost.ts`, this describes how
// to reach an agent host over one transport; it does not define a new kind of agent host.

import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IReplayedTaskHistory } from './taskEventReplay.js';

/** Configuration key gating the cloud-sandbox connection path. Disabled by default. */
export const CloudSandboxEnabledSettingId = 'chat.agentHost.cloudSandbox.enabled';

/** Prefix for the synthesized display address of a cloud sandbox connection. */
export const CLOUD_SANDBOX_ADDRESS_PREFIX = 'cloudsandbox:';

/**
 * Session URI scheme the Copilot host uses when it creates and lists sessions
 * (`ahp-session:/<uuid>`). Differs from its agent provider ({@link CLOUD_SANDBOX_AGENT_PROVIDER}):
 * the UI routes by provider, but backend calls must address sessions under this scheme because the
 * host's session registry is keyed by the exact URI.
 */
export const CLOUD_SANDBOX_SESSION_SCHEME = 'ahp-session';

/** The agent provider advertised by the Copilot host inside the sandbox. */
export const CLOUD_SANDBOX_AGENT_PROVIDER = 'copilot';

/** Prefix of a sealed token envelope (`copilot-sealed.v1.<key_id>.<b64url>`). */
export const CLOUD_SANDBOX_SEALED_TOKEN_PREFIX = 'copilot-sealed.v1.';

/** Whether {@link token} is a sealed envelope, and so safe to forward over the relay. */
export function isCloudSandboxSealedToken(token: string | undefined): boolean {
	return typeof token === 'string' && token.startsWith(CLOUD_SANDBOX_SEALED_TOKEN_PREFIX);
}
/** The Mission Control environment id encoded in a cloud sandbox connection address, if any. */
export function cloudSandboxEnvironmentId(address: string): string | undefined {
	return address.startsWith(CLOUD_SANDBOX_ADDRESS_PREFIX)
		? address.slice(CLOUD_SANDBOX_ADDRESS_PREFIX.length)
		: undefined;
}

/**
 * The Copilot cloud agent slug whose tasks run inside a Mission Control sandbox.
 *
 * Sandbox tasks carry this slug today, which is why {@link CloudSandboxEnabledSettingId} exists and
 * defaults to off: the Copilot extension's cloud provider lists tasks by an allowlist of cloud
 * slugs (`copilot-developer`, `copilot-swe-agent`) that excludes this one, so the two providers do
 * not overlap. Sandbox tasks are expected to move under one of those slugs eventually, at which
 * point both providers would list the same task and the sessions list would show it twice — the
 * setting keeps that from reaching everyone before the overlap is resolved.
 */
export const CLOUD_SANDBOX_AGENT_SLUG = 'copilot-developer-cli';

/** A sandbox session discovered from the Copilot task list, enough to seed a session entry. */
export interface ICloudSandboxDiscoveredSession {
	/** Mission Control environment id the session's sandbox is bound to. */
	readonly environmentId: string;
	/**
	 * Session id, used as the native session's raw id. Mission Control creates the session as
	 * `ahp-session:/<sessionId>` and the host lists it back under the same id, so seeded entries
	 * reconcile with the host's `listSessions()` on connect.
	 */
	readonly sessionId: string;
	/**
	 * Mission Control task id owning the session. Persisted AHP history is addressed per task, so
	 * this is what makes a session's conversation readable after its sandbox is gone.
	 */
	readonly taskId: string;
	/** Display name for the session/host. */
	readonly name: string;
	/** Owning repository as `owner/name`, when known. */
	readonly repoName?: string;
	/** Last-updated timestamp (ISO 8601), when known, for ordering. */
	readonly updatedAt?: string;
}

/** Build the synthesized remote-agent-host address for a sandbox environment. */
export function cloudSandboxAddress(environmentId: string): string {
	return `${CLOUD_SANDBOX_ADDRESS_PREFIX}${environmentId}`;
}

/** Build the Web PubSub URL for a client token. The scheme is forced to `wss://`. */
export function buildWpsUrl(token: ICloudSandboxClientToken): string {
	const base = token.wps_endpoint.replace(/^ws:\/\//i, 'wss://').replace(/^http:\/\//i, 'wss://').replace(/^https:\/\//i, 'wss://');
	const withScheme = /^wss:\/\//i.test(base) ? base : `wss://${base}`;
	const separator = withScheme.includes('?') ? '&' : '?';
	return `${withScheme}${separator}access_token=${encodeURIComponent(token.access_token)}&clientId=${encodeURIComponent(token.client_id)}`;
}

/**
 * The three per-client Web PubSub group "lanes". The client joins {@link broadcast} and
 * {@link to_client} (inbound) and publishes to {@link to_host} (outbound).
 */
export interface IWebPubSubClientGroups {
	/** Host → this-client broadcast lane the client subscribes to. */
	readonly broadcast: string;
	/** Host → this-client lane the client subscribes to. */
	readonly to_client: string;
	/** This-client → host lane the client publishes to. */
	readonly to_host: string;
}

/** A public sealing key advertised by the sandbox host. */
export interface IHostEncryptionKey {
	/** Stateless key fingerprint; names the key in a sealed value's envelope. */
	readonly key_id: string;
	/** Trust domain the key serves (e.g. `auth-token`). */
	readonly use: string;
	/** Sealing scheme (only `x25519-sealedbox` is defined today). */
	readonly algorithm: string;
	/** Recipient public key in standard (padded) base64. */
	readonly public_key: string;
}

/**
 * A client Web PubSub connection token (`/connect` and `/reconnect`, HTTP 200). Field names mirror
 * the wire shape so the extension can pass them through the bridge without remapping.
 */
export interface ICloudSandboxClientToken {
	/** Short-lived Web PubSub JWT. Never persisted. */
	readonly access_token: string;
	/** ISO-8601 expiry of {@link access_token}. */
	readonly expires_at: string;
	/** Web PubSub endpoint URL (without the access-token query param). */
	readonly wps_endpoint: string;
	/** Web PubSub hub name. */
	readonly hub: string;
	/** WebSocket subprotocol to negotiate (e.g. the reliable JSON subprotocol). */
	readonly subprotocol: string;
	/** MC-issued stable client identity used for group lanes, `initialize`, and reconnect. */
	readonly client_id: string;
	/** The per-client group lanes. */
	readonly groups: IWebPubSubClientGroups;
	/** Opaque `copilot-sealed.v1.<key_id>.<b64url>` envelope, when MC sealed a token. */
	readonly encrypted_github_token?: string;
	/** The host key the {@link encrypted_github_token} was sealed to, when present. */
	readonly host_encryption_key?: IHostEncryptionKey;
}

/**
 * Mission Control signalled that the environment is waking (HTTP 202). The
 * client must retry `/connect` after {@link retryAfterSeconds} until it gets a
 * token (HTTP 200).
 */
export interface ICloudSandboxWaking {
	/** Seconds to wait before retrying, from the `Retry-After` header. */
	readonly retryAfterSeconds: number;
}

/** Result of a credentials mint: either a usable token or a "waking" retry signal. */
export type CloudSandboxConnectResult =
	| { readonly kind: 'token'; readonly token: ICloudSandboxClientToken }
	| { readonly kind: 'waking'; readonly waking: ICloudSandboxWaking };

/**
 * Operational state of a sandbox environment. Only `online` has a daemon listening on the relay;
 * connecting to any other state leaves the AHP `initialize` unanswered.
 */
export type CloudSandboxEnvironmentStatus = 'online' | 'offline' | 'degraded' | 'waking' | 'draining';

/** A sandbox environment's current record, as reported by Mission Control. */
export interface ICloudSandboxEnvironment {
	readonly id: string;
	readonly status: CloudSandboxEnvironmentStatus;
	readonly capabilities?: {
		/** The copilotd **host** version (e.g. `0.6.3`), not the AHP wire protocol version. */
		readonly ahp_version?: string;
	};
}

/** Identifies which sandbox environment/session credentials are being minted for. */
export interface ICloudSandboxConnectionRequest {
	/** Stable environment identifier (`env_<uuid>`) of the sandbox. */
	readonly environmentId: string;
	/**
	 * The cloud session/task id the client is connecting to. Mission Control
	 * uses it to resolve the repository when minting the token.
	 */
	readonly sessionId?: string;
}

export const ICloudSandboxApiService = createDecorator<ICloudSandboxApiService>('cloudSandboxApiService');

/**
 * Client for the Mission Control APIs a cloud sandbox session depends on: connection credentials,
 * the environment and task records, and the persisted history. Every call is served by Mission
 * Control rather than the sandbox, which is what keeps {@link getSessionHistory} readable after the
 * environment is gone.
 */
export interface ICloudSandboxApiService {
	readonly _serviceBrand: undefined;

	/**
	 * Mint a fresh client Web PubSub connection token for a new logical connection. May resolve to a
	 * "waking" result the caller should retry.
	 */
	connect(request: ICloudSandboxConnectionRequest, token: CancellationToken): Promise<CloudSandboxConnectResult>;

	/**
	 * Refresh the credentials for an existing logical connection identified by {@link clientId}
	 * (e.g. after the access token expired).
	 */
	reconnect(request: ICloudSandboxConnectionRequest, clientId: string, token: CancellationToken): Promise<CloudSandboxConnectResult>;

	/**
	 * Read an environment's current record. `status` is derived from heartbeat age, so it says
	 * whether the environment is running — not whether a dormant one can be woken, which Mission
	 * Control only discovers by attempting the resume behind `/connect`.
	 */
	getEnvironment(environmentId: string, token: CancellationToken): Promise<ICloudSandboxEnvironment>;

	/** Enumerate the caller's sandbox-backed cloud sessions, enough to seed session entries. */
	listSessions(token: CancellationToken): Promise<ICloudSandboxDiscoveryResult>;

	/**
	 * Read a task's persisted AHP history and fold it back into session and chat state.
	 *
	 * Mission Control mirrors every `ActionEnvelope` it relays, so this rebuilds the conversation
	 * **without the sandbox**. `undefined` when the task has no AHP history.
	 */
	getSessionHistory(taskId: string, token: CancellationToken): Promise<IReplayedTaskHistory | undefined>;
}

/**
 * Outcome of a discovery pass. Only a `complete` result describes the full set of sandbox sessions,
 * so only it may be reconciled against — a `partial` result is missing entries that still exist, and
 * treating it as authoritative would tear down live sessions.
 */
export type ICloudSandboxDiscoveryResult =
	/** Every task was scanned and resolved; absent sessions really are gone. */
	| { readonly kind: 'complete'; readonly sessions: readonly ICloudSandboxDiscoveredSession[] }
	/** Some tasks could not be resolved. Seed what was found, but do not remove anything. */
	| { readonly kind: 'partial'; readonly sessions: readonly ICloudSandboxDiscoveredSession[] }
	/** Discovery could not run (auth not ready, request failed). Existing state must be left alone. */
	| { readonly kind: 'failed'; readonly reason: string };

/** Thrown when no GitHub session with the required scopes is available. */
export class CloudSandboxAuthenticationRequiredError extends Error {
	constructor() {
		super('Connecting to a cloud sandbox requires a signed-in GitHub account.');
		this.name = 'CloudSandboxAuthenticationRequiredError';
	}
}

/**
 * A Mission Control request that came back with a non-success status. Carries the {@link statusCode}
 * so callers can tell a failure that may clear on its own from one that never will.
 */
export class CloudSandboxRequestError extends Error {
	constructor(readonly statusCode: number | undefined, message: string) {
		super(message);
		this.name = 'CloudSandboxRequestError';
	}
}

/**
 * Whether re-issuing a failed request could plausibly succeed later. Callers that retry on a timer
 * MUST consult this, or one dead session becomes an unbounded stream of failed requests.
 *
 * Transport failures (no status), 5xx, 408 and 429 are transient; every other 4xx describes a
 * request Mission Control will reject identically however often it is repeated.
 *
 * This gates credential refresh for *live* connections, where a transient fault must not tear down
 * a working session — hence 5xx staying retryable. Opening a new connection deliberately does not
 * use it: there, any answer is final. {@link CloudSandboxAuthenticationRequiredError} is retryable
 * because it is raised before any request goes out, so callers need their own ceiling.
 */
export function isRetryableCloudSandboxError(error: unknown): boolean {
	if (!(error instanceof CloudSandboxRequestError) || error.statusCode === undefined) {
		return true;
	}
	const status = error.statusCode;
	return status === 408 || status === 429 || status < 400 || status >= 500;
}

export const ICloudSandboxAgentHostService = createDecorator<ICloudSandboxAgentHostService>('cloudSandboxAgentHostService');

/** Options for establishing a live AHP relay to a cloud sandbox environment. */
export interface ICloudSandboxConnectOptions {
	/** Stable Mission Control environment identifier (`env_<uuid>`). */
	readonly environmentId: string;
	/** The cloud session/task id this connection is for, used for token minting. */
	readonly sessionId?: string;
	/** Human-readable display name for the connection. */
	readonly name: string;
}

/**
 * Renderer-side coordinator that establishes and manages live Agent Host
 * Protocol relay connections to Copilot cloud sandbox environments. Mints
 * credentials via {@link ICloudSandboxApiService}, opens a
 * {@link WebPubSubRelayTransport}, drives the AHP handshake (including the
 * sealed-token `authenticate`), and registers the connection with
 * {@link IRemoteAgentHostService} so it surfaces as a native agent-host session.
 */
export interface ICloudSandboxAgentHostService {
	readonly _serviceBrand: undefined;

	/**
	 * Establish (or reuse) a live AHP relay connection to the given sandbox
	 * environment. Resolves with the connection's display address once the
	 * connection is registered with {@link IRemoteAgentHostService}.
	 *
	 * Retries while the environment is waking (bounded), honoring the
	 * server-provided Retry-After delay.
	 */
	connect(options: ICloudSandboxConnectOptions, token: CancellationToken): Promise<string>;

	/**
	 * The sealed GitHub token for a live connection to the given environment, as minted by
	 * `/connect` and refreshed by `/reconnect`, or `undefined` when there is no connection.
	 */
	getSealedGitHubToken(environmentId: string): string | undefined;
}
