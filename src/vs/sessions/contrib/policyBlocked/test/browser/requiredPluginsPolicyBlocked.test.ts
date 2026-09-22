/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IManagedPluginAvailability, IManagedPluginAvailabilityService, ManagedPluginAvailabilityService, RETRY_MANAGED_PLUGINS_COMMAND_ID } from '../../../../../workbench/contrib/chat/common/plugins/managedPluginAvailability.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { AccountPolicyGateState, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../../../../workbench/services/policies/common/accountPolicyService.js';
import { TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IManagedSettingsUpdateInfo, IManagedSettingsUpdateService } from '../../../../../workbench/services/policies/common/managedSettingsUpdate.js';
import { SessionsPolicyBlockedContribution } from '../../browser/policyBlocked.contribution.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';

suite('Sessions required plugins explanation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const unavailable: IManagedPluginAvailability = { kind: 'unavailable', pluginIds: ['required@managed'] };
	const product = new class extends mock<IProductService>() {
		override readonly nameShort = 'Code';
		override readonly urlProtocol = 'code-oss';
	}();

	function setup(initial: IManagedPluginAvailability | undefined, agentEnabled = true) {
		const services = store.add(new TestInstantiationService());
		const root = append(mainWindow.document.body, $('div'));
		root.style.position = 'relative';
		root.style.width = '600px';
		root.style.height = '400px';
		store.add(toDisposable(() => root.remove()));
		const content = append(root, $('div'));
		const fallbackFocusTarget = append(content, $('input', { 'aria-label': 'Session input' }));
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const fallbackFocusCalls: { sessionId: string | undefined; inert: boolean }[] = [];
		const layoutEvent = store.add(new Emitter<{ width: number; height: number }>());
		const layout = new class extends TestLayoutService {
			override mainContainer = root;
			override mainContainerOffset = { top: 30, quickPickTop: 30 };
			override onDidLayoutMainContainer = layoutEvent.event;
		}();
		layout.getContainer = () => content;
		const availability = new ManagedPluginAvailabilityService();
		availability.setState(initial);
		const configuration = new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: agentEnabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const gateChange = store.add(new Emitter<IAccountPolicyGateInfo>());
		const gate = new class extends mock<IAccountPolicyGateService>() {
			override gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
			override readonly onDidChangeGateInfo = gateChange.event;
		}();
		const opened: string[] = [];
		services.stub(IWorkbenchLayoutService, layout);
		services.stub(IManagedPluginAvailabilityService, availability);
		const updateInfo = observableValue<IManagedSettingsUpdateInfo | undefined>('updateInfo', undefined);
		services.stub(IManagedSettingsUpdateService, { updateInfo });
		services.stub(IConfigurationService, configuration);
		services.stub(IAccountPolicyGateService, gate);
		services.stub(ISessionsService, { activeSession });
		services.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
			override focusSession(session: IActiveSession | undefined): void {
				fallbackFocusCalls.push({ sessionId: session?.sessionId, inert: content.inert });
				fallbackFocusTarget.focus();
			}
		}());
		services.stub(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly currentDefaultAccount = null;
		}());
		services.stub(IProductService, product);
		services.stub(ICommandService, new class extends mock<ICommandService>() { }());
		services.stub(IOpenerService, new class extends mock<IOpenerService>() {
			override async open(target: string | URI) { opened.push(target.toString()); return true; }
		}());
		const contribution = store.add(services.createInstance(SessionsPolicyBlockedContribution));
		return { root, content, availability, opened, contribution, layout, layoutEvent, gateChange, activeSession, fallbackFocusTarget, fallbackFocusCalls, updateInfo };
	}

	test('shows one blocking region with Retry and a fresh editor-window action', () => {
		const { root, content, opened, contribution, layout, layoutEvent } = setup(unavailable);
		const overlay = root.querySelector<HTMLElement>('.sessions-policy-blocked-overlay')!;
		const button = overlay.querySelector<HTMLElement>('.monaco-button')!;
		const initial = {
			title: overlay.querySelector('h2')?.textContent,
			role: overlay.getAttribute('role'),
			buttons: [...overlay.querySelectorAll('.monaco-button')].map(button => button.textContent),
			focused: mainWindow.document.activeElement === button,
			top: overlay.style.top,
			inert: content.inert,
			overlays: root.querySelectorAll('.sessions-policy-blocked-overlay').length,
		};
		button.click();
		overlay.querySelector<HTMLElement>('.monaco-button.secondary')!.click();
		layout.mainContainerOffset = { top: 48, quickPickTop: 48 };
		layoutEvent.fire({ width: 800, height: 600 });
		const newTop = overlay.style.top;
		contribution.dispose();
		assert.deepStrictEqual({ initial, opened, newTop, inert: content.inert, remaining: root.querySelectorAll('.sessions-policy-blocked-overlay').length }, {
			initial: { title: 'Required plugins unavailable', role: 'region', buttons: ['Retry', 'Open Editor Window'], focused: true, top: '30px', inert: true, overlays: 1 },
			opened: [`command:${RETRY_MANAGED_PLUGINS_COMMAND_ID}`, URI.from({ scheme: 'code-oss', query: 'windowId=_blank' }).toString()],
			newTop: '48px',
			inert: false,
			remaining: 0,
		});
	});

	test('keeps stronger agent restrictions and generic blocked-state layout unchanged', () => {
		const { root, availability } = setup(undefined, false);
		availability.setState(unavailable);
		const overlay = root.querySelector<HTMLElement>('.sessions-policy-blocked-overlay')!;
		assert.deepStrictEqual({
			title: root.querySelector('h2')?.textContent,
			pluginStyles: overlay.classList.contains('required-plugins'),
			display: mainWindow.getComputedStyle(overlay).display,
			scrollContainers: overlay.querySelectorAll('.sessions-policy-blocked-scrollable').length,
		}, { title: 'Agents Disabled', pluginStyles: false, display: 'flex', scrollContainers: 0 });
	});

	test('uses one overlay for minimum-version and plugin requirements without clearing either policy', () => {
		const { root, availability, updateInfo } = setup(unavailable);
		updateInfo.set({
			title: 'Update required by your organization',
			message: 'A newer version is required.',
			detail: undefined,
			action: { label: 'Check for Updates', href: 'command:update.checkForUpdate' },
			updateStatus: undefined,
		}, undefined);
		const update = {
			title: root.querySelector('h2')?.textContent,
			count: root.querySelectorAll('.sessions-policy-blocked-overlay').length,
			buttons: [...root.querySelectorAll('.monaco-button')].map(button => button.textContent),
		};
		updateInfo.set(undefined, undefined);
		assert.deepStrictEqual({
			update,
			pluginTitle: root.querySelector('h2')?.textContent,
			pluginState: availability.state.get(),
		}, {
			update: { title: 'Update required by your organization', count: 1, buttons: ['Check for Updates', 'Open Editor Window'] },
			pluginTitle: 'Required plugins unavailable',
			pluginState: unavailable,
		});
	});

	test('deduplicates unchanged state, shows installation progress and clears after recovery', () => {
		const { root, availability, content, gateChange } = setup(unavailable);
		const first = root.querySelector('.sessions-policy-blocked-overlay');
		gateChange.fire({ state: AccountPolicyGateState.Inactive });
		const unchanged = root.querySelector('.sessions-policy-blocked-overlay') === first;
		availability.setState({ kind: 'installing', pluginIds: unavailable.pluginIds });
		const pending = {
			title: root.querySelector('h2')?.textContent,
			buttons: [...root.querySelectorAll('.monaco-button')].map(button => button.textContent),
		};
		availability.setState(undefined);
		assert.deepStrictEqual({ unchanged, pending, inert: content.inert, overlays: root.querySelectorAll('.sessions-policy-blocked-overlay').length }, {
			unchanged: true,
			pending: { title: 'Installing required plugins', buttons: ['Open Editor Window'] },
			inert: false,
			overlays: 0,
		});
	});

	test('restores prior focus after clearing inert state, including after rerender', () => {
		const { content, availability, fallbackFocusCalls } = setup(undefined);
		const previous = append(content, $('button', undefined, 'Previously focused action'));
		previous.focus();
		availability.setState(unavailable);
		availability.setState({ kind: 'installing', pluginIds: unavailable.pluginIds });
		availability.setState(undefined);
		assert.deepStrictEqual({
			restored: mainWindow.document.activeElement === previous,
			inert: content.inert,
			fallbackFocusCalls,
		}, { restored: true, inert: false, fallbackFocusCalls: [] });
	});

	test('does not steal focus from another surface on rerender or recovery', () => {
		const { root, content, availability, fallbackFocusCalls } = setup(unavailable);
		const other = append(root, $('button', undefined, 'Title bar action'));
		other.focus();
		availability.setState({ kind: 'installing', pluginIds: unavailable.pluginIds });
		const preservedDuringUpdate = mainWindow.document.activeElement === other;
		availability.setState(undefined);
		assert.deepStrictEqual({
			preservedDuringUpdate,
			preservedAfterClear: mainWindow.document.activeElement === other,
			inert: content.inert,
			fallbackFocusCalls,
		}, { preservedDuringUpdate: true, preservedAfterClear: true, inert: false, fallbackFocusCalls: [] });
	});

	for (const priorTarget of ['removed', 'disabled'] as const) {
		test(`focuses the active session if the prior target is ${priorTarget}`, () => {
			const { content, availability, activeSession, fallbackFocusTarget, fallbackFocusCalls } = setup(undefined);
			activeSession.set(new class extends mock<IActiveSession>() { override readonly sessionId = 'active-session'; }(), undefined);
			const previous = append(content, $('button', undefined, 'Previous action'));
			previous.focus();
			availability.setState(unavailable);
			if (priorTarget === 'removed') {
				previous.remove();
			} else {
				previous.setAttribute('disabled', '');
			}
			availability.setState(undefined);
			assert.deepStrictEqual({
				focused: mainWindow.document.activeElement === fallbackFocusTarget,
				fallbackFocusCalls,
			}, { focused: true, fallbackFocusCalls: [{ sessionId: 'active-session', inert: false }] });
		});
	}

	test('long plugin identities wrap and focused recovery actions remain visible after resize', async () => {
		const { root, availability, layoutEvent } = setup(undefined);
		root.style.width = '320px';
		root.style.height = '220px';
		availability.setState({ kind: 'unavailable', pluginIds: [`${'required'.repeat(120)}@managed`] });
		const overlay = root.querySelector<HTMLElement>('.sessions-policy-blocked-overlay')!;
		const scrollContent = root.querySelector<HTMLElement>('.sessions-policy-blocked-scroll-content')!;
		const button = overlay.querySelector<HTMLElement>('.monaco-button.secondary')!;
		button.focus();
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		const viewport = scrollContent.getBoundingClientRect();
		const buttonBounds = button.getBoundingClientRect();
		root.style.height = '160px';
		layoutEvent.fire({ width: 320, height: 160 });
		const resizedViewport = scrollContent.getBoundingClientRect();
		const resizedButton = button.getBoundingClientRect();
		assert.deepStrictEqual({
			noHorizontalOverflow: [...overlay.querySelectorAll<HTMLElement>('.sessions-policy-blocked-scroll-content, .sessions-policy-blocked-card, h2, p')].every(element => element.scrollWidth <= element.clientWidth),
			verticalOverflow: scrollContent.scrollHeight > scrollContent.clientHeight,
			actionVisible: buttonBounds.top >= viewport.top && buttonBounds.bottom <= viewport.bottom,
			resizedActionVisible: resizedButton.top >= resizedViewport.top && resizedButton.bottom <= resizedViewport.bottom,
			focused: mainWindow.document.activeElement === button,
		}, { noHorizontalOverflow: true, verticalOverflow: true, actionVisible: true, resizedActionVisible: true, focused: true });
	});
});
