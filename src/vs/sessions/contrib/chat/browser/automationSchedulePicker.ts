/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { AutomationInterval, IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';

/**
 * Time increments shown in the time picker, in minutes. 30 minutes keeps the
 * dropdown list short (48 entries) while still covering most scheduling
 * needs; users who need finer control can edit the automation from the
 * Automations editor.
 */
const TIME_INCREMENT_MINUTES = 30;

interface IIntervalOption {
	readonly interval: AutomationInterval;
	readonly label: string;
	readonly description: string;
	readonly icon: ThemeIcon;
}

const INTERVAL_OPTIONS: readonly IIntervalOption[] = [
	{
		interval: 'hourly',
		label: localize('automationSchedule.hourly', "Hourly"),
		description: localize('automationSchedule.hourly.desc', "Runs once every hour."),
		icon: Codicon.history,
	},
	{
		interval: 'daily',
		label: localize('automationSchedule.daily', "Daily"),
		description: localize('automationSchedule.daily.desc', "Runs once per day at the chosen time."),
		icon: Codicon.calendar,
	},
	{
		interval: 'weekly',
		label: localize('automationSchedule.weekly', "Weekly"),
		description: localize('automationSchedule.weekly.desc', "Runs once per week on the chosen day and time."),
		icon: Codicon.calendar,
	},
	{
		interval: 'manual',
		label: localize('automationSchedule.manual', "Manual"),
		description: localize('automationSchedule.manual.desc', "Never runs automatically; triggered manually."),
		icon: Codicon.debugStart,
	},
];

function getIntervalOption(interval: AutomationInterval): IIntervalOption {
	return INTERVAL_OPTIONS.find(o => o.interval === interval) ?? INTERVAL_OPTIONS[1];
}

const WEEKDAY_LABELS: readonly string[] = [
	localize('automationSchedule.day.sun', "Sunday"),
	localize('automationSchedule.day.mon', "Monday"),
	localize('automationSchedule.day.tue', "Tuesday"),
	localize('automationSchedule.day.wed', "Wednesday"),
	localize('automationSchedule.day.thu', "Thursday"),
	localize('automationSchedule.day.fri', "Friday"),
	localize('automationSchedule.day.sat', "Saturday"),
];

function formatTime12h(hour24: number, minute: number): string {
	const period = hour24 < 12 ? localize('automationSchedule.am', "AM") : localize('automationSchedule.pm', "PM");
	const hour12 = ((hour24 + 11) % 12) + 1;
	const minuteStr = minute.toString().padStart(2, '0');
	return localize('automationSchedule.timeFormat', "{0}:{1} {2}", hour12, minuteStr, period);
}

interface IIntervalPickerItem { readonly interval: AutomationInterval }
interface ITimePickerItem { readonly hour: number; readonly minute: number; readonly custom?: boolean }
interface IDayPickerItem { readonly day: number }

/**
 * Renders three inline pickers (interval, time, weekday) for configuring a
 * scheduled automation directly in the new-chat composer. The pickers live
 * next to the "Default approvals" toolbar so the user can pick a cadence
 * without leaving the composer.
 *
 * The time picker uses 12-hour format with AM/PM by convention. The day
 * picker is only shown for `weekly` schedules; the time picker is only
 * shown for `daily` and `weekly` schedules. {@link setVisible} toggles the
 * entire picker (used to hide it when the composer's kind picker is set to
 * "session").
 */
export class AutomationSchedulePicker extends Disposable {

	private readonly _interval = observableValue<AutomationInterval>(this, 'daily');
	private readonly _hour = observableValue<number>(this, 9);
	private readonly _minute = observableValue<number>(this, 0);
	private readonly _day = observableValue<number>(this, 1);

	readonly currentSchedule: IObservable<IAutomationSchedule> = derived(this, reader => ({
		interval: this._interval.read(reader),
		scheduleHour: this._hour.read(reader),
		scheduleMinute: this._minute.read(reader),
		scheduleDay: this._day.read(reader),
	}));

	private _container: HTMLElement | undefined;
	private _intervalTrigger: HTMLElement | undefined;
	private _timeSlot: HTMLElement | undefined;
	private _timeTrigger: HTMLElement | undefined;
	private _daySlot: HTMLElement | undefined;
	private _dayTrigger: HTMLElement | undefined;

	private _visible = true;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
	}

	render(container: HTMLElement): IDisposable {
		this._renderDisposables.clear();

		const root = dom.append(container, dom.$('.sessions-chat-automation-schedule'));
		this._container = root;
		this._renderDisposables.add({ dispose: () => root.remove() });

		this._intervalTrigger = this._createTrigger(
			root,
			'sessions-chat-automation-interval-picker',
			localize('automationSchedule.intervalAriaPrefix', "Schedule interval"),
			() => this._showIntervalPicker(),
		);
		this._refreshIntervalTrigger();

		this._timeSlot = dom.append(root, dom.$('.sessions-chat-automation-time-slot'));
		this._timeTrigger = this._createTrigger(
			this._timeSlot,
			'sessions-chat-automation-time-picker',
			localize('automationSchedule.timeAriaPrefix', "Schedule time"),
			() => this._showTimePicker(),
		);
		this._refreshTimeTrigger();

		this._daySlot = dom.append(root, dom.$('.sessions-chat-automation-day-slot'));
		this._dayTrigger = this._createTrigger(
			this._daySlot,
			'sessions-chat-automation-day-picker',
			localize('automationSchedule.dayAriaPrefix', "Schedule day"),
			() => this._showDayPicker(),
		);
		this._refreshDayTrigger();

		this._refreshSlotVisibility();
		this._applyVisibility();

		return this._renderDisposables;
	}

	setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}
		this._visible = visible;
		this._applyVisibility();
	}

	/** Hydrates the picker from an existing schedule (e.g. when editing). */
	setSchedule(schedule: IAutomationSchedule): void {
		transaction(tx => {
			this._interval.set(schedule.interval, tx);
			this._hour.set(this._clampHour(schedule.scheduleHour), tx);
			this._minute.set(this._snapMinute(schedule.scheduleMinute), tx);
			this._day.set(this._clampDay(schedule.scheduleDay), tx);
		});
		this._refreshIntervalTrigger();
		this._refreshTimeTrigger();
		this._refreshDayTrigger();
		this._refreshSlotVisibility();
	}

	private _applyVisibility(): void {
		if (!this._container) {
			return;
		}
		this._container.style.display = this._visible ? '' : 'none';
	}

	private _refreshSlotVisibility(): void {
		const interval = this._interval.get();
		if (this._timeSlot) {
			this._timeSlot.style.display = (interval === 'daily' || interval === 'weekly') ? '' : 'none';
		}
		if (this._daySlot) {
			this._daySlot.style.display = interval === 'weekly' ? '' : 'none';
		}
	}

	private _createTrigger(
		container: HTMLElement,
		slotClass: string,
		ariaPrefix: string,
		onActivate: () => void,
	): HTMLElement {
		const slot = dom.append(container, dom.$(`.sessions-chat-picker-slot.${slotClass}`));
		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		trigger.setAttribute('data-aria-prefix', ariaPrefix);

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				onActivate();
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				onActivate();
			}
		}));
		return trigger;
	}

	private _setTriggerContent(trigger: HTMLElement, icon: ThemeIcon, label: string): void {
		dom.clearNode(trigger);
		dom.append(trigger, renderIcon(icon));
		const labelSpan = dom.append(trigger, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;

		const ariaPrefix = trigger.getAttribute('data-aria-prefix') ?? '';
		trigger.ariaLabel = localize('automationSchedule.triggerAriaLabel', "{0}: {1}. Click to change.", ariaPrefix, label);
	}

	private _refreshIntervalTrigger(): void {
		if (!this._intervalTrigger) {
			return;
		}
		const option = getIntervalOption(this._interval.get());
		this._setTriggerContent(this._intervalTrigger, option.icon, option.label);
	}

	private _refreshTimeTrigger(): void {
		if (!this._timeTrigger) {
			return;
		}
		this._setTriggerContent(this._timeTrigger, Codicon.clock, formatTime12h(this._hour.get(), this._minute.get()));
	}

	private _refreshDayTrigger(): void {
		if (!this._dayTrigger) {
			return;
		}
		const day = this._clampDay(this._day.get());
		this._setTriggerContent(this._dayTrigger, Codicon.calendar, WEEKDAY_LABELS[day]);
	}

	private _showIntervalPicker(): void {
		if (!this._intervalTrigger || this.actionWidgetService.isVisible) {
			return;
		}
		const trigger = this._intervalTrigger;
		const current = this._interval.get();

		const items: IActionListItem<IIntervalPickerItem>[] = INTERVAL_OPTIONS.map(option => ({
			kind: ActionListItemKind.Action,
			label: option.label,
			description: option.description,
			group: { title: '', icon: option.icon },
			item: { interval: option.interval },
			disabled: false,
		}));
		// Mark the current selection via the action-widget's "checked" pseudo
		// is not supported on these items; users still get visual context from
		// the trigger label updating after selection.

		const delegate: IActionListDelegate<IIntervalPickerItem> = {
			onSelect: item => {
				this.actionWidgetService.hide();
				if (item.interval !== current) {
					this._interval.set(item.interval, undefined);
					this._refreshIntervalTrigger();
					this._refreshSlotVisibility();
				}
			},
			onHide: () => {
				trigger.setAttribute('aria-expanded', 'false');
				trigger.focus();
			},
		};

		trigger.setAttribute('aria-expanded', 'true');
		this.actionWidgetService.show<IIntervalPickerItem>(
			'automationIntervalPicker',
			false,
			items,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.item ? getIntervalOption(item.item.interval).label : '',
				getWidgetAriaLabel: () => localize('automationSchedule.intervalWidgetAriaLabel', "Schedule interval"),
			},
		);
	}

	private _showTimePicker(): void {
		if (!this._timeTrigger || this.actionWidgetService.isVisible) {
			return;
		}
		const trigger = this._timeTrigger;

		const items: IActionListItem<ITimePickerItem>[] = [];
		items.push({
			kind: ActionListItemKind.Action,
			label: localize('automationSchedule.customTime', "Custom\u2026"),
			group: { title: '', icon: Codicon.edit },
			item: { hour: this._hour.get(), minute: this._minute.get(), custom: true },
			disabled: false,
		});
		for (let hour = 0; hour < 24; hour++) {
			for (let minute = 0; minute < 60; minute += TIME_INCREMENT_MINUTES) {
				items.push({
					kind: ActionListItemKind.Action,
					label: formatTime12h(hour, minute),
					group: { title: '', icon: Codicon.clock },
					item: { hour, minute },
					disabled: false,
				});
			}
		}

		const delegate: IActionListDelegate<ITimePickerItem> = {
			onSelect: item => {
				this.actionWidgetService.hide();
				if (item.custom) {
					void this._promptForCustomTime();
					return;
				}
				transaction(tx => {
					this._hour.set(item.hour, tx);
					this._minute.set(item.minute, tx);
				});
				this._refreshTimeTrigger();
			},
			onHide: () => {
				trigger.setAttribute('aria-expanded', 'false');
				trigger.focus();
			},
		};

		trigger.setAttribute('aria-expanded', 'true');
		this.actionWidgetService.show<ITimePickerItem>(
			'automationTimePicker',
			false,
			items,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.item ? (item.item.custom ? localize('automationSchedule.customTime', "Custom\u2026") : formatTime12h(item.item.hour, item.item.minute)) : '',
				getWidgetAriaLabel: () => localize('automationSchedule.timeWidgetAriaLabel', "Schedule time"),
			},
		);
	}

	/**
	 * Prompts the user for a free-form time string and applies the parsed
	 * result to the picker. Accepts a flexible set of formats: ``9:15``,
	 * ``09:15``, ``9:15 AM``, ``9:15pm``, ``21:30``, ``9 AM``, etc. Returns
	 * silently if the user cancels.
	 */
	private async _promptForCustomTime(): Promise<void> {
		const initial = formatTime12h(this._hour.get(), this._minute.get());
		const result = await this.quickInputService.input({
			title: localize('automationSchedule.customTime.title', "Schedule time"),
			prompt: localize('automationSchedule.customTime.prompt', "Enter a time (e.g. 9:15 AM, 14:30)."),
			value: initial,
			validateInput: async value => {
				return parseTime(value) ? undefined : localize('automationSchedule.customTime.invalid', "Enter a time like ``9:15 AM`` or ``14:30``.");
			},
		});
		if (result === undefined) {
			return;
		}
		const parsed = parseTime(result);
		if (!parsed) {
			return;
		}
		transaction(tx => {
			this._hour.set(parsed.hour, tx);
			this._minute.set(parsed.minute, tx);
		});
		this._refreshTimeTrigger();
		this._timeTrigger?.focus();
	}

	private _showDayPicker(): void {
		if (!this._dayTrigger || this.actionWidgetService.isVisible) {
			return;
		}
		const trigger = this._dayTrigger;

		const items: IActionListItem<IDayPickerItem>[] = WEEKDAY_LABELS.map((label, day) => ({
			kind: ActionListItemKind.Action,
			label,
			group: { title: '', icon: Codicon.calendar },
			item: { day },
			disabled: false,
		}));

		const delegate: IActionListDelegate<IDayPickerItem> = {
			onSelect: item => {
				this.actionWidgetService.hide();
				this._day.set(this._clampDay(item.day), undefined);
				this._refreshDayTrigger();
			},
			onHide: () => {
				trigger.setAttribute('aria-expanded', 'false');
				trigger.focus();
			},
		};

		trigger.setAttribute('aria-expanded', 'true');
		this.actionWidgetService.show<IDayPickerItem>(
			'automationDayPicker',
			false,
			items,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.item ? WEEKDAY_LABELS[this._clampDay(item.item.day)] : '',
				getWidgetAriaLabel: () => localize('automationSchedule.dayWidgetAriaLabel', "Schedule day"),
			},
		);
	}

	private _clampHour(hour: number): number {
		if (!Number.isFinite(hour)) { return 9; }
		return Math.min(23, Math.max(0, Math.trunc(hour)));
	}

	private _snapMinute(minute: number): number {
		if (!Number.isFinite(minute)) { return 0; }
		// Custom-entered minutes (0-59) are preserved when hydrating from an
		// existing schedule. Only minutes that came from outside the valid
		// range get snapped to the nearest valid bucket.
		if (minute >= 0 && minute < 60) {
			return Math.trunc(minute);
		}
		const snapped = Math.round(minute / TIME_INCREMENT_MINUTES) * TIME_INCREMENT_MINUTES;
		return Math.min(60 - TIME_INCREMENT_MINUTES, Math.max(0, snapped));
	}

	private _clampDay(day: number): number {
		if (!Number.isFinite(day)) { return 1; }
		return Math.min(6, Math.max(0, Math.trunc(day)));
	}
}

