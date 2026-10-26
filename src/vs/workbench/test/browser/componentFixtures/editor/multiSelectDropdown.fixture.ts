/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMultiSelectDropdownSection, MultiSelectDropdown } from '../../../../../platform/actionWidget/browser/multiSelectDropdown.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { registerActionWidgetTestKeybindings } from '../../../../../platform/actionWidget/test/browser/actionWidgetTestUtils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';

const sections: readonly IMultiSelectDropdownSection[] = [
	{
		label: 'Weekdays',
		items: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(label => ({ id: label, label })),
	},
];

async function render(context: ComponentFixtureContext): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.style.width = '320px';
	container.style.height = '300px';
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
			}());
			registration.define(IContextViewService, ContextViewService);
			registration.define(IActionWidgetService, ActionWidgetService);
		},
	});
	disposableStore.add(registerActionWidgetTestKeybindings(container, instantiationService.get(IContextKeyService), instantiationService));
	const button = disposableStore.add(new Button(container, { ...defaultButtonStyles, secondary: true }));
	button.element.style.width = '280px';
	button.element.setAttribute('aria-haspopup', 'menu');
	button.element.setAttribute('aria-expanded', 'false');
	button.label = 'Weekdays';
	const dropdown = disposableStore.add(instantiationService.createInstance(MultiSelectDropdown));
	let selectedIds: readonly string[] = ['Monday', 'Wednesday', 'Friday'];
	disposableStore.add(dropdown.onDidChangeSelection(ids => {
		selectedIds = ids;
	}));
	disposableStore.add(button.onDidClick(() => dropdown.show({
		anchor: button.element, ariaLabel: 'Weekdays', sections, selectedIds,
	})));
	button.element.click();
	context.focus(container.querySelector<HTMLElement>('.monaco-list')!);
	await waitForFixtureCondition(() => [...container.querySelectorAll('.scrollbar')].every(element =>
		element.classList.contains('invisible') && dom.getWindow(element).getComputedStyle(element).opacity === '0'),
		'Dropdown scrollbars must be idle before capture');
}

export default defineThemedFixtureGroup({ path: 'editor/multiSelectDropdown' }, {
	Weekdays: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		deferPaint: true,
		render,
	}),
});
