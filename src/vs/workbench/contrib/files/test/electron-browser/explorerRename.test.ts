/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { timeout } from '../../../../../base/common/async.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../browser/labels.js';
import { IEditableData } from '../../../../common/views.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { IExplorerService } from '../../browser/files.js';
import { FilesRenderer } from '../../browser/views/explorerViewer.js';
import { ExplorerItem } from '../../common/explorerModel.js';

suite('Files - Explorer rename focus', () => {
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

		const fileService = store.add(new TestFileService());
		const configurationService = new TestConfigurationService();
		const item = new ExplorerItem(URI.file('/workspace/example.txt'), fileService, configurationService, NullFilesConfigurationService, undefined);
		const editableData: IEditableData = {
			validationMessage: () => null,
			onFinish: async (value, success) => { finished.push({ value, success }); },
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IExplorerService, { getEditableData: () => editableData });
		const labels = store.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const renderer = store.add(instantiationService.createInstance(FilesRenderer, container, labels, { get: () => 0, isMatch: () => false }, () => { }));
		const template = renderer.renderTemplate(container);
		store.add(toDisposable(() => renderer.disposeTemplate(template)));
		renderer.renderElement(new class extends mock<ITreeNode<ExplorerItem, FuzzyScore>>() {
			override readonly element = item;
		}(), 0, template);
		const element = container.querySelector('input');
		assert.ok(element);
		input = element;
		input.value = 'renamed.txt';
		input.setSelectionRange(0, 7);
		input.focus();
	});

	teardown(async () => {
		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', true);
	});

	test('preserves rename when its document loses focus', async () => {
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

	test('finishes rename when focus moves within its document', async () => {
		otherInput.focus();
		await timeout(0);
		assert.deepStrictEqual({ finished, connected: input.isConnected }, {
			finished: [{ value: 'renamed.txt', success: true }], connected: false
		});
	});
});
