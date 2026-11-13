/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/style.css';
import * as DOM from '../../../base/browser/dom.js';
import { Menu } from '../../../base/browser/ui/menu/menu.js';
import { Action } from '../../../base/common/actions.js';
import { isHighContrast } from '../../../platform/theme/common/theme.js';
import { defaultMenuStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { ActionListItemKind, ActionListWidget, IActionListItem } from '../../../platform/actionWidget/browser/actionList.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

function renderPopupHover(context: ComponentFixtureContext): void {
	const { container, disposableStore, theme } = context;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.display = 'flex';
	container.style.alignItems = 'flex-start';
	container.style.gap = '24px';
	container.style.width = '680px';
	container.style.padding = '24px';
	container.style.boxSizing = 'border-box';
	container.style.background = 'var(--vscode-agents-background)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const actionListHost = DOM.append(container, DOM.$('.action-widget'));
	actionListHost.style.width = '300px';
	const items: IActionListItem<string>[] = [
		{ kind: ActionListItemKind.Action, item: 'interactive', label: 'Interactive', detail: 'Step-by-step collaboration' },
		{ kind: ActionListItemKind.Action, item: 'plan', label: 'Plan', detail: 'Plan first, execute when ready' },
		{ kind: ActionListItemKind.Action, item: 'autopilot', label: 'Autopilot', detail: 'Works autonomously' },
	];
	const actionList = disposableStore.add(instantiationService.createInstance(
		ActionListWidget<string>,
		'popupHoverActionList',
		false,
		items,
		{ onHide: () => { }, onSelect: () => { } },
		undefined,
		{ showFilter: false, wrapDetails: true },
	));
	actionListHost.appendChild(actionList.domNode);
	actionList.layout(actionList.computeListHeight());
	actionList.focus();
	const actionRow = actionList.domNode.querySelectorAll<HTMLElement>('.monaco-list-row.action')[1];
	actionRow.classList.add('hovered');
	actionRow.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));

	const menuHost = DOM.append(container, DOM.$('.popup-hover-menu'));
	menuHost.style.width = '300px';
	const menu = disposableStore.add(new Menu(menuHost, [
		disposableStore.add(new Action('ordering', 'Ordering')),
		disposableStore.add(new Action('grouping', 'Grouping')),
		disposableStore.add(new Action('show', 'Show')),
	], {}, defaultMenuStyles));
	menu.focus(true);
	const menuRow = menuHost.querySelectorAll<HTMLElement>('.action-item')[1];
	menuRow.classList.add('hovered');
	menuRow.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));

	if (isHighContrast(theme.type)) {
		const actionOutline = DOM.getWindow(actionRow).getComputedStyle(actionRow).outlineStyle;
		const menuItem = menuRow.querySelector<HTMLElement>('.action-menu-item')!;
		const menuOutline = DOM.getWindow(menuItem).getComputedStyle(menuItem).outlineStyle;
		if (actionOutline !== 'dashed' || menuOutline !== 'dashed') {
			throw new Error(`Expected dashed HC pointer outlines, got action list ${actionOutline} and menu ${menuOutline}`);
		}
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/popupHover/' }, {
	ActionListAndMenu: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The action-list Plan row and context-menu Grouping row are pointer-hovered. In high contrast themes, both use the same dashed active-contrast boundary.'],
		render: renderPopupHover,
	}),
});
