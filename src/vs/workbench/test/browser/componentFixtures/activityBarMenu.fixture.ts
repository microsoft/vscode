/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { ActionBar, ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HorizontalDirection, VerticalDirection } from '../../../../base/browser/ui/menu/menu.js';
import { MenuBar } from '../../../../base/browser/ui/menu/menubar.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { defaultMenuStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ActivitybarPart } from '../../../browser/parts/activitybar/activitybarPart.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

import '../../../browser/media/floatingPanels.css';
import '../../../browser/parts/activitybar/media/activitybarpart.css';
import '../../../browser/parts/activitybar/media/activityaction.css';
import '../../../browser/parts/titlebar/media/menubarControl.css';
import '../../../contrib/modernUI/browser/media/activityBar.css';
import '../../../contrib/modernUI/browser/media/roundedCorners.css';

function renderActivityBarMenu({ container, disposableStore }: ComponentFixtureContext, compact: boolean): void {
	container.style.width = '560px';
	container.style.height = '360px';
	const root = DOM.append(container, DOM.$('.monaco-workbench.modern-ui.floating-panels'));
	root.classList.toggle('modern-ui-compact', compact);
	root.style.width = '100%';
	root.style.height = '100%';
	root.style.position = 'relative';

	const activityBar = DOM.append(root, DOM.$('.part.activitybar.left'));
	activityBar.style.setProperty('--activity-bar-width', `${ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH}px`);
	activityBar.style.setProperty('--activity-bar-action-height', `${ActivitybarPart.FLOATING_ACTION_HEIGHT}px`);
	activityBar.style.setProperty('--activity-bar-action-gap', `${compact ? ActivitybarPart.FLOATING_COMPACT_ACTION_GAP : ActivitybarPart.FLOATING_ACTION_GAP}px`);
	activityBar.style.backgroundColor = 'var(--vscode-modernActivityBar-background)';
	const content = DOM.append(activityBar, DOM.$('.content'));
	const menubar = DOM.append(content, DOM.$('.menubar'));
	const rail = disposableStore.add(new ActionBar(DOM.append(content, DOM.$('.composite-bar')), {
		orientation: ActionsOrientation.VERTICAL,
		ariaLabel: 'Activity Bar',
	}));
	rail.push([
		disposableStore.add(new Action('explorer', 'Explorer', ThemeIcon.asClassName(Codicon.files))),
		disposableStore.add(new Action('search', 'Search', ThemeIcon.asClassName(Codicon.search))),
	], { icon: true, label: false });

	const action = (id: string, label: string) => disposableStore.add(new Action(id, label));
	const menuOptions = {
		visibility: 'compact',
		compactMode: { horizontal: HorizontalDirection.Right, vertical: VerticalDirection.Below },
	};
	const menuBar = new MenuBar(menubar, { ...menuOptions, visibility: 'hidden' }, defaultMenuStyles);
	disposableStore.add(combinedDisposable(toDisposable(() => menuBar.blur()), menuBar));
	menuBar.push([
		{ label: 'File', actions: [action('new', 'New File'), action('open', 'Open File')] },
		{
			label: 'Edit',
			actions: [
				action('undo', 'Undo'), action('redo', 'Redo'), new Separator(),
				action('cut', 'Cut'), action('copy', 'Copy'), action('paste', 'Paste'), new Separator(),
				action('find', 'Find'), action('replace', 'Replace'),
			],
		},
		{ label: 'Selection', actions: [action('selectAll', 'Select All')] },
		{ label: 'View', actions: [action('appearance', 'Appearance')] },
		{ label: 'Go', actions: [action('goToFile', 'Go to File')] },
		{ label: 'Run', actions: [action('start', 'Start Debugging')] },
		{ label: 'Terminal', actions: [action('terminal', 'New Terminal')] },
		{ label: 'Help', actions: [action('about', 'About')] },
	]);
	menuBar.update(menuOptions);
	menuBar.toggleFocus();
	const toggle = menubar.querySelector<HTMLElement>('.menubar-menu-button');
	if (!toggle) {
		throw new Error('Expected the compact application menu button.');
	}
	toggle.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
	const [file, edit] = menubar.querySelectorAll<HTMLElement>('.monaco-menu .action-menu-item');
	if (!file || !edit) {
		throw new Error('Expected the File and Edit menu entries.');
	}
	file.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
	edit.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
}

export default defineThemedFixtureGroup({ path: 'workbench/' }, {
	CompactActivityBarMenu_DefaultDensity: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['The compact application menu and its open Edit submenu use the same menu-row spacing. Separators retain normal menu spacing, without extra activity-bar gaps. The Explorer and Search icons remain separated on the rail.'],
		render: ctx => renderActivityBarMenu(ctx, false),
	}),
	CompactActivityBarMenu_CompactDensity: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['Compact Modern UI density tightens the activity rail, but the application menu and Edit submenu retain the same row and separator spacing as default density.'],
		render: ctx => renderActivityBarMenu(ctx, true),
	}),
});
