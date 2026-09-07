/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import Severity from '../../../../../base/common/severity.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { TestTerminalGroupService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { ITerminalStatusList } from '../../browser/terminalStatusList.js';
import { TerminalViewPane } from '../../browser/terminalView.js';
import { ITerminalStatus, TerminalCommandId } from '../../common/terminal.js';

class TestTerminalInstance extends mock<ITerminalInstance>() {
	override title = 'zsh';
	override description = '';
	override icon = Codicon.terminal;
	override readonly statusList = new class extends mock<ITerminalStatusList>() {
		override primary: ITerminalStatus | undefined;
	}();
}

suite('TerminalViewPane', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports inline label changes without refreshing the title area', async () => {
		const configurationService = new TestConfigurationService({ terminal: { integrated: { tabs: { separator: '-' } } } });
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		instantiationService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override readonly onDidChangeLocation = Event.None;
			override getViewLocationById() { return ViewContainerLocation.Panel; }
		}());
		const titleChanged = store.add(new Emitter<ITerminalInstance>());
		const statusChanged = store.add(new Emitter<ITerminalInstance>());
		const activeChanged = store.add(new Emitter<ITerminalInstance | undefined>());
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override readonly onDidRegisterProcessSupport = Event.None;
			override readonly onDidChangeInstances = Event.None;
			override readonly onAnyInstanceAddedCapabilityType = Event.None;
			override readonly onAnyInstanceTitleChange = titleChanged.event;
			override readonly onAnyInstancePrimaryStatusChange = statusChanged.event;
			override readonly onAnyInstanceIconChange = Event.None;
			override readonly onDidChangeInstanceCapability = Event.None;
		}());
		const groupService = new class extends TestTerminalGroupService {
			override onDidChangeActiveInstance = activeChanged.event;
		}();
		instantiationService.stub(ITerminalGroupService, groupService);
		const first = new TestTerminalInstance();
		const second = new TestTerminalInstance();
		second.title = 'bash';
		groupService.activeInstance = first;
		const view: ViewPane = store.add(instantiationService.createInstance(TerminalViewPane, { id: 'terminal', title: 'Terminal' }));
		const action = instantiationService.createInstance(MenuItemAction, { id: TerminalCommandId.Focus, title: 'Focus Terminal' }, undefined, undefined, undefined, undefined);
		const item = view.createActionViewItem(action, {});
		assert.ok(item?.onDidChangeContent);
		const container = document.createElement('div');
		item.render(container);
		const label = container.querySelector('.single-terminal-tab');
		let titleAreaUpdates = 0;
		store.add(view.onDidChangeTitleArea(() => titleAreaUpdates++));
		const updates: { text: string | null; warning: boolean }[] = [];
		store.add(item.onDidChangeContent(() => updates.push({ text: container.textContent?.trim() ?? null, warning: !!container.querySelector('.codicon-warning') })));

		first.description = 'long-name-folder';
		titleChanged.fire(first);
		titleChanged.fire(first);
		await Promise.resolve();
		titleChanged.fire(second);
		await Promise.resolve();
		first.statusList.primary = { id: 'warning', severity: Severity.Warning, icon: Codicon.warning };
		statusChanged.fire(first);
		await Promise.resolve();
		groupService.activeInstance = second;
		activeChanged.fire(second);
		await Promise.resolve();
		assert.deepStrictEqual({ updates, titleAreaUpdates, sameLabel: container.querySelector('.single-terminal-tab') === label }, {
			updates: [
				{ text: 'zsh - long-name-folder', warning: false },
				{ text: 'zsh - long-name-folder', warning: true },
				{ text: 'bash', warning: false },
			],
			titleAreaUpdates: 0,
			sameLabel: true,
		});
	});
});
