/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { CompositeBarAction, CompositeBarActionViewItem } from '../../../browser/parts/compositeBarActions.js';
import { IconBadge, NumberBadge } from '../../../services/activity/common/activity.js';
import { workbenchInstantiationService } from '../workbenchTestServices.js';
import '../../../../base/browser/ui/codicons/codiconStyles.js';
import '../../../browser/parts/activitybar/media/activityaction.css';
import '../../../browser/parts/media/paneCompositePart.css';

suite('CompositeBarActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let workbench: HTMLElement;

	setup(() => {
		workbench = append(mainWindow.document.body, $('.monaco-workbench'));
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
	});

	teardown(() => {
		workbench.remove();
	});

	const layouts = [
		{ name: 'top activity bar', section: '.header-or-footer.header', compact: true, icon: true, size: 13 },
		{ name: 'bottom activity bar', section: '.header-or-footer.footer', compact: true, icon: true, size: 13 },
		{ name: 'title icons', section: '.title', compact: true, icon: true, size: 13 },
		{ name: 'compact left activity bar', section: undefined, side: 'left', compact: true, icon: true, size: 13 },
		{ name: 'compact right activity bar', section: undefined, side: 'right', compact: true, icon: true, size: 13 },
	];

	for (const layout of layouts) {
		test(`renders a square spinning icon badge in ${layout.name} without changing number badges`, () => {
			let compositeBar: HTMLElement;
			if (layout.section) {
				const part = append(workbench, $('.pane-composite-part'));
				const section = append(part, $(layout.section));
				compositeBar = append(append(section, $('.composite-bar-container')), $('.composite-bar'));
			} else {
				const part = append(workbench, $(`.activitybar.${layout.side}${layout.compact ? '.compact' : ''}`));
				compositeBar = append(append(part, $('.content')), $('.composite-bar'));
			}
			const actionBar = append(compositeBar, $('.monaco-action-bar'));
			const actions = append(actionBar, $('ul.actions-container'));
			const container = append(actions, $('li.action-item'));
			const action = store.add(new CompositeBarAction({ id: 'testing', name: 'Testing' }));
			const instantiationService = workbenchInstantiationService(undefined, store);
			const viewItem = store.add(instantiationService.createInstance(CompositeBarActionViewItem, action, {
				icon: layout.icon,
				compact: layout.compact,
				colors: () => ({}),
				hoverOptions: { position: () => HoverPosition.RIGHT },
			}, () => true));
			viewItem.render(container);

			const badge = container.querySelector<HTMLElement>('.badge')!;
			const content = badge.querySelector<HTMLElement>('.badge-content')!;
			const numberBadge = new NumberBadge(12345, () => '12345 tests');
			const numberState = () => {
				const style = mainWindow.getComputedStyle(content);
				return {
					text: content.textContent,
					width: content.offsetWidth,
					height: content.offsetHeight,
					padding: style.padding,
					classes: badge.className,
					label: container.getAttribute('aria-label'),
				};
			};
			action.activities = [{ badge: numberBadge }];
			const initialNumberState = numberState();

			action.activities = [{ badge: new IconBadge(spinningLoading, () => 'Tests are running') }];
			const style = mainWindow.getComputedStyle(content);
			assert.deepStrictEqual({
				width: content.offsetWidth,
				height: content.offsetHeight,
				padding: style.padding,
				display: style.display,
				alignItems: style.alignItems,
				justifyContent: style.justifyContent,
				fontSize: style.fontSize,
				spinning: content.classList.contains('codicon-modifier-spin'),
				label: container.getAttribute('aria-label'),
			}, {
				width: layout.size,
				height: layout.size,
				padding: '0px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				fontSize: '12px',
				spinning: true,
				label: 'Testing - Tests are running',
			});

			action.activities = [{ badge: numberBadge }];
			assert.deepStrictEqual(numberState(), initialNumberState);
		});
	}
});
