/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { ComputerUsePermission, ComputerUsePermissionState, IComputerUseSetupActionV1, IComputerUseSetupV1, IComputerUseStatusV1 } from '../../../../../../platform/agentHost/common/computerUse.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { ComputerUseSetupPanel, getComputerUseSetupView, type IComputerUseSetupGuidance, type IComputerUseSetupModel } from '../../../browser/agentSessions/agentHost/computerUseSetupDialog.js';

function createStatus(permissions: readonly [ComputerUsePermissionState, ComputerUsePermissionState], setups: readonly IComputerUseSetupV1[], operation?: IComputerUseStatusV1['operation']): IComputerUseStatusV1 {
	return {
		schemaVersion: 1,
		permissions: [{ permission: 'accessibility', state: permissions[0] }, { permission: 'screenRecording', state: permissions[1] }],
		...(operation ? { operation } : {}),
		setups,
	};
}

function request(permission: ComputerUsePermission): IComputerUseSetupActionV1 {
	return { action: 'request', permission };
}

function openSettings(permission: ComputerUsePermission): IComputerUseSetupActionV1 {
	return { action: 'openSettings', permission };
}

const recheck: IComputerUseSetupActionV1 = { action: 'recheck' };

function setup(state: IComputerUseSetupV1['state'], round: number, actions: readonly IComputerUseSetupActionV1[] = [], error?: IComputerUseSetupV1['error']): IComputerUseSetupV1 {
	return { id: 'setup-1', chat: 'chat:a', state, round, actions, ...(error ? { error } : {}) };
}

class TestSetupModel implements IComputerUseSetupModel {
	readonly status = observableValue<IComputerUseStatusV1 | undefined>(this, undefined);
	readonly requests: { readonly setupId: string; readonly action: IComputerUseSetupActionV1 }[] = [];

	request(setupId: string, action: IComputerUseSetupActionV1): boolean {
		this.requests.push({ setupId, action });
		return true;
	}
}

