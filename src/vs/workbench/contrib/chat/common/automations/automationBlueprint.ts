/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseFrontMatter, YamlMapNode, YamlNode, YamlParseError } from '../../../../../base/common/yaml.js';
import { IAutomationDescriptor, IAutomationSchedule } from './automation.js';

export const AUTOMATION_BLUEPRINT_FILE_SUFFIX = '.automation.md';
export const AUTOMATION_BLUEPRINT_VERSION = 1;

const AUTOMATION_BLUEPRINT_ID_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const AUTOMATION_BLUEPRINT_PROPERTIES = new Set(['version', 'id', 'name', 'description', 'schedule']);
const AUTOMATION_BLUEPRINT_SCHEDULE_PROPERTIES = new Set(['interval', 'hour', 'minute', 'day']);

export type AutomationBlueprintParseErrorCode =
	| 'invalidFrontmatter'
	| 'unknownProperty'
	| 'invalidField'
	| 'unsupportedVersion'
	| 'invalidId'
	| 'missingPrompt';

export class AutomationBlueprintParseError extends Error {
	constructor(
		readonly code: AutomationBlueprintParseErrorCode,
		readonly property?: string,
	) {
		super(property ? `${code}: ${property}` : code);
	}
}

/** A portable Automation definition without execution authority or machine-specific target state. */
export interface IAutomationBlueprint {
	readonly version: typeof AUTOMATION_BLUEPRINT_VERSION;
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;
}

export function parseAutomationBlueprint(content: string): IAutomationBlueprint {
	const errors: YamlParseError[] = [];
	const document = parseFrontMatter(content, errors);
	if (!document?.header || document.header.type !== 'map' || errors.length > 0) {
		throw new AutomationBlueprintParseError('invalidFrontmatter');
	}

	assertKnownProperties(document.header, AUTOMATION_BLUEPRINT_PROPERTIES);
	const version = readRequiredInteger(document.header, 'version');
	if (version !== AUTOMATION_BLUEPRINT_VERSION) {
		throw new AutomationBlueprintParseError('unsupportedVersion', String(version));
	}

	const id = readRequiredString(document.header, 'id');
	if (id.length > 64 || !AUTOMATION_BLUEPRINT_ID_PATTERN.test(id)) {
		throw new AutomationBlueprintParseError('invalidId', id);
	}

	const name = readRequiredString(document.header, 'name');
	const description = readOptionalString(document.header, 'description');
	const schedule = readSchedule(document.header);
	const prompt = document.body.trim();
	if (!prompt) {
		throw new AutomationBlueprintParseError('missingPrompt');
	}

	return {
		version: AUTOMATION_BLUEPRINT_VERSION,
		id,
		name,
		...(description ? { description } : {}),
		prompt,
		schedule,
	};
}

export function serializeAutomationBlueprint(blueprint: IAutomationBlueprint): string {
	const lines = [
		'---',
		`version: ${AUTOMATION_BLUEPRINT_VERSION}`,
		`id: ${quoteYamlString(blueprint.id)}`,
		`name: ${quoteYamlString(blueprint.name)}`,
	];
	if (blueprint.description) {
		lines.push(`description: ${quoteYamlString(blueprint.description)}`);
	}
	lines.push('schedule:', `  interval: ${blueprint.schedule.interval}`);
	switch (blueprint.schedule.interval) {
		case 'daily':
			lines.push(`  hour: ${blueprint.schedule.scheduleHour}`, `  minute: ${blueprint.schedule.scheduleMinute}`);
			break;
		case 'weekly':
			lines.push(
				`  hour: ${blueprint.schedule.scheduleHour}`,
				`  minute: ${blueprint.schedule.scheduleMinute}`,
				`  day: ${blueprint.schedule.scheduleDay}`,
			);
			break;
	}
	lines.push('---', '', blueprint.prompt.trim(), '');
	return lines.join('\n');
}

