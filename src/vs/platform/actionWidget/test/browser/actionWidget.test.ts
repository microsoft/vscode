/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../base/browser/dom.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { AnchorPosition } from '../../../../base/common/layout.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { getSingletonServiceDescriptors } from '../../../instantiation/common/extensions.js';
import { createServices, TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { ActionListItemKind, IActionListItem } from '../../browser/actionList.js';
import { ActionWidgetService, IActionWidgetService } from '../../browser/actionWidget.js';

suite('ActionWidgetService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function showWidget(filterAsCombobox?: boolean) {
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IActionWidgetService)?.[1];
		assert.ok(descriptor);
		const container = document.createElement('div');
		container.style.cssText = 'position: relative; width: 400px; height: 400px;';
		document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		const anchor = container.appendChild(document.createElement('button'));
		anchor.style.cssText = 'position: absolute; bottom: 0; width: 100px; height: 22px;';
		const instantiationService = createServices(disposables.add(new DisposableStore()), [
			[IActionWidgetService, descriptor.ctor],
			[IContextViewService, ContextViewService],
			[IContextKeyService, MockContextKeyService],
			[IKeybindingService, MockKeybindingService],
			[IHoverService, NullHoverService],
			[IOpenerService, NullOpenerService],
			[ILayoutService, upcastPartial<ILayoutService>({
				getContainer: () => container,
				mainContainer: container,
				activeContainer: container,
				onDidLayoutContainer: Event.None,
			})],
		]);
		const service = instantiationService.get(IActionWidgetService);
		const selected: string[] = [];
		const cancelled: (boolean | undefined)[] = [];
		service.show('test', false, ['first match', 'second match'].map(id => ({
			kind: ActionListItemKind.Action,
			label: id,
			item: { id },
		})), {
			onSelect: item => {
				selected.push(item.id);
				service.hide();
			},
			onHide: didCancel => cancelled.push(didCancel),
		}, anchor, undefined, [], undefined, {
			showFilter: true,
			focusFilterOnOpen: true,
			initialFilterValue: 'match',
			filterAsCombobox,
		});
		const input = instantiationService.get(IContextViewService).getContextViewElement().querySelector<HTMLInputElement>('input');
		assert.ok(input);
		return { service, input, selected, cancelled };
	}

	for (const filterAsCombobox of [undefined, true]) {
		test(`only combobox popups handle Escape before the shared keybindings: ${filterAsCombobox}`, () => {
			const { service, input, cancelled } = showWidget(filterAsCombobox);
			const escape = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
			input.dispatchEvent(escape);

			assert.deepStrictEqual({
				visible: service.isVisible,
				defaultPrevented: escape.defaultPrevented,
				cancelled,
			}, {
				visible: !filterAsCombobox,
				defaultPrevented: !!filterAsCombobox,
				cancelled: filterAsCombobox ? [true] : [],
			});
			service.hide();
		});
	}

	test('search navigation keeps input focus and Enter accepts and closes the popup', () => {
		const { service, input, selected } = showWidget(true);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true }));
		const inputFocusedAfterNavigation = document.activeElement === input;
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

		assert.deepStrictEqual({
			inputFocusedAfterNavigation,
			selected,
			visible: service.isVisible,
		}, {
			inputFocusedAfterNavigation: true,
			selected: ['second match'],
			visible: false,
		});
	});

	test('Escape does not dismiss the combobox popup during composition', () => {
		const { service, input, cancelled } = showWidget(true);
		input.dispatchEvent(new globalThis.Event('compositionstart'));
		const escape = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
		input.dispatchEvent(escape);

		assert.deepStrictEqual({
			visible: service.isVisible,
			defaultPrevented: escape.defaultPrevented,
			cancelled,
		}, { visible: true, defaultPrevented: false, cancelled: [] });
		service.hide();
	});

	function setup() {
		const container = dom.append(document.body, dom.$('div'));
		disposables.add({ dispose: () => container.remove() });
		const layout = disposables.add(new Emitter<{ container: HTMLElement; dimension: dom.IDimension }>());
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
			override readonly mainContainer = container;
			override readonly activeContainer = container;
			override readonly onDidLayoutContainer = layout.event;
			override getContainer() { return container; }
		}());
		instantiationService.set(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		const contextView = disposables.add(instantiationService.createInstance(ContextViewService));
		instantiationService.set(IContextViewService, contextView);
		const service = disposables.add(instantiationService.createInstance(ActionWidgetService));
		return { container, layout, service };
	}

	test('closes an inline permission action once before focusing a warning dialog', () => {
		const { container, service } = setup();
		const trigger = dom.append(container, dom.$('button'));
		const warning = dom.append(container, dom.$('button'));
		const events: string[] = [];
		service.show('permissions', false, [{
			kind: ActionListItemKind.Action,
			label: 'Permissions',
			item: toAction({ id: 'permissions', label: 'Permissions', run: () => { } }),
			section: 'permissions',
			isSectionToggle: true,
		}, {
			kind: ActionListItemKind.Action,
			label: 'Allow All',
			section: 'permissions',
			item: toAction({
				id: 'allowAll', label: 'Allow All', checked: true,
				run: () => {
					service.hide();
					events.push('warning');
					warning.focus();
				},
			}),
		}], {
			onSelect: action => action.run(),
			onHide: () => {
				events.push('hide');
				trigger.focus();
			},
		}, { x: 400, y: 400, width: 100, height: 24 }, undefined, [], undefined, {
			anchorPosition: AnchorPosition.ABOVE,
			initialFocusItemId: 'allowAll',
		});
		service.acceptSelected();
		assert.deepStrictEqual({
			events,
			warningFocused: document.activeElement === warning,
			visible: service.isVisible,
		}, { events: ['hide', 'warning'], warningFocused: true, visible: false });
	});

	test('keeps inline menus open across workbench layout changes with or without initial item focus', () => {
		const { container, layout, service } = setup();
		const states = [];
		for (const initialFocusItemId of [undefined, 'manual']) {
			let hides = 0;
			service.show('mode', false, [{
				kind: ActionListItemKind.Action,
				label: 'Mode',
				item: toAction({ id: 'mode', label: 'Mode', checked: true, run: () => { } }),
			}, {
				kind: ActionListItemKind.Action,
				label: 'Manual',
				item: toAction({ id: 'manual', label: 'Manual', checked: true, run: () => { } }),
			}], {
				onSelect: () => { },
				onHide: () => { hides++; },
			}, { x: 400, y: 400, width: 100, height: 24 }, undefined, [], undefined, {
				anchorPosition: AnchorPosition.ABOVE,
				initialFocusItemId,
				useFullHeight: true,
			});
			const openAfterInitialLayout = service.isVisible;
			layout.fire({ container, dimension: { width: 900, height: 600 } });
			states.push({ initialFocusItemId, openAfterInitialLayout, visibleAfterResize: service.isVisible, hides });
			service.hide();
		}
		assert.deepStrictEqual(states, [
			{ initialFocusItemId: undefined, openAfterInitialLayout: true, visibleAfterResize: true, hides: 0 },
			{ initialFocusItemId: 'manual', openAfterInitialLayout: true, visibleAfterResize: true, hides: 0 },
		]);
	});

	test('keeps a nested submenu open when removing a remote row refreshes parent items', async () => {
		const { service } = setup();
		let hides = 0;
		let selected = 0;
		const keep = toAction({ id: 'keep', label: 'Keep', run: () => { } });
		const makeParent = (children: readonly IAction[]): IActionListItem<{ id: string }> => ({
			kind: ActionListItemKind.Action,
			label: 'Remote',
			item: { id: 'remote' },
			submenuActions: [...children],
		});
		const removable = Object.assign(toAction({ id: 'remove', label: 'Remove Me', run: () => { } }), {
			onRemove: async () => {
				await timeout(0);
				service.updateItems([makeParent([keep])], undefined, { preserveHover: true });
			},
		});
		service.show('remote', false, [makeParent([removable, keep])], {
			onSelect: () => {
				selected++;
				service.hide();
			},
			onHide: () => { hides++; },
		}, { x: 400, y: 400, width: 100, height: 24 }, undefined, [], undefined, {
			showFilter: true,
		});

		const widget = document.querySelector<HTMLElement>('.action-widget .actionList');
		assert.ok(widget);
		widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const panel = document.querySelector<HTMLElement>('.action-list-submenu-panel');
		assert.ok(panel);
		const removeButton = Array.from(panel.querySelectorAll<HTMLElement>('.monaco-list-row.action'))
			.find(row => row.querySelector<HTMLElement>('.title')?.textContent === 'Remove Me')
			?.querySelector<HTMLElement>('.action-list-item-toolbar .action-label');
		assert.ok(removeButton);
		removeButton.click();
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual({
			visible: service.isVisible,
			hides,
			selected,
			rows: Array.from(panel.querySelectorAll<HTMLElement>('.monaco-list-row.action'))
				.map(row => row.querySelector<HTMLElement>('.title')?.textContent),
		}, {
			visible: true,
			hides: 0,
			selected: 0,
			rows: ['Keep'],
		});
		service.hide();
	});

	test('keeps submenu open while remove action completes asynchronously', async () => {
		const { service } = setup();
		let hides = 0;
		const keep = toAction({ id: 'keep', label: 'Keep', run: () => { } });
		const makeParent = (children: readonly IAction[]): IActionListItem<{ id: string }> => ({
			kind: ActionListItemKind.Action,
			label: 'Remote',
			item: { id: 'remote' },
			submenuActions: [...children],
		});
		const removable = Object.assign(toAction({ id: 'remove', label: 'Remove Me', run: () => { } }), {
			onRemove: async () => {
				await timeout(350);
				service.updateItems([makeParent([keep])], undefined, { preserveHover: true });
			},
		});
		service.show('remote', false, [makeParent([removable, keep])], {
			onSelect: () => { },
			onHide: () => { hides++; },
		}, { x: 400, y: 400, width: 100, height: 24 }, undefined, [], undefined, {
			showFilter: true,
		});

		const widget = document.querySelector<HTMLElement>('.action-widget .actionList');
		assert.ok(widget);
		widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const panel = document.querySelector<HTMLElement>('.action-list-submenu-panel');
		assert.ok(panel);
		const removeButton = panel.querySelector<HTMLElement>('.action-list-item-toolbar .action-label');
		assert.ok(removeButton);
		removeButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		removeButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
		removeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		await timeout(450);

		assert.deepStrictEqual({
			visible: service.isVisible,
			hides,
		}, {
			visible: true,
			hides: 0,
		});
		await timeout(100);
		service.hide();
	});
});
