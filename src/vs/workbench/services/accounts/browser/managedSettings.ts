/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { IProductConfiguration } from '../../../../base/common/product.js';
import { isString } from '../../../../base/common/types.js';
import { IRequestContext } from '../../../../base/parts/request/common/request.js';
import { IManagedSettingsCompatibilityError, MANAGED_SETTINGS_UPDATE_REQUIRED_ERROR_CODE } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { MANAGED_SETTINGS_ORIGINAL_STATUS_HEADER, normalizeManagedSettings } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { readHeader } from '../../../../platform/request/common/request.js';

/**
 * Client identity VS Code reports to the managed settings service. It names this codebase's own
 * managed settings implementation, which is distinct from the `copilot-runtime` implementation
 * VS Code relays a subset of these settings into.
 */
const MANAGED_SETTINGS_CLIENT_ID = 'vscode';

/**
 * A single MCP server matcher entry in the `allowedMcpServers` / `deniedMcpServers` managed
 * settings, identifying a server by exactly one strategy: name, remote URL pattern, or local
 * command invocation.
 */
export type IManagedMcpServerMatcher =
	| { readonly serverName: string }
	| { readonly serverUrl: string }
	| { readonly serverCommand: readonly string[] };

/**
 * Response shape from the Copilot `/copilot_internal/managed_settings` endpoint.
 * The endpoint returns `.github/copilot/settings.json` content from the
 * enterprise's source org. An empty response (`{}`) is success and means
 * "no policy file present".
 *
 * Unknown keys are accepted via the index signature so the client is
 * forward-compatible with future additions to the registry schema.
 *
 * Exported for unit-testing the {@link adaptManagedSettings} shape transformation.
 */
export interface IManagedSettingsResponse {
	readonly permissions?: {
		readonly disableBypassPermissionsMode?: string;
		/**
		 * Legacy location for the default chat model. Retained for deployments authored against
		 * the original schema; the top-level {@link IManagedSettingsResponse.model} wins when both
		 * are present.
		 */
		readonly model?: string;
	};
	/**
	 * Default chat model (`auto`, a model family name, or a full model id). Canonical top-level
	 * location in the current schema; supersedes the legacy nested `permissions.model`.
	 */
	readonly model?: string;
	readonly enabledPlugins?: Record<string, boolean>;
	readonly extraKnownMarketplaces?: Record<string, {
		readonly source:
		| { readonly source: 'github'; readonly repo: string; readonly ref?: string }
		| { readonly source: 'git'; readonly url: string; readonly ref?: string };
	}>;
	readonly strictKnownMarketplaces?: readonly unknown[];
	readonly allowedMcpServers?: ReadonlyArray<IManagedMcpServerMatcher>;
	readonly deniedMcpServers?: ReadonlyArray<IManagedMcpServerMatcher>;
	readonly strictPluginOnlyCustomization?: boolean;
	readonly allowManagedMcpServersOnly?: boolean;
	readonly allowManagedHooksOnly?: boolean;
	readonly forceRemoteSettingsRefresh?: boolean;
	readonly telemetry?: {
		readonly enabled?: boolean;
		readonly endpoint?: string;
		readonly protocol?: 'grpc' | 'http/protobuf' | 'http/json';
		readonly captureContent?: boolean;
		readonly lockCaptureContent?: boolean;
		readonly serviceName?: string;
		readonly resourceAttributes?: Record<string, string>;
		readonly headers?: Record<string, string>;
	};
	/** Any unknown keys in the response are accepted for forward compatibility. */
	readonly [key: string]: unknown;
}

/**
 * Restore the HTTP status a response really carried, for responses whose status was rewritten so
 * that an expected failure status would not be logged to the Developer Tools console. The main
 * process performs that rewrite (see `MANAGED_SETTINGS_ORIGINAL_STATUS_HEADER`), so on every other
 * platform — and for every other endpoint — the response is returned untouched.
 */
export function restoreOriginalStatus(context: IRequestContext): IRequestContext {
	const originalStatus = readHeader(context.res.headers, MANAGED_SETTINGS_ORIGINAL_STATUS_HEADER);
	if (!originalStatus) {
		return context;
	}

	const statusCode = Number(originalStatus);
	if (!Number.isInteger(statusCode)) {
		return context;
	}

	return { ...context, res: { ...context.res, statusCode } };
}

/**
 * Append the client identity to a `managed_settings` request URL, naming the implementations that
 * parse and enforce the response so the service can fail closed when they are too old to honor a
 * setting it would otherwise deliver. `copilot_runtime_version` is present only when a runtime is
 * bundled.
 *
 * Existing query parameters are preserved, and the URL is returned unchanged when it cannot be
 * parsed so a malformed `managedSettingsUrl` cannot turn into a thrown request. The identity
 * travels in the query string because neither header channel reaches the service; see the PR and
 * ADR for that rationale.
 */
export function appendManagedSettingsClientIdentity(url: string, product: Pick<IProductConfiguration, 'version' | 'copilotVersions'>): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}

	parsed.searchParams.set('client_id', MANAGED_SETTINGS_CLIENT_ID);
	parsed.searchParams.set('client_version', product.version);
	const runtimeVersion = product.copilotVersions?.runtime;
	if (runtimeVersion) {
		parsed.searchParams.set('copilot_runtime_version', runtimeVersion);
	} else {
		// Never let a value configured on the endpoint URL stand in for a runtime we did not bundle.
		parsed.searchParams.delete('copilot_runtime_version');
	}
	return parsed.toString();
}

interface IManagedSettingsCompatibilityErrorResponse {
	readonly error_code?: unknown;
	readonly client_version?: unknown;
	readonly minimum_client_version?: unknown;
}

function isManagedSettingsCompatibilityErrorResponse(response: unknown): response is IManagedSettingsCompatibilityErrorResponse {
	return typeof response === 'object' && response !== null;
}

export function parseManagedSettingsCompatibilityError(response: unknown): IManagedSettingsCompatibilityError | undefined {
	if (!isManagedSettingsCompatibilityErrorResponse(response) || response.error_code !== MANAGED_SETTINGS_UPDATE_REQUIRED_ERROR_CODE) {
		return undefined;
	}

	const clientVersion = isString(response.client_version) ? response.client_version : undefined;
	const minimumClientVersion = isString(response.minimum_client_version) ? response.minimum_client_version : undefined;
	return {
		errorCode: MANAGED_SETTINGS_UPDATE_REQUIRED_ERROR_CODE,
		...(clientVersion ? { clientVersion } : {}),
		...(minimumClientVersion ? { minimumClientVersion } : {}),
	};
}

/**
 * Adapt the `managed_settings` API response into the `managedSettings` slice of
 * {@link IPolicyData} that the policy framework consumes. This is a thin wrapper
 * around {@link normalizeManagedSettings} — the single normalization path shared
 * by all delivery channels (server API, file-based, native MDM) — so downstream
 * projection and policy `value()` callbacks behave identically regardless of source.
 *
 * Exported for unit-testing the shape transformation independently of network I/O.
 */
export function adaptManagedSettings(response: IManagedSettingsResponse, onWarn?: (msg: string) => void): Partial<IPolicyData> {
	return { managedSettings: normalizeManagedSettings(response as Record<string, unknown>, onWarn) };
}