/**
 * Parses a free-form user-entered time string into hour (0-23) and minute
 * (0-59). Accepts 12-hour formats (``9:15 AM``, ``9:15pm``, ``9 PM``) and
 * 24-hour formats (``21:30``, ``09:15``). Whitespace and case are ignored.
 * Returns ``undefined`` if the input cannot be parsed.
 *
 * Exported for unit testing.
 */
export function parseTime(input: string): { hour: number; minute: number } | undefined {
	if (!input) {
		return undefined;
	}
	const trimmed = input.trim().toUpperCase();
	// Matches: "9", "9:15", "09:15", with optional " AM"/" PM" suffix.
	const match = /^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/.exec(trimmed);
	if (!match) {
		return undefined;
	}
	let hour = parseInt(match[1], 10);
	const minute = match[2] !== undefined ? parseInt(match[2], 10) : 0;
	const period = match[3];

	if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
		return undefined;
	}

	if (period) {
		// 12-hour with AM/PM: hour must be 1-12.
		if (hour < 1 || hour > 12) {
			return undefined;
		}
		if (period === 'AM') {
			hour = hour === 12 ? 0 : hour;
		} else {
			hour = hour === 12 ? 12 : hour + 12;
		}
	} else {
		// 24-hour: hour must be 0-23.
		if (hour < 0 || hour > 23) {
			return undefined;
		}
	}

	return { hour, minute };
}
