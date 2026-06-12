/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { IExtraKnownMarketplaceEntry } from '../../../../base/common/managedSettings.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { flattenManagedSettings } from '../../../../platform/policy/common/copilotManagedSettings.js';

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
 * Adapt the `managed_settings` API response into the slice of {@link IPolicyData}
 * that the policy framework consumes. Primitive leaves are also normalized into
 * dot-separated `managedSettings` paths so policy definitions can evaluate the
 * same managed-settings keys across server and MDM delivery.
 *
 * `extraKnownMarketplaces` is converted from the API's `Record<id, { source }>`
 * map shape to a flat array of
 * {@link IExtraKnownMarketplaceEntry} objects, preserving the marketplace `name`
 * (used downstream as `displayLabel` so that `enabledPlugins["plugin@<name>"]`
 * keys resolve correctly), the source discriminator, and any `ref`.
 *
 * Each field is validated independently at runtime — malformed or off-spec
 * shapes are dropped (with an optional warning via {@link onWarn}) rather than
 * throwing, so a bad enterprise settings file degrades gracefully instead of
 * blocking startup.
 *
 * Exported for unit-testing the shape transformation independently of network I/O.
 */
export function adaptManagedSettings(response: IManagedSettingsResponse, onWarn?: (msg: string) => void): Partial<IPolicyData> {
	let extraKnownMarketplaces: readonly IExtraKnownMarketplaceEntry[] | undefined;
	if (isObject(response.extraKnownMarketplaces)) {
		const seen = new Set<string>();
		const entries: IExtraKnownMarketplaceEntry[] = [];
		for (const [name, entry] of Object.entries(response.extraKnownMarketplaces)) {
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
		extraKnownMarketplaces = entries;
	}

	return {
		managedSettings: flattenManagedSettings(response),
		enabledPlugins: isObject(response.enabledPlugins) ? response.enabledPlugins as Record<string, boolean> : undefined,
		extraKnownMarketplaces,
		strictKnownMarketplaces: typeof response.strictKnownMarketplaces === 'boolean' ? response.strictKnownMarketplaces : undefined,
	};
}
