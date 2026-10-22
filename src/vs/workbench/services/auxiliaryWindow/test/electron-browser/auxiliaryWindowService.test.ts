/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Barrier, DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWorkbenchLayoutService } from '../../../layout/browser/layoutService.js';
import { NativeAuxiliaryWindow } from '../../electron-browser/auxiliaryWindowService.js';

class TestNativeAuxiliaryWindow extends NativeAuxiliaryWindow {
	genericConfirmations = 0;

	protected override enableWindowFocusOnElementFocus(): void { }
	protected override enableMultiWindowAwareTimeout(): void { }

	protected override async confirmBeforeClose(event: BeforeUnloadEvent): Promise<void> {
		this.genericConfirmations++;
		this.preventUnload(event);
	}

	requestClose(): boolean {
		const event = new mainWindow.Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
		this.handleBeforeUnload(event);
		return event.defaultPrevented;
	}
}

suite('NativeAuxiliaryWindow close handler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindow(confirmBeforeClose = 'always') {
		const instantiation = workbenchInstantiationService(undefined, store);
		const container = mainWindow.document.createElement('div');
		instantiation.stub(IConfigurationService, new TestConfigurationService({ window: { confirmBeforeClose } }));
		instantiation.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return container; }
		}());
		const errors: string[] = [];
		let loggedErrors = 0;
		instantiation.stub(IDialogService, { error: async message => { errors.push(message); } });
		instantiation.stub(ILogService, new class extends NullLogService {
			override error(): void { loggedErrors++; }
		}());
		const nativeCloses: (number | undefined)[] = [];
		const retries: boolean[] = [];
		const controls = { retry: true, fail: false };
		instantiation.stub(INativeHostService, new class extends mock<INativeHostService>() {
			override readonly onDidMaximizeWindow = Event.None;
			override readonly onDidUnmaximizeWindow = Event.None;
			override readonly onDidChangeWindowAlwaysOnTop = Event.None;
			override async isMaximized() { return false; }
			override async isWindowAlwaysOnTop() { return false; }
			override async isFullScreen() { return false; }
			override async closeWindow(options?: { targetWindowId: number }) {
				nativeCloses.push(options?.targetWindowId);
				if (controls.fail) {
					throw new Error('Native close failed');
				}
				if (controls.retry) {
					retries.push(window.requestClose());
				}
			}
		}());
		const window = store.add(instantiation.createInstance(TestNativeAuxiliaryWindow, mainWindow, container, new Barrier()));
		return { window, nativeCloses, retries, controls, errors, loggedErrors: () => loggedErrors };
	}

	for (const setting of ['always', 'keyboardOnly', 'never']) {
		test(`uses one owner decision without generic confirmation for ${setting}`, async () => {
			const { window, nativeCloses, retries, errors } = createWindow(setting);
			let decisions = 0;
			store.add(window.registerCloseHandler({ close: async () => { decisions++; return true; }, isReadyToClose: () => true }));
			const prevented = window.requestClose();
			await timeout(0);
			assert.deepStrictEqual({ prevented, decisions, nativeCloses, retries, generic: window.genericConfirmations, errors }, {
				prevented: true, decisions: 1, nativeCloses: [mainWindow.vscodeWindowId], retries: [false], generic: 0, errors: [],
			});
		});
	}

	test('coalesces repeated and recursive close requests while the owner is pending', async () => {
		const { window, nativeCloses, retries } = createWindow();
		const decision = new DeferredPromise<boolean>();
		let decisions = 0;
		let recursive = false;
		store.add(window.registerCloseHandler({
			close: async () => {
				decisions++;
				const confirmed = await decision.p;
				recursive = window.requestClose();
				return confirmed;
			},
			isReadyToClose: () => true,
		}));
		const prevented = [window.requestClose(), window.requestClose(), window.requestClose()];
		await decision.complete(true);
		await timeout(0);
		assert.deepStrictEqual({ prevented, decisions, recursive, nativeCloses, retries }, {
			prevented: [true, true, true], decisions: 1, recursive: true, nativeCloses: [mainWindow.vscodeWindowId], retries: [false],
		});
	});

	test('cancellation leaves the window open and permits a later decision', async () => {
		const { window, nativeCloses, retries } = createWindow();
		let decisions = 0;
		store.add(window.registerCloseHandler({ close: async () => ++decisions > 1, isReadyToClose: () => true }));
		window.requestClose();
		await timeout(0);
		const cancelled = { decisions, nativeCloses: nativeCloses.length };
		window.requestClose();
		await timeout(0);
		assert.deepStrictEqual({ cancelled, decisions, nativeCloses, retries }, {
			cancelled: { decisions: 1, nativeCloses: 0 }, decisions: 2, nativeCloses: [mainWindow.vscodeWindowId], retries: [false],
		});
	});

	test('refuses an accepted close when new contents arrive before native unload', async () => {
		const { window, nativeCloses, controls, errors, loggedErrors } = createWindow();
		controls.retry = false;
		let ready = true;
		store.add(window.registerCloseHandler({ close: async () => true, isReadyToClose: () => ready }));
		window.requestClose();
		await timeout(0);
		ready = false;
		const prevented = window.requestClose();
		await timeout(0);
		assert.deepStrictEqual({ nativeCloses, prevented, errors: errors.length, logged: loggedErrors() }, {
			nativeCloses: [mainWindow.vscodeWindowId], prevented: true, errors: 1, logged: 1,
		});
	});

	test('does not arm native unload when the owner still has editors', async () => {
		const { window, nativeCloses, errors } = createWindow();
		store.add(window.registerCloseHandler({ close: async () => true, isReadyToClose: () => false }));
		window.requestClose();
		await timeout(0);
		assert.deepStrictEqual({ nativeCloses, errors: errors.length }, { nativeCloses: [], errors: 1 });
	});

	test('retains independent synchronous vetoes on the approved retry', async () => {
		const { window, nativeCloses, retries, errors } = createWindow();
		let vetoChecks = 0;
		store.add(window.onBeforeUnload(event => { vetoChecks++; event.veto('Independent veto'); }));
		store.add(window.registerCloseHandler({ close: async () => true, isReadyToClose: () => true }));
		window.requestClose();
		await timeout(0);
		assert.deepStrictEqual({ nativeCloses, retries, vetoChecks, errors, generic: window.genericConfirmations }, {
			nativeCloses: [mainWindow.vscodeWindowId], retries: [true], vetoChecks: 1, errors: ['Independent veto'], generic: 0,
		});
	});

	for (const action of ['unregister', 'dispose'] as const) {
		test(`ignores a pending owner result after ${action}`, async () => {
			const { window, nativeCloses, errors } = createWindow();
			const decision = new DeferredPromise<boolean>();
			const registration = store.add(window.registerCloseHandler({ close: () => decision.p, isReadyToClose: () => true }));
			window.requestClose();
			if (action === 'dispose') {
				window.dispose();
			} else {
				registration.dispose();
			}
			await decision.complete(true);
			await timeout(0);
			assert.deepStrictEqual({ nativeCloses, errors }, { nativeCloses: [], errors: [] });
		});
	}

	test('rejects conflicting close owners and restores default behavior on unregister', () => {
		const { window } = createWindow();
		const handler = { close: async () => true, isReadyToClose: () => true };
		const registration = store.add(window.registerCloseHandler(handler));
		assert.throws(() => window.registerCloseHandler(handler));
		registration.dispose();
		const prevented = window.requestClose();
		assert.deepStrictEqual({ prevented, generic: window.genericConfirmations }, { prevented: true, generic: 1 });
	});

	for (const failure of ['owner', 'native'] as const) {
		test(`logs ${failure} close failures and permits retry without closing on failure`, async () => {
			const { window, controls, nativeCloses, retries, errors, loggedErrors } = createWindow();
			let fail = true;
			controls.fail = failure === 'native';
			store.add(window.registerCloseHandler({
				close: async () => {
					if (failure === 'owner' && fail) {
						throw new Error('Owner close failed');
					}
					return true;
				},
				isReadyToClose: () => true,
			}));
			window.requestClose();
			await timeout(0);
			const beforeRetry = { closes: nativeCloses.length, errors: errors.length, retries: retries.length };
			fail = false;
			controls.fail = false;
			window.requestClose();
			await timeout(0);
			assert.deepStrictEqual({ beforeRetry, retries, errors: errors.length, logged: loggedErrors() }, {
				beforeRetry: { closes: failure === 'native' ? 1 : 0, errors: 1, retries: 0 },
				retries: [false], errors: 1, logged: 1,
			});
		});
	}

	test('preserves unregistered windows without owner-specific confirmation', () => {
		const { window, nativeCloses } = createWindow('never');
		assert.deepStrictEqual({ prevented: window.requestClose(), generic: window.genericConfirmations, nativeCloses }, { prevented: false, generic: 0, nativeCloses: [] });
	});
});
