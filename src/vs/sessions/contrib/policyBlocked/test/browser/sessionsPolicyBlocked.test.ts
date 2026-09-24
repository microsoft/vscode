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
import { DisablementReason, State, UpdateType } from '../../../../../platform/update/common/update.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { AccountPolicyGateState, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../../../../workbench/services/policies/common/accountPolicyService.js';
import { getManagedSettingsUpdateInfo, IManagedSettingsUpdateInfo, IManagedSettingsUpdateService } from '../../../../../workbench/services/policies/common/managedSettingsUpdate.js';
import { TestLayoutService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { SessionsPolicyBlockedContribution } from '../../browser/policyBlocked.contribution.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';

suite('Sessions policy update explanation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const product = new class extends mock<IProductService>() {
		override readonly nameShort = 'Code';
		override readonly version = '1.140.0';
		override readonly urlProtocol = 'code-oss';
	}();
	const info = getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: '1.141.0' }, product, State.Idle(UpdateType.Archive));

	function setup(initial: IManagedSettingsUpdateInfo | undefined, agentEnabled = true) {
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
		const updateInfo = observableValue<IManagedSettingsUpdateInfo | undefined>('updateInfo', initial);
		const configuration = new TestConfigurationService({ [ChatConfiguration.AgentEnabled]: agentEnabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const gateChange = store.add(new Emitter<IAccountPolicyGateInfo>());
		const gate = new class extends mock<IAccountPolicyGateService>() {
			override gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
			override readonly onDidChangeGateInfo = gateChange.event;
		}();
		const opened: string[] = [];
		services.stub(IWorkbenchLayoutService, layout);
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
		return { root, content, updateInfo, opened, contribution, layout, layoutEvent, gateChange, activeSession, fallbackFocusTarget, fallbackFocusCalls };
	}

	test('initially blocked Agents shows versions and a keyboard-focusable update action below the title bar', () => {
		const { root, content, opened, contribution, layout, layoutEvent } = setup(info);
		const overlay = root.querySelector<HTMLElement>('.sessions-policy-blocked-overlay')!;
		const button = overlay.querySelector<HTMLElement>('.monaco-button')!;
		const initial = {
			title: overlay.querySelector('h2')?.textContent,
			message: overlay.querySelector('p')?.textContent,
			details: [...overlay.querySelectorAll('p')].map(p => p.textContent),
			button: button.textContent,
			recoveryButtons: [...overlay.querySelectorAll('.monaco-button')].map(button => button.textContent),
			focused: mainWindow.document.activeElement === button,
			top: overlay.style.top,
			inert: content.inert,
		};
		button.click();
		overlay.querySelector<HTMLElement>('.monaco-button.secondary')!.click();
		layout.mainContainerOffset = { top: 48, quickPickTop: 48 };
		layoutEvent.fire({ width: 800, height: 600 });
		const newTop = overlay.style.top;
		contribution.dispose();
		assert.deepStrictEqual({ initial, opened, newTop, inert: content.inert, overlays: root.querySelectorAll('.sessions-policy-blocked-overlay').length }, {
			initial: { title: info.title, message: info.message, details: [info.message, info.detail], button: 'Check for Updates', recoveryButtons: ['Check for Updates', 'Open Editor Window'], focused: true, top: '30px', inert: true },
			opened: ['command:update.checkForUpdate', URI.from({ scheme: 'code-oss', query: 'windowId=_blank' }).toString()],
			newTop: '48px',
			inert: false,
			overlays: 0,
		});
	});

	test('late update explanation replaces but never relabels unrelated agent restrictions and clears cleanly', () => {
		const { root, updateInfo, content, gateChange } = setup(undefined, false);
		const titles: (string | null | undefined)[] = [];
		const capture = () => titles.push(root.querySelector('h2')?.textContent);
		capture();
		updateInfo.set(info, undefined);
		const first = root.querySelector('.sessions-policy-blocked-overlay');
		gateChange.fire({ state: AccountPolicyGateState.Inactive });
		assert.strictEqual(root.querySelector('.sessions-policy-blocked-overlay'), first);
		capture();
		updateInfo.set({ ...info, message: 'Your organization requires Code 1.142.0 or later to use AI features.' }, undefined);
		capture();
		updateInfo.set(undefined, undefined);
		capture();
		assert.deepStrictEqual({ titles, inert: content.inert, overlays: root.querySelectorAll('.sessions-policy-blocked-overlay').length }, {
			titles: ['Agents Disabled', info.title, info.title, 'Agents Disabled'],
			inert: false,
			overlays: 1,
		});
	});

	test('disabled updates leave only Open Editor Window as the Agents recovery action', () => {
		const { root, updateInfo } = setup(info);
		const states = [DisablementReason.Policy, DisablementReason.NotBuilt, DisablementReason.ManuallyDisabled].map(reason => {
			updateInfo.set(getManagedSettingsUpdateInfo({ errorCode: 'client_update_required', minimumClientVersion: '1.141.0' }, product, State.Disabled(reason)), undefined);
			const overlay = root.querySelector<HTMLElement>('.sessions-policy-blocked-overlay')!;
			return {
				buttons: [...overlay.querySelectorAll('.monaco-button')].map(button => button.textContent),
				focused: mainWindow.document.activeElement?.textContent,
				instructions: overlay.textContent!.includes('Update Instructions'),
				administrator: overlay.textContent!.includes('Contact your administrator'),
			};
		});
		assert.deepStrictEqual(states, [
			{ buttons: ['Open Editor Window'], focused: 'Open Editor Window', instructions: false, administrator: true },
			{ buttons: ['Open Editor Window'], focused: 'Open Editor Window', instructions: false, administrator: false },
			{ buttons: ['Open Editor Window'], focused: 'Open Editor Window', instructions: false, administrator: false },
		]);
	});

	test('satisfying or removing the compatibility requirement removes the overlay', () => {
		const { root, updateInfo, content } = setup(undefined);
		const counts: number[] = [];
		for (const value of [info, undefined, info, undefined]) {
			updateInfo.set(value, undefined);
			counts.push(root.querySelectorAll('.sessions-policy-blocked-overlay').length);
		}
		assert.deepStrictEqual({ counts, inert: content.inert }, { counts: [1, 0, 1, 0], inert: false });
	});

	test('restores prior focus after clearing inert state, including after an overlay rerender', () => {
		const { content, updateInfo, fallbackFocusCalls } = setup(undefined);
		const previous = append(content, $('button', undefined, 'Previously focused action'));
		previous.focus();
		updateInfo.set(info, undefined);
		updateInfo.set({ ...info, action: undefined }, undefined);
		updateInfo.set(undefined, undefined);
		assert.deepStrictEqual({
			restored: mainWindow.document.activeElement === previous,
			inert: content.inert,
			fallbackFocusCalls,
		}, { restored: true, inert: false, fallbackFocusCalls: [] });
	});

	test('does not steal focus from another surface when the block clears', () => {
		const { root, content, updateInfo, fallbackFocusCalls } = setup(undefined);
		const previous = append(content, $('button', undefined, 'Previous action'));
		const otherSurface = append(root, $('button', undefined, 'Title bar action'));
		previous.focus();
		updateInfo.set(info, undefined);
		otherSurface.focus();
		updateInfo.set(undefined, undefined);
		assert.deepStrictEqual({
			preserved: mainWindow.document.activeElement === otherSurface,
			inert: content.inert,
			fallbackFocusCalls,
		}, { preserved: true, inert: false, fallbackFocusCalls: [] });
	});

	test('does not steal focus from another surface when the update overlay rerenders', () => {
		const { root, updateInfo, fallbackFocusCalls } = setup(info);
		const otherSurface = append(root, $('button', undefined, 'Title bar action'));
		otherSurface.focus();
		updateInfo.set({ ...info, action: undefined }, undefined);
		const preservedDuringUpdate = mainWindow.document.activeElement === otherSurface;
		updateInfo.set(undefined, undefined);
		assert.deepStrictEqual({
			preservedDuringUpdate,
			preservedAfterClear: mainWindow.document.activeElement === otherSurface,
			fallbackFocusCalls,
		}, { preservedDuringUpdate: true, preservedAfterClear: true, fallbackFocusCalls: [] });
	});

	for (const unavailable of ['removed', 'disabled'] as const) {
		test(`focuses the active Sessions view if the prior target is ${unavailable}`, () => {
			const { content, updateInfo, activeSession, fallbackFocusTarget, fallbackFocusCalls } = setup(undefined);
			activeSession.set(new class extends mock<IActiveSession>() { override readonly sessionId = 'active-session'; }(), undefined);
			const previous = append(content, $('button', undefined, 'Previous action'));
			previous.focus();
			updateInfo.set(info, undefined);
			if (unavailable === 'removed') {
				previous.remove();
			} else {
				previous.setAttribute('disabled', '');
			}
			updateInfo.set(undefined, undefined);
			assert.deepStrictEqual({
				focused: mainWindow.document.activeElement === fallbackFocusTarget,
				fallbackFocusCalls,
			}, { focused: true, fallbackFocusCalls: [{ sessionId: 'active-session', inert: false }] });
		});
	}

	test('startup clearance focuses the Sessions placeholder instead of the document body', () => {
		const temporary = append(mainWindow.document.body, $('button'));
		temporary.focus();
		temporary.remove();
		const { updateInfo, fallbackFocusTarget, fallbackFocusCalls } = setup(info);
		updateInfo.set(undefined, undefined);
		assert.deepStrictEqual({
			focused: mainWindow.document.activeElement === fallbackFocusTarget,
			fallbackFocusCalls,
		}, { focused: true, fallbackFocusCalls: [{ sessionId: undefined, inert: false }] });
	});

	test('wraps long unbroken versions and keeps recovery actions reachable in a short viewport', async () => {
		const { root, updateInfo, layoutEvent } = setup(undefined);
		root.style.width = '320px';
		root.style.height = '220px';
		const longInfo = getManagedSettingsUpdateInfo({
			errorCode: 'client_update_required',
			clientVersion: `1.140.0-${'installed'.repeat(40)}`,
			minimumClientVersion: `1.141.0-${'required'.repeat(120)}`,
		}, product, State.Idle(UpdateType.Archive));
		updateInfo.set(longInfo, undefined);
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
			scrollsToAction: scrollContent.scrollTop > 0,
			actionVisible: buttonBounds.top >= viewport.top && buttonBounds.bottom <= viewport.bottom,
			focusedActionStillVisibleAfterResize: resizedButton.top >= resizedViewport.top && resizedButton.bottom <= resizedViewport.bottom,
			focused: mainWindow.document.activeElement === button,
		}, { noHorizontalOverflow: true, verticalOverflow: true, scrollsToAction: true, actionVisible: true, focusedActionStillVisibleAfterResize: true, focused: true });
	});

	test('leaves generic blocked-state layout unchanged', () => {
		const { root } = setup(undefined, false);
		const overlay = root.querySelector<HTMLElement>('.sessions-policy-blocked-overlay')!;
		assert.deepStrictEqual({
			updateStyles: overlay.classList.contains('update-required'),
			display: mainWindow.getComputedStyle(overlay).display,
			scrollContainers: overlay.querySelectorAll('.sessions-policy-blocked-scrollable').length,
		}, { updateStyles: false, display: 'flex', scrollContainers: 0 });
	});
});
