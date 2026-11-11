/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IParsedReminder {
	readonly text: string;
	readonly at: string;
}

const numbers: Readonly<Record<string, number>> = {
	a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
	seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
	fifteen: 15, twenty: 20, thirty: 30, forty: 40, fortyfive: 45, sixty: 60,
};
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const relativeTime = String.raw`in (?:\d+|${Object.keys(numbers).join('|')}) (?:minutes?|hours?|days?)`;
const calendarTime = String.raw`(?:today|tomorrow|${weekdays.join('|')}|\d{4}-\d{2}-\d{2}) at \d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?`;
const timeClause = `(?:${relativeTime}|${calendarTime})`;
const leading = new RegExp(`^(?<time>${timeClause})\\s+(?:to\\s+)?(?<text>.+)$`, 'i');
const trailing = new RegExp(`^(?:to\\s+)?(?<text>.+?)\\s+(?<time>${timeClause})$`, 'i');

/** Returns no interpretation when the time needs an explicit choice. */
export function parseReminder(input: string, now: Date): IParsedReminder | undefined {
	const value = input.trim().replace(/^\/remind(?:\s+|$)/i, '').replace(/^me\s+/i, '');
	if (/\b(?:every|each)\s+(?:day|week|month|year|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value)) {
		return undefined;
	}
	const matches = [leading.exec(value), trailing.exec(value)].filter(match => match !== null);
	if (matches.length !== 1) {
		return undefined;
	}
	const { time, text } = matches[0].groups!;
	if (!text.trim() || new RegExp(`(?:^|\\s)${timeClause}$`, 'i').test(text)) {
		return undefined;
	}
	const date = parseReminderTime(time, now);
	return date ? { text: text.trim(), at: date.toISOString() } : undefined;
}

/** Parses the bounded reminder grammar, rejecting ambiguous local clock times. */
export function parseReminderTime(input: string, now: Date): Date | undefined {
	const value = input.trim().toLowerCase();
	const relative = /^in (?<amount>\d+|[a-z]+) (?<unit>minutes?|hours?|days?)$/.exec(value)?.groups;
	if (relative) {
		const amount = numbers[relative.amount] ?? Number(relative.amount);
		const unit = relative.unit.startsWith('minute') ? 60_000 : relative.unit.startsWith('hour') ? 3_600_000 : 86_400_000;
		const timestamp = now.getTime() + amount * unit;
		return Number.isSafeInteger(amount) && amount > 0 && Number.isFinite(new Date(timestamp).getTime()) ? new Date(timestamp) : undefined;
	}
	const match = /^(?<day>today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2}) at (?<hour>\d{1,2})(?::(?<minute>\d{2}))?\s*(?<period>am|pm)?$/.exec(value)?.groups;
	if (!match) {
		return undefined;
	}
	let hour = Number(match.hour);
	const minute = Number(match.minute ?? 0);
	if (minute > 59 || (match.period ? hour < 1 || hour > 12 : hour > 23 || (hour >= 1 && hour <= 12 && match.minute === undefined))) {
		return undefined;
	}
	if (match.period) {
		hour = hour % 12 + (match.period === 'pm' ? 12 : 0);
	}
	const date = new Date(now);
	if (match.day === 'tomorrow') {
		date.setDate(date.getDate() + 1);
	} else if (weekdays.includes(match.day)) {
		date.setDate(date.getDate() + ((weekdays.indexOf(match.day) - date.getDay() + 7) % 7 || 7));
	} else if (match.day !== 'today') {
		const [year, month, day] = match.day.split('-').map(Number);
		date.setFullYear(year, month - 1, day);
		if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
			return undefined;
		}
	}
	const expectedDay = date.getDate();
	date.setHours(hour, minute, 0, 0);
	if (date.getDate() !== expectedDay || date.getHours() !== hour || date.getMinutes() !== minute || date <= now) {
		return undefined;
	}
	// A repeated wall-clock time has two possible instants; require a different explicit time.
	for (const offset of [-120, -60, -30, 30, 60, 120]) {
		const other = new Date(date.getTime() + offset * 60_000);
		if (other.getFullYear() === date.getFullYear() && other.getMonth() === date.getMonth() && other.getDate() === date.getDate()
			&& other.getHours() === hour && other.getMinutes() === minute) {
			return undefined;
		}
	}
	return date;
}
