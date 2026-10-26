/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { IMultiSelectDropdownOptions, MultiSelectDropdown } from '../../browser/multiSelectDropdown.js';
import { ActionWidgetService, IActionWidgetService } from '../../browser/actionWidget.js';
import { registerActionWidgetTestKeybindings } from './actionWidgetTestUtils.js';

suite('MultiSelectDropdown', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(options: Partial<IMultiSelectDropdownOptions> = {}) {
		const container = dom.append(document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const anchor = dom.append(container, dom.$('button', { 'aria-expanded': 'false', 'aria-haspopup': 'menu' }, 'Choose'));
		const nextButton = dom.append(container, dom.$('button', undefined, 'Next'));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
			override readonly mainContainer = container;
			override readonly activeContainer = container;
			override readonly onDidLayoutContainer = Event.None;
			override getContainer(): HTMLElement { return container; }
		}());
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		const contextKeys = store.add(new MockContextKeyService());
		instantiationService.set(IContextKeyService, contextKeys);
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		const contextView = store.add(instantiationService.createInstance(ContextViewService));
		instantiationService.set(IContextViewService, contextView);
		const service = store.add(instantiationService.createInstance(ActionWidgetService));
		instantiationService.set(IActionWidgetService, service);
		store.add(registerActionWidgetTestKeybindings(container, contextKeys, instantiationService));
		const dropdown = store.add(instantiationService.createInstance(MultiSelectDropdown));
		const changes: (readonly string[])[] = [];
		let hides = 0;
		store.add(dropdown.onDidChangeSelection(value => changes.push(value)));
		store.add(dropdown.onDidHide(() => hides++));
		const showOptions: IMultiSelectDropdownOptions = {
			anchor, ariaLabel: 'Days', selectedIds: ['mon', 'fri'], sections: [
				{
					label: 'Weekdays', items: [
						{ id: 'mon', label: 'Monday' },
						{ id: 'wed', label: 'Wednesday' },
						{ id: 'fri', label: 'Friday', disabled: true },
					]
				},
				{ label: 'Weekend', items: [{ id: 'sat', label: 'Saturday' }] },
				{ label: 'Empty', items: [] },
			],
			...options,
		};
		dropdown.show(showOptions);
		const rows = () => [...container.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"], [role="option"]')];
		const row = (label: string) => rows().find(row => row.textContent?.includes(label))!;
		const key = (key: string, keyCode: number, target = document.activeElement!, isComposing = false) =>
			target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true, isComposing }));
		const filter = (value: string) => {
			const input = container.querySelector('input')!;
			input.value = value;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		};
		return { container, anchor, nextButton, dropdown, contextView, service, contextKeys, instantiationService, changes, showOptions, rows, row, key, filter, hides: () => hides };
	}

	test('renders sections, check states and menu semantics', () => {
		const { container, rows } = create();
		assert.deepStrictEqual({
			label: container.querySelector('[role="menu"]')?.getAttribute('aria-label'),
			sections: [...container.querySelectorAll('.group-header')].map(row => row.textContent),
			checks: rows().map(row => row.getAttribute('aria-checked')),
			labels: rows().map(row => row.getAttribute('aria-label')),
		}, {
			label: 'Days', sections: ['Weekdays', 'Weekend'], checks: ['true', 'false', 'true', 'false'],
			labels: ['Monday, Weekdays', 'Wednesday, Weekdays', 'Friday, Weekdays, disabled', 'Saturday, Weekend'],
		});
	});

	for (const modifier of ['shiftKey', 'ctrlKey', 'metaKey'] as const) {
		test(`${modifier} click toggles only the clicked item`, () => {
			const { dropdown, changes, row } = create();
			row('Wednesday').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, [modifier]: true }));
			row('Wednesday').dispatchEvent(new MouseEvent('mouseup', { bubbles: true, [modifier]: true }));
			row('Wednesday').dispatchEvent(new MouseEvent('click', { bubbles: true, [modifier]: true }));
			assert.deepStrictEqual({ changes, visible: dropdown.isVisible }, {
				changes: [['mon', 'wed', 'fri']], visible: true,
			});
		});
	}

	for (const searchable of [false, true]) {
		test(`mouse to keyboard keeps the clicked target with search ${searchable}`, async () => {
			const { container, row, key, changes, dropdown } = create({ searchable });
			if (searchable) {
				container.querySelector('input')!.dispatchEvent(new FocusEvent('blur'));
			}
			container.querySelector<HTMLElement>('.monaco-list')!.focus();
			row('Wednesday').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			row('Wednesday').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
			row('Wednesday').click();
			await Promise.resolve();
			key(' ', 32);
			await Promise.resolve();
			key('Enter', 13);
			await Promise.resolve();
			key('ArrowDown', 40);
			key('Enter', 13);
			assert.deepStrictEqual({ changes, visible: dropdown.isVisible }, {
				changes: [['mon', 'wed', 'fri'], ['mon', 'fri'], ['mon', 'wed', 'fri'], ['mon', 'wed', 'fri', 'sat']],
				visible: true,
			});
		});
	}

	test('click toggles repeatedly without closing; disabled rows do not toggle', () => {
		const { dropdown, changes, row } = create();
		row('Wednesday').click();
		row('Wednesday').click();
		row('Friday').click();
		row('Saturday').click();
		assert.deepStrictEqual({ changes, visible: dropdown.isVisible }, {
			changes: [['mon', 'wed', 'fri'], ['mon', 'fri'], ['mon', 'fri', 'sat']], visible: true,
		});
	});

	test('double click toggles exactly twice', async () => {
		const { dropdown, changes, row } = create();
		const click = (detail: number) => {
			row('Wednesday').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail }));
			row('Wednesday').dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail }));
			row('Wednesday').dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
		};

		click(1);
		await Promise.resolve();
		click(2);
		await Promise.resolve();
		row('Wednesday').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
		await Promise.resolve();

		assert.deepStrictEqual({ changes, visible: dropdown.isVisible }, {
			changes: [['mon', 'wed', 'fri'], ['mon', 'fri']], visible: true,
		});
	});

	test('shows dividers only between sections and no keyboard hint footer', () => {
		const { container, filter } = create({ searchable: true });
		container.style.setProperty('--vscode-editorHoverWidget-border', 'currentColor');
		const borders = () => [...container.querySelectorAll('.group-header, .separator')].map(row => parseFloat(dom.getWindow(row).getComputedStyle(row).borderTopWidth) > 0);
		assert.deepStrictEqual({
			borders: borders(),
			footer: container.querySelector('.action-list-footer'),
		}, { borders: [false, true, false], footer: null });
		filter('Saturday');
		assert.deepStrictEqual(borders(), []);
	});

	test('Enter and Space toggle, arrows skip disabled rows, Escape restores trigger focus', async () => {
		const { dropdown, changes, key, anchor, hides } = create();
		key('Enter', 13);
		key('ArrowDown', 40);
		key(' ', 32);
		key('ArrowDown', 40);
		key('Enter', 13);
		key('Escape', 27);
		await Promise.resolve();
		assert.deepStrictEqual({
			changes, visible: dropdown.isVisible, focused: document.activeElement === anchor,
			expanded: anchor.getAttribute('aria-expanded'), hides: hides(),
		}, { changes: [['fri'], ['wed', 'fri'], ['wed', 'fri', 'sat']], visible: false, focused: true, expanded: 'false', hides: 1 });
	});

	test('search follows ActionList header filtering and retains selection across no results', () => {
		const { row, rows, filter, changes, container, dropdown } = create({ searchable: true });
		filter('WED');
		row('Wednesday').click();
		const filtered = [...container.querySelectorAll('.group-header, .separator')].map(row => row.textContent);
		filter('no matching day');
		const empty = rows().length;
		filter('');
		assert.deepStrictEqual({
			filtered, empty, changes, visible: dropdown.isVisible, checks: rows().map(row => row.getAttribute('aria-checked')),
		}, { filtered: [], empty: 0, changes: [['mon', 'wed', 'fri']], visible: true, checks: ['true', 'true', 'true', 'false'] });
	});

	test('Space remains text input and IME key events do not toggle or dismiss', () => {
		const { key, changes, container, dropdown } = create({ searchable: true });
		const input = container.querySelector('input')!;
		input.dispatchEvent(new FocusEvent('focus'));
		const spaceDefault = key(' ', 32, input);
		key('Enter', 13, input, true);
		key('Escape', 27, input, true);
		assert.deepStrictEqual({ spaceDefault, changes, visible: dropdown.isVisible }, { spaceDefault: true, changes: [], visible: true });
	});

	test('closing and replacing emits hide once without selection events', async () => {
		const { dropdown, changes, showOptions, hides, anchor } = create();
		dropdown.show(showOptions);
		await Promise.resolve();
		dropdown.hide();
		dropdown.hide();
		await Promise.resolve();
		dropdown.show(showOptions);
		dropdown.dispose();
		assert.deepStrictEqual({ changes, hides: hides(), expanded: anchor.getAttribute('aria-expanded') }, { changes: [], hides: 2, expanded: 'false' });
	});

	test('external context view dismissal releases popup ownership', async () => {
		const { contextView, dropdown, hides } = create();
		contextView.hideContextView();
		await Promise.resolve();
		assert.deepStrictEqual({ visible: dropdown.isVisible, hides: hides() }, { visible: false, hides: 1 });
	});

	test('leaving the popup closes without stealing focus', async () => {
		const { container, nextButton, dropdown, hides } = create();
		const list = container.querySelector<HTMLElement>('.monaco-list')!;
		// Hidden Electron test windows do not emit native focus events.
		list.dispatchEvent(new FocusEvent('focus'));
		const hidden = new Promise<void>(resolve => store.add(dropdown.onDidHide(resolve)));
		nextButton.focus();
		list.dispatchEvent(new FocusEvent('blur'));
		await hidden;
		assert.deepStrictEqual({
			visible: dropdown.isVisible, hides: hides(), focused: document.activeElement === nextButton,
		}, { visible: false, hides: 1, focused: true });
	});

	test('reopening after external dismissal retains the replacement and its ownership', async () => {
		const { dropdown, contextView, showOptions } = create();
		store.add(Event.once(dropdown.onDidHide)(() => dropdown.show(showOptions)));
		contextView.hideContextView();
		await Promise.resolve();
		assert.strictEqual(dropdown.isVisible, true);
		dropdown.hide();
		assert.strictEqual(dropdown.isVisible, false);
	});

	test('disposing a replaced adapter does not close another client', () => {
		const { dropdown, instantiationService, showOptions, service, anchor } = create();
		const replacement = store.add(instantiationService.createInstance(MultiSelectDropdown));
		replacement.show({ ...showOptions, searchable: true });
		dropdown.dispose();
		const open = { visible: replacement.isVisible, service: service.isVisible, expanded: anchor.getAttribute('aria-expanded'), popup: anchor.getAttribute('aria-haspopup') };
		replacement.hide();
		assert.deepStrictEqual({ open, closed: { expanded: anchor.getAttribute('aria-expanded'), popup: anchor.getAttribute('aria-haspopup') } }, {
			open: { visible: true, service: true, expanded: 'true', popup: 'listbox' },
			closed: { expanded: 'false', popup: 'menu' },
		});
	});

	test('search exposes checked options and retains combobox focus after toggling', async () => {
		const { container, key, filter, changes } = create({ searchable: true });
		filter('Wed');
		const input = container.querySelector('input')!;
		const active = container.querySelector('[role="option"]')!;
		const state = {
			role: input.getAttribute('role'),
			active: input.getAttribute('aria-activedescendant') === active.id,
			multiple: container.querySelector('[role="listbox"]')?.getAttribute('aria-multiselectable'),
			checked: active.getAttribute('aria-checked'),
		};
		key('Enter', 13, input);
		await Promise.resolve();
		const updated = container.querySelector('[role="option"]')!;
		assert.deepStrictEqual({ state, changes, focused: dom.isActiveElement(input), active: input.getAttribute('aria-activedescendant') === updated.id, checked: updated.getAttribute('aria-checked') }, {
			state: { role: 'combobox', active: true, multiple: 'true', checked: 'false' },
			changes: [['mon', 'wed', 'fri']],
			focused: true, active: true, checked: 'true',
		});
	});

	test('long lists start at the section heading and scroll without losing selection', () => {
		const { container, rows, key, changes, dropdown } = create({
			sections: [{ label: 'Tools', items: Array.from({ length: 60 }, (_, i) => ({ id: String(i), label: `Tool ${i}` })) }],
			selectedIds: [],
		});
		const initialTop = container.querySelector<HTMLElement>('.monaco-list-rows')!.style.top;
		for (let i = 0; i < 55; i++) {
			key('ArrowDown', 40);
		}
		const beforeToggle = container.querySelector<HTMLElement>('.monaco-list-rows')!.style.top;
		key(' ', 32);
		assert.deepStrictEqual({
			initialTop, scrollPreserved: container.querySelector<HTMLElement>('.monaco-list-rows')!.style.top === beforeToggle,
			scrolled: parseFloat(beforeToggle) < 0, virtualized: rows().length < 60, changes, visible: dropdown.isVisible,
		}, { initialTop: '0px', scrollPreserved: true, scrolled: true, virtualized: true, changes: [['55']], visible: true });
	});

	test('invalid identities fail before replacing the open popup', () => {
		const { dropdown, showOptions } = create();
		assert.throws(() => dropdown.show({ ...showOptions, selectedIds: ['missing'] }), /known selected ids/);
		assert.throws(() => dropdown.show({ ...showOptions, sections: [...showOptions.sections, showOptions.sections[0]] }), /unique/);
		assert.strictEqual(dropdown.isVisible, true);
	});

	test('empty collections can still be dismissed', () => {
		const { rows, dropdown, key, container } = create({ sections: [], selectedIds: [], searchable: true });
		assert.strictEqual(rows().length, 0);
		key('Escape', 27, container.querySelector('input')!);
		assert.strictEqual(dropdown.isVisible, false);
	});
});
