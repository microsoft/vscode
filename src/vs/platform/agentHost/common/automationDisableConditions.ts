/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { AutomationDisableConditionKind, type AutomationDisableCondition } from './state/protocol/channels-automation/state.js';

export function isAutomationAfterDate(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false;
	}
	const match = /^(?<date>\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
	if (!match || !Number.isFinite(Date.parse(value))) {
		return false;
	}
	const calendarDate = new Date(`${match.groups!.date}T00:00:00Z`);
	return Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === match.groups!.date;
}

export function getAutomationDisableConditionsError(value: unknown): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		return localize('automation.disableConditions.array', "Disable conditions must be an array. Use an empty array to clear all conditions.");
	}
	const kinds = new Set<string>();
	for (const condition of value) {
		if (!condition || typeof condition !== 'object'
			|| (condition.kind !== AutomationDisableConditionKind.AfterRuns && condition.kind !== AutomationDisableConditionKind.AfterDate)) {
			return localize('automation.disableConditions.kind', "Each disable condition must have kind 'afterRuns' or 'afterDate'.");
		}
		if (kinds.has(condition.kind)) {
			return localize('automation.disableConditions.duplicate', "Each disable condition kind may appear at most once.");
		}
		kinds.add(condition.kind);
		if (condition.kind === AutomationDisableConditionKind.AfterRuns
			&& (typeof condition.max !== 'number' || !Number.isSafeInteger(condition.max) || condition.max <= 0)) {
			return localize('automation.disableConditions.maxRuns', "The maximum number of scheduled runs must be a positive safe integer.");
		}
		if (condition.kind === AutomationDisableConditionKind.AfterDate && !isAutomationAfterDate(condition.date)) {
			return localize('automation.disableConditions.finalDate', "The final date must be a valid ISO 8601 timestamp with a time zone.");
		}
	}
	return undefined;
}

export function isAutomationDisableConditions(value: unknown): value is AutomationDisableCondition[] {
	return Array.isArray(value) && getAutomationDisableConditionsError(value) === undefined;
}

export function getAutomationMaxRuns(conditions: readonly AutomationDisableCondition[] | undefined): number | undefined {
	return conditions?.find(condition => condition.kind === AutomationDisableConditionKind.AfterRuns)?.max;
}

export function getAutomationAfterDate(conditions: readonly AutomationDisableCondition[] | undefined): string | undefined {
	return conditions?.find(condition => condition.kind === AutomationDisableConditionKind.AfterDate)?.date;
}

export function isAutomationAfterDateExpired(conditions: readonly AutomationDisableCondition[] | undefined, now = Date.now()): boolean {
	const date = getAutomationAfterDate(conditions);
	return date !== undefined && Date.parse(date) <= now;
}
