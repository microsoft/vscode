/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { AgentHostConfigurationSyncScope, Extensions as ConfigurationExtensions, IAgentHostConfigurationSync, IConfigurationPropertySchema, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';
import { AgentHostResourceIdentity, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from './agentHostResourceService.js';

function getRegistry(): IConfigurationRegistry {
	return Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
}

/**
 * The schema a setting was registered with, looked up in both the visible and
 * the excluded buckets — settings hidden with `included: false` still mirror.
 */
function getPropertySchema(settingId: string): IConfigurationPropertySchema | undefined {
	const registry = getRegistry();
	return registry.getConfigurationProperties()[settingId] ?? registry.getExcludedConfigurationProperties()[settingId];
}

/** Whether `value` conforms to a JSON-schema `type` declaration. */
function matchesSchemaType(value: unknown, type: IConfigurationPropertySchema['type']): boolean {
	if (type === undefined) {
		return true;
	}
	if (Array.isArray(type)) {
		return type.some(candidate => matchesSchemaType(value, candidate));
	}
	switch (type) {
		case 'boolean': return typeof value === 'boolean';
		case 'string': return typeof value === 'string';
		case 'number': return typeof value === 'number';
		case 'integer': return typeof value === 'number' && Number.isInteger(value);
		case 'array': return Array.isArray(value);
		case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
		case 'null': return value === null;
		default: return true;
	}
}

/**
 * Resolves the *globally-scoped* value of `settingId`, ignoring any workspace or
 * folder value.
 *
 * The agent host root config is shared by every window connected to a host, so
 * forwarding a workspace value would let one window's workspace settings leak
 * into unrelated windows on a last-writer-wins basis. Resolution order mirrors
 * the platform's own precedence for the layers we keep — policy overrides
 * everything, then user (local merged with remote), then application.
 *
 * A layer whose value does not conform to the setting's declared `type` is
 * skipped, so a malformed `settings.json` entry falls through to the next layer
 * and ultimately to the registered default rather than being mirrored verbatim.
 * This mirrors how `AgentConfigurationService.getEffectiveValue` skips layers
 * that fail schema validation on the host side.
 */
export function getGlobalConfigurationValue<T>(configurationService: IConfigurationService, settingId: string): T | undefined {
	const inspected = configurationService.inspect<T>(settingId);
	const property = getPropertySchema(settingId);
	for (const value of [inspected.policyValue, inspected.userValue, inspected.applicationValue]) {
		if (value !== undefined && matchesSchemaType(value, property?.type)) {
			return value;
		}
	}
	// `inspect` reports the default from the default-configuration model, which is
	// built only from *visible* properties — a setting hidden with `included: false`
	// has no entry there. Fall back to the declared default so hidden and visible
	// settings mirror identically.
	return inspected.defaultValue ?? property?.default as T | undefined;
}

/**
 * Inspects the configured application-wide value of `settingId`, excluding the
 * registered default and workspace/folder layers.
 */
export function inspectValue<T>(configurationService: IConfigurationService, settingId: string): readonly [value: T, source: 'policyValue' | 'userValue' | 'applicationValue'] | undefined {
	const inspected = configurationService.inspect<T>(settingId);
	const property = getPropertySchema(settingId);
	const values = [
		['policyValue', inspected.policyValue],
		['userValue', inspected.userValue],
		['applicationValue', inspected.applicationValue],
	] as const;
	for (const [source, value] of values) {
		if (value !== undefined && matchesSchemaType(value, property?.type)) {
			return [value, source];
		}
	}
	return undefined;
}

/**
 * A setting that declares {@link IAgentHostConfigurationSync}, paired with the
 * setting id it was declared on.
 */
export interface IAgentHostConfigurationSyncEntry {
	readonly settingId: string;
	readonly sync: IAgentHostConfigurationSync;
}

export const enum AgentHostConfigurationSyncTarget {
	Local,
	RemoteExtensionHost,
	Remote,
}

export function getAgentHostConfigurationSyncTarget(identity: AgentHostResourceIdentity): AgentHostConfigurationSyncTarget {
	if (identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY) {
		return AgentHostConfigurationSyncTarget.Local;
	}
	return URI.parse(identity).scheme === Schemas.vscodeRemote
		? AgentHostConfigurationSyncTarget.RemoteExtensionHost
		: AgentHostConfigurationSyncTarget.Remote;
}

function includesTarget(scope: AgentHostConfigurationSyncScope | undefined, target: AgentHostConfigurationSyncTarget): boolean {
	switch (scope ?? AgentHostConfigurationSyncScope.All) {
		case AgentHostConfigurationSyncScope.All:
			return true;
		case AgentHostConfigurationSyncScope.Local:
			return target === AgentHostConfigurationSyncTarget.Local;
		case AgentHostConfigurationSyncScope.Ambient:
			return target === AgentHostConfigurationSyncTarget.Local || target === AgentHostConfigurationSyncTarget.RemoteExtensionHost;
	}
}

/**
 * Returns every setting that declares agent-host mirroring and applies to a host
 * of this target kind.
 */
export function getAgentHostConfigurationSyncEntries(target: AgentHostConfigurationSyncTarget): IAgentHostConfigurationSyncEntry[] {
	const entries: IAgentHostConfigurationSyncEntry[] = [];
	for (const [settingId, sync] of getRegistry().getAgentHostSyncConfigurations()) {
		if (!includesTarget(sync.scope, target)) {
			continue;
		}
		entries.push({ settingId, sync });
	}
	return entries;
}

/**
 * Reads the current globally-scoped value for `entry` and maps it through the
 * entry's transform, producing the single-key patch to merge into the agent
 * host's root config.
 */
export function resolveAgentHostConfigurationSyncValue(configurationService: IConfigurationService, entry: IAgentHostConfigurationSyncEntry): unknown {
	const value = getGlobalConfigurationValue(configurationService, entry.settingId);
	return entry.sync.transform ? entry.sync.transform(value) : value;
}

/**
 * Renders a mirrored value for logging, redacting anything that could carry
 * user content. Mirrored settings are registry-driven and may hold paths or
 * arbitrary strings, so only closed-set values (booleans, numbers, and declared
 * enum members) are printed verbatim.
 */
export function formatAgentHostConfigurationSyncValueForLog(settingId: string, value: unknown): string {
	if (typeof value === 'boolean' || typeof value === 'number') {
		return String(value);
	}
	const property = getPropertySchema(settingId);
	if (typeof value === 'string' && property?.enum?.includes(value)) {
		return value;
	}
	return `<${Array.isArray(value) ? 'array' : typeof value}>`;
}

/**
 * Builds the full root-config patch mirroring every applicable setting. Used on
 * connect and reconnect, where the host may be a freshly restarted process that
 * has none of these values.
 */
export function resolveAgentHostConfigurationSyncPatch(configurationService: IConfigurationService, target: AgentHostConfigurationSyncTarget): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	for (const entry of getAgentHostConfigurationSyncEntries(target)) {
		const value = resolveAgentHostConfigurationSyncValue(configurationService, entry);
		// A setting with no value in any global layer and no registered default has
		// nothing to mirror; leave the key absent so a previously stored host value
		// is preserved rather than clobbered with `undefined`.
		if (value !== undefined) {
			patch[entry.sync.key] = value;
		}
	}
	return patch;
}
