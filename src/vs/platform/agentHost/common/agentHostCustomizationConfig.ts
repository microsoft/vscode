/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import { type CustomizationRef } from './state/protocol/state.js';

/**
 * Well-known root-config keys used by the platform to configure agent-host
 * customizations.
 */
export const enum AgentHostConfigKey {
	/** Host-owned Open Plugins available to remote sessions. */
	Customizations = 'customizations',
}

export const agentHostCustomizationConfigSchema = createSchema({
	[AgentHostConfigKey.Customizations]: schemaProperty<CustomizationRef[]>({
		type: 'array',
		title: localize('agentHost.config.customizations.title', "Plugins"),
		description: localize('agentHost.config.customizations.description', "Plugins configured on this agent host and available to remote sessions."),
		default: [],
		items: {
			type: 'object',
			title: localize('agentHost.config.customizations.itemTitle', "Plugin"),
			properties: {
				uri: {
					type: 'string',
					title: localize('agentHost.config.customizations.uri', "Plugin URI"),
				},
				displayName: {
					type: 'string',
					title: localize('agentHost.config.customizations.displayName', "Name"),
				},
				description: {
					type: 'string',
					title: localize('agentHost.config.customizations.descriptionField', "Description"),
				},
			},
			required: ['uri', 'displayName'],
		},
	}),
});

export const defaultAgentHostCustomizationConfigValues = {
	[AgentHostConfigKey.Customizations]: [] as CustomizationRef[],
};

export function getAgentHostConfiguredCustomizations(values: Record<string, unknown> | undefined): readonly CustomizationRef[] {
	const raw = values?.[AgentHostConfigKey.Customizations];
	return agentHostCustomizationConfigSchema.validate(AgentHostConfigKey.Customizations, raw)
		? raw
		: defaultAgentHostCustomizationConfigValues[AgentHostConfigKey.Customizations];
}
