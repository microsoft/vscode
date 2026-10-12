/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IMultiSelectDropdownSection, MultiSelectDropdown } from '../../../../../platform/actionWidget/browser/multiSelectDropdown.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';

const sections: readonly IMultiSelectDropdownSection[] = [
	{ label: 'Weekdays', items: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(label => ({ id: label, label })) },
	{ label: 'Weekend', items: ['Saturday', 'Sunday'].map(label => ({ id: label, label })) },
	{
		label: 'Tools', items: Array.from({ length: 24 }, (_, index) => ({
			id: `tool-${index}`, label: `Workspace Tool ${index + 1}`,
			description: index === 0 ? 'Unavailable in this workspace' : 'Available for automation',
			disabled: index === 0,
		}))
	},
];

async function render(context: ComponentFixtureContext, search?: string): Promise<void> {
	const { container, disposableStore, theme } = context;
	container.style.width = '420px';
	container.style.height = '540px';
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
		},
	});
	const button = disposableStore.add(new Button(container, { ...defaultButtonStyles, secondary: true }));
	button.element.style.width = '280px';
	button.element.setAttribute('aria-haspopup', 'menu');
	button.element.setAttribute('aria-expanded', 'false');
	button.label = 'Select Days and Tools';
	const dropdown = disposableStore.add(instantiationService.createInstance(MultiSelectDropdown));
	let selectedIds: readonly string[] = ['Monday', 'Wednesday', 'Friday', 'tool-2'];
	disposableStore.add(dropdown.onDidChangeSelection(ids => {
		selectedIds = ids;
		button.label = `${ids.length} Selected`;
	}));
	disposableStore.add(button.onDidClick(() => dropdown.show({
		anchor: button.element, ariaLabel: 'Days and tools', sections, selectedIds,
		searchable: true, filterPlaceholder: 'Search days and tools', width: 320,
	})));
	button.element.click();
	if (search !== undefined) {
		const input = container.querySelector('input')!;
		input.value = search;
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
	}
	context.focus(container.querySelector<HTMLElement>('.monaco-list')!);
	await waitForFixtureCondition(() => [...container.querySelectorAll('.scrollbar')].every(element =>
		element.classList.contains('invisible') && dom.getWindow(element).getComputedStyle(element).opacity === '0'),
		'Dropdown scrollbars must be idle before capture');
}

export default defineThemedFixtureGroup({ path: 'editor/multiSelectDropdown' }, {
	SectionsAndScrolling: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		virtualTime: { enabled: false },
		deferPaint: true,
		render: context => render(context),
	}),
	Search: defineComponentFixture({ virtualTime: { enabled: false }, deferPaint: true, render: context => render(context, 'Wednesday') }),
	NoResults: defineComponentFixture({ virtualTime: { enabled: false }, deferPaint: true, render: context => render(context, 'No matching item') }),
});
