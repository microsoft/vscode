/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { RemoteAgentHostCommandIds } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remoteAgentHostCommandIds.js';
import { MobileHostPickerSheet } from '../../browser/mobileHostPickerSheet.js';

suite('MobileHostPickerSheet', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function showPicker(canAdd: boolean) {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: canAdd });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ILayoutService, { mainContainer: container });
		const executeCommand = sinon.stub().resolves();
		instantiation.stub(ICommandService, { executeCommand });
		const changed = store.add(new Emitter<void>());
		const hosts: IAgentHostFilterEntry[] = [];
		instantiation.stub(IAgentHostFilterService, {
			hosts, onDidChange: changed.event, onDidChangeDiscovering: Event.None,
			rediscover: async () => {
				hosts.push({ id: 'laptop', label: 'Laptop', address: 'tunnel:laptop', icon: Codicon.vm, grouped: false, connectable: true, providerIds: ['laptop'], status: AgentHostFilterConnectionStatus.Connected });
				changed.fire();
				return true;
			},
		});
		store.add(instantiation.createInstance(MobileHostPickerSheet)).show();
		return { container, executeCommand };
	}

	test('Refresh lists a discovered computer; Add offers only manual address entry', () => {
		const { container, executeCommand } = showPicker(true);
		const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]:not(.closing)');
		const picker = dialog()!;
		const computers = picker.querySelector<HTMLElement>('.host-picker-computers')!;
		const empty = computers.textContent;
		const caption = picker.querySelector('.mobile-picker-sheet-caption');
		picker.querySelector<HTMLButtonElement>('.host-picker-section-action')!.click();
		const discovered = computers.querySelector('[role="menuitemradio"]')?.getAttribute('aria-label');
		computers.querySelector<HTMLButtonElement>('button:not([role])')!.click();

		const add = dialog()!;
		const actions = [...add.querySelectorAll<HTMLButtonElement>('.mobile-content-sheet-body button')];
		const address = actions[0];
		const description = mainWindow.document.getElementById(add.getAttribute('aria-describedby')!);
		const focused = dom.getActiveElement();
		address.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
		const tabTarget = dom.getActiveElement();
		address.click();

		assert.deepStrictEqual({
			empty, caption, discovered, guidance: description?.textContent,
			actions: actions.map(button => button.getAttribute('aria-label')),
			focused: focused === address, tabReachesClose: tabTarget === add.querySelector('.mobile-picker-sheet-done'),
			commands: executeCommand.args, open: dialog(),
		}, {
			empty: 'Add a computer…', caption: null, discovered: 'Laptop, Connected',
			guidance: 'Share your computer from VS Code using a Dev Tunnel or GitHub Environment to see it here.',
			actions: ['Enter an address…'], focused: true, tabReachesClose: true,
			commands: [[RemoteAgentHostCommandIds.addRemoteAgentHost]], open: null,
		});
	});

	test('when adding is disabled, an empty list keeps its status and Refresh but offers no Add action', () => {
		const { container } = showPicker(false);
		const computers = container.querySelector<HTMLElement>('.host-picker-computers')!;
		assert.deepStrictEqual({
			empty: computers.textContent, add: computers.querySelector('button'),
			refresh: container.querySelector('.host-picker-section-action')?.textContent,
		}, { empty: 'No computers found yet.', add: null, refresh: 'Refresh' });
	});
});
