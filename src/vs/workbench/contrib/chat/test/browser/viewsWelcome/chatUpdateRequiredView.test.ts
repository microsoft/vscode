/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { DisablementReason, State, UpdateType } from '../../../../../../platform/update/common/update.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { getManagedSettingsUpdateInfo, IManagedSettingsUpdateInfo, IManagedSettingsUpdateService, MANAGED_SETTINGS_UPDATE_VIEW_ID } from '../../../../../services/policies/common/managedSettingsUpdate.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatUpdateRequiredView } from '../../../browser/viewsWelcome/chatUpdateRequiredView.js';

class TestUpdateRequiredView extends ChatUpdateRequiredView {
	renderForTest(container: HTMLElement): void { this.renderBody(container); }
	layoutForTest(height: number, width: number): void { this.layoutBody(height, width); }
}

suite('Chat update required view', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const product = new class extends mock<IProductService>() {
		override readonly nameShort = 'Code';
		override readonly version = '1.140.0';
	}();
	const info = getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: '1.141.0' }, product, State.Idle(UpdateType.Archive));

	function setup(initial: IManagedSettingsUpdateInfo | undefined = info, width = 300) {
		const services = workbenchInstantiationService(undefined, store);
		services.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override readonly onDidChangeLocation = Event.None;
			override getViewLocationById() { return ViewContainerLocation.AuxiliaryBar; }
		}());
		const updateInfo = observableValue<IManagedSettingsUpdateInfo | undefined>('updateInfo', initial);
		services.stub(IManagedSettingsUpdateService, { updateInfo });
		const opened: string[] = [];
		services.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(target: string) { opened.push(target); return true; }
		}());
		const container = append(mainWindow.document.body, $('.pane-body'));
		container.style.width = `${width}px`;
		container.style.height = '120px';
		store.add(toDisposable(() => container.remove()));
		const view = store.add(services.createInstance(TestUpdateRequiredView, { id: MANAGED_SETTINGS_UPDATE_VIEW_ID, title: 'Chat' }));
		view.renderForTest(container);
		view.layoutForTest(120, width);
		return { view, container, updateInfo, opened };
	}

	test('renders a persistent read-only explanation and update action, not a composer', () => {
		const { container, opened } = setup();
		container.querySelector<HTMLElement>('.monaco-button')?.click();
		assert.deepStrictEqual({
			title: container.querySelector('.chat-welcome-view-title')?.textContent,
			detail: container.querySelector('.chat-welcome-view-disclaimer')?.textContent,
			buttons: [...container.querySelectorAll('.monaco-button')].map(button => button.textContent),
			inputs: container.querySelectorAll('textarea, input, .interactive-session').length,
			opened,
		}, { title: info.title, detail: info.detail, buttons: ['Check for Updates'], inputs: 0, opened: ['command:update.checkForUpdate'] });
	});

	test('late state updates replace content, retain focus and clear stale versions/actions', () => {
		const { container, updateInfo } = setup(undefined);
		updateInfo.set(info, undefined);
		container.querySelector<HTMLElement>('.monaco-button')!.focus();
		updateInfo.set({ ...info, message: 'Your organization requires Code 1.142.0 or later to use AI features.', action: { label: 'Restart to Update', href: 'command:update.restartToUpdate' } }, undefined);
		const updated = {
			message: container.querySelector('.chat-welcome-view-message')?.textContent,
			buttons: [...container.querySelectorAll('.monaco-button')].map(button => button.textContent),
			focused: mainWindow.document.activeElement === container.querySelector('.chat-update-required-content'),
		};
		updateInfo.set(undefined, undefined);
		assert.deepStrictEqual({ updated, remaining: container.querySelector('.chat-update-required-content')?.textContent }, {
			updated: { message: 'Your organization requires Code 1.142.0 or later to use AI features.', buttons: ['Restart to Update'], focused: true },
			remaining: '',
		});
	});

	test('disabled updates remove the primary action without adding a generic link or losing focus', () => {
		const { container, updateInfo } = setup();
		container.querySelector<HTMLElement>('.monaco-button')!.focus();
		const states = [DisablementReason.Policy, DisablementReason.NotBuilt, DisablementReason.ManuallyDisabled].map(reason => {
			updateInfo.set(getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: '1.141.0' }, product, State.Disabled(reason)), undefined);
			return {
				buttons: container.querySelectorAll('.monaco-button').length,
				links: container.querySelectorAll('.chat-update-required-content a').length,
				focused: mainWindow.document.activeElement === container.querySelector('.chat-update-required-content'),
				administrator: container.textContent!.includes('Contact your administrator'),
			};
		});
		updateInfo.set(info, undefined);
		assert.deepStrictEqual({ states, restoredAction: container.querySelector('.monaco-button')?.textContent }, {
			states: [
				{ buttons: 0, links: 0, focused: true, administrator: true },
				{ buttons: 0, links: 0, focused: true, administrator: false },
				{ buttons: 0, links: 0, focused: true, administrator: false },
			],
			restoredAction: 'Check for Updates',
		});
	});

	test('renders response metadata as text and keeps the explanation scrollable in small panels', () => {
		const maliciousVersion = '[Run](command:unexpected.command) https://example.com <a href="command:update.restartToUpdate">Run</a>';
		const { container } = setup(getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: maliciousVersion }, product, State.Idle(UpdateType.Archive)));
		const content = container.querySelector<HTMLElement>('.chat-update-required-content')!;
		const message = container.querySelector<HTMLElement>('.chat-welcome-view-message p')!;
		assert.deepStrictEqual({
			message: message.textContent,
			detail: container.querySelector('.chat-welcome-view-disclaimer')?.textContent,
			unexpectedLinks: container.querySelectorAll('.chat-welcome-view-message a').length,
			buttons: [...container.querySelectorAll('.monaco-button')].map(button => button.textContent),
			scrolls: content.scrollHeight > content.clientHeight,
			height: content.clientHeight,
			messageWraps: message.scrollWidth <= message.clientWidth,
		}, {
			message: `Your organization requires Code ${maliciousVersion} or later to use AI features.`,
			detail: 'Installed: 1.140.0',
			unexpectedLinks: 0,
			buttons: ['Check for Updates'],
			scrolls: true,
			height: 120,
			messageWraps: true,
		});
	});

	for (const width of [320, 480, 900]) {
		test(`wraps the explanation and long component/version text within a ${width}px Chat pane`, () => {
			const longProduct = new class extends mock<IProductService>() {
				override readonly nameShort = `Code-${'Enterprise'.repeat(25)}`;
				override readonly version = `1.140.0-${'preview'.repeat(25)}`;
			}();
			const longInfo = getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: `1.141.0-${'release'.repeat(25)}` }, longProduct, State.Idle(UpdateType.Archive));
			const { container, updateInfo } = setup(info, width);
			const fits = () => [...container.querySelectorAll<HTMLElement>('.chat-update-required-content, .chat-welcome-view, .chat-welcome-view-title, .chat-welcome-view-message, .chat-welcome-view-message p, .chat-welcome-view-disclaimer')].every(element => element.scrollWidth <= element.clientWidth);
			const standardFits = fits();
			updateInfo.set(longInfo, undefined);
			assert.deepStrictEqual({ standardFits, longTextFits: fits(), button: container.querySelector('.monaco-button')?.textContent }, {
				standardFits: true, longTextFits: true, button: 'Check for Updates',
			});
		});
	}
});
