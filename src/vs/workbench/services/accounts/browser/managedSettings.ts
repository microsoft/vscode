/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { IExtraKnownMarketplaceEntry, extraKnownMarketplacesToConfigDict } from '../../../../base/common/managedSettings.js';
import { ManagedSettingValue } from '../../../../base/common/policy.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, flattenManagedSettings } from '../../../../platform/policy/common/copilotManagedSettings.js';

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
	readonly strictKnownMarketplaces?: boolean;
	/** Any unknown keys in the response are accepted for forward compatibility. */
	readonly [key: string]: unknown;
}

/**
 * Adapt the `managed_settings` API response into the `managedSettings` slice of
 * {@link IPolicyData} that the policy framework consumes. This is the single
 * server-side normalizer: it encodes the response into the SAME canonical
 * `managedSettings` shape an admin authors via native MDM, so downstream
 * projection and policy `value()` callbacks behave identically regardless of
 * source. It does not itself enforce the declared `managedSettings` schema —
 * dropping undeclared or type-mismatched keys happens later, at the
 * `projectManagedSettings` step.
 *
 * - Scalar leaves (`permissions.*`, `strictKnownMarketplaces`, and any
 *   forward-compatible scalar keys) are flattened into dot-separated keys.
 * - Structured settings (`enabledPlugins`, `extraKnownMarketplaces`) are carried
 *   as canonical JSON strings under a single key each — the same shape an admin
 *   authors via native MDM. `PolicyConfiguration` parses the JSON back into the
 *   object-typed setting on read. `extraKnownMarketplaces` is normalized from the
 *   API's `Record<id, { source }>` map to the `{ [name]: url-or-shorthand }` dict.
 *
 * Malformed marketplace entries are dropped (with an optional warning via
 * {@link onWarn}) rather than throwing, so a bad enterprise settings file degrades
 * gracefully instead of blocking startup.
 *
 * Exported for unit-testing the shape transformation independently of network I/O.
 */
export function adaptManagedSettings(response: IManagedSettingsResponse, onWarn?: (msg: string) => void): Partial<IPolicyData> {
	const { enabledPlugins, extraKnownMarketplaces, ...rest } = response;

	const managedSettings: Record<string, ManagedSettingValue> = { ...flattenManagedSettings(rest) };

	if (isObject(enabledPlugins)) {
		managedSettings[COPILOT_ENABLED_PLUGINS_KEY] = JSON.stringify(enabledPlugins);
	}

	const marketplaceDict = extraKnownMarketplacesToConfigDict(normalizeExtraKnownMarketplaces(extraKnownMarketplaces, onWarn));
	if (marketplaceDict) {
		managedSettings[COPILOT_EXTRA_MARKETPLACES_KEY] = JSON.stringify(marketplaceDict);
	}

	return { managedSettings };
}

/**
 * Normalize the endpoint's `{ [id]: { source } }` marketplace map into the
 * {@link IExtraKnownMarketplaceEntry} array, preserving the marketplace `name`,
 * source discriminator, and any `ref`. Malformed or off-spec entries are dropped
 * (with an optional warning via {@link onWarn}).
 */
function normalizeExtraKnownMarketplaces(value: IManagedSettingsResponse['extraKnownMarketplaces'], onWarn?: (msg: string) => void): IExtraKnownMarketplaceEntry[] | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const seen = new Set<string>();
	const entries: IExtraKnownMarketplaceEntry[] = [];
	for (const [name, entry] of Object.entries(value)) {
		if (!isObject(entry) || !isObject(entry.source)) {
			onWarn?.(`[DefaultAccount] Skipping malformed extraKnownMarketplaces entry "${name}": expected { source: { source, repo|url } }`);
			continue;
		}
		const src = entry.source as { source?: string; repo?: string; url?: string; ref?: string };
		let normalized: IExtraKnownMarketplaceEntry | undefined;
		if (src.source === 'github' && isString(src.repo)) {
			normalized = { name, source: { source: 'github', repo: src.repo, ...(src.ref ? { ref: src.ref } : {}) } };
		} else if (src.source === 'git' && isString(src.url)) {
			normalized = { name, source: { source: 'git', url: src.url, ...(src.ref ? { ref: src.ref } : {}) } };
		} else if (src.source === 'github' || src.source === 'git') {
			onWarn?.(`[DefaultAccount] Skipping extraKnownMarketplaces entry "${name}": source "${src.source}" requires ${src.source === 'github' ? '"repo"' : '"url"'}`);
		} else {
			onWarn?.(`[DefaultAccount] Skipping extraKnownMarketplaces entry "${name}": unknown source type "${src.source}"`);
		}
		if (normalized && !seen.has(name)) {
			seen.add(name);
			entries.push(normalized);
		}
	}
	return entries;
}
