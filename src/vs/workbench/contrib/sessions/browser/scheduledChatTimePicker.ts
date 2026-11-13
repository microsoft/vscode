/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scheduledChatTimePicker.css';
import { $, addDisposableListener, append, EventHelper, EventType, reset } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { SelectBoxNative } from '../../../../base/browser/ui/selectBox/selectBoxNative.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { parseScheduledChatTime } from '../common/scheduledChatRequest.js';

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
	const lastDay = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
	return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), lastDay));
}

function localDate(date: Date): string {
	return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

/** A month grid for choosing a day with the mouse or keyboard, following the WAI-ARIA date picker grid pattern. */
class ScheduledChatCalendar extends Disposable {
	private readonly onDidSelectEmitter = this._register(new Emitter<void>());
	readonly onDidSelect = this.onDidSelectEmitter.event;

	private readonly monthLabel: HTMLElement;
	private readonly body: HTMLElement;
	private readonly previousButton: Button;
	private readonly dates = new Map<HTMLElement, Date>();
	private month: Date;
	private focused: Date;

	constructor(container: HTMLElement, private selected: Date, private readonly minimum: Date) {
		super();
		const calendar = append(container, $('.scheduled-chat-calendar'));
		const header = append(calendar, $('.scheduled-chat-calendar-header'));
		const previousLabel = localize('sendLater.previousMonth', "Previous Month");
		this.previousButton = this._register(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: previousLabel, title: previousLabel }));
		this.previousButton.label = '$(chevron-left)';
		const labelId = `scheduled-chat-calendar-${generateUuid()}`;
		this.monthLabel = append(header, $('.scheduled-chat-calendar-month', { id: labelId, 'aria-live': 'polite' }));
		const nextLabel = localize('sendLater.nextMonth', "Next Month");
		const nextButton = this._register(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: nextLabel, title: nextLabel }));
		nextButton.label = '$(chevron-right)';

		const grid = append(calendar, $('.scheduled-chat-calendar-grid', { role: 'grid', 'aria-labelledby': labelId }));
		const weekdays = append(grid, $('.scheduled-chat-calendar-row', { role: 'row' }));
		for (let day = 0; day < 7; day++) {
			// January 1, 2023 was a Sunday.
			const weekday = new Date(2023, 0, 1 + day);
			append(weekdays, $('.scheduled-chat-calendar-weekday', {
				role: 'columnheader',
				'aria-label': weekday.toLocaleDateString(undefined, { weekday: 'long' }),
			}, weekday.toLocaleDateString(undefined, { weekday: 'narrow' })));
		}
		this.body = append(grid, $('.scheduled-chat-calendar-body', { role: 'rowgroup' }));

		this.month = new Date(selected.getFullYear(), selected.getMonth(), 1);
		this.focused = selected;
		this._register(this.previousButton.onDidClick(() => this.showMonth(-1)));
		this._register(nextButton.onDidClick(() => this.showMonth(1)));
		this._register(addDisposableListener(this.body, EventType.CLICK, event => {
			const cell = (event.target as HTMLElement).closest<HTMLElement>('[role="gridcell"]');
			const date = cell && this.dates.get(cell);
			if (date) {
				this.select(date);
			}
		}));
		this._register(addDisposableListener(this.body, EventType.KEY_DOWN, event => this.onKeyDown(event)));
		this.render();
	}

	get value(): Date {
		return this.selected;
	}

	focus(): void {
		this.cellFor(this.focused)?.focus();
	}

	private onKeyDown(event: KeyboardEvent): void {
		const moves: Record<string, (date: Date) => Date> = {
			ArrowLeft: date => addDays(date, -1),
			ArrowRight: date => addDays(date, 1),
			ArrowUp: date => addDays(date, -7),
			ArrowDown: date => addDays(date, 7),
			Home: date => addDays(date, -date.getDay()),
			End: date => addDays(date, 6 - date.getDay()),
			PageUp: date => addMonths(date, -1),
			PageDown: date => addMonths(date, 1),
		};
		if (event.key === 'Enter' || event.key === ' ') {
			this.select(this.focused);
		} else if (Object.hasOwn(moves, event.key)) {
			this.moveFocus(moves[event.key](this.focused));
		} else {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
	}

	private showMonth(offset: number): void {
		const focused = addMonths(this.focused, offset);
		this.focused = focused < this.minimum ? this.minimum : focused;
		this.month = new Date(this.focused.getFullYear(), this.focused.getMonth(), 1);
		this.render();
	}

	private moveFocus(date: Date): void {
		this.focused = date < this.minimum ? this.minimum : date;
		if (this.focused.getFullYear() !== this.month.getFullYear() || this.focused.getMonth() !== this.month.getMonth()) {
			this.month = new Date(this.focused.getFullYear(), this.focused.getMonth(), 1);
			this.render();
		} else {
			this.updateStates();
		}
		this.focus();
	}

	private select(date: Date): void {
		if (date < this.minimum) {
			return;
		}
		this.selected = date;
		this.focused = date;
		this.updateStates();
		this.onDidSelectEmitter.fire();
	}

	private cellFor(date: Date): HTMLElement | undefined {
		for (const [cell, candidate] of this.dates) {
			if (candidate.getTime() === date.getTime()) {
				return cell;
			}
		}
		return undefined;
	}

	private render(): void {
		this.monthLabel.textContent = this.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
		this.previousButton.enabled = this.month > this.minimum;
		this.dates.clear();
		reset(this.body);
		const firstWeekday = this.month.getDay();
		const days = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 0).getDate();
		for (let week = 0; week * 7 < firstWeekday + days; week++) {
			const row = append(this.body, $('.scheduled-chat-calendar-row', { role: 'row' }));
			for (let column = 0; column < 7; column++) {
				const day = week * 7 + column - firstWeekday + 1;
				const cell = append(row, $('.scheduled-chat-calendar-day', { role: 'gridcell' }));
				if (day < 1 || day > days) {
					continue;
				}
				const date = new Date(this.month.getFullYear(), this.month.getMonth(), day);
				cell.textContent = String(day);
				cell.setAttribute('aria-label', date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
				this.dates.set(cell, date);
			}
		}
		this.updateStates();
	}

	private updateStates(): void {
		const today = startOfDay(new Date()).getTime();
		for (const [cell, date] of this.dates) {
			const time = date.getTime();
			cell.tabIndex = time === this.focused.getTime() ? 0 : -1;
			cell.setAttribute('aria-selected', String(time === this.selected.getTime()));
			cell.setAttribute('aria-disabled', String(date < this.minimum));
			cell.classList.toggle('today', time === today);
		}
	}
}

