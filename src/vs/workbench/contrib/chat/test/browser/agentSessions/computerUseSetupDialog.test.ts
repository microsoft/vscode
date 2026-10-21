/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { ComputerUsePermission, ComputerUsePermissionState, IComputerUseSetupActionV1, IComputerUseSetupV1, IComputerUseStatusV1 } from '../../../../../../platform/agentHost/common/computerUse.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
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

	constructor(readonly helperApp?: IComputerUseHelperAppSupport) { }

	request(setupId: string, action: IComputerUseSetupActionV1): boolean {
		this.requests.push({ setupId, action });
		return true;
	}
}

class TestHelperAppSupport implements IComputerUseHelperAppSupport {
	readonly calls: string[] = [];

	startDrag(path: string): void {
		this.calls.push(`drag ${path}`);
	}

	reveal(path: string): void {
		this.calls.push(`reveal ${path}`);
	}
}

suite('Computer Use setup modal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('derives what it shows from the host\'s verified status', () => {
		const view = (status: IComputerUseStatusV1 | undefined, setupId: string | undefined = 'setup-1') => {
			const result = getComputerUseSetupView(status, setupId);
			return {
				phase: result.phase,
				rows: result.rows.map(row => [row.permission, row.state, row.action?.action ?? null, row.busy]),
				message: result.message ? result.messageKind : null,
				canRecheck: result.canRecheck,
				canContinue: result.canContinue,
				settingsStep: result.settingsStep ?? null,
			};
		};
		assert.deepStrictEqual({
			unavailable: view(undefined),
			idle: view(createStatus(['unknown', 'unknown'], []), undefined),
			needsBoth: view(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])])),
			settingsStep: view(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 2, [request('screenRecording'), openSettings('screenRecording'), recheck])])),
			grantedElsewhere: view(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])])),
			allVerifiedElsewhere: view(createStatus(['granted', 'granted'], [setup('needsPermissions', 2, [request('screenRecording'), openSettings('screenRecording'), recheck], { code: 'stillNotGranted', message: 'Still off' })])),
			requesting: view(createStatus(['notGranted', 'notGranted'], [setup('working', 1)], { setupId: 'setup-1', ...request('screenRecording') })),
			checking: view(createStatus(['granted', 'notGranted'], [setup('working', 2)], { setupId: 'setup-1', ...recheck })),
			stillOff: view(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 3, [request('screenRecording'), openSettings('screenRecording'), recheck], { code: 'stillNotGranted', message: 'Still off' })])),
			ready: view(createStatus(['granted', 'granted'], [setup('ready', 3)])),
			ended: view(createStatus(['notGranted', 'notGranted'], [setup('ended', 1, [], { code: 'notWaiting', message: 'Not waiting' })])),
		}, {
			unavailable: { phase: 'unavailable', rows: [], message: 'info', canRecheck: false, canContinue: false, settingsStep: null },
			idle: { phase: 'idle', rows: [['accessibility', 'unknown', null, false], ['screenRecording', 'unknown', null, false]], message: 'info', canRecheck: false, canContinue: false, settingsStep: null },
			needsBoth: { phase: 'needsPermissions', rows: [['accessibility', 'notGranted', 'request', false], ['screenRecording', 'notGranted', 'request', false]], message: null, canRecheck: true, canContinue: false, settingsStep: null },
			settingsStep: { phase: 'needsPermissions', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'notGranted', 'openSettings', false]], message: null, canRecheck: true, canContinue: false, settingsStep: 'screenRecording' },
			grantedElsewhere: { phase: 'needsPermissions', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'notGranted', 'request', false]], message: null, canRecheck: true, canContinue: false, settingsStep: null },
			allVerifiedElsewhere: { phase: 'needsPermissions', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'granted', null, false]], message: 'success', canRecheck: true, canContinue: true, settingsStep: null },
			requesting: { phase: 'working', rows: [['accessibility', 'notGranted', null, false], ['screenRecording', 'notGranted', null, true]], message: 'progress', canRecheck: false, canContinue: false, settingsStep: null },
			checking: { phase: 'working', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'notGranted', null, true]], message: 'progress', canRecheck: false, canContinue: false, settingsStep: null },
			stillOff: { phase: 'needsPermissions', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'notGranted', 'openSettings', false]], message: 'error', canRecheck: true, canContinue: false, settingsStep: 'screenRecording' },
			ready: { phase: 'ready', rows: [['accessibility', 'granted', null, false], ['screenRecording', 'granted', null, false]], message: 'success', canRecheck: false, canContinue: false, settingsStep: null },
			ended: { phase: 'ended', rows: [['accessibility', 'notGranted', null, false], ['screenRecording', 'notGranted', null, false]], message: 'error', canRecheck: false, canContinue: false, settingsStep: null },
		});
	});

	suite('panel', () => {

		function createPanel(setupId: string | undefined = 'setup-1', helperAppSupport?: IComputerUseHelperAppSupport) {
			const disposables = store.add(new DisposableStore());
			const model = new TestSetupModel(helperAppSupport);
			const windowFocus = disposables.add(new Emitter<boolean>());
			const panel = disposables.add(new ComputerUseSetupPanel(model, setupId, { onDidChangeWindowFocus: windowFocus.event }));
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			container.appendChild(panel.appIcon);
			container.appendChild(panel.element);
			const dismiss = disposables.add(new Button(container, { ...defaultButtonStyles }));
			panel.setDismissButton(dismiss);
			disposables.add({ dispose: () => container.remove() });
			const actionButtons = () => [...panel.element.querySelectorAll<HTMLElement>('.computer-use-setup-permission-action .monaco-button')];
			const recheckButton = () => panel.element.querySelector<HTMLElement>('.computer-use-setup-actions .monaco-button');
			const visible = (selector: string) => (panel.element.querySelector(selector)?.getClientRects().length ?? 0) > 0;
			const describe = (element: Element | null | undefined) => element ? { label: element.textContent, aria: element.getAttribute('aria-label'), disabled: element.classList.contains('disabled'), focused: mainWindow.document.activeElement === element } : null;
			return { model, panel, windowFocus, dismiss, actionButtons, recheckButton, visible, describe };
		}

		test('focuses the next step, keeps focus while it runs, and moves it when the step is done', () => {
			const { model, panel, actionButtons, recheckButton, describe } = createPanel();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])]), undefined);
			panel.focus();
			const initial = { actions: actionButtons().map(describe), recheck: describe(recheckButton()) };
			actionButtons()[0].click();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('working', 1)], { setupId: 'setup-1', ...request('accessibility') }), undefined);
			const working = { actions: actionButtons().map(describe), busy: panel.element.querySelectorAll('.computer-use-setup-permission-status.codicon-loading').length };
			model.status.set(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 2, [request('screenRecording'), recheck])]), undefined);
			const next = { actions: actionButtons().map(describe), granted: panel.element.querySelectorAll('.computer-use-setup-permission-status.granted').length };

			assert.deepStrictEqual({ initial, requests: model.requests, working, next }, {
				initial: {
					actions: [
						{ label: 'Allow', aria: 'Allow Accessibility', disabled: false, focused: true },
						{ label: 'Allow', aria: 'Allow Screen Recording', disabled: false, focused: false },
					],
					recheck: null,
				},
				requests: [{ setupId: 'setup-1', action: request('accessibility') }],
				working: {
					actions: [
						{ label: 'Allow', aria: 'Allow Accessibility', disabled: true, focused: true },
						{ label: 'Allow', aria: 'Allow Screen Recording', disabled: true, focused: false },
					],
					busy: 1,
				},
				next: {
					actions: [{ label: 'Allow', aria: 'Allow Screen Recording', disabled: false, focused: true }],
					granted: 1,
				},
			});
		});

		test('shows the app\'s own icon once the host read it', () => {
			const { model, panel } = createPanel();
			const icon = () => ({ image: panel.appIcon.classList.contains('has-image'), src: panel.appIcon.querySelector('img')?.getAttribute('src') });
			model.status.set({ ...createStatus(['unknown', 'unknown'], []), helperApp: { path: helperApp.path } }, undefined);
			const withoutIcon = icon();
			model.status.set(createStatus(['unknown', 'unknown'], []), undefined);
			assert.deepStrictEqual({ withoutIcon, withIcon: icon() }, {
				withoutIcon: { image: false, src: '' },
				withIcon: { image: true, src: helperApp.icon },
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
				before: null,
				continueControl: { actions: 0, recheck: { label: 'Continue', aria: 'Continue Your Task', disabled: false, focused: true }, primary: true },
				requests: [{ setupId: 'setup-1', action: recheck }],
			});
		});

		test('guides the System Settings step, offering the app for dragging into the list and in Finder', () => {
			const support = new TestHelperAppSupport();
			const { model, panel, recheckButton, visible, describe } = createPanel('setup-1', support);
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])]), undefined);
			const beforeSettings = visible('.computer-use-setup-settings-step');
			model.status.set(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 2, [request('screenRecording'), openSettings('screenRecording'), recheck])]), undefined);
			const drag = new DragEvent('dragstart', { bubbles: true, cancelable: true });
			panel.element.querySelector('.computer-use-setup-helper-app-chip')?.dispatchEvent(drag);
			const reveal = panel.element.querySelector<HTMLElement>('.computer-use-setup-helper-app-action .monaco-button');
			reveal?.click();
			const step = {
				caption: panel.element.querySelector('.computer-use-setup-settings-step-caption')?.textContent,
				app: visible('.computer-use-setup-helper-app'),
				icon: panel.element.querySelector('.computer-use-setup-helper-app-icon')?.getAttribute('src'),
				nativeDrag: drag.defaultPrevented,
				reveal: reveal?.getAttribute('aria-label'),
				recheck: describe(recheckButton())?.label,
			};
			model.status.set(createStatus(['granted', 'notGranted'], [setup('working', 2)], { setupId: 'setup-1', ...recheck }), undefined);
			const whileChecking = visible('.computer-use-setup-settings-step');
			model.status.set(createStatus(['granted', 'granted'], [setup('ready', 3)]), undefined);
			assert.deepStrictEqual({ beforeSettings, step, whileChecking, ready: visible('.computer-use-setup-settings-step'), calls: support.calls }, {
				beforeSettings: false,
				step: {
					caption: 'Turn on Copilot Computer Use under Screen Recording in System Settings, or drag it into the list.',
					app: true,
					icon: helperApp.icon,
					nativeDrag: true,
					reveal: 'Show Copilot Computer Use in Finder',
					recheck: 'Check Again',
				},
				whileChecking: true,
				ready: false,
				calls: [`drag ${helperApp.path}`, `reveal ${helperApp.path}`],
			});
		});

		test('lets the keyboard reach every control it shows, and moves focus on when the System Settings step ends', () => {
			const { model, panel, describe } = createPanel('setup-1', new TestHelperAppSupport());
			// The modal moves focus itself, link by link, across its body.
			const tabStops = () => [...panel.element.querySelectorAll<HTMLElement>('a')].map(link => {
				link.focus();
				return { label: link.textContent, reached: mainWindow.document.activeElement === link };
			});
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 1, [request('accessibility'), request('screenRecording'), recheck])]), undefined);
			const initial = tabStops();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 2, [request('accessibility'), openSettings('accessibility'), request('screenRecording'), recheck])]), undefined);
			const settingsStep = tabStops();
			panel.element.querySelector<HTMLElement>('.computer-use-setup-helper-app-action .monaco-button')?.focus();
			model.status.set(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 3, [request('screenRecording'), recheck])]), undefined);
			const focusedAfterStep = describe(mainWindow.document.activeElement);
			assert.deepStrictEqual({ initial, settingsStep, focusedAfterStep, afterStep: tabStops() }, {
				initial: [{ label: 'Allow', reached: true }, { label: 'Allow', reached: true }],
				settingsStep: [{ label: 'Open Settings', reached: true }, { label: 'Allow', reached: true }, { label: 'Show in Finder', reached: true }, { label: 'Check Again', reached: true }],
				focusedAfterStep: { label: 'Allow', aria: 'Allow Screen Recording', disabled: false, focused: true },
				afterStep: [{ label: 'Allow', reached: true }],
			});
		});

		test('guides the System Settings step without the app on clients that can\'t drag it', () => {
			const { model, panel, visible } = createPanel();
			model.status.set(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 2, [request('screenRecording'), openSettings('screenRecording'), recheck])]), undefined);
			assert.deepStrictEqual({ caption: panel.element.querySelector('.computer-use-setup-settings-step-caption')?.textContent, app: visible('.computer-use-setup-helper-app') }, {
				caption: 'Turn on Copilot Computer Use under Screen Recording in System Settings.',
				app: false,
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

		test('skips the check on return once the host confirmed the permission the user went to grant', () => {
			const { model, actionButtons, windowFocus } = createPanel();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 2, [request('accessibility'), openSettings('accessibility'), request('screenRecording'), recheck])]), undefined);
			windowFocus.fire(true);
			actionButtons()[0].click();
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('needsPermissions', 3, [request('accessibility'), openSettings('accessibility'), request('screenRecording'), recheck])]), undefined);
			windowFocus.fire(false);
			// macOS reported the change while the user was in System Settings, and the host checked again on its own.
			model.status.set(createStatus(['notGranted', 'notGranted'], [setup('working', 3)], { setupId: 'setup-1', ...recheck }), undefined);
			model.status.set(createStatus(['granted', 'notGranted'], [setup('needsPermissions', 4, [request('screenRecording'), recheck])]), undefined);
			windowFocus.fire(true);
			assert.deepStrictEqual(model.requests.map(entry => entry.action), [openSettings('accessibility')]);
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

	test('opens with its button labelled by the setup\'s progress', () => {
		const disposables = store.add(new DisposableStore());
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => container.remove()));
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILayoutService, { activeContainer: container });
		instantiationService.stub(IKeybindingService, {});
		instantiationService.stub(IHostService, { onDidChangeFocus: Event.None, setWindowDimmed: async () => { } });
		const model = new TestSetupModel();
		model.status.set(createStatus(['granted', 'granted'], []), undefined);
		const dialog = disposables.add(instantiationService.createInstance(ComputerUseSetupDialog, model, undefined));
		void dialog.show();
		assert.deepStrictEqual([...container.querySelectorAll('.dialog-buttons .monaco-button')].map(button => button.textContent), ['Close']);
	});
});
