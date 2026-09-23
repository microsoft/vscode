/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAutoModeTier, normalizeAutoModeTier, type AutoModeTier } from '../../common/autoModeTiers.js';
import { createAgentModelDefaultMeta } from '../../common/meta/agentModelDefaultMeta.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import type { ConfigPropertySchema } from '../../common/state/protocol/state.js';
import { isAutoModel } from './modelIdentifiers.js';
import { AutoTierConfigKey } from './copilotSessionLauncher.js';

/**
 * One managed model default from the Copilot runtime's `managedSettings.get`
 * (github/copilot-agent-runtime#22675), already resolved across managed-settings channels.
 */
export interface ICopilotManagedModelDefault {
	/** Value a new session applies when the caller does not choose one. */
	readonly value: string;
	/** `false` when policy locks the value. */
	readonly overridable: boolean;
	/** Managed-settings channel that supplied the value. */
	readonly source: string;
}

/** Managed model defaults for the model picker. */
export interface ICopilotManagedModelPolicy {
	/** The managed default model identifier, as configured. */
	readonly model?: ICopilotManagedModelDefault;
	/** The managed default Auto routing preference. */
	readonly autoTier?: ICopilotManagedModelDefault;
}

interface IManagedSettingsGetRpc {
	readonly managedSettings?: { readonly get?: (params: { readonly gitHubToken: string }) => Promise<unknown> };
}

/**
 * Fetches the managed model defaults for an account. Returns `undefined` when the bundled SDK
 * predates `managedSettings.get` (declared locally until the SDK publishes it) or when policy sets
 * no model defaults. Callers run this off the startup path: it can fetch server policy.
 */
export async function fetchCopilotManagedModelPolicy(rpc: object, gitHubToken: string): Promise<ICopilotManagedModelPolicy | undefined> {
	const managedSettings = (rpc as IManagedSettingsGetRpc).managedSettings;
	if (typeof managedSettings?.get !== 'function') {
		return undefined;
	}
	return readCopilotManagedModelPolicy(await managedSettings.get({ gitHubToken }));
}

/** Reads `modelPolicy` from a `managedSettings.get` result, ignoring malformed values. */
export function readCopilotManagedModelPolicy(result: unknown): ICopilotManagedModelPolicy | undefined {
	const modelPolicy = isObject(result) ? result['modelPolicy'] : undefined;
	if (!isObject(modelPolicy)) {
		return undefined;
	}
	const model = readManagedDefault(modelPolicy['model']);
	const autoTier = readManagedDefault(modelPolicy['autoTier']);
	if (!model && !autoTier) {
		return undefined;
	}
	return { ...(model ? { model } : {}), ...(autoTier ? { autoTier } : {}) };
}

function readManagedDefault(candidate: unknown): ICopilotManagedModelDefault | undefined {
	if (!isObject(candidate)) {
		return undefined;
	}
	const { value, overridable, source } = candidate;
	if (typeof value !== 'string' || value.length === 0 || typeof overridable !== 'boolean') {
		return undefined;
	}
	return { value, overridable, source: typeof source === 'string' ? source : 'unknown' };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The picker profile for a managed Auto tier, or `undefined` when the picker does not offer it. */
export function managedAutoModeTier(managed: ICopilotManagedModelDefault | undefined): AutoModeTier | undefined {
	const tier = normalizeAutoModeTier(managed?.value);
	return isAutoModeTier(tier) ? tier : undefined;
}

/**
 * Applies managed model defaults to the Copilot models published to the picker:
 * - the managed Auto tier becomes the Auto model's "Optimize for" default, locked when policy
 *   does not let users override it;
 * - the managed default model, matched by identifier among this provider's models, is marked
 *   as the default.
 * Returns the input unchanged when there is no policy.
 */
export function applyCopilotManagedModelPolicy(models: readonly IAgentModelInfo[], policy: ICopilotManagedModelPolicy | undefined, provider: string): readonly IAgentModelInfo[] {
	if (!policy) {
		return models;
	}
	const tier = managedAutoModeTier(policy.autoTier);
	const defaultModelId = policy.model?.value;
	return models.map(model => {
		if (model.provider !== provider) {
			return model;
		}
		let result = model;
		const tierProperty = model.configSchema?.properties[AutoTierConfigKey];
		if (tier && isAutoModel(model.id) && tierProperty && model.configSchema) {
			const property: ConfigPropertySchema = { ...tierProperty, default: tier, ...(policy.autoTier?.overridable === false ? { readOnly: true } : {}) };
			result = { ...result, configSchema: { ...model.configSchema, properties: { ...model.configSchema.properties, [AutoTierConfigKey]: property } } };
		}
		if (defaultModelId !== undefined && model.id === defaultModelId) {
			result = { ...result, _meta: { ...result._meta, ...createAgentModelDefaultMeta(true) } };
		}
		return result;
	});
}
