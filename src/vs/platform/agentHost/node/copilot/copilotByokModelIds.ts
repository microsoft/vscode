/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ProviderModelConfig } from '@microsoft/copilot-sdk';
import { createHash } from 'crypto';

/*
 * The runtime qualifies a BYOK model with its provider's name (`provider/id`),
 * and provider names cannot contain `/`. A model the runtime calls directly has
 * a provider of its own, so its runtime id differs from the `vendor/[group/]id`
 * the agent host advertises. These helpers translate between the two wherever
 * a model id crosses the runtime boundary.
 */

const directByokProviderNamePattern = /^(?<vendor>[^/~]+)~[0-9a-f]{16}$/;

/** The BYOK models a session registers, or is about to register. */
interface IByokModelRegistration {
	readonly models?: readonly ProviderModelConfig[];
}

/**
 * The runtime provider of a BYOK model the runtime calls directly. Each such
 * model gets a provider of its own, since models of one provider group can use
 * different endpoints and groups use different keys. The name only depends on
 * the model's identity, so a session resumed with the same model finds its
 * provider again, and a changed endpoint or key updates it in place.
 */
export function getDirectByokProviderName(vendor: string, localModelId: string): string {
	const suffix = createHash('sha256').update(`${vendor}/${localModelId}`).digest('hex').slice(0, 16);
	return `${vendor}~${suffix}`;
}

/** The vendor of a direct model's runtime provider name, else `undefined`. */
export function toAgentByokProviderId(providerName: string): string | undefined {
	return directByokProviderNamePattern.exec(providerName)?.groups?.vendor;
}

/**
 * The runtime selection id of the agent model `modelId` (`vendor/[group/]id`):
 * `<direct provider>/[group/]id` when `config` registers the model as a direct
 * model, else `modelId` itself.
 */
export function toRuntimeByokModelId(modelId: string, config: IByokModelRegistration): string;
export function toRuntimeByokModelId(modelId: string | undefined, config: IByokModelRegistration): string | undefined;
export function toRuntimeByokModelId(modelId: string | undefined, config: IByokModelRegistration): string | undefined {
	const separator = modelId?.indexOf('/') ?? -1;
	if (!modelId || separator <= 0) {
		return modelId;
	}
	const localModelId = modelId.slice(separator + 1);
	const provider = getDirectByokProviderName(modelId.slice(0, separator), localModelId);
	return config.models?.some(model => model.provider === provider && model.id === localModelId) ? `${provider}/${localModelId}` : modelId;
}

/**
 * The agent model id (`vendor/[group/]id`) of a runtime selection id, which
 * names a direct model by its own provider (see {@link toRuntimeByokModelId}).
 * Other ids are returned unchanged.
 */
export function toAgentByokModelId(modelId: string): string;
export function toAgentByokModelId(modelId: string | undefined): string | undefined;
export function toAgentByokModelId(modelId: string | undefined): string | undefined {
	const separator = modelId?.indexOf('/') ?? -1;
	if (!modelId || separator <= 0) {
		return modelId;
	}
	const vendor = toAgentByokProviderId(modelId.slice(0, separator));
	return vendor === undefined ? modelId : `${vendor}/${modelId.slice(separator + 1)}`;
}

/**
 * The runtime selection id of the agent model `modelId` on a live session. The
 * latest resolved BYOK config decides, so a model that moved between direct and
 * bridged routing takes its new route; the registered config covers a model the
 * latest resolution transiently omitted.
 */
export function resolveRuntimeByokModelId(modelId: string, latest: IByokModelRegistration, registered: IByokModelRegistration): string {
	const fromLatest = toRuntimeByokModelId(modelId, latest);
	if (fromLatest !== modelId || latest.models?.some(model => `${model.provider}/${model.id}` === modelId)) {
		return fromLatest;
	}
	return toRuntimeByokModelId(modelId, registered);
}

/** A runtime model snapshot, with a direct model named by its agent model id and vendor. */
export function toAgentByokCurrentModel<T extends { readonly modelId?: string; readonly providerId?: string }>(current: T): T {
	return {
		...current,
		...(current.modelId !== undefined ? { modelId: toAgentByokModelId(current.modelId) } : {}),
		...(current.providerId !== undefined ? { providerId: toAgentByokProviderId(current.providerId) ?? current.providerId } : {}),
	};
}
