/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/parts/media/editorPart.css';
import { $, append } from '../../../base/browser/dom.js';
import { Event } from '../../../base/common/event.js';
import { IMenuService, MenuId } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { EmptyEditorGroupAddTab } from '../../browser/parts/emptyEditorGroupAddTab.js';
import { FixtureContextViewService, FixtureKeybindingService, FixtureMenuService, fixtureBrowser, fixtureCanvas, fixtureChanges, fixtureFiles, fixtureSearch, IFixtureEntry } from './addTabFixtureUtils.js';

const addTabMenu = MenuId.for('sessions.fixture.emptyEditorGroupAddTab');

interface IFixtureOptions {
	readonly entries: readonly IFixtureEntry[];
	/** Moves keyboard focus to the first row, showing its focus outline. */
	readonly focusFirstEntry?: boolean;
	readonly width?: number;
	/** Width of a docked detail panel beside the group, mirrored into the content right inset. */
	readonly detailPanelWidth?: number;
	readonly openSubmenu?: boolean;
}

export default defineThemedFixtureGroup({ path: 'sessions/emptyEditorGroupAddTab/' }, {
	WithSubmenuEntry: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderEmptyGroup(context, { entries: [fixtureChanges, fixtureFiles, fixtureBrowser, fixtureSearch, fixtureCanvas] }),
	}),
	WithoutSubmenuEntry: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderEmptyGroup(context, { entries: [fixtureChanges, fixtureFiles, fixtureBrowser, fixtureSearch] }),
	}),
	SubmenuOpen: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderEmptyGroup(context, { entries: [fixtureChanges, fixtureFiles, fixtureBrowser, fixtureSearch, fixtureCanvas], width: 720, openSubmenu: true }),
	}),
	DetailPanelDocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderEmptyGroup(context, { entries: [fixtureChanges, fixtureFiles, fixtureBrowser, fixtureSearch, fixtureCanvas], width: 720, detailPanelWidth: 300 }),
	}),
	KeyboardFocusedEntry: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderEmptyGroup(context, { entries: [fixtureChanges, fixtureFiles, fixtureBrowser, fixtureSearch, fixtureCanvas], focusFirstEntry: true }),
	}),
	DisabledEntry: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderEmptyGroup(context, { entries: [fixtureChanges, { ...fixtureFiles, disabled: true }, fixtureBrowser, fixtureSearch, fixtureCanvas] }),
	}),
	Narrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderEmptyGroup(context, { entries: [fixtureChanges, fixtureFiles, fixtureBrowser, fixtureSearch, fixtureCanvas], width: 240 }),
	}),
});

async function renderEmptyGroup({ container, disposableStore, theme, focus }: ComponentFixtureContext, options: IFixtureOptions): Promise<void> {
	container.style.width = `${options.width ?? 480}px`;
	container.style.height = '360px';
	container.style.position = 'relative';
	container.classList.add('agent-sessions-workbench');

	const part = append(container, $('.part.editor'));
	part.style.height = '100%';
	part.style.backgroundColor = 'var(--vscode-editor-background)';
	const content = append(part, $('.content'));
	content.style.height = '100%';
	const groupElement = append(content, $('.editor-group-container.empty.active'));
	groupElement.style.height = '100%';

	if (options.detailPanelWidth) {
		part.style.setProperty('--sessions-editor-content-right-inset', `${options.detailPanelWidth}px`);
		const detailPanel = append(groupElement, $('.fixture-detail-panel'));
		detailPanel.style.cssText = `position: absolute; top: 0; right: 0; bottom: 0; width: ${options.detailPanelWidth}px; box-sizing: border-box; background: var(--vscode-sideBar-background); border-left: 1px solid var(--vscode-widget-border, transparent);`;
	}

	const menuService = new FixtureMenuService(options.entries);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IMenuService, menuService);
			reg.defineInstance(IKeybindingService, new FixtureKeybindingService(options.entries));
			reg.defineInstance(IContextViewService, new FixtureContextViewService(container));
		},
	});
	menuService.commandService = instantiationService.get(ICommandService);

	disposableStore.add(instantiationService.createInstance(EmptyEditorGroupAddTab, {
		element: groupElement,
		scopedContextKeyService: instantiationService.get(IContextKeyService),
		isEmpty: true,
		onDidModelChange: Event.None,
	}, addTabMenu));

	if (options.focusFirstEntry) {
		const firstEntry = groupElement.querySelector<HTMLElement>('.sessions-add-tab-watermark-entry');
		if (!firstEntry) {
			throw new Error('Expected an Add Tab entry to focus');
		}
		focus(firstEntry);
	}

	if (options.openSubmenu) {
		const submenuRow = [...groupElement.querySelectorAll<HTMLElement>('.sessions-add-tab-watermark-entry')].find(row => row.getAttribute('aria-haspopup') === 'menu');
		submenuRow?.dispatchEvent(new MouseEvent('mouseenter'));
		await waitForFixtureCondition(() => !!container.querySelector('.fixture-context-view .monaco-menu .action-item'), 'The hovered Canvas entry did not open its submenu');
	}
}
