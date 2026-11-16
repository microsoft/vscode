/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IPickOptions, IQuickInputHideEvent, IQuickInputService, IQuickPickItem, IQuickWidget, QuickInputHideReason, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { pickScheduledChatTime } from '../../browser/scheduledChatTimePicker.js';

suite('Scheduled chat time picker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	// Local midday mid-month, so rounding the suggestion up to the next quarter hour never crosses a day or month.
	const fixedNow = new Date(2030, 4, 15, 12, 0).getTime();
	const timedTest = (name: string, fn: () => Promise<void>) => test(name, () => runWithFakedTimers({ startTime: fixedNow }, fn));

	function create(preset?: string) {
		const onDidHide = store.add(new Emitter<IQuickInputHideEvent>());
		const shown = new DeferredPromise<void>();
		const container = document.body.appendChild($('div'));
		store.add(toDisposable(() => container.remove()));
		let choices: readonly IQuickPickItem[] = [];
		let focusedAtHide: Element | null | undefined;
		const picker = upcastPartial<IQuickWidget>({
			onDidHide: onDidHide.event,
			show: () => {
				container.appendChild(picker.widget as HTMLElement);
				shown.complete();
			},
			hide: () => {
				focusedAtHide = document.activeElement;
				onDidHide.fire({ reason: QuickInputHideReason.Gesture });
			},
			dispose: () => { container.replaceChildren(); },
		});
		const quickInput = new class extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
			override pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options: IPickOptions<T> & { canPickMany: false }): Promise<T | undefined>;
			override pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
			override async pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: IPickOptions<T>): Promise<T | T[] | undefined> {
				const picks = (await items).filter((item): item is T => item.type !== 'separator');
				choices = picks;
				const item = preset ? picks.find(item => item.label === preset) : picks.at(-1);
				return options?.canPickMany ? item && [item] : item;
			}
			override createQuickWidget() { return picker; }
		};
		const result = pickScheduledChatTime(quickInput);
		const ready = async () => {
			await shown.p;
			const query = (selector: string) => container.querySelector<HTMLElement>(selector)!;
			return {
				time: container.querySelector('select')!,
				exact: container.querySelector<HTMLInputElement>('input[type="time"]')!,
				previousMonth: container.querySelectorAll<HTMLElement>('.scheduled-chat-calendar-header .monaco-button')[0],
				nextMonth: container.querySelectorAll<HTMLElement>('.scheduled-chat-calendar-header .monaco-button')[1],
				schedule: query('.scheduled-chat-time-actions .monaco-button'),
				cancel: container.querySelectorAll<HTMLElement>('.scheduled-chat-time-actions .monaco-button')[1],
				summary: query('[role="status"]'),
				day: (day: number) => [...container.querySelectorAll<HTMLElement>('[role="gridcell"]')].find(cell => cell.textContent === String(day))!,
				focusedDay: () => container.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!,
				press: (key: string) => container.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
				selectTime: (index: number) => {
					const time = container.querySelector('select')!;
					time.selectedIndex = index;
					time.dispatchEvent(new InputEvent('change'));
				},
			};
		};
		return { result, ready, picker, get choices() { return choices; }, get focusedAtHide() { return focusedAtHide; } };
	}

	function today(offsetDays = 0, hours = 0, minutes = 0): Date {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hours, minutes);
	}

	timedTest('presets include short delays and tomorrow at local 9 AM with exact send times', async () => {
		const fixture = create('Tomorrow Morning');
		const date = await fixture.result;
		assert.deepStrictEqual({
			labels: fixture.choices.map(item => item.label),
			hasDescriptions: fixture.choices.slice(0, -1).every(item => !!item.description),
			date: date?.getTime(),
		}, {
			labels: ['In 5 Minutes', 'In 10 Minutes', 'In 15 Minutes', 'In 30 Minutes', 'In 1 Hour', 'In 24 Hours', 'Tomorrow Morning', 'Choose Date and Time...'],
			hasDescriptions: true,
			date: today(1, 9).getTime(),
		});
	});

	timedTest('calendar clicks and quarter-hour dropdown schedule a local time without text input', async () => {
		const fixture = create();
		const { nextMonth, day, selectTime, schedule, summary, time } = await fixture.ready();
		nextMonth.click();
		day(15).click();
		selectTime(38);
		const expected = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 15, 9, 30);
		const summaryText = summary.textContent;
		const selected = day(15).getAttribute('aria-selected');
		schedule.click();
		assert.deepStrictEqual({
			date: (await fixture.result)?.getTime(),
			options: time.options.length,
			selected,
			summary: summaryText,
		}, {
			date: expected.getTime(),
			options: 97,
			selected: 'true',
			summary: `Send ${expected.toLocaleString(undefined, { timeZoneName: 'short' })}`,
		});
	});

	timedTest('calendar keyboard navigation moves by day and week, stops at today, and selects with Enter', async () => {
		const fixture = create();
		const { press, focusedDay, previousMonth, selectTime, schedule } = await fixture.ready();
		for (let i = 0; i < 40; i++) {
			press('ArrowLeft');
		}
		const clampedToToday = focusedDay().getAttribute('aria-label');
		press('ArrowDown');
		press('ArrowRight');
		press('Enter');
		const focusFollowed = document.activeElement === focusedDay();
		selectTime(38);
		schedule.click();
		assert.deepStrictEqual({
			clampedToToday,
			focusFollowed,
			previousMonthEnabled: previousMonth.getAttribute('aria-disabled') !== 'true',
			date: (await fixture.result)?.getTime(),
		}, {
			clampedToToday: today().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
			focusFollowed: true,
			previousMonthEnabled: today(8).getMonth() !== today().getMonth(),
			date: today(8, 9, 30).getTime(),
		});
	});

	timedTest('exact time supports minutes outside the quarter-hour options', async () => {
		const fixture = create();
		const { nextMonth, day, selectTime, exact, schedule } = await fixture.ready();
		nextMonth.click();
		day(15).click();
		selectTime(96);
		const focused = document.activeElement === exact;
		exact.value = '09:37';
		exact.dispatchEvent(new InputEvent('input'));
		schedule.click();
		assert.deepStrictEqual({ focused, date: (await fixture.result)?.getTime() }, {
			focused: true, date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 15, 9, 37).getTime(),
		});
	});

	timedTest('past and incomplete times cannot be scheduled and expose a visible reason', async () => {
		const fixture = create();
		const { press, selectTime, exact, schedule, summary, cancel } = await fixture.ready();
		press('ArrowLeft');
		press('Enter');
		const state = () => ({ enabled: schedule.getAttribute('aria-disabled') !== 'true', reason: summary.textContent });
		selectTime(0);
		const past = state();
		selectTime(96);
		exact.value = '';
		exact.dispatchEvent(new InputEvent('input'));
		const incomplete = state();
		cancel.click();
		const invalid = { enabled: false, reason: 'Choose a valid future date and time.' };
		assert.deepStrictEqual({ past, incomplete, date: await fixture.result }, { past: invalid, incomplete: invalid, date: undefined });
	});

	timedTest('Escape on a picker button cancels while focus is still inside the picker', async () => {
		const fixture = create();
		const { nextMonth } = await fixture.ready();
		nextMonth.focus();
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		nextMonth.dispatchEvent(event);
		assert.deepStrictEqual({ date: await fixture.result, focusedAtHide: fixture.focusedAtHide === nextMonth, handled: event.defaultPrevented }, {
			date: undefined, focusedAtHide: true, handled: true,
		});
	});

	timedTest('dismissing the custom picker returns no date', async () => {
		const fixture = create();
		await fixture.ready();
		fixture.picker.hide();
		assert.strictEqual(await fixture.result, undefined);
	});
});
