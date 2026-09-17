/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../base/common/errors.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { IWorkflowCheckRegistry, WorkflowCheckContext, WorkflowCheckResult, WorkflowValue } from './workflow.js';
import { isWorkflowTimeZone, resolveWorkflowBindings } from './workflowValidation.js';

const calendarCheckId = 'vscode.calendar/weekday-on-or-after@1';
const dayMs = 86_400_000;

export function registerWorkflowCalendarCheck(registry: IWorkflowCheckRegistry, now: () => number = Date.now): IDisposable {
	return registry.register({
		id: calendarCheckId,
		evaluate: async (context, token) => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			return checkCalendar(context, now());
		},
	});
}

export function parseWorkflowTimestamp(value: WorkflowValue | undefined): number | undefined {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
		return undefined;
	}
	const civil = Date.parse(`${value.slice(0, 19)}Z`);
	const timestamp = Date.parse(value);
	if (!Number.isFinite(civil) || new Date(civil).toISOString().slice(0, 19) !== value.slice(0, 19) || !Number.isFinite(timestamp)) {
		return undefined;
	}
	return timestamp;
}

function checkCalendar(context: WorkflowCheckContext, now: number): WorkflowCheckResult {
	const anchor = parseWorkflowTimestamp(context.inputs.anchor);
	if (anchor === undefined || !hasCheckedAnchor(context)) {
		return { kind: 'blocked', reason: localize('workflowCalendar.anchor', "The calendar condition requires a timestamp bound to an earlier checked checkpoint output, not a reported date or workflow input.") };
	}
	const { weekday, hour, minute = 0, offsetDays = 0 } = context.options;
	if (!integerInRange(weekday, 0, 6) || !integerInRange(hour, 0, 23) || !integerInRange(minute, 0, 59) || !integerInRange(offsetDays, 0, 6)
		|| Object.keys(context.options).some(key => !['weekday', 'hour', 'minute', 'offsetDays'].includes(key))) {
		return { kind: 'blocked', reason: localize('workflowCalendar.options', "The calendar condition needs a weekday (0–6), hour (0–23), minute (0–59), and optional following-day offset (0–6).") };
	}
	const timeZone = context.inputs.timeZone;
	let formatter: Intl.DateTimeFormat;
	try {
		if (!isWorkflowTimeZone(timeZone)) {
			throw new Error();
		}
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
			year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
		});
	} catch {
		return { kind: 'blocked', reason: localize('workflowCalendar.timeZone', "The calendar condition requires the user's IANA timezone, captured when the workflow starts. The host's timezone cannot be substituted.") };
	}
	const schedule = { anchor: new Date(anchor).toISOString(), timeZone, weekday, hour, minute, offsetDays };
	const previous = context.previousState;
	const dueAt = previous && Object.entries(schedule).every(([key, value]) => previous[key] === value)
		&& typeof previous.dueAt === 'number' && Number.isSafeInteger(previous.dueAt) && previous.dueAt >= 0
		? previous.dueAt
		: calendarDueAt(anchor, formatter, weekday, hour, minute, offsetDays);
	if (dueAt === undefined) {
		return { kind: 'blocked', reason: localize('workflowCalendar.missingTime', "The scheduled local time does not exist in the saved timezone. The workflow has not moved the schedule to another day.") };
	}
	const state = { ...schedule, dueAt };
	if (now >= dueAt) {
		return { kind: 'satisfied', output: state };
	}
	return {
		kind: 'waiting',
		reason: localize('workflowCalendar.waiting', "Waiting until {0} ({1}); the calendar date is anchored to the checked checkpoint.", formatter.format(dueAt), timeZone),
		retryAfterMs: dueAt - now,
		state,
	};
}

function hasCheckedAnchor(context: WorkflowCheckContext): boolean {
	const condition = context.checkpoint.type.startCondition;
	if (condition?.check !== calendarCheckId) {
		return false;
	}
	const checkBinding = condition.inputs?.anchor;
	const binding = checkBinding && hasKey(checkBinding, { input: true }) ? context.checkpoint.inputs[checkBinding.input] : checkBinding ?? context.checkpoint.inputs.anchor;
	if (!binding || !hasKey(binding, { checkpoint: true })) {
		return false;
	}
	const index = context.run.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === binding.checkpoint);
	const receipt = context.run.receipts[index];
	const completion = context.run.snapshot.checkpoints[index]?.type.completion;
	return index >= 0 && index < context.run.checkpointIndex && receipt?.checkpointId === binding.checkpoint
		&& receipt.provenance === 'checked' && completion?.kind === 'checked' && receipt.checkId === completion.check.check
		&& resolveWorkflowBindings({ anchor: binding }, {}, [receipt]).anchor === context.inputs.anchor;
}

function integerInRange(value: WorkflowValue | undefined, minimum: number, maximum: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function civilTime(timestamp: number, formatter: Intl.DateTimeFormat): number {
	const parts = new Map(formatter.formatToParts(timestamp).map(part => [part.type, part.value]));
	const date = new Date(0);
	date.setUTCFullYear(Number(parts.get('year')), Number(parts.get('month')) - 1, Number(parts.get('day')));
	date.setUTCHours(Number(parts.get('hour')), Number(parts.get('minute')), Number(parts.get('second')), 0);
	return date.getTime();
}

function calendarDueAt(anchor: number, formatter: Intl.DateTimeFormat, weekday: number, hour: number, minute: number, offsetDays: number): number | undefined {
	const date = new Date(civilTime(anchor, formatter));
	date.setUTCDate(date.getUTCDate() + (weekday - date.getUTCDay() + 7) % 7 + offsetDays);
	date.setUTCHours(hour, minute, 0, 0);
	const target = date.getTime();
	const candidates: number[] = [];
	// Sample both sides of timezone transitions; repeated local times use the earlier instant.
	for (const days of [-2, -1, 0, 1, 2]) {
		const sample = target + days * dayMs;
		const candidate = target - (civilTime(sample, formatter) - sample);
		if (civilTime(candidate, formatter) === target) {
			candidates.push(candidate);
		}
	}
	return candidates.length ? Math.min(...candidates) : undefined;
}