export async function pickScheduledChatTime(quickInputService: IQuickInputService, anchor?: HTMLElement): Promise<Date | undefined> {
	const now = new Date();
	const formatTime = (date: Date) => date.toLocaleString(undefined, { timeZoneName: 'short' });
	const choices = [
		{ minutes: 5, label: localize('sendLater.fiveMinutes', "In 5 Minutes") },
		{ minutes: 10, label: localize('sendLater.tenMinutes', "In 10 Minutes") },
		{ minutes: 15, label: localize('sendLater.fifteenMinutes', "In 15 Minutes") },
		{ minutes: 30, label: localize('sendLater.thirtyMinutes', "In 30 Minutes") },
		{ minutes: 60, label: localize('sendLater.oneHour', "In 1 Hour") },
		{ minutes: 24 * 60, label: localize('sendLater.oneDay', "In 24 Hours") },
	].map(({ minutes, label }) => {
		const date = new Date(now.getTime() + minutes * 60_000);
		return { label, description: formatTime(date), date };
	});
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	tomorrow.setHours(9, 0, 0, 0);
	choices.push({ label: localize('sendLater.tomorrowMorning', "Tomorrow Morning"), description: formatTime(tomorrow), date: tomorrow });
	const picked = await quickInputService.pick([
		...choices,
		{ label: localize('sendLater.customTime', "Choose Date and Time..."), description: '', date: undefined },
	], {
		title: localize('sendLater.title', "Send Later"),
		placeHolder: localize('sendLater.pickTime', "Choose when to send. Times use this device's time zone."),
		anchor, anchorPosition: anchor ? 'above' : undefined,
	});
	if (!picked || picked.date) {
		return picked?.date;
	}

	const disposables = new DisposableStore();
	try {
		const picker = disposables.add(quickInputService.createQuickWidget());
		picker.title = localize('sendLater.customTitle', "Send Later - Date and Time");
		picker.anchor = anchor;
		picker.anchorPosition = anchor ? 'above' : undefined;
		const form = $('.scheduled-chat-time-picker');
		picker.widget = form;
		// Buttons blur themselves on Escape, which would close the picker without restoring focus to the invoking control.
		disposables.add(addDisposableListener(form, EventType.KEY_DOWN, event => {
			if (event.key === 'Escape') {
				EventHelper.stop(event, true);
				picker.hide();
			}
		}, true));

		const fields = append(form, $('.scheduled-chat-time-fields'));
		const initial = new Date((Math.floor(Date.now() / 900_000) + 1) * 900_000);
		const calendar = disposables.add(new ScheduledChatCalendar(fields, startOfDay(initial), startOfDay(new Date())));

		const timeColumn = append(fields, $('.scheduled-chat-time-column'));
		const timeLabel = append(timeColumn, $('.scheduled-chat-time-field'));
		append(timeLabel, $('span', undefined, localize('sendLater.time', "Time")));
		const times = Array.from({ length: 96 }, (_, index) => {
			const hours = Math.floor(index / 4);
			const minutes = index % 4 * 15;
			return {
				text: new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
				value: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
			};
		});
		let timeIndex = initial.getHours() * 4 + initial.getMinutes() / 15;
		const timeSelect = disposables.add(new SelectBoxNative([
			...times,
			{ text: localize('sendLater.exactTime', "Exact Time...") },
		], timeIndex, defaultSelectBoxStyles, { ariaLabel: localize('sendLater.time', "Time") }));
		timeSelect.render(append(timeLabel, $('.scheduled-chat-time-select')));

		const exactLabel = append(timeColumn, $('label.scheduled-chat-time-field'));
		append(exactLabel, $('span', undefined, localize('sendLater.exactTimeLabel', "Exact time")));
		const exactInput = disposables.add(new InputBox(exactLabel, undefined, {
			type: 'time', ariaLabel: localize('sendLater.exactTimeLabel', "Exact time"), inputBoxStyles: defaultInputBoxStyles,
		}));
		exactInput.value = times[timeIndex].value;
		exactLabel.hidden = true;

		const summary = append(form, $('.scheduled-chat-time-summary', { role: 'status' }));
		append(form, $('.scheduled-chat-time-hint', undefined, localize('sendLater.calendarHint', "Pick a day in the calendar and a time from the dropdown. Times use this device's time zone. The local agent host sends when available.")));
		const actions = append(form, $('.scheduled-chat-time-actions'));
		const scheduleButton = disposables.add(new Button(actions, defaultButtonStyles));
		scheduleButton.label = localize('sendLater.schedule', "Schedule");
		const cancelButton = disposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		cancelButton.label = localize('sendLater.cancel', "Cancel");
		const selectedDate = () => parseScheduledChatTime(`${localDate(calendar.value)} ${timeIndex < times.length ? times[timeIndex].value : exactInput.value}`);
		const update = () => {
			const date = selectedDate();
			const valid = !!date && date.getTime() > Date.now();
			scheduleButton.enabled = valid;
			summary.textContent = valid
				? localize('sendLater.summary', "Send {0}", formatTime(date))
				: localize('sendLater.invalidTime', "Choose a valid future date and time.");
		};
		disposables.add(calendar.onDidSelect(update));
		disposables.add(exactInput.onDidChange(update));
		disposables.add(timeSelect.onDidSelect(({ index }) => {
			timeIndex = index;
			exactLabel.hidden = index < times.length;
			if (!exactLabel.hidden) {
				exactInput.focus();
			}
			update();
		}));
		update();

		return await new Promise<Date | undefined>(resolve => {
			disposables.add(picker.onDidHide(() => resolve(undefined)));
			disposables.add(cancelButton.onDidClick(() => picker.hide()));
			disposables.add(scheduleButton.onDidClick(() => {
				update();
				if (scheduleButton.enabled) {
					resolve(selectedDate());
					picker.hide();
				}
			}));
			picker.show();
			calendar.focus();
		});
	} finally {
		disposables.dispose();
	}
}
