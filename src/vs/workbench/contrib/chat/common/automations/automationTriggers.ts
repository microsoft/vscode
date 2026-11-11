/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { equals, stableStringify } from '../../../../../base/common/objects.js';
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
const fieldLabels: Readonly<Record<string, string>> = {
	query: localize('automation.trigger.query', "Query"),
	body_substring: localize('automation.trigger.body', "Comment text"),
	labels: localize('automation.trigger.labels', "Labels added"),
	assignees: localize('automation.trigger.assignees', "Assignees"),
	paths: localize('automation.trigger.paths', "Changed paths"),
	states: localize('automation.trigger.states', "Review states"),
};

export type AutomationTriggerFamily = 'issue' | 'pullRequest';

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
	{ name: 'pull_request_opened', type: 'opened', family: 'pullRequest', label: localize('automation.event.prOpened', "Pull request opened") },
	{ name: 'pull_request_synchronize', type: 'synchronize', family: 'pullRequest', label: localize('automation.event.prSynchronized', "Pull request synchronized") },
	{ name: 'pull_request_merged', type: 'merged', family: 'pullRequest', label: localize('automation.event.prMerged', "Pull request merged") },
	{ name: 'pull_request_assigned', type: 'assigned', family: 'pullRequest', label: localize('automation.event.prAssigned', "Pull request assigned") },
	{ name: 'pull_request_labeled', type: 'labeled', family: 'pullRequest', label: localize('automation.event.prLabeled', "Pull request labeled") },
	{ name: 'pull_request_ready_for_review', type: 'ready_for_review', family: 'pullRequest', label: localize('automation.event.prReady', "Pull request ready for review") },
	{ name: 'pull_request_closed', type: 'closed', family: 'pullRequest', label: localize('automation.event.prClosed', "Pull request closed") },
	{ name: 'pull_request_reopened', type: 'reopened', family: 'pullRequest', label: localize('automation.event.prReopened', "Pull request reopened") },
	{ name: 'pull_request_converted_to_draft', type: 'converted_to_draft', family: 'pullRequest', label: localize('automation.event.prDraft', "Pull request converted to draft") },
	{ name: 'pull_request_merge_conflict', type: 'conflicted', family: 'pullRequest', label: localize('automation.event.prConflict', "Pull request merge conflict") },
	{ name: 'pull_request_comment', type: 'timeline_comment', family: 'pullRequest', label: localize('automation.event.prTimelineComment', "Timeline comment") },
	{ name: 'pull_request_comment', type: 'review_comment', family: 'pullRequest', label: localize('automation.event.prReviewComment', "Review comment") },
	{ name: 'pull_request_review_submitted', type: 'submitted', family: 'pullRequest', label: localize('automation.event.prReviewSubmitted', "Review submitted") },
	{ name: 'pull_request_review_requested', type: 'requested', family: 'pullRequest', label: localize('automation.event.prReviewRequested', "Review requested") },
	{ name: 'pull_request_review_dismissed', type: 'dismissed', family: 'pullRequest', label: localize('automation.event.prReviewDismissed', "Review dismissed") },
	{ name: 'pull_request_review_thread_resolved', type: 'resolved', family: 'pullRequest', label: localize('automation.event.prThreadResolved', "Review thread resolved") },
	{ name: 'pull_request_review_thread_unresolved', type: 'unresolved', family: 'pullRequest', label: localize('automation.event.prThreadUnresolved', "Review thread unresolved") },
];

export interface IAutomationTriggerChoice extends IEvent {
	readonly fields: readonly IAutomationTriggerField[];
}

export interface IAutomationTriggerFieldGroup extends IAutomationTriggerField {
	readonly choices: readonly IAutomationTriggerChoice[];
}

export function automationTriggerChoices(definitions: readonly AutomationTriggerDefinition[]): readonly IAutomationTriggerChoice[] {
	const definitionsByName = new Map(definitions.flatMap(definition => {
		const name = definition.name ?? definition.id;
		const types = definition.fields.find(field => (field.name ?? field.id) === 'types')?.options;
		const fields = automationTriggerFields(definition);
		return name && fields ? [[name, { types, fields }] as const] : [];
	}));
	return events.flatMap(event => {
		const definition = definitionsByName.get(event.name);
		return definition?.types?.includes(event.type) ? [{ ...event, fields: definition.fields }] : [];
	});
}

