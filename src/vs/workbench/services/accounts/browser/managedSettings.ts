/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { isObject, isString } from '../../../../base/common/types.js';

/**
 * Response shape from the Copilot `/copilot_internal/managed_settings` endpoint.
 * The endpoint returns `.github/copilot/settings.json` content from the
 * enterprise's source org. An empty response (`{}`) is success and means
 * "no policy file present".
 *
 * Unknown keys are silently ignored via the index signature so the client is
 * forward-compatible with future additions to the registry schema.
 *
 * Exported for unit-testing the {@link adaptManagedSettings} shape transformation.
 */
export interface IManagedSettingsResponse {
	readonly enabledPlugins?: Record<string, boolean>;
	readonly extraKnownMarketplaces?: Record<string, {
		readonly source:
		| { readonly source: 'github'; readonly repo: string; readonly ref?: string }
		| { readonly source: 'git'; readonly url: string; readonly ref?: string };
	}>;
	readonly strictKnownMarketplaces?: boolean;
	/** Any unknown keys in the response are silently ignored for forward compatibility. */
	readonly [key: string]: unknown;
}

/**
 * Adapt the `managed_settings` API response into the slice of {@link IPolicyData}
 * that the policy framework consumes. `extraKnownMarketplaces` is flattened from
 * the API's `Record<id, { source }>` shape to the existing
 * `chat.plugins.extraMarketplaces` string-array shape (`<owner>/<repo>[#<ref>]`
 * for GitHub sources, `<url>[#<ref>]` for Git sources), deduplicated.
 *
 * Each field is validated independently at runtime — malformed or off-spec
 * shapes are dropped (with an optional warning via {@link onWarn}) rather than
 * throwing, so a bad enterprise settings file degrades gracefully instead of
 * blocking startup.
 *
 * Exported for unit-testing the shape transformation independently of network I/O.
 */
export function adaptManagedSettings(response: IManagedSettingsResponse, onWarn?: (msg: string) => void): Partial<IPolicyData> {
	let extraKnownMarketplaces: readonly string[] | undefined;
	if (isObject(response.extraKnownMarketplaces)) {
		// Set preserves insertion order and dedups for free.
		const flattened = new Set<string>();
		for (const [id, entry] of Object.entries(response.extraKnownMarketplaces)) {
			if (!isObject(entry) || !isObject(entry.source)) {
				onWarn?.(`[DefaultAccount] Skipping malformed extraKnownMarketplaces entry "${id}": expected { source: { source, repo|url } }`);
				continue;
			}
			const src = entry.source as { source?: string; repo?: string; url?: string; ref?: string };
			const suffix = src.ref ? `#${src.ref}` : '';
			if (src.source === 'github' && isString(src.repo)) {
				flattened.add(`${src.repo}${suffix}`);
			} else if (src.source === 'git' && isString(src.url)) {
				flattened.add(`${src.url}${suffix}`);
			} else if (src.source === 'github' || src.source === 'git') {
				onWarn?.(`[DefaultAccount] Skipping extraKnownMarketplaces entry "${id}": source "${src.source}" requires ${src.source === 'github' ? '"repo"' : '"url"'}`);
			} else {
				onWarn?.(`[DefaultAccount] Skipping extraKnownMarketplaces entry "${id}": unknown source type "${src.source}"`);
			}
		}
		extraKnownMarketplaces = [...flattened];
	}

	return {
		enabledPlugins: isObject(response.enabledPlugins) ? response.enabledPlugins as Record<string, boolean> : undefined,
		extraKnownMarketplaces,
		strictKnownMarketplaces: typeof response.strictKnownMarketplaces === 'boolean' ? response.strictKnownMarketplaces : undefined,
	};
}
