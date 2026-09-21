/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { IAgentModelInfo } from './agent.js';
import { isPlainRecord, parseAgentHostModelSelection } from './agentHostModelSelection.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import { ModelSelection, PolicyState } from './state/sessionState.js';
import { SessionConfigPropertySchema } from './state/protocol/commands.js';

export const CopilotModelTeamConfigKey = 'copilotModelTeam';
export const CopilotModelTeamRememberedConfigKey = 'copilotModelTeamRemembered';

export interface ICopilotModelTeam {
	readonly worker: ModelSelection;
	readonly scout?: ModelSelection;
}

const modelProperty: SessionConfigPropertySchema = {
	type: 'object',
	title: localize('modelTeam.modelTitle', "Model"),
	properties: {
		id: { type: 'string', title: localize('modelTeam.modelIdentifier', "Model Identifier") },
		config: { type: 'object', title: localize('modelTeam.modelConfiguration', "Model Configuration") },
	},
	required: ['id'],
};

const teamProperty: SessionConfigPropertySchema = {
	type: 'object',
	title: localize('modelTeam.configurationTitle', "Model Team"),
	description: localize('modelTeam.configurationDescription', "The Worker and optional Scout models. An empty object selects a single model. Changes apply before the next request."),
	properties: { worker: modelProperty, scout: modelProperty },
	sessionMutable: true,
};

export const copilotModelTeamSchema = createSchema({
	[CopilotModelTeamConfigKey]: schemaProperty<ICopilotModelTeam | Record<string, never>>(teamProperty),
	[CopilotModelTeamRememberedConfigKey]: schemaProperty<ICopilotModelTeam | Record<string, never>>({
		...teamProperty,
		title: localize('modelTeam.rememberedTitle', "Saved Model Team"),
		description: localize('modelTeam.rememberedDescription', "The helper models and settings remembered when Team is off. Saving these preferences does not enable a team."),
	}),
});

export function omitCopilotModelTeamConfig<T>(values: Record<string, T>): Record<string, T> {
	const result = { ...values };
	delete result[CopilotModelTeamConfigKey];
	delete result[CopilotModelTeamRememberedConfigKey];
	delete result.copilotModelTeamApplied;
	delete result.copilotModelTeamLeadApplied;
	delete result.copilotModelTeamSupport;
	return result;
}

/** Only an absent value or an empty object selects Single; malformed teams fail explicitly. */
export function parseCopilotModelTeam(value: unknown): ICopilotModelTeam | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isPlainRecord(value) || Object.keys(value).some(key => key !== 'worker' && key !== 'scout')) {
		throw new Error(localize('modelTeam.invalidConfiguration', "Invalid model team configuration."));
	}
	if (Object.keys(value).length === 0) {
		return undefined;
	}
	if (!Object.hasOwn(value, 'worker')) {
		throw new Error(localize('modelTeam.workerRequired', "A model team requires a Worker."));
	}
	const worker = parseAgentHostModelSelection(value.worker);
	const scout = !Object.hasOwn(value, 'scout') || value.scout === undefined ? undefined : parseAgentHostModelSelection(value.scout);
	return { worker, ...(scout ? { scout } : {}) };
}

export function validateCopilotModelTeam(team: ICopilotModelTeam, models: readonly IAgentModelInfo[]): void {
	parseCopilotModelTeam(team);
	for (const [role, selection] of [
		[localize('modelTeam.workerRole', "Worker"), team.worker],
		[localize('modelTeam.scoutRole', "Scout"), team.scout],
	] as const) {
		if (!selection) {
			continue;
		}
		const model = models.find(model => model.provider === 'copilotcli' && model.id === selection.id && model.policyState !== PolicyState.Disabled);
		if (!model) {
			throw new Error(localize('modelTeam.roleModelUnavailable', "The {0} model '{1}' is unavailable or disabled by policy. Choose a replacement in the model team's picker.", role, selection.id));
		}
		for (const [key, value] of Object.entries(selection.config ?? {})) {
			const property = model.configSchema?.properties[key];
			if (!property || property.readOnly || !schemaProperty(property).validate(value)) {
				throw new Error(localize('modelTeam.roleConfigurationUnavailable', "The {0} model '{1}' does not support the selected value for '{2}'.", role, selection.id, key));
			}
		}
		for (const key of model.configSchema?.required ?? []) {
			if (!Object.hasOwn(selection.config ?? {}, key)) {
				throw new Error(localize('modelTeam.roleConfigurationRequired', "The {0} model '{1}' requires a value for '{2}'.", role, selection.id, key));
			}
		}
	}
}
