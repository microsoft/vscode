/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { normalizeManagedSettings } from '../../../../platform/policy/common/copilotManagedSettings.js';

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
	};
	readonly enabledPlugins?: Record<string, boolean>;
	readonly extraKnownMarketplaces?: Record<string, {
		readonly source:
		| { readonly source: 'github'; readonly repo: string; readonly ref?: string }
		| { readonly source: 'git'; readonly url: string; readonly ref?: string };
	}>;
	readonly strictKnownMarketplaces?: readonly unknown[];
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
