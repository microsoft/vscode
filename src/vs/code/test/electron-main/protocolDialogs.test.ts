/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { BrowserWindow, MessageBoxOptions, MessageBoxReturnValue } from 'electron';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IAuxiliaryWindow } from '../../../platform/auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { ICodeWindow } from '../../../platform/window/electron-main/window.js';
import { confirmProtocolOpenable, getProtocolDialogParentWindow } from '../../electron-main/protocolDialogs.js';

suite('Protocol dialogs', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createBrowserWindow(id: number, destroyed = false): BrowserWindow {
		return { id, isDestroyed: () => destroyed } as unknown as BrowserWindow;
	}

	function createCodeWindow(win: BrowserWindow | null): ICodeWindow {
		return { win } as unknown as ICodeWindow;
	}

	interface IRecorded {
		dialogs: { options: MessageBoxOptions; parentId: number | undefined }[];
		sent: { method: string; channel: string; args: unknown[] }[];
	}

	function createServices(windows: { focused?: ICodeWindow; lastActive?: ICodeWindow }, result: MessageBoxReturnValue) {
		const recorded: IRecorded = { dialogs: [], sent: [] };
		const windowsMainService = {
			getFocusedWindow: () => windows.focused,
			getLastActiveWindow: () => windows.lastActive,
			sendToFocused: (channel: string, ...args: unknown[]) => { recorded.sent.push({ method: 'sendToFocused', channel, args }); },
			sendToOpeningWindow: (channel: string, ...args: unknown[]) => { recorded.sent.push({ method: 'sendToOpeningWindow', channel, args }); },
		};
		const dialogMainService = {
			showMessageBox: async (options: MessageBoxOptions, window?: BrowserWindow) => {
				recorded.dialogs.push({ options, parentId: window?.id });
				return result;
			}
		};
		return { recorded, windowsMainService, dialogMainService };
	}

	const options: MessageBoxOptions = { type: 'warning', message: 'test', buttons: ['Yes', 'No'], checkboxLabel: 'Do not ask again', cancelId: 1 };

	suite('getProtocolDialogParentWindow', () => {

		test('prefers the focused window', () => {
			const focused = createBrowserWindow(1);
			const parent = getProtocolDialogParentWindow({ getFocusedWindow: () => createCodeWindow(focused), getLastActiveWindow: () => createCodeWindow(createBrowserWindow(2)) });
			assert.strictEqual(parent, focused);
		});

		test('falls back to the last active window', () => {
			const lastActive = createBrowserWindow(2);
			const parent = getProtocolDialogParentWindow({ getFocusedWindow: () => undefined, getLastActiveWindow: () => createCodeWindow(lastActive) });
			assert.strictEqual(parent, lastActive);
		});

		test('prefers a focused auxiliary window', () => {
			const auxiliary = createBrowserWindow(3);
			const results = [
				getProtocolDialogParentWindow({ getFocusedWindow: () => createCodeWindow(createBrowserWindow(1)), getLastActiveWindow: () => undefined }, { getFocusedWindow: () => ({ win: auxiliary }) as IAuxiliaryWindow }),
				getProtocolDialogParentWindow({ getFocusedWindow: () => createCodeWindow(createBrowserWindow(1)), getLastActiveWindow: () => undefined }, { getFocusedWindow: () => ({ win: createBrowserWindow(4, true) }) as IAuxiliaryWindow }),
			];
			assert.deepStrictEqual(results.map(window => window?.id), [3, 1]);
		});

		test('returns undefined without a usable window', () => {
			assert.deepStrictEqual([
				getProtocolDialogParentWindow({ getFocusedWindow: () => undefined, getLastActiveWindow: () => undefined }),
				getProtocolDialogParentWindow({ getFocusedWindow: () => createCodeWindow(null), getLastActiveWindow: () => undefined }),
				getProtocolDialogParentWindow({ getFocusedWindow: () => createCodeWindow(createBrowserWindow(1, true)), getLastActiveWindow: () => undefined }),
				getProtocolDialogParentWindow({ getFocusedWindow: () => undefined, getLastActiveWindow: () => createCodeWindow(createBrowserWindow(2, true)) }),
			], [undefined, undefined, undefined, undefined]);
		});
	});

	suite('confirmProtocolOpenable', () => {

		test('parents the dialog to the focused window and allows on Yes', async () => {
			const { recorded, windowsMainService, dialogMainService } = createServices({ focused: createCodeWindow(createBrowserWindow(1)), lastActive: createCodeWindow(createBrowserWindow(2)) }, { response: 0, checkboxChecked: false });
			const blocked = await confirmProtocolOpenable(options, 'local', windowsMainService, dialogMainService);
			assert.deepStrictEqual({ blocked, recorded }, { blocked: false, recorded: { dialogs: [{ options, parentId: 1 }], sent: [] } });
		});

		test('parents the dialog to the last active window when none is focused', async () => {
			const { recorded, windowsMainService, dialogMainService } = createServices({ lastActive: createCodeWindow(createBrowserWindow(2)) }, { response: 0, checkboxChecked: false });
			const blocked = await confirmProtocolOpenable(options, 'remote', windowsMainService, dialogMainService);
			assert.deepStrictEqual({ blocked, recorded }, { blocked: false, recorded: { dialogs: [{ options, parentId: 2 }], sent: [] } });
		});

		test('leaves the dialog unparented without a window', async () => {
			const { recorded, windowsMainService, dialogMainService } = createServices({}, { response: 0, checkboxChecked: false });
			const blocked = await confirmProtocolOpenable(options, 'local', windowsMainService, dialogMainService);
			assert.deepStrictEqual({ blocked, recorded }, { blocked: false, recorded: { dialogs: [{ options, parentId: undefined }], sent: [] } });
		});

		test('blocks on No or cancel without disabling the prompt', async () => {
			const results = [];
			for (const response of [1, 2]) {
				const { recorded, windowsMainService, dialogMainService } = createServices({ focused: createCodeWindow(createBrowserWindow(1)) }, { response, checkboxChecked: true });
				const blocked = await confirmProtocolOpenable(options, 'local', windowsMainService, dialogMainService);
				results.push({ blocked, sent: recorded.sent });
			}
			assert.deepStrictEqual(results, [{ blocked: true, sent: [] }, { blocked: true, sent: [] }]);
		});

		test('parents the dialog to a focused auxiliary window', async () => {
			const { recorded, windowsMainService, dialogMainService } = createServices({ focused: createCodeWindow(createBrowserWindow(1)) }, { response: 0, checkboxChecked: false });
			const blocked = await confirmProtocolOpenable(options, 'local', windowsMainService, dialogMainService, { getFocusedWindow: () => ({ win: createBrowserWindow(3) }) as IAuxiliaryWindow });
			assert.deepStrictEqual({ blocked, recorded }, { blocked: false, recorded: { dialogs: [{ options, parentId: 3 }], sent: [] } });
		});

		test('blocks without disabling the prompt when the parent is destroyed while the dialog is open', async () => {
			let destroyed = false;
			const parent = { id: 1, isDestroyed: () => destroyed } as unknown as BrowserWindow;
			const { recorded, windowsMainService } = createServices({ focused: createCodeWindow(parent) }, { response: 0, checkboxChecked: true });
			const results = [];
			for (const outcome of ['resolve', 'reject'] as const) {
				destroyed = false;
				const dialogMainService = {
					showMessageBox: async (): Promise<MessageBoxReturnValue> => {
						destroyed = true;
						if (outcome === 'reject') {
							throw new Error('Object has been destroyed');
						}
						return { response: 0, checkboxChecked: true };
					}
				};
				results.push({ outcome, blocked: await confirmProtocolOpenable(options, 'local', windowsMainService, dialogMainService) });
			}
			assert.deepStrictEqual({ results, sent: recorded.sent }, {
				results: [{ outcome: 'resolve', blocked: true }, { outcome: 'reject', blocked: true }],
				sent: []
			});
		});

		test('propagates dialog errors while the parent is alive', async () => {
			const { windowsMainService } = createServices({ focused: createCodeWindow(createBrowserWindow(1)) }, { response: 0, checkboxChecked: false });
			const dialogMainService = { showMessageBox: async (): Promise<MessageBoxReturnValue> => { throw new Error('dialog failed'); } };
			await assert.rejects(() => confirmProtocolOpenable(options, 'local', windowsMainService, dialogMainService), /dialog failed/);
		});

		test('disables the prompt for the scheme when the checkbox is checked', async () => {
			const results = [];
			for (const scheme of ['local', 'remote'] as const) {
				const { recorded, windowsMainService, dialogMainService } = createServices({ focused: createCodeWindow(createBrowserWindow(1)) }, { response: 0, checkboxChecked: true });
				const blocked = await confirmProtocolOpenable(options, scheme, windowsMainService, dialogMainService);
				results.push({ blocked, sent: recorded.sent });
			}
			assert.deepStrictEqual(results, [
				{
					blocked: false, sent: [
						{ method: 'sendToFocused', channel: 'vscode:disablePromptForProtocolHandling', args: ['local'] },
						{ method: 'sendToOpeningWindow', channel: 'vscode:disablePromptForProtocolHandling', args: ['local'] },
					]
				},
				{
					blocked: false, sent: [
						{ method: 'sendToFocused', channel: 'vscode:disablePromptForProtocolHandling', args: ['remote'] },
						{ method: 'sendToOpeningWindow', channel: 'vscode:disablePromptForProtocolHandling', args: ['remote'] },
					]
				},
			]);
		});
	});
});
