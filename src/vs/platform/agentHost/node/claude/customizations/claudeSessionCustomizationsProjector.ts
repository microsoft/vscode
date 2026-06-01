/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISyncedCustomization } from '../../../common/agentPluginManager.js';
import type { Customization } from '../../../common/state/protocol/state.js';

/**
 * Project the union of (a) client-pushed customizations and
 * (b) the on-disk discovery bundle (server-provided) onto the
 * protocol's {@link Customization} surface.
 *
 * Client-pushed entries get the per-id enablement overlay applied
 * (`enablement.get(id) ?? customization.enabled`). The discovery
 * bundle is surfaced verbatim — it is a single synthetic plugin URI
 * pointing at an on-disk Open Plugin layout (`agents/`, `skills/`,
 * `commands/`, `rules/`) the workbench's plugin expander scans to
 * emit per-type child items. Per-file enablement happens
 * workbench-side; we surface only the bundle URI.
 */
export function projectSessionCustomizations(
	synced: readonly ISyncedCustomization[],
	enablement: ReadonlyMap<string, boolean>,
	discovered: Customization | undefined,
): readonly Customization[] {
	const result: Customization[] = [];

	for (const item of synced) {
		const enabled = enablement.get(item.customization.id) ?? item.customization.enabled;
		result.push({ ...item.customization, enabled });
	}

	if (discovered) {
		result.push(discovered);
	}

	return result;
}

