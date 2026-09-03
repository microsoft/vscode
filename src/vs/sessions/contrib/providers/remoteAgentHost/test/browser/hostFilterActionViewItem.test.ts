/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../../base/browser/contextmenu.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { HostFilterActionViewItem } from '../../browser/hostFilterActionViewItem.js';

suite('HostFilterActionViewItem', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('sidebar picker delegates the toolbar tab stop to its button', () => {
		const testDisposables = disposables.add(new DisposableStore());
		const container = document.createElement('li');
		document.body.appendChild(container);
		testDisposables.add(toDisposable(() => container.remove()));

		const interactiveHost: IAgentHostFilterEntry = {
			id: 'interactive',
			providerIds: ['interactive'],
			label: 'Interactive',
			grouped: false,
			address: undefined,
			icon: Codicon.remote,
			status: AgentHostFilterConnectionStatus.Connected,
			connectable: false,
		};
		const otherHost: IAgentHostFilterEntry = {
			...interactiveHost,
			id: 'other',
			providerIds: ['other'],
			label: 'Other',
		};
		const filterService = new class extends mock<IAgentHostFilterService>() {
			override readonly onDidChange = Event.None;
			override readonly onDidChangeDiscovering = Event.None;
			override readonly selectedHostId = interactiveHost.id;
			override readonly selectedHost = interactiveHost;
			override readonly hosts = [interactiveHost, otherHost];
			override readonly isDiscovering = false;
		}();
		let menuShowCount = 0;
		const contextMenuService = new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void {
				menuShowCount++;
				for (const action of delegate.getActions?.() ?? []) {
					if (action instanceof Action) {
						testDisposables.add(action);
					}
				}
			}
		}();
		const viewItem = testDisposables.add(new HostFilterActionViewItem(
			testDisposables.add(new Action('pickHost', 'Select Agent Host')),
			'sidebar',
			filterService,
			contextMenuService,
			NullHoverService,
		));

		viewItem.render(container);
		viewItem.setFocusable(true);
		viewItem.focus();

		const button = container.querySelector<HTMLElement>('.agent-host-filter-button');
		button?.click();

		assert.deepStrictEqual({
			wrapperTabIndex: container.tabIndex,
			buttonTabIndex: button?.tabIndex,
			pickerTabbableDescendants: container.querySelectorAll('.customization-link-button-container [tabindex="0"]').length,
			buttonFocused: document.activeElement === button,
			viewItemFocused: viewItem.isFocused(),
			menuShowCount,
		}, {
			wrapperTabIndex: -1,
			buttonTabIndex: 0,
			pickerTabbableDescendants: 1,
			buttonFocused: true,
			viewItemFocused: true,
			menuShowCount: 1,
		});
	});
});
