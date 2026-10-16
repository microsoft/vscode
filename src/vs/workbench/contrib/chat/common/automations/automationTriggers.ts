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

export type AutomationTriggerFamily = 'issue';

interface IEvent {
	readonly name: string;
	readonly type: string;
	readonly family: AutomationTriggerFamily;
	readonly label: string;
}

const events: readonly IEvent[] = [
	{ name: 'issues', type: 'opened', family: 'issue', label: localize('automation.event.issueCreated', "Issue created") },
	{ name: 'issue_assigned', type: 'assigned', family: 'issue', label: localize('automation.event.issueAssigned', "Issue assigned") },
	{ name: 'issue_labeled', type: 'labeled', family: 'issue', label: localize('automation.event.issueLabeled', "Issue labeled") },
	{ name: 'issue_comment', type: 'created', family: 'issue', label: localize('automation.event.issueComment', "Issue comment") },
	{ name: 'issue_closed', type: 'closed', family: 'issue', label: localize('automation.event.issueClosed', "Issue closed") },
	{ name: 'issue_reopened', type: 'reopened', family: 'issue', label: localize('automation.event.issueReopened', "Issue reopened") },
];

export interface IAutomationTriggerChoice extends IEvent {
	readonly fields: readonly IAutomationTriggerField[];
}

export function automationTriggerChoices(definitions: readonly AutomationTriggerDefinition[]): readonly IAutomationTriggerChoice[] {
	return definitions.flatMap(definition => {
		const name = definition.name ?? definition.id;
		const types = definition.fields.find(field => (field.name ?? field.id) === 'types')?.options;
		const fields = automationTriggerFields(definition);
		return fields ? events.filter(event => event.name === name && types?.includes(event.type)).map(event => ({ ...event, fields })) : [];
	});
}

export function automationTriggerFamily(triggers: Readonly<Record<string, AutomationTrigger>>): AutomationTriggerFamily | undefined {
	if (Object.values(triggers).some(trigger => !trigger.types?.length)) {
		return undefined;
	}
	const selected = Object.entries(triggers).flatMap(([name, trigger]) => trigger.types?.map(type => events.find(event => event.name === name && event.type === type)) ?? [undefined]);
	if (!selected.length || selected.some(event => !event) || selected.some(event => event?.family !== selected[0]?.family)) {
		return undefined;
	}
	return selected.length === 1 ? selected[0]?.family : undefined;
}

export function canEditAutomationTriggers(triggers: Readonly<Record<string, AutomationTrigger>>, choices: readonly IAutomationTriggerChoice[]): boolean {
	return automationTriggerFamily(triggers) !== undefined && Object.entries(triggers).every(([name, trigger]) =>
		trigger.types?.every(type => {
			const choice = choices.find(choice => choice.name === name && choice.type === type);
			return choice && !validateAutomationTriggerFields(choice.fields, trigger);
		}));
}

export function automationTriggerSummary(triggers: Readonly<Record<string, AutomationTrigger>>, compact = false): string | undefined {
	const entries = Object.entries(triggers);
	if (!entries.length || (entries.length === 1 && entries[0][0] === 'interval')) {
		return undefined;
	}
	const labels = entries.flatMap(([name, trigger]) => trigger.types?.length
		? trigger.types.map(type => events.find(event => event.name === name && event.type === type)?.label ?? `${name}: ${type}`)
		: [name]);
	return compact && labels.length > 1 ? localize('automation.trigger.multiple', "Multiple") : labels.join(', ');
}

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