export function automationToBlueprint(automation: IAutomationDescriptor): IAutomationBlueprint {
	return {
		version: AUTOMATION_BLUEPRINT_VERSION,
		id: createAutomationBlueprintId(automation.name),
		name: automation.name,
		prompt: automation.prompt,
		schedule: normalizeSchedule(automation.schedule),
	};
}

export function createAutomationBlueprintFileName(name: string): string {
	return `${createAutomationBlueprintId(name)}${AUTOMATION_BLUEPRINT_FILE_SUFFIX}`;
}

function createAutomationBlueprintId(name: string): string {
	const normalized = name
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9.-]+/g, '-')
		.replace(/--+|\.\.+/g, '-')
		.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
		.slice(0, 64)
		.replace(/[^a-z0-9]+$/g, '');
	return normalized || 'automation';
}

function normalizeSchedule(schedule: IAutomationSchedule): IAutomationSchedule {
	switch (schedule.interval) {
		case 'manual':
			return { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		case 'hourly':
			return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		case 'daily':
			return { interval: 'daily', scheduleHour: schedule.scheduleHour, scheduleMinute: schedule.scheduleMinute, scheduleDay: 0 };
		case 'weekly':
			return schedule;
	}
}

function readSchedule(root: YamlMapNode): IAutomationSchedule {
	const node = getProperty(root, 'schedule');
	if (!node || node.type !== 'map') {
		throw new AutomationBlueprintParseError('invalidField', 'schedule');
	}
	assertKnownProperties(node, AUTOMATION_BLUEPRINT_SCHEDULE_PROPERTIES, 'schedule.');

	const interval = readRequiredString(node, 'interval');
	switch (interval) {
		case 'manual':
			return { interval, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		case 'hourly':
			return { interval, scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		case 'daily':
			return {
				interval,
				scheduleHour: readScheduleInteger(node, 'hour', 0, 23),
				scheduleMinute: readScheduleInteger(node, 'minute', 0, 59),
				scheduleDay: 0,
			};
		case 'weekly':
			return {
				interval,
				scheduleHour: readScheduleInteger(node, 'hour', 0, 23),
				scheduleMinute: readScheduleInteger(node, 'minute', 0, 59),
				scheduleDay: readScheduleInteger(node, 'day', 0, 6),
			};
		default:
			throw new AutomationBlueprintParseError('invalidField', 'schedule.interval');
	}
}

function assertKnownProperties(node: YamlMapNode, known: ReadonlySet<string>, prefix = ''): void {
	const unknown = node.properties.find(property => !known.has(property.key.value));
	if (unknown) {
		throw new AutomationBlueprintParseError('unknownProperty', `${prefix}${unknown.key.value}`);
	}
}

function getProperty(node: YamlMapNode, name: string): YamlNode | undefined {
	return node.properties.find(property => property.key.value === name)?.value;
}

function readRequiredString(node: YamlMapNode, name: string): string {
	const value = readOptionalString(node, name);
	if (!value) {
		throw new AutomationBlueprintParseError('invalidField', name);
	}
	return value;
}

function readOptionalString(node: YamlMapNode, name: string): string | undefined {
	const property = getProperty(node, name);
	if (!property) {
		return undefined;
	}
	if (property.type !== 'scalar') {
		throw new AutomationBlueprintParseError('invalidField', name);
	}
	return property.value.trim();
}

function readRequiredInteger(node: YamlMapNode, name: string): number {
	const property = getProperty(node, name);
	if (!property || property.type !== 'scalar' || !/^-?\d+$/.test(property.value)) {
		throw new AutomationBlueprintParseError('invalidField', name);
	}
	const value = Number(property.value);
	if (!Number.isSafeInteger(value)) {
		throw new AutomationBlueprintParseError('invalidField', name);
	}
	return value;
}

function readScheduleInteger(node: YamlMapNode, name: string, minimum: number, maximum: number): number {
	const value = readRequiredInteger(node, name);
	if (value < minimum || value > maximum) {
		throw new AutomationBlueprintParseError('invalidField', `schedule.${name}`);
	}
	return value;
}

function quoteYamlString(value: string): string {
	return JSON.stringify(value);
}
