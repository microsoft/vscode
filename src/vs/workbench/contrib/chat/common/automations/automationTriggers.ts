/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { AutomationTrigger, AutomationTriggerDefinition } from '../../../../../platform/github/common/missionControl/automations.js';

export interface IAutomationTriggerField {
	readonly name: string;
	readonly label: string;
	readonly scalar: boolean;
	readonly required: boolean;
	readonly options?: readonly string[];
}

const scalarFields = new Set(['query', 'body_substring']);
const arrayFields = new Set(['labels', 'assignees', 'paths', 'states']);
const preservedFields = new Set(['write_scope', 'allow_copilot_triggers']);

/** Returns undefined when the catalog requires controls this editor cannot represent. */
export function automationTriggerFields(definition: AutomationTriggerDefinition): readonly IAutomationTriggerField[] | undefined {
	const fields: IAutomationTriggerField[] = [];
	for (const field of definition.fields) {
		const name = field.name ?? field.id;
		if (name === 'types' || (name && preservedFields.has(name))) {
			continue;
		}
		if (!name || (!scalarFields.has(name) && !arrayFields.has(name))) {
			return undefined;
		}
		const scalar = scalarFields.has(name);
		if (field.type && field.type !== (scalar ? 'string' : 'string_array')) {
			return undefined;
		}
		fields.push({ name, label: field.label ?? definition.field_labels?.[name] ?? name, scalar, required: field.required, options: field.options });
	}
	return fields;
}

export function normalizeAutomationTriggerField(field: IAutomationTriggerField, value: string | readonly string[]): string | readonly string[] | undefined {
	if (field.scalar) {
		const text = (typeof value === 'string' ? value : value.join(', ')).trim();
		return text || undefined;
	}
	const values = (typeof value === 'string' ? value.split(',') : value).map(value => value.trim()).filter(Boolean);
	return values.length ? [...new Set(values)] : undefined;
}

export function validateAutomationTriggerFields(fields: readonly IAutomationTriggerField[], trigger: AutomationTrigger): string | undefined {
	for (const field of fields) {
		const value = trigger[field.name];
		const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
		if (field.required && !values.some(value => typeof value === 'string' && value.trim())) {
			return localize('automation.trigger.required', "{0} is required.", field.label);
		}
		if (value !== undefined && (field.scalar ? typeof value !== 'string' : !Array.isArray(value))
			|| values.some(value => typeof value !== 'string' || (field.options?.length && !field.options.includes(value)))) {
			return localize('automation.trigger.invalid', "Choose a supported value for {0}.", field.label);
		}
	}
	return undefined;
}
