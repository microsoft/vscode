/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const runtimePluginEnablementMetaKey = 'vscode.runtimePluginEnablement';

/**
 * A plugin's enabled state as reported by a running agent runtime session.
 *
 * This is the runtime's effective state for that session (for example a
 * team-default plugin is enabled even though its persisted install record is
 * not), not a user decision.
 */
export interface IRuntimePluginEnablement {
	readonly name: string;
	readonly marketplace: string;
	readonly directSourceId?: string;
	readonly enabled: boolean;
}

function isRuntimePluginEnablement(value: unknown): value is IRuntimePluginEnablement {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Partial<Record<keyof IRuntimePluginEnablement, unknown>>;
	return typeof candidate.name === 'string' && candidate.name.length > 0
		&& typeof candidate.marketplace === 'string'
		&& (candidate.directSourceId === undefined || typeof candidate.directSourceId === 'string')
		&& typeof candidate.enabled === 'boolean';
}

/** Reads the runtime-reported plugin enablement, or `undefined` when absent or malformed. */
export function readRuntimePluginEnablement(source: { readonly _meta?: Record<string, unknown> }): readonly IRuntimePluginEnablement[] | undefined {
	const value = source._meta?.[runtimePluginEnablementMetaKey];
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.filter(isRuntimePluginEnablement).map(plugin => ({
		name: plugin.name,
		marketplace: plugin.marketplace,
		...(plugin.directSourceId !== undefined ? { directSourceId: plugin.directSourceId } : {}),
		enabled: plugin.enabled,
	}));
}

/** Returns `meta` with the runtime-reported plugin enablement replaced. */
export function withRuntimePluginEnablement(meta: Record<string, unknown> | undefined, plugins: readonly IRuntimePluginEnablement[]): Record<string, unknown> {
	return {
		...meta,
		[runtimePluginEnablementMetaKey]: plugins.map(plugin => ({
			name: plugin.name,
			marketplace: plugin.marketplace,
			...(plugin.directSourceId !== undefined ? { directSourceId: plugin.directSourceId } : {}),
			enabled: plugin.enabled,
		})),
	};
}
