/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../base/common/codicons.js';
import { ActionListItemKind, ActionListWidget, IActionListItem } from '../../../platform/actionWidget/browser/actionList.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import '../../browser/media/style.css';

function renderActionList(context: ComponentFixtureContext, navigation: 'keyboard' | 'mouse', width = 360): void {
	const { container, disposableStore, theme } = context;
	container.classList.add('agent-sessions-workbench');
	container.style.width = `${width}px`;

	const wrapper = document.createElement('div');
	wrapper.classList.add('action-widget');
	wrapper.style.boxSizing = 'border-box';
	container.appendChild(wrapper);

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const items: IActionListItem<string>[] = [
		{ kind: ActionListItemKind.Header, group: { title: 'Pinned' } },
		{ kind: ActionListItemKind.Action, item: 'selected', label: 'Model with a long display name (Preview)', description: 'Max \u00b7 1M', group: { title: '', icon: Codicon.check } },
		{ kind: ActionListItemKind.Separator },
		{ kind: ActionListItemKind.Action, item: 'another', label: 'Another model', description: 'Max', group: { title: '', icon: Codicon.blank } },
	];
	const widget = disposableStore.add(instantiationService.createInstance(
		ActionListWidget<string>,
		'actionListFocus',
		false,
		items,
		{ onHide: () => { }, onSelect: () => { } },
		undefined,
		{ showFilter: true, filterPlaceholder: 'Search models', focusFilterOnOpen: true, filterAsCombobox: true },
	));
	if (widget.filterContainer) {
		wrapper.appendChild(widget.filterContainer);
	}
	wrapper.appendChild(widget.domNode);
	widget.layout(widget.computeListHeight());
	context.focus({
		focus: () => {
			widget.focus();
			widget.clearFocus();
			widget.focusNext();
		},
	});

	const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row.action');
	const description = row?.querySelector<HTMLElement>('.description');
	if (!row || !description) {
		throw new Error('Expected a model row with context-window details');
	}
	if (navigation === 'mouse') {
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
	}
	if (row.getBoundingClientRect().right - description.getBoundingClientRect().right < 12) {
		throw new Error('Context-window details must stay inset from the row focus border');
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/actionList' }, {
	KeyboardNavigation: defineComponentFixture({
		additionalThemes: ['light2026', 'darkHighContrast', 'lightHighContrast'],
		render: context => renderActionList(context, 'keyboard'),
	}),
	MouseNavigation: defineComponentFixture({
		additionalThemes: ['light2026', 'darkHighContrast', 'lightHighContrast'],
		render: context => renderActionList(context, 'mouse'),
	}),
	NarrowContextDetails: defineComponentFixture({
		additionalThemes: ['light2026'],
		render: context => renderActionList(context, 'keyboard', 260),
	}),
});