export function hasAutomationEventTrigger(triggers: Readonly<Record<string, AutomationTrigger>>): boolean {
	return Object.keys(triggers).some(name => name === 'issues' || name.startsWith('issue_') || name.startsWith('pull_request'));
}

export function automationTriggerFieldGroups(choices: readonly IAutomationTriggerChoice[]): readonly IAutomationTriggerFieldGroup[] {
	const groups = new Map<string, IAutomationTriggerFieldGroup>();
	for (const choice of choices) {
		for (const field of choice.fields) {
			const key = stableStringify(field);
			const current = groups.get(key);
			groups.set(key, current ? {
				...current,
				choices: [...current.choices, choice],
			} : { ...field, choices: [choice] });
		}
	}
	return [...groups.values()];
}

export function automationTriggerFamily(triggers: Readonly<Record<string, AutomationTrigger>>): AutomationTriggerFamily | undefined {
	if (Object.values(triggers).some(trigger => !trigger.types?.length)) {
		return undefined;
	}
	const selected = Object.entries(triggers).flatMap(([name, trigger]) => trigger.types?.map(type => events.find(event => event.name === name && event.type === type)) ?? [undefined]);
	if (!selected.length || selected.some(event => !event) || selected.some(event => event?.family !== selected[0]?.family)) {
		return undefined;
	}
	return selected[0]?.family === 'pullRequest' || selected.length === 1 ? selected[0]?.family : undefined;
}

/** Keeps existing event entries intact when only the event selection changes. */
export function selectAutomationTriggerEvents(current: Readonly<Record<string, AutomationTrigger>>, selected: readonly IAutomationTriggerChoice[]): Readonly<Record<string, AutomationTrigger>> {
	const result: Record<string, AutomationTrigger> = {};
	for (const choice of selected) {
		const types = [...(result[choice.name]?.types ?? []), choice.type];
		result[choice.name] = { ...current[choice.name], types };
	}
	for (const [name, trigger] of Object.entries(result)) {
		if (current[name]?.types?.length === trigger.types?.length && current[name].types?.every(type => trigger.types?.includes(type))) {
			result[name] = current[name];
		}
	}
	for (const field of automationTriggerFieldGroups(selected)) {
		const names = [...new Set(field.choices.map(choice => choice.name))];
		const value = names.map(name => result[name]?.[field.name]).find(value => value !== undefined);
		if (value !== undefined) {
			for (const name of names) {
				if (!equals(result[name][field.name], value)) {
					result[name] = { ...result[name], [field.name]: value };
				}
			}
		}
	}
	return result;
}

export function canEditAutomationTriggers(triggers: Readonly<Record<string, AutomationTrigger>>, choices: readonly IAutomationTriggerChoice[]): boolean {
	if (automationTriggerFamily(triggers) === undefined) {
		return false;
	}
	const selected: IAutomationTriggerChoice[] = [];
	for (const [name, trigger] of Object.entries(triggers)) {
		for (const type of trigger.types ?? []) {
			const choice = choices.find(choice => choice.name === name && choice.type === type);
			if (!choice || validateAutomationTriggerFields(choice.fields, trigger)) {
				return false;
			}
			selected.push(choice);
		}
	}
	return automationTriggerFieldGroups(selected).every(field => {
		const values = [...new Set(field.choices.map(choice => choice.name))].map(name => triggers[name]?.[field.name]).filter(value => value !== undefined);
		return values.every(value => equals(value, values[0]));
	});
}

export function automationTriggerSummary(triggers: Readonly<Record<string, AutomationTrigger>>, compact = false): string | undefined {
	const entries = Object.entries(triggers);
	if (!entries.length || (entries.length === 1 && entries[0][0] === 'interval')) {
		return undefined;
	}
	const labels = events
		.filter(event => triggers[event.name]?.types?.includes(event.type))
		.map(event => event.label);
	for (const [name, trigger] of entries) {
		if (!trigger.types?.length) {
			labels.push(name);
			continue;
		}
		for (const type of trigger.types) {
			if (!events.some(event => event.name === name && event.type === type)) {
				labels.push(`${name}: ${type}`);
			}
		}
	}
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
		fields.push({ name, label: field.label ?? definition.field_labels?.[name] ?? fieldLabels[name] ?? name, scalar, required: field.required, options: field.options });
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
