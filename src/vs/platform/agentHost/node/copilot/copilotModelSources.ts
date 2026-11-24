/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { NamedProviderConfig, ProviderModelConfig } from '@microsoft/copilot-sdk';
import { createHash } from 'crypto';
import { localize } from '../../../../nls.js';
import type { IAgentModelSource, IAgentModelSourceDescription } from '../../common/agent.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, getByokEndpointsCredentialOrigins, getByokEndpointsCredentialResource, readByokEndpointsDefinition, type IByokEndpointModel } from '../../common/byokModelSource.js';

/** The definition formats the Copilot agent reads registered model sources in. */
export const COPILOT_MODEL_SOURCE_FORMATS: readonly string[] = [BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT];

const MODEL_SOURCE_PROVIDER_PREFIX = 'modelsource~';

/** Whether `name` is the runtime provider of a registered model source's model. */
export function isModelSourceProviderName(name: string): boolean {
	return name.startsWith(MODEL_SOURCE_PROVIDER_PREFIX);
}

/** Whether `id` is the selection id of a registered model source's model, `<provider>/<model id>`. */
export function isModelSourceModelId(id: string): boolean {
	return id.startsWith(MODEL_SOURCE_PROVIDER_PREFIX) && id.includes('/');
}

/**
 * Whether a session on `modelId` asks for no reasoning summaries: the model is a
 * registered model source's Responses model in `config`. VS Code's BYOK providers
 * never ask for them, and OpenAI only returns them to verified organizations,
 * while the runtime asks every Responses model for them by default.
 */
export function omitsReasoningSummary(modelId: string | undefined, config: { readonly providers?: readonly NamedProviderConfig[]; readonly models?: readonly ProviderModelConfig[] }): boolean {
	if (!modelId || !isModelSourceModelId(modelId)) {
		return false;
	}
	const model = config.models?.find(candidate => `${candidate.provider}/${candidate.id}` === modelId);
	return !!model && config.providers?.find(candidate => candidate.name === model.provider)?.wireApi === 'responses';
}

/** One model of a registered model source, as the Copilot agent lists it and the runtime calls it. */
export interface ICopilotModelSourceModel {
	/** The registration's `id`. */
	readonly modelSourceId: string;
	/**
	 * The catalog id, `<provider>/<model id>`, which is also the runtime's
	 * selection id, so it never needs translating at the runtime boundary.
	 */
	readonly id: string;
	readonly model: IByokEndpointModel;
	/**
	 * Whether the runtime can call the model: its source has a credential, or needs none. Never true
	 * for a keyless Azure endpoint, which the runtime would authenticate with the machine's Azure identity.
	 */
	readonly servable: boolean;
	/** Whether the source is going away: only turns already running on the model may still call it. */
	readonly draining: boolean;
	readonly runtimeProvider: NamedProviderConfig;
	readonly runtimeModel: ProviderModelConfig;
}

/** Reads a registered model source's definition. Throws, with a message for the user, when the agent can't serve it. */
export function describeCopilotModelSource(source: Pick<IAgentModelSource, 'format' | 'definition'>): IAgentModelSourceDescription {
	if (source.format !== BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT) {
		throw new Error(localize('copilotModelSource.unsupportedFormat', "Copilot can't read model sources in the format {0}.", source.format));
	}
	const definition = readByokEndpointsDefinition(source.definition);
	const credentialResource = getByokEndpointsCredentialResource(definition);
	return credentialResource ? { credentialResource, credentialOrigins: getByokEndpointsCredentialOrigins(definition) } : {};
}

/**
 * The models of a registered model source. Each model has a runtime provider of
 * its own, since a group's models can use different endpoints. The provider's
 * name hashes the registration, the endpoint, and the upstream model, so a
 * model's id stays bound to them: a changed endpoint gets a new id, and an
 * unchanged one keeps its id across credential and other definition changes.
 */
export function getCopilotModelSourceModels(source: IAgentModelSource): readonly ICopilotModelSourceModel[] {
	const { models, requiresCredential } = readByokEndpointsDefinition(source.definition);
	return models.map(model => {
		const endpoint = model.endpoint;
		const chatCompletions = (endpoint.type === 'openai' || endpoint.type === 'azure') && endpoint.wireApi !== 'responses';
		const providerName = `${MODEL_SOURCE_PROVIDER_PREFIX}${createHash('sha256').update(JSON.stringify([source.id, source.format, endpoint.type, endpoint.wireApi ?? null, endpoint.baseUrl, endpoint.azureApiVersion ?? null, model.id])).digest('hex').slice(0, 16)}`;
		const supports = {
			// Unknown capabilities stay unknown, so the runtime applies its own defaults.
			...(model.vision !== undefined ? { vision: model.vision } : {}),
			...(model.toolCalling !== undefined ? { toolCalls: model.toolCalling } : {}),
			...(model.reasoningEfforts?.length ? { reasoningEffort: true } : {}),
		};
		return {
			modelSourceId: source.id,
			id: `${providerName}/${model.id}`,
			model,
			servable: source.credential ? true : !requiresCredential && endpoint.type !== 'azure',
			draining: source.draining === true,
			runtimeProvider: {
				name: providerName,
				type: endpoint.type,
				// The definition only gives OpenAI and Azure endpoints a wire API.
				...(endpoint.wireApi ? { wireApi: endpoint.wireApi } : {}),
				baseUrl: endpoint.baseUrl,
				...(endpoint.azureApiVersion ? { azure: { apiVersion: endpoint.azureApiVersion } } : {}),
				// A static key, never a header: the runtime redacts it, and may echo headers in errors.
				...(source.credential ? { apiKey: source.credential } : {}),
			},
			runtimeModel: {
				id: model.id,
				provider: providerName,
				modelId: model.id,
				...(model.name !== undefined ? { name: model.name } : {}),
				...(model.maxContextWindowTokens !== undefined ? { maxContextWindowTokens: model.maxContextWindowTokens } : {}),
				...(model.maxInputTokens !== undefined ? { maxPromptTokens: model.maxInputTokens } : {}),
				// On Chat Completions the runtime sends it as `max_tokens`, which reasoning models reject, while
				// VS Code's BYOK providers send no cap there.
				...(model.maxOutputTokens !== undefined && !chatCompletions ? { maxOutputTokens: model.maxOutputTokens } : {}),
				...(Object.keys(supports).length ? { capabilities: { supports } } : {}),
			},
		};
	});
}
