/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { ComputerUsePermission, ComputerUsePermissionState, IComputerUseSetupActionV1, IComputerUseSetupV1, IComputerUseStatusV1 } from '../../../../../../platform/agentHost/common/computerUse.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { ComputerUseSetupDialog, ComputerUseSetupPanel, getComputerUseSetupView, type IComputerUseHelperAppSupport, type IComputerUseSetupModel } from '../../../browser/agentSessions/agentHost/computerUseSetupDialog.js';

const helperApp = { path: '/Users/me/.copilot/computer-use/Copilot Computer Use.app', icon: 'data:image/png;base64,iVBORw0KGgo=' };

function createStatus(permissions: readonly [ComputerUsePermissionState, ComputerUsePermissionState], setups: readonly IComputerUseSetupV1[], operation?: IComputerUseStatusV1['operation']): IComputerUseStatusV1 {
	return {
		schemaVersion: 1,
		permissions: [{ permission: 'accessibility', state: permissions[0] }, { permission: 'screenRecording', state: permissions[1] }],
		...(operation ? { operation } : {}),
		setups,
		helperApp,
	};
}

function allow(permission: ComputerUsePermission): IComputerUseSetupActionV1 {
	return { action: 'allow', permission };
}

const recheck: IComputerUseSetupActionV1 = { action: 'recheck' };

function setup(state: IComputerUseSetupV1['state'], round: number, actions: readonly IComputerUseSetupActionV1[] = [], error?: IComputerUseSetupV1['error']): IComputerUseSetupV1 {
	return { id: 'setup-1', chat: 'chat:a', state, round, actions, ...(error ? { error } : {}) };
}

const needsBoth = createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [allow('accessibility'), allow('screenRecording'), recheck])]);
const allowingAccessibility = createStatus(['notGranted', 'notGranted'], [setup('working', 1)], { setupId: 'setup-1', ...allow('accessibility') });
const needsScreenRecording = createStatus(['granted', 'notGranted'], [setup('needsPermissions', 2, [allow('screenRecording'), recheck])]);
const checkingScreenRecording = createStatus(['granted', 'notGranted'], [setup('working', 2)], { setupId: 'setup-1', ...recheck });
const ready = createStatus(['granted', 'granted'], [setup('ready', 3)]);
const ended = createStatus(['notGranted', 'notGranted'], [setup('ended', 1)]);

class TestSetupModel implements IComputerUseSetupModel {
	readonly status = observableValue<IComputerUseStatusV1 | undefined>(this, undefined);
	readonly requests: { readonly setupId: string; readonly action: IComputerUseSetupActionV1 }[] = [];

	constructor(readonly helperApp?: IComputerUseHelperAppSupport) { }

	request(setupId: string, action: IComputerUseSetupActionV1): boolean {
		this.requests.push({ setupId, action });
		return true;
	}
}

class TestHelperAppSupport implements IComputerUseHelperAppSupport {
	readonly drags: string[] = [];

	startDrag(path: string): void {
		this.drags.push(path);
	}
}

