/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { IExtraKnownMarketplaceEntry, IStrictMarketplaceSource, extraKnownMarketplacesToConfigDict } from '../../../../base/common/managedSettings.js';
import { ManagedSettingValue } from '../../../../base/common/policy.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_STRICT_MARKETPLACES_KEY, flattenManagedSettings } from '../../../../platform/policy/common/copilotManagedSettings.js';

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
	readonly strictKnownMarketplaces?: readonly IStrictMarketplaceSource[];
	/** Any unknown keys in the response are accepted for forward compatibility. */
	readonly [key: string]: unknown;
}

/**
 * Descriptor for a structured (object/array) managed setting: one carried across both delivery
 * channels as a canonical JSON string under a single key. This table is the single place that
 * knows how to turn a server `managed_settings` response field into that canonical value, so
 * adding a structured key is one row here (plus its {@link IManagedSettingsResponse} field — the
 * `responseField` union is hand-maintained in sync with the interface's named fields, not
 * compiler-enforced, because the response's index signature widens `keyof` to `string`; the
 * `adaptManagedSettings` tests are the drift backstop — and the policy declaration that reads
 * the bag key).
 */
interface IStructuredManagedSetting {
	/** Canonical managed-settings bag key (the dot-path constant) the JSON string is stored under. */
	readonly key: string;
	/** Server response field this descriptor consumes; excluded from the scalar flatten and fed to `encode`. */
	readonly responseField: 'enabledPlugins' | 'extraKnownMarketplaces' | 'strictKnownMarketplaces';
	/**
	 * Normalize the raw server value into the canonical pre-stringify shape an admin authors via
	 * native MDM. Return `undefined` to omit the key (absent or malformed value). Note an empty
	 * array (the `strictKnownMarketplaces` lockdown case) is returned as-is, not omitted.
	 */
	readonly encode: (value: unknown, onWarn?: (msg: string) => void) => unknown;
}

const STRUCTURED_MANAGED_SETTINGS: readonly IStructuredManagedSetting[] = [
	{
		key: COPILOT_ENABLED_PLUGINS_KEY,
		responseField: 'enabledPlugins',
		encode: value => isObject(value) ? value : undefined,
	},
	{
		key: COPILOT_STRICT_MARKETPLACES_KEY,
		responseField: 'strictKnownMarketplaces',
		encode: value => Array.isArray(value) ? value : undefined,
	},
	{
		key: COPILOT_EXTRA_MARKETPLACES_KEY,
		responseField: 'extraKnownMarketplaces',
		encode: (value, onWarn) => extraKnownMarketplacesToConfigDict(normalizeExtraKnownMarketplaces(value, onWarn)),
	},
];

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
 * - Scalar leaves (`permissions.*` and any forward-compatible scalar keys) are
 *   flattened into dot-separated keys.
 * - Structured settings (declared in {@link STRUCTURED_MANAGED_SETTINGS}) are
 *   carried as canonical JSON strings under a single key each — the same shape an
 *   admin authors via native MDM. `PolicyConfiguration` parses the JSON back into
 *   the object-typed setting on read. `extraKnownMarketplaces` is normalized from
 *   the API's `Record<id, { source }>` map to the `{ [name]: url-or-shorthand }` dict.
 *
 * Malformed marketplace entries are dropped (with an optional warning via
 * {@link onWarn}) rather than throwing, so a bad enterprise settings file degrades
 * gracefully instead of blocking startup.
 *
 * Exported for unit-testing the shape transformation independently of network I/O.
 */
export function adaptManagedSettings(response: IManagedSettingsResponse, onWarn?: (msg: string) => void): Partial<IPolicyData> {
	// Spread + delete (not for..in + assignment) so the scalar remainder keeps exact `{ ...rest }`
	// semantics: it never triggers the inherited `__proto__` setter for a server-sent own
	// `__proto__` key, matching the original destructuring rest.
	const scalarRest: Record<string, unknown> = { ...response };
	for (const setting of STRUCTURED_MANAGED_SETTINGS) {
		delete scalarRest[setting.responseField];
	}

	const managedSettings: Record<string, ManagedSettingValue> = { ...flattenManagedSettings(scalarRest) };

	for (const setting of STRUCTURED_MANAGED_SETTINGS) {
		const encoded = setting.encode(response[setting.responseField], onWarn);
		if (encoded !== undefined) {
			managedSettings[setting.key] = JSON.stringify(encoded);
		}
	}

	return { managedSettings };
}

/**
 * Normalize the endpoint's `{ [id]: { source } }` marketplace map into the
 * {@link IExtraKnownMarketplaceEntry} array, preserving the marketplace `name`,
 * source discriminator, and any `ref`. Malformed or off-spec entries are dropped
 * (with an optional warning via {@link onWarn}).
 */
function normalizeExtraKnownMarketplaces(value: unknown, onWarn?: (msg: string) => void): IExtraKnownMarketplaceEntry[] | undefined {
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
