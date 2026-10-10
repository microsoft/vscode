/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewModel } from '../../../browserView/common/browserView.js';
import { WebContentsViewHost } from '../../../browserView/electron-browser/webContentsViewHost.js';
import { CanvasInput, ICanvasService } from '../../common/canvas.js';
import { CanvasEditor } from '../../electron-browser/canvasEditor.js';

suite('CanvasEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const parent = $('.canvas-test-parent');
		parent.style.width = '400px';
		parent.style.height = '200px';
		getWindow(parent).document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const group = upcastPartial<IEditorGroup>({ id: 1, windowId: getWindow(parent).vscodeWindowId });
		const visible: boolean[] = [];
		const attached: (IBrowserViewModel | undefined)[] = [];
		let disposed = 0;
		let created = 0;
		const ownerVisible = observableValue('ownerVisible', true);
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.test',
			onDidChangeFocus: Event.None,
			onDidChangeLoadingState: Event.None,
			onDidNavigate: Event.None,
			onWillDispose: Event.None,
			layout: async () => { },
			dispose: () => disposed++,
		});
		let view = Promise.resolve(model);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IEditorGroupsService, { mainPart: upcastPartial<IEditorPart>({ windowId: group.windowId }) });
		instantiationService.stub(ICanvasService, {
			enabled: observableValue('enabled', true),
			isOwnerPresentable: (_reference, reader) => ownerVisible.read(reader),
			resolveCanvasModel: async () => { created++; return { model: await view, reused: false }; },
		});
		instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => false });
		instantiationService.stub(IAccessibleViewService, {});
		instantiationService.stubInstance(WebContentsViewHost, {
			screenshotElement: $('div'), pauseElement: $('div'),
			onContainerCreated: () => { },
			setModel: model => attached.push(model),
			setVisible: value => visible.push(value),
			layout: () => { },
			tryFocus: () => false,
			dispose: () => { },
		});
		const editor = store.add(instantiationService.createInstance(CanvasEditor, group));
		editor.create(parent);
		const input = store.add(instantiationService.createInstance(CanvasInput, {
			providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner'), canvas: URI.parse('canvas:/preview'),
		}, {
			resource: URI.parse('canvas:/preview'), instanceId: 'preview', title: 'Preview', source: URI.parse('https://example.test'),
		}));
		return {
			editor, input, model, visible, attached, ownerVisible,
			get disposed() { return disposed; },
			get created() { return created; },
			setView: (value: Promise<IBrowserViewModel>) => view = value,
			open: () => editor.setInput(input, undefined, { newInGroup: true }, CancellationToken.None),
		};
	}

	test('does not revive hidden native content when an old rectangle is laid out', async () => {
		const harness = createHarness();
		harness.editor.setVisible(true);
		await harness.open();
		await timeout(0);
		harness.editor.setVisible(false);
		harness.editor.layout();
		assert.deepStrictEqual({ attached: harness.attached.includes(harness.model), visible: harness.visible.at(-1) }, { attached: true, visible: false });
	});

	test('does not create a view while canvas state has no live source', async () => {
		const harness = createHarness();
		const canvas = harness.input.canvas.get();
		assert.ok(canvas);
		harness.input.setCanvas({ ...canvas, source: undefined });
		await harness.open();
		harness.editor.clearInput();
		await timeout(0);
		assert.deepStrictEqual({ created: harness.created, attached: harness.attached.includes(harness.model) }, { created: 0, attached: false });
	});

	test('leaves a late service-owned model detached when its owner is hidden', async () => {
		const harness = createHarness();
		const pending = new DeferredPromise<IBrowserViewModel>();
		harness.setView(pending.p);
		await harness.open();
		await timeout(0);
		harness.ownerVisible.set(false, undefined);
		await pending.complete(harness.model);
		await timeout(0);
		assert.deepStrictEqual({ disposed: harness.disposed, attached: harness.attached.includes(harness.model) }, { disposed: 0, attached: false });
	});

	test('rejects a direct open in an auxiliary window before loading the source', async () => {
		const harness = createHarness();
		Object.assign(harness.editor.group, { windowId: harness.editor.group.windowId + 1 });
		await assert.rejects(harness.open(), /main window/);
		assert.strictEqual(harness.created, 0);
	});
});