suite('Computer Use setup modal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('derives what it shows from the host\'s verified status', () => {
		const guidance: IComputerUseSetupGuidance = { setupId: 'setup-1', permission: 'screenRecording' };
		const view = (status: IComputerUseStatusV1 | undefined, setupId: string | undefined = 'setup-1', withGuidance?: IComputerUseSetupGuidance) => {
			const result = getComputerUseSetupView(status, setupId, withGuidance);
			return {
				phase: result.phase,
				rows: result.rows.map(row => [row.permission, row.state, row.action?.action ?? null, row.busy]),
				kind: result.messageKind,
				canRecheck: result.canRecheck,
				canContinue: result.canContinue,
			};
		};
		const needsBoth = createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])]);
		assert.deepStrictEqual({
			unavailable: view(undefined),
			idle: view(createStatus(['unknown', 'unknown'], []), undefined),
			needsBoth: view(needsBoth),
			settingsFallback: view(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 2, [request('screenRecording'), openSettings('screenRecording'), recheck])]), 'setup-1', guidance),
			grantedElsewhere: view(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])])),
			allVerifiedElsewhere: view(createStatus(['granted', 'granted'], [setup('needsPermissions', 2, [request('screenRecording'), recheck], { code: 'stillNotGranted', message: 'Still off' })])),
			working: view(createStatus(['notGranted', 'notGranted'], [setup('working', 1)], { setupId: 'setup-1', ...request('screenRecording') })),
			stillOff: view(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 2, [request('accessibility'), request('screenRecording'), recheck], { code: 'stillNotGranted', message: 'Still off' })])),
			ready: view(createStatus(['granted', 'granted'], [setup('ready', 3)])),
			ended: view(createStatus(['notGranted', 'notGranted'], [setup('ended', 1, [], { code: 'notWaiting', message: 'Not waiting' })])),
		}, {
			unavailable: { phase: 'unavailable', rows: [], kind: 'info', canRecheck: false, canContinue: false },
			idle: { phase: 'idle', rows: [['accessibility', 'unknown', null, false], ['screenRecording', 'unknown', null, false]], kind: 'info', canRecheck: false, canContinue: false },
			needsBoth: { phase: 'needsPermissions', rows: [['accessibility', 'notGranted', 'request', false], ['screenRecording', 'notGranted', 'request', false]], kind: 'info', canRecheck: true, canContinue: false },
			settingsFallback: { phase: 'needsPermissions', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'notGranted', 'openSettings', false]], kind: 'info', canRecheck: true, canContinue: false },
			grantedElsewhere: { phase: 'needsPermissions', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'notGranted', 'request', false]], kind: 'info', canRecheck: true, canContinue: false },
			allVerifiedElsewhere: { phase: 'needsPermissions', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'granted', null, false]], kind: 'success', canRecheck: true, canContinue: true },
			working: { phase: 'working', rows: [['accessibility', 'notGranted', null, false], ['screenRecording', 'notGranted', null, true]], kind: 'progress', canRecheck: false, canContinue: false },
			stillOff: { phase: 'needsPermissions', rows: [['accessibility', 'notGranted', 'request', false], ['screenRecording', 'notGranted', 'request', false]], kind: 'error', canRecheck: true, canContinue: false },
			ready: { phase: 'ready', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'granted', null, false]], kind: 'success', canRecheck: false, canContinue: false },
			ended: { phase: 'ended', rows: [['accessibility', 'notGranted', null, false], ['screenRecording', 'notGranted', null, false]], kind: 'error', canRecheck: false, canContinue: false },
		});
		assert.deepStrictEqual({
			guidance: getComputerUseSetupView(needsBoth, 'setup-1', guidance).message !== getComputerUseSetupView(needsBoth, 'setup-1').message,
			stillOff: getComputerUseSetupView(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 2, [recheck], { code: 'stillNotGranted', message: 'Still off' })]), 'setup-1').message,
		}, { guidance: true, stillOff: 'Still off' });
	});

	suite('panel', () => {

		function createPanel(setupId: string | undefined = 'setup-1') {
			const disposables = store.add(new DisposableStore());
			const model = new TestSetupModel();
			const windowFocus = disposables.add(new Emitter<boolean>());
			const panel = disposables.add(new ComputerUseSetupPanel(model, setupId, { productName: 'Code - OSS', onDidChangeWindowFocus: windowFocus.event }));
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			container.appendChild(panel.element);
			const dismiss = disposables.add(new Button(container, { ...defaultButtonStyles }));
			panel.setDismissButton(dismiss);
			disposables.add({ dispose: () => container.remove() });
			const actionButtons = () => [...panel.element.querySelectorAll<HTMLElement>('.computer-use-setup-permission-action .monaco-button')];
			const recheckButton = () => panel.element.querySelector<HTMLElement>('.computer-use-setup-actions .monaco-button');
			const describe = (element: Element | null | undefined) => element ? { label: element.textContent, aria: element.getAttribute('aria-label'), disabled: element.classList.contains('disabled'), focused: mainWindow.document.activeElement === element } : null;
			return { model, panel, windowFocus, dismiss, actionButtons, recheckButton, describe };
		}

		test('focuses the next step, keeps focus while it runs, and moves it when the step is done', () => {
			const { model, panel, actionButtons, recheckButton, describe } = createPanel();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])]), undefined);
			panel.focus();
			const initial = { actions: actionButtons().map(describe), recheck: describe(recheckButton()) };
			actionButtons()[0].click();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('working', 1)], { setupId: 'setup-1', ...request('accessibility') }), undefined);
			const working = { actions: actionButtons().map(describe), recheck: describe(recheckButton()) };
			model.status.set(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 2, [request('screenRecording'), recheck])]), undefined);
			const next = { actions: actionButtons().map(describe), recheck: describe(recheckButton()) };

			assert.deepStrictEqual({ initial, requests: model.requests, working, next }, {
				initial: {
					actions: [
						{ label: 'Request Access', aria: 'Request Accessibility Access', disabled: false, focused: true },
						{ label: 'Request Access', aria: 'Request Screen Recording Access', disabled: false, focused: false },
					],
					recheck: { label: 'Check Again', aria: 'Check Permissions Again', disabled: false, focused: false },
				},
				requests: [{ setupId: 'setup-1', action: request('accessibility') }],
				working: {
					actions: [
						{ label: 'Request Access', aria: 'Request Accessibility Access', disabled: true, focused: true },
						{ label: 'Request Access', aria: 'Request Screen Recording Access', disabled: true, focused: false },
					],
					recheck: { label: 'Check Again', aria: 'Check Permissions Again', disabled: true, focused: false },
				},
				next: {
					actions: [{ label: 'Request Access', aria: 'Request Screen Recording Access', disabled: false, focused: true }],
					recheck: { label: 'Check Again', aria: 'Check Permissions Again', disabled: false, focused: false },
				},
			});
		});

		test('offers Continue when every permission was already verified while this setup waits, and focuses it', () => {
			const { model, panel, actionButtons, recheckButton, describe } = createPanel();
			model.status.set(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 1, [request('screenRecording'), recheck])]), undefined);
			panel.focus();
			const before = describe(recheckButton());
			model.status.set(createStatus(['granted', 'granted'], [setup('needsPermissions', 1, [request('screenRecording'), recheck])]), undefined);
			const continueControl = { actions: actionButtons().length, recheck: describe(recheckButton()), primary: !recheckButton()?.classList.contains('secondary') };
			recheckButton()?.click();
			assert.deepStrictEqual({ before, continueControl, requests: model.requests }, {
				before: { label: 'Check Again', aria: 'Check Permissions Again', disabled: false, focused: false },
				continueControl: { actions: 0, recheck: { label: 'Continue', aria: 'Continue Your Task', disabled: false, focused: true }, primary: true },
				requests: [{ setupId: 'setup-1', action: recheck }],
			});
		});

		test('checks again once when the user comes back from macOS, after the step that sent them there', () => {
			const { model, actionButtons, windowFocus } = createPanel();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])]), undefined);
			windowFocus.fire(true);
			actionButtons()[0].click();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('working', 1)], { setupId: 'setup-1', ...request('accessibility') }), undefined);
			windowFocus.fire(false);
			windowFocus.fire(true);
			const whileWorking = model.requests.length;
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 2, [request('accessibility'), openSettings('accessibility'), request('screenRecording'), recheck])]), undefined);
			windowFocus.fire(false);
			windowFocus.fire(true);
			assert.deepStrictEqual({ whileWorking, requests: model.requests.map(entry => entry.action) }, {
				whileWorking: 1,
				requests: [request('accessibility'), recheck],
			});
		});

		test('labels the modal\'s button by the setup\'s progress, and follows the newest waiting setup when opened without one', () => {
			const { model, dismiss } = createPanel(undefined);
			const label = () => ({ label: dismiss.element.textContent, secondary: dismiss.element.classList.contains('secondary') });
			model.status.set(createStatus(['unknown', 'unknown'], []), undefined);
			const idle = label();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), recheck])]), undefined);
			const waiting = label();
			model.status.set(createStatus(['granted', 'granted'], [setup('ready', 2)]), undefined);
			const ready = label();
			model.status.set(createStatus(['granted', 'granted'], [setup('ended', 2, [], { code: 'notWaiting', message: 'Not waiting' })]), undefined);
			assert.deepStrictEqual({ idle, waiting, ready, ended: label() }, {
				idle: { label: 'Close', secondary: false },
				waiting: { label: 'Not Now', secondary: true },
				ready: { label: 'Continue', secondary: false },
				ended: { label: 'Close', secondary: false },
			});
		});
	});
});
