/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InlineEditInputBox } from '../../../../browser/parts/views/inlineEditInputBox.js';

suite('InlineEditInputBox - focus', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let input: HTMLInputElement;
	let otherInput: HTMLInputElement;
	let finished: { value: string; success: boolean }[];

	setup(async () => {
		finished = [];
		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', true);
		const container = dom.append(document.body, document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		otherInput = dom.append(document.body, document.createElement('input'));
		store.add(toDisposable(() => otherInput.remove()));

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => { } }), hideContextView: () => { }, layout: () => { } });
		instantiationService.stub(IContextMenuService, { onDidHideContextMenu: Event.None });
		const inputBox = store.add(instantiationService.createInstance(InlineEditInputBox, container, {
			validationMessage: () => null,
			onFinish: async (value, success) => { finished.push({ value, success }); },
		}, { ariaLabel: 'Rename', value: 'renamed.txt', selection: { start: 0, end: 7 } }));
		input = inputBox.inputBox.inputElement;
	});

	teardown(async () => {
		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', true);
	});

	test('preserves editing when its document loses focus', async () => {
		// Capture the state at blur before the asynchronous handler can finish editing.
		let blurState: { focused: boolean; active: boolean } | undefined;
		store.add(dom.addDisposableListener(input, dom.EventType.BLUR, () => {
			blurState = { focused: input.ownerDocument.hasFocus(), active: input.ownerDocument.activeElement === input };
		}));
		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', false);
		assert.deepStrictEqual(blurState, { focused: false, active: true });
		await timeout(0);
		assert.deepStrictEqual({ finished, connected: input.isConnected, value: input.value, selection: [input.selectionStart, input.selectionEnd] }, {
			finished: [], connected: true, value: 'renamed.txt', selection: [0, 7]
		});

		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', true);
		input.focus();
		otherInput.focus();
		await timeout(0);
		assert.deepStrictEqual(finished, [{ value: 'renamed.txt', success: true }]);
	});

	test('finishes editing when focus moves within its document', async () => {
		otherInput.focus();
		await timeout(0);
		assert.deepStrictEqual({ finished, connected: input.isConnected }, {
			finished: [{ value: 'renamed.txt', success: true }], connected: false
		});
	});

	test('finishes editing when focus moves within its document while it is unfocused', async () => {
		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', false);
		await timeout(0);
		// No blur is dispatched for focus changes while the document is unfocused
		otherInput.focus();
		await timeout(0);
		assert.deepStrictEqual(finished, []);

		const refocused = new Promise<void>(resolve => store.add(dom.addDisposableListener(dom.getWindow(input), dom.EventType.FOCUS, () => resolve())));
		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', true);
		await refocused;
		await timeout(0);
		assert.deepStrictEqual({ finished, connected: input.isConnected }, {
			finished: [{ value: 'renamed.txt', success: true }], connected: false
		});
	});
});
