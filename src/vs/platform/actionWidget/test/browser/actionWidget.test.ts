/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { getSingletonServiceDescriptors } from '../../../instantiation/common/extensions.js';
import { createServices } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { ActionListItemKind } from '../../browser/actionList.js';
import { IActionWidgetService } from '../../browser/actionWidget.js';

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
});