suite('Computer Use setup modal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('derives what it shows from the host\'s verified status, and nothing once the setup no longer waits', () => {
		const view = (status: IComputerUseStatusV1 | undefined, setupId = 'setup-1') => {
			const result = getComputerUseSetupView(status, setupId);
			return result && { ...result, rows: result.rows.map(row => `${row.permission} ${row.state}${row.current ? ' current' : ''}`) };
		};
		assert.deepStrictEqual({
			unpublished: view(undefined),
			missing: view(needsBoth, 'setup-2'),
			ended: view(ended),
			needsBoth: view(needsBoth),
			allowing: view(allowingAccessibility),
			grantedElsewhere: view(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 1, [allow('accessibility'), allow('screenRecording'), recheck])])),
			stillOff: view(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 3, [allow('screenRecording'), recheck], { code: 'stillNotGranted', message: 'Still off' })])),
			checking: view(checkingScreenRecording),
			ready: view(ready),
		}, {
			unpublished: undefined,
			missing: undefined,
			ended: undefined,
			needsBoth: { setupId: 'setup-1', state: 'needsPermissions', rows: ['accessibility notGranted current', 'screenRecording notGranted'], canAllow: true, canRecheck: true },
			allowing: { setupId: 'setup-1', state: 'working', rows: ['accessibility notGranted current', 'screenRecording notGranted'], canAllow: false, canRecheck: false },
			grantedElsewhere: { setupId: 'setup-1', state: 'needsPermissions', rows: ['accessibility granted', 'screenRecording notGranted current'], canAllow: true, canRecheck: true },
			stillOff: { setupId: 'setup-1', state: 'needsPermissions', rows: ['accessibility granted', 'screenRecording notGranted current'], canAllow: true, canRecheck: true, error: 'Still off' },
			checking: { setupId: 'setup-1', state: 'working', rows: ['accessibility granted', 'screenRecording notGranted current'], canAllow: false, canRecheck: false },
			ready: { setupId: 'setup-1', state: 'ready', rows: ['accessibility granted', 'screenRecording granted'], canAllow: false, canRecheck: false },
		});
	});

	suite('panel', () => {

		function createPanel(status: IComputerUseStatusV1, helperAppSupport?: IComputerUseHelperAppSupport) {
			const disposables = store.add(new DisposableStore());
			const model = new TestSetupModel(helperAppSupport);
			model.status.set(status, undefined);
			const windowFocus = disposables.add(new Emitter<boolean>());
			let closed = 0;
			const panel = disposables.add(new ComputerUseSetupPanel(model, 'setup-1', { onDidChangeWindowFocus: windowFocus.event, close: () => closed++ }));
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			container.appendChild(panel.appIcon);
			container.appendChild(panel.element);
			disposables.add(toDisposable(() => container.remove()));
			const focused = (element: Element | null) => element !== null && mainWindow.document.activeElement === element;
			const rows = () => [...panel.element.querySelectorAll<HTMLElement>('.computer-use-setup-permission')].map(row => {
				const refresh = row.querySelector<HTMLElement>('.action-label');
				const allowButton = row.querySelector<HTMLElement>('.monaco-button');
				return {
					label: row.getAttribute('aria-label'),
					granted: row.querySelector('.computer-use-setup-permission-status.granted') !== null,
					refresh: refresh && { aria: refresh.getAttribute('aria-label'), icon: [...refresh.classList].filter(name => name.startsWith('codicon-')).join(' '), disabled: refresh.classList.contains('disabled'), focused: focused(refresh) },
					allow: allowButton && { label: allowButton.textContent, aria: allowButton.getAttribute('aria-label'), disabled: allowButton.classList.contains('disabled'), focused: focused(allowButton) },
				};
			});
			const allowButton = () => panel.element.querySelector<HTMLElement>('.computer-use-setup-permission .monaco-button');
			const refreshButton = () => panel.element.querySelector<HTMLElement>('.computer-use-setup-permission .action-label');
			return { model, panel, windowFocus, closed: () => closed, rows, allowButton, refreshButton };
		}

		test('offers controls for the current permission only, keeps them in place while a step runs, and moves focus on with the step', () => {
			const { model, panel, rows, allowButton } = createPanel(needsBoth);
			panel.focus();
			const first = rows();
			// The modal moves focus itself, link by link, across its body.
			const tabStops = [...panel.element.querySelectorAll<HTMLElement>('a')].map(link => {
				link.focus();
				return { aria: link.getAttribute('aria-label'), reached: mainWindow.document.activeElement === link };
			});
			allowButton()?.focus();
			allowButton()?.click();
			model.status.set(allowingAccessibility, undefined);
			const allowing = rows();
			model.status.set(needsScreenRecording, undefined);

			assert.deepStrictEqual({ first, tabStops, requests: model.requests, allowing, next: rows() }, {
				first: [
					{
						label: 'Accessibility, Not granted. Click and type in apps',
						granted: false,
						refresh: { aria: 'Check Accessibility Again', icon: 'codicon-refresh', disabled: false, focused: false },
						allow: { label: 'Allow in Settings', aria: 'Allow Accessibility in System Settings', disabled: false, focused: true },
					},
					{ label: 'Screen Recording, Not granted. See app windows', granted: false, refresh: null, allow: null },
				],
				tabStops: [{ aria: 'Check Accessibility Again', reached: true }, { aria: 'Allow Accessibility in System Settings', reached: true }],
				requests: [{ setupId: 'setup-1', action: allow('accessibility') }],
				allowing: [
					{
						label: 'Accessibility, Not granted. Click and type in apps',
						granted: false,
						refresh: { aria: 'Check Accessibility Again', icon: 'codicon-loading codicon-modifier-spin', disabled: true, focused: false },
						allow: { label: 'Allow in Settings', aria: 'Allow Accessibility in System Settings', disabled: true, focused: true },
					},
					{ label: 'Screen Recording, Not granted. See app windows', granted: false, refresh: null, allow: null },
				],
				next: [
					{ label: 'Accessibility, Granted. Click and type in apps', granted: true, refresh: null, allow: null },
					{
						label: 'Screen Recording, Not granted. See app windows',
						granted: false,
						refresh: { aria: 'Check Screen Recording Again', icon: 'codicon-refresh', disabled: false, focused: false },
						allow: { label: 'Allow in Settings', aria: 'Allow Screen Recording in System Settings', disabled: false, focused: true },
					},
				],
			});
		});

		test('checks the current permission again from its refresh button, which runs as the key goes down because the modal stops key releases', () => {
			const { model, refreshButton } = createPanel(needsBoth);
			refreshButton()?.click();
			refreshButton()?.focus();
			// The test window has no focus, so the browser doesn't report focus changes on its own.
			refreshButton()?.dispatchEvent(new FocusEvent('focus'));
			refreshButton()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			assert.deepStrictEqual(model.requests, [{ setupId: 'setup-1', action: recheck }, { setupId: 'setup-1', action: recheck }]);
		});

		test('shows the app\'s own icon once the host read it', () => {
			const { model, panel } = createPanel({ ...needsBoth, helperApp: { path: helperApp.path } });
			const icon = () => ({ image: panel.appIcon.classList.contains('has-image'), src: panel.appIcon.querySelector('img')?.getAttribute('src') });
			const withoutIcon = icon();
			model.status.set(needsBoth, undefined);
			assert.deepStrictEqual({ withoutIcon, withIcon: icon() }, {
				withoutIcon: { image: false, src: '' },
				withIcon: { image: true, src: helperApp.icon },
			});
		});

		test('offers the app for dragging into System Settings under the current permission, on clients that can drag it', () => {
			const support = new TestHelperAppSupport();
			const { model, panel } = createPanel(needsBoth, support);
			const chip = () => {
				const element = panel.element.querySelector<HTMLElement>('.computer-use-setup-helper-app-chip');
				const row = [...panel.element.querySelectorAll('.computer-use-setup-permission')].findIndex(candidate => !!element && candidate.contains(element));
				return element && { row, ariaHidden: element.getAttribute('aria-hidden'), draggable: element.draggable, icon: element.querySelector('img')?.getAttribute('src'), name: element.textContent };
			};
			const first = chip();
			const drag = new DragEvent('dragstart', { bubbles: true, cancelable: true });
			panel.element.querySelector('.computer-use-setup-helper-app-chip')?.dispatchEvent(drag);
			model.status.set(needsScreenRecording, undefined);
			const next = chip();
			model.status.set(checkingScreenRecording, undefined);
			const whileChecking = chip();
			model.status.set({ ...needsScreenRecording, helperApp: undefined }, undefined);
			const unpublished = chip();
			model.status.set(ready, undefined);
			const granted = chip();
			const withoutDragSupport = createPanel(needsBoth).panel.element.querySelector('.computer-use-setup-helper-app-chip');

			const shown = (row: number) => ({ row, ariaHidden: 'true', draggable: true, icon: helperApp.icon, name: 'Copilot Computer Use' });
			assert.deepStrictEqual({ first, nativeDrag: drag.defaultPrevented, drags: support.drags, next, whileChecking, unpublished, granted, withoutDragSupport }, {
				first: shown(0),
				nativeDrag: true,
				drags: [helperApp.path],
				next: shown(1),
				whileChecking: shown(1),
				unpublished: null,
				granted: null,
				withoutDragSupport: null,
			});
		});

		test('checks again once when the user comes back from macOS, after the step that sent them there', () => {
			const { model, windowFocus, allowButton } = createPanel(needsBoth);
			windowFocus.fire(true);
			allowButton()?.click();
			model.status.set(allowingAccessibility, undefined);
			windowFocus.fire(false);
			windowFocus.fire(true);
			const whileWorking = model.requests.length;
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 2, [allow('accessibility'), allow('screenRecording'), recheck])]), undefined);
			windowFocus.fire(false);
			windowFocus.fire(true);
			assert.deepStrictEqual({ whileWorking, requests: model.requests.map(entry => entry.action) }, {
				whileWorking: 1,
				requests: [allow('accessibility'), recheck],
			});
		});

		test('skips the check on return once the host confirmed the permission the user went to grant', () => {
			const { model, windowFocus, allowButton } = createPanel(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 2, [allow('accessibility'), allow('screenRecording'), recheck])]));
			windowFocus.fire(true);
			allowButton()?.click();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 3, [allow('accessibility'), allow('screenRecording'), recheck])]), undefined);
			windowFocus.fire(false);
			// macOS reported the change while the user was in System Settings, and the host checked again on its own.
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('working', 3)], { setupId: 'setup-1', ...recheck }), undefined);
			model.status.set(needsScreenRecording, undefined);
			windowFocus.fire(true);
			assert.deepStrictEqual(model.requests.map(entry => entry.action), [allow('accessibility')]);
		});

		test('closes as soon as its setup no longer waits', () => {
			const close = (status: IComputerUseStatusV1 | undefined) => {
				const { model, panel, closed } = createPanel(needsBoth);
				model.status.set(status, undefined);
				return { closed: closed(), view: panel.view?.state };
			};
			assert.deepStrictEqual({
				ended: close(ended),
				missing: close(createStatus(['notGranted', 'notGranted'], [])),
				unpublished: close(undefined),
				working: close(allowingAccessibility),
			}, {
				ended: { closed: 1, view: undefined },
				missing: { closed: 1, view: undefined },
				unpublished: { closed: 1, view: undefined },
				working: { closed: 0, view: 'working' },
			});
		});

		test('shows every permission granted for a moment once the setup is ready, then closes once', () => runWithFakedTimers({}, async () => {
			const { model, rows, closed } = createPanel(checkingScreenRecording);
			model.status.set(ready, undefined);
			const granted = rows();
			await timeout(900);
			// Other updates of the status don't postpone closing.
			model.status.set({ ...ready, verifiedAt: 1 }, undefined);
			const before = closed();
			await timeout(200);
			const after = closed();
			await timeout(2000);
			assert.deepStrictEqual({ granted, before, after, later: closed() }, {
				granted: [
					{ label: 'Accessibility, Granted. Click and type in apps', granted: true, refresh: null, allow: null },
					{ label: 'Screen Recording, Granted. See app windows', granted: true, refresh: null, allow: null },
				],
				before: 0,
				after: 1,
				later: 1,
			});
		}));
	});

	function createDialog(model: TestSetupModel) {
		const disposables = store.add(new DisposableStore());
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => container.remove()));
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILayoutService, { activeContainer: container });
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(IHostService, { onDidChangeFocus: Event.None, setWindowDimmed: async () => { } });
		const dialog = disposables.add(instantiationService.createInstance(ComputerUseSetupDialog, model, 'setup-1'));
		return { container, dialog };
	}

	test('opens as a modal without buttons of its own, focused on the current step, and closes itself once its setup stops waiting', async () => {
		const model = new TestSetupModel();
		model.status.set(needsBoth, undefined);
		const { container, dialog } = createDialog(model);
		let closed = false;
		const shown = dialog.show().then(() => { closed = true; });
		const open = {
			buttons: container.querySelectorAll('.dialog-buttons .monaco-button').length,
			title: container.querySelector('.dialog-message-text')?.textContent,
			focused: mainWindow.document.activeElement?.getAttribute('aria-label'),
			refreshDecoration: container.querySelector<HTMLElement>('.computer-use-setup-permission .action-label')?.style.textDecoration,
		};
		model.status.set(ended, undefined);
		await shown;
		assert.deepStrictEqual({ open, closed, modal: container.querySelector('.monaco-dialog-box') !== null }, {
			open: { buttons: 0, title: 'Set Up Computer Use', focused: 'Allow Accessibility in System Settings', refreshDecoration: '' },
			closed: true,
			modal: false,
		});
	});

	test('closes on Escape without buttons of its own, leaving the setup waiting', async () => {
		const model = new TestSetupModel();
		model.status.set(needsBoth, undefined);
		const { container, dialog } = createDialog(model);
		const shown = dialog.show();
		const focused = mainWindow.document.activeElement;
		for (const type of ['keydown', 'keyup']) {
			focused?.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		}
		await shown;
		assert.deepStrictEqual({ focusedInModal: !!focused && container.contains(focused), requests: model.requests }, {
			focusedInModal: true,
			requests: [],
		});
	});
});
