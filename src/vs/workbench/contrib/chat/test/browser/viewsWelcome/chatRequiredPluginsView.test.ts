/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatPolicyBlockedView } from '../../../browser/viewsWelcome/chatPolicyBlockedView.js';
import { IManagedSettingsUpdateInfo, IManagedSettingsUpdateService } from '../../../../../services/policies/common/managedSettingsUpdate.js';
import { getManagedPluginBlockInfo, IManagedPluginAvailability, IManagedPluginAvailabilityService, MANAGED_PLUGINS_VIEW_ID, ManagedPluginAvailabilityService, RETRY_MANAGED_PLUGINS_COMMAND_ID } from '../../../common/plugins/managedPluginAvailability.js';

class TestRequiredPluginsView extends ChatPolicyBlockedView {
	renderForTest(container: HTMLElement): void { this.renderBody(container); }
	layoutForTest(height: number, width: number): void { this.layoutBody(height, width); }
}

suite('Chat required plugins view', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const unavailable: IManagedPluginAvailability = { kind: 'unavailable', pluginIds: ['required-demo@managed-marketplace'] };

	function setup(initial: IManagedPluginAvailability | undefined = unavailable, width = 300) {
		const services = workbenchInstantiationService(undefined, store);
		services.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override readonly onDidChangeLocation = Event.None;
			override getViewLocationById() { return ViewContainerLocation.AuxiliaryBar; }
		}());
		const availability = new ManagedPluginAvailabilityService();
		availability.setState(initial);
		services.stub(IManagedPluginAvailabilityService, availability);
		const updateInfo = observableValue<IManagedSettingsUpdateInfo | undefined>('updateInfo', undefined);
		services.stub(IManagedSettingsUpdateService, { updateInfo });
		const opened: string[] = [];
		services.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(target: string | URI) { opened.push(target.toString()); return true; }
		}());
		const container = append(mainWindow.document.body, $('.pane-body'));
		container.style.width = `${width}px`;
		container.style.height = '120px';
		store.add(toDisposable(() => container.remove()));
		const view = store.add(services.createInstance(TestRequiredPluginsView, { id: MANAGED_PLUGINS_VIEW_ID, title: 'Chat' }));
		view.renderForTest(container);
		view.layoutForTest(120, width);
		return { view, container, availability, opened, updateInfo };
	}

	test('shows required plugins and Retry without a composer or update action', () => {
		const { container, opened } = setup();
		container.querySelector<HTMLElement>('.monaco-button')?.click();
		assert.deepStrictEqual({
			title: container.querySelector('.chat-welcome-view-title')?.textContent,
			detail: container.querySelector('.chat-welcome-view-disclaimer')?.textContent,
			buttons: [...container.querySelectorAll('.monaco-button')].map(button => button.textContent),
			inputs: container.querySelectorAll('textarea, input, .interactive-session').length,
			opened,
		}, {
			title: 'Required plugins unavailable',
			detail: 'Required: required-demo@managed-marketplace',
			buttons: ['Retry'],
			inputs: 0,
			opened: [`command:${RETRY_MANAGED_PLUGINS_COMMAND_ID}`],
		});
	});

	test('retry progress removes the action without losing focus and recovery clears the explanation', () => {
		const { container, availability } = setup();
		container.querySelector<HTMLElement>('.monaco-button')!.focus();
		availability.setState({ kind: 'installing', pluginIds: unavailable.pluginIds });
		const pending = {
			title: container.querySelector('.chat-welcome-view-title')?.textContent,
			buttons: container.querySelectorAll('.monaco-button').length,
			focused: mainWindow.document.activeElement === container.querySelector('.chat-policy-blocked-content'),
		};
		availability.setState(undefined);
		assert.deepStrictEqual({ pending, remaining: container.querySelector('.chat-policy-blocked-content')?.textContent }, {
			pending: { title: 'Installing required plugins', buttons: 0, focused: true },
			remaining: '',
		});
	});

	test('renders plugin identities as text rather than links or markup', () => {
		const pluginId = '[Run](command:unexpected.command)<a href="command:unexpected.command">Run</a>@managed';
		const { container } = setup({ kind: 'unavailable', pluginIds: [pluginId] });
		assert.deepStrictEqual({
			detail: container.querySelector('.chat-welcome-view-disclaimer')?.textContent,
			links: container.querySelectorAll('.chat-welcome-view-disclaimer a').length,
			buttons: [...container.querySelectorAll('.monaco-button')].map(button => button.textContent),
		}, {
			detail: `Required: ${pluginId}`,
			links: 0,
			buttons: ['Retry'],
		});
	});

	test('uses the same view for version restrictions and gives the update requirement precedence', () => {
		const { container, updateInfo, availability } = setup();
		updateInfo.set({
			title: 'Update required by your organization',
			message: 'A newer version is required.',
			detail: 'Installed: 1.140.0',
			action: { label: 'Check for Updates', href: 'command:update.checkForUpdate' },
			updateStatus: undefined,
		}, undefined);
		const update = {
			title: container.querySelector('.chat-welcome-view-title')?.textContent,
			button: container.querySelector('.monaco-button')?.textContent,
		};
		updateInfo.set(undefined, undefined);
		assert.deepStrictEqual({
			update,
			pluginTitle: container.querySelector('.chat-welcome-view-title')?.textContent,
			pluginStateUnchanged: availability.state.get(),
		}, {
			update: { title: 'Update required by your organization', button: 'Check for Updates' },
			pluginTitle: 'Required plugins unavailable',
			pluginStateUnchanged: unavailable,
		});
	});

	for (const width of [320, 480, 900]) {
		test(`wraps long identities inside a ${width}px pane and remains vertically scrollable`, () => {
			const { container, availability } = setup(unavailable, width);
			const longState: IManagedPluginAvailability = { kind: 'unavailable', pluginIds: [`${'required'.repeat(80)}@managed`] };
			availability.setState(longState);
			const content = container.querySelector<HTMLElement>('.chat-policy-blocked-content')!;
			assert.deepStrictEqual({
				fits: [...container.querySelectorAll<HTMLElement>('.chat-policy-blocked-content, .chat-welcome-view, .chat-welcome-view-title, .chat-welcome-view-message, .chat-welcome-view-message p, .chat-welcome-view-disclaimer')].every(element => element.scrollWidth <= element.clientWidth),
				scrolls: content.scrollHeight > content.clientHeight,
				height: content.clientHeight,
				detail: container.querySelector('.chat-welcome-view-disclaimer')?.textContent,
			}, {
				fits: true,
				scrolls: true,
				height: 120,
				detail: getManagedPluginBlockInfo(longState).detail,
			});
		});
	}
});
