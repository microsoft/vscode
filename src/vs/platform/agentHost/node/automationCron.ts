/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const MINUTE_MS = 60_000;
const MAX_SEARCH_MINUTES = 10 * 366 * 24 * 60;

const MONTH_NAMES = new Map([
	['JAN', 1],
	['FEB', 2],
	['MAR', 3],
	['APR', 4],
	['MAY', 5],
	['JUN', 6],
	['JUL', 7],
	['AUG', 8],
	['SEP', 9],
	['OCT', 10],
	['NOV', 11],
	['DEC', 12],
]);

const WEEKDAY_NAMES = new Map([
	['SUN', 0],
	['MON', 1],
	['TUE', 2],
	['WED', 3],
	['THU', 4],
	['FRI', 5],
	['SAT', 6],
]);

interface ICronField {
	readonly values: ReadonlySet<number>;
	readonly unrestricted: boolean;
}

interface IAutomationCron {
	readonly minute: ICronField;
	readonly hour: ICronField;
	readonly dayOfMonth: ICronField;
	readonly month: ICronField;
	readonly dayOfWeek: ICronField;
}

interface ILocalDateParts {
	readonly minute: number;
	readonly hour: number;
	readonly dayOfMonth: number;
	readonly month: number;
	readonly dayOfWeek: number;
}

export function validateAutomationCron(expression: string, timeZone: string): void {
	parseAutomationCron(expression);
	createDateFormatter(timeZone);
}

export function nextAutomationCronOccurrence(expression: string, timeZone: string, after: Date): Date {
	const cron = parseAutomationCron(expression);
	const formatter = createDateFormatter(timeZone);
	let candidate = Math.floor(after.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
	for (let iteration = 0; iteration < MAX_SEARCH_MINUTES; iteration++, candidate += MINUTE_MS) {
		if (matches(cron, readLocalDateParts(formatter, candidate))) {
			return new Date(candidate);
		}
	}
	throw new Error(`Automation schedule has no occurrence within ten years: ${expression}`);
}

function parseAutomationCron(expression: string): IAutomationCron {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new Error(`Automation schedule must contain exactly five fields: ${expression}`);
	}
	const cron: IAutomationCron = {
		minute: parseField(fields[0], 0, 59),
		hour: parseField(fields[1], 0, 23),
		dayOfMonth: parseField(fields[2], 1, 31),
		month: parseField(fields[3], 1, 12, MONTH_NAMES),
		dayOfWeek: parseField(fields[4], 0, 7, WEEKDAY_NAMES, value => value === 7 ? 0 : value),
	};
	if (!hasPossibleCalendarDay(cron)) {
		throw new Error(`Automation schedule cannot match a real calendar date: ${expression}`);
	}
	return cron;
}

function hasPossibleCalendarDay(cron: IAutomationCron): boolean {
	if (cron.dayOfMonth.unrestricted || !cron.dayOfWeek.unrestricted) {
		return true;
	}
	const maximumDayByMonth = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	for (const month of cron.month.values) {
		const maximumDay = maximumDayByMonth[month];
		for (const day of cron.dayOfMonth.values) {
			if (day <= maximumDay) {
				return true;
			}
		}
	}
	return false;
}

function parseField(
	field: string,
	minimum: number,
	maximum: number,
	names: ReadonlyMap<string, number> = new Map(),
	normalize: (value: number) => number = value => value,
): ICronField {
	const values = new Set<number>();
	for (const segment of field.split(',')) {
		if (!segment) {
			throw new Error(`Automation schedule contains an empty field segment: ${field}`);
		}
		const stepParts = segment.split('/');
		if (stepParts.length > 2) {
			throw new Error(`Automation schedule contains an invalid step: ${segment}`);
		}
		const step = stepParts[1] === undefined ? 1 : parsePositiveInteger(stepParts[1], segment);
		const base = stepParts[0];
		let start: number;
		let end: number;
		if (base === '*') {
			start = minimum;
			end = maximum;
		} else {
			const range = base.split('-');
			if (range.length === 1) {
				if (stepParts.length > 1) {
					throw new Error(`Automation schedule steps require '*' or a range: ${segment}`);
				}
				start = parseValue(range[0], minimum, maximum, names);
				end = start;
			} else if (range.length === 2) {
				start = parseValue(range[0], minimum, maximum, names);
				end = parseValue(range[1], minimum, maximum, names);
				if (start > end) {
					throw new Error(`Automation schedule ranges must be ascending: ${segment}`);
				}
			} else {
				throw new Error(`Automation schedule contains an invalid range: ${segment}`);
			}
		}
		for (let value = start; value <= end; value += step) {
			values.add(normalize(value));
		}
	}
	return { values, unrestricted: field === '*' };
}

function parseValue(value: string, minimum: number, maximum: number, names: ReadonlyMap<string, number>): number {
	const named = names.get(value.toUpperCase());
	const parsed = named ?? (/^\d+$/.test(value) ? Number(value) : Number.NaN);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`Automation schedule value is outside ${minimum}-${maximum}: ${value}`);
	}
	return parsed;
}

function parsePositiveInteger(value: string, segment: string): number {
	const parsed = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`Automation schedule step must be a positive integer: ${segment}`);
	}
	return parsed;
}

function createDateFormatter(timeZone: string): Intl.DateTimeFormat {
	try {
		return new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			weekday: 'short',
			hourCycle: 'h23',
		});
	} catch (error) {
		throw new Error(`Automation schedule uses an invalid time zone: ${timeZone}`, { cause: error });
	}
}

function readLocalDateParts(formatter: Intl.DateTimeFormat, timestamp: number): ILocalDateParts {
	const parts = new Map(formatter.formatToParts(timestamp).map(part => [part.type, part.value]));
	const weekday = WEEKDAY_NAMES.get((parts.get('weekday') ?? '').toUpperCase());
	if (weekday === undefined) {
		throw new Error('Automation schedule could not resolve the local weekday.');
	}
	return {
		minute: Number(parts.get('minute')),
		hour: Number(parts.get('hour')),
		dayOfMonth: Number(parts.get('day')),
		month: Number(parts.get('month')),
		dayOfWeek: weekday,
	};
}

function matches(cron: IAutomationCron, parts: ILocalDateParts): boolean {
	if (!cron.minute.values.has(parts.minute)
		|| !cron.hour.values.has(parts.hour)
		|| !cron.month.values.has(parts.month)) {
		return false;
	}
	const dayOfMonthMatches = cron.dayOfMonth.values.has(parts.dayOfMonth);
	const dayOfWeekMatches = cron.dayOfWeek.values.has(parts.dayOfWeek);
	if (cron.dayOfMonth.unrestricted) {
		return cron.dayOfWeek.unrestricted || dayOfWeekMatches;
	}
	if (cron.dayOfWeek.unrestricted) {
		return dayOfMonthMatches;
	}
	return dayOfMonthMatches || dayOfWeekMatches;
}
