/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewModel } from '../../../browserView/common/browserView.js';
import { WebContentsViewHost } from '../../../browserView/electron-browser/webContentsViewHost.js';
import { CanvasInput, ICanvasService } from '../../common/canvas.js';
import { CanvasEditor } from '../../electron-browser/canvasEditor.js';

suite('CanvasEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(harnessOptions?: { readonly isSessionsWindow?: boolean; readonly openerResult?: boolean }) {
		const parent = $('.canvas-test-parent');
		parent.style.width = '400px';
		parent.style.height = '200px';
		getWindow(parent).document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const group = upcastPartial<IEditorGroup>({ id: 1, windowId: getWindow(parent).vscodeWindowId });
		const visible: boolean[] = [];
		const attached: (IBrowserViewModel | undefined)[] = [];
		const log: string[] = [];
		const errors: string[] = [];
		let pendingLayouts: DeferredPromise<void>[] | undefined;
		let disposed = 0;
		let created = 0;
		const openExternal = store.add(new Emitter<string>());
		const opened: Array<{ resource: string; options: OpenOptions | undefined }> = [];
		const modelAttached = new DeferredPromise<void>();
		const openerCalled = new DeferredPromise<void>();
		const warningLogged = new DeferredPromise<string>();
		const ownerVisible = observableValue('ownerVisible', true);
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.test',
			onDidChangeFocus: Event.None,
			onDidChangeLoadingState: Event.None,
			onDidNavigate: Event.None,
			onDidRequestOpenExternal: openExternal.event,
			onWillDispose: Event.None,
			layout: bounds => {
				log.push(`model.layout:${bounds.width}x${bounds.height}`);
				if (!pendingLayouts) {
					return Promise.resolve();
				}
				const layout = new DeferredPromise<void>();
				pendingLayouts.push(layout);
				return layout.p;
			},
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
		instantiationService.stub(IOpenerService, {
			open: async (resource, openOptions) => {
				opened.push({ resource: resource.toString(), options: openOptions });
				openerCalled.complete();
				return harnessOptions?.openerResult ?? true;
			},
		});
		instantiationService.stub(ILogService, {
			warn: message => warningLogged.complete(String(message)),
			error: message => errors.push(String(message)),
		});
		if (harnessOptions?.isSessionsWindow !== undefined) {
			instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: harnessOptions.isSessionsWindow }));
		}
		instantiationService.stubInstance(WebContentsViewHost, {
			screenshotElement: $('div'), pauseElement: $('div'),
			onContainerCreated: () => { },
			setModel: value => {
				attached.push(value);
				log.push(`host.model:${value ? 'attached' : 'none'}`);
				if (value === model) {
					modelAttached.complete();
				}
			},
			setVisible: value => { visible.push(value); log.push(`host.visible:${value}`); },
			layout: () => { log.push('host.layout'); },
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
			editor, input, model, visible, attached, ownerVisible, openExternal, opened, modelAttached, openerCalled, warningLogged, parent, log, errors,
			get disposed() { return disposed; },
			get created() { return created; },
			setView: (value: Promise<IBrowserViewModel>) => view = value,
			open: () => editor.setInput(input, undefined, { newInGroup: true }, CancellationToken.None),
			/** Native layouts stay pending until the returned promises are settled. */
			deferLayouts: (): DeferredPromise<void>[] => {
				pendingLayouts = [];
				return pendingLayouts;
			},
			/** Shows the pane and lets its scheduled layout run, so no layout is pending afterwards. */
			show: async () => {
				editor.setVisible(true);
				await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(getWindow(parent), () => resolve())));
			},
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

	test('keeps an attached model hidden while its pane is visible inside a hidden editor part', async () => {
		const harness = createHarness();
		harness.parent.style.display = 'none';
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		harness.editor.layout();
		const whileHidden = [...harness.log];
		harness.parent.style.display = '';
		harness.editor.layout();
		await timeout(0);
		assert.deepStrictEqual({
			attached: harness.attached.includes(harness.model),
			shownWhileHidden: whileHidden.includes('host.visible:true'),
			boundsWhileHidden: whileHidden.filter(entry => entry.startsWith('model.layout')),
			reveal: harness.log.slice(whileHidden.length),
		}, {
			attached: true,
			shownWhileHidden: false,
			boundsWhileHidden: [],
			reveal: ['model.layout:400x200', 'host.layout', 'host.visible:true'],
		});
	});

	test('sends native bounds before revealing an attached model', async () => {
		const harness = createHarness();
		harness.editor.setVisible(true);
		await harness.open();
		await timeout(0);
		assert.deepStrictEqual(harness.log.slice(0, harness.log.indexOf('host.visible:true') + 1), [
			'host.visible:false',
			'host.model:attached',
			'model.layout:400x200',
			'host.layout',
			'host.visible:true',
		]);
	});

	test('waits for layout before revealing an attached model when its pane becomes visible again', async () => {
		const harness = createHarness();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		await timeout(0);
		harness.editor.setVisible(false);
		const layouts = harness.deferLayouts();
		const showStart = harness.log.length;
		await harness.show();
		const pending = harness.log.slice(showStart);
		await layouts[0].complete();
		await timeout(0);
		assert.deepStrictEqual({
			pending,
			applied: harness.log.slice(showStart + pending.length),
		}, {
			pending: ['model.layout:400x200'],
			applied: ['host.layout', 'host.visible:true'],
		});
	});

	test('reveals an attached model only after its native bounds are applied', async () => {
		const harness = createHarness();
		const layouts = harness.deferLayouts();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		await timeout(0);
		const pending = [...harness.log];
		await layouts[0].complete();
		await timeout(0);
		assert.deepStrictEqual({ pending, applied: harness.log.slice(pending.length) }, {
			pending: ['host.visible:false', 'host.model:attached', 'model.layout:400x200'],
			applied: ['host.layout', 'host.visible:true'],
		});
	});

	test('refreshes overlays of a resized visible model only after its new bounds are applied', async () => {
		const harness = createHarness();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		await timeout(0);
		const layouts = harness.deferLayouts();
		const resizeStart = harness.log.length;
		harness.parent.style.width = '300px';
		harness.editor.layout();
		const pending = harness.log.slice(resizeStart);
		await layouts[0].complete();
		await timeout(0);
		assert.deepStrictEqual({ pending, applied: harness.log.slice(resizeStart + pending.length) }, {
			pending: ['model.layout:300x200'],
			applied: ['host.layout', 'host.visible:true'],
		});
	});

	test('keeps an attached model hidden when its native bounds cannot be applied', async () => {
		const harness = createHarness();
		const layouts = harness.deferLayouts();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		await layouts[0].error(new Error('view is gone'));
		await timeout(0);
		assert.deepStrictEqual({ log: harness.log, errors: harness.errors }, {
			log: ['host.visible:false', 'host.model:attached', 'model.layout:400x200', 'host.visible:false', 'host.layout'],
			errors: ['[CanvasEditor] Failed to layout canvas'],
		});
	});

	test('reveals an attached model only for its latest pending layout', async () => {
		const harness = createHarness();
		const layouts = harness.deferLayouts();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		harness.parent.style.width = '300px';
		harness.editor.layout();
		const sent = [...harness.log];
		await layouts[0].complete();
		await timeout(0);
		const afterStale = harness.log.slice(sent.length);
		await layouts[1].complete();
		await timeout(0);
		assert.deepStrictEqual({ sent, afterStale, afterLatest: harness.log.slice(sent.length + afterStale.length) }, {
			sent: ['host.visible:false', 'host.model:attached', 'model.layout:400x200', 'model.layout:300x200'],
			afterStale: [],
			afterLatest: ['host.layout', 'host.visible:true'],
		});
	});

	test('does not reveal a pending layout after its pane is hidden', async () => {
		const harness = createHarness();
		const layouts = harness.deferLayouts();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		harness.editor.setVisible(false);
		await layouts[0].complete();
		await timeout(0);
		assert.deepStrictEqual(harness.log, ['host.visible:false', 'host.model:attached', 'model.layout:400x200', 'host.visible:false']);
	});

	test('does not reveal a pending layout after its model is detached', async () => {
		const harness = createHarness();
		const layouts = harness.deferLayouts();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		harness.editor.clearInput();
		await layouts[0].complete();
		await timeout(0);
		assert.deepStrictEqual(harness.log, ['host.visible:false', 'host.model:attached', 'model.layout:400x200', 'host.model:none']);
	});

	test('keeps a pending layout hidden when its editor part is hidden before the bounds are applied', async () => {
		const harness = createHarness();
		const layouts = harness.deferLayouts();
		await harness.show();
		await harness.open();
		await harness.modelAttached.p;
		harness.parent.style.display = 'none';
		await layouts[0].complete();
		await timeout(0);
		assert.deepStrictEqual(harness.log, ['host.visible:false', 'host.model:attached', 'model.layout:400x200', 'host.visible:false', 'host.layout']);
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

	test('routes external link requests through the workbench opener', async () => {
		const harness = createHarness();
		await harness.open();
		await harness.modelAttached.p;
		harness.openExternal.fire('http://localhost:3000/details');
		await harness.openerCalled.p;
		assert.deepStrictEqual(harness.opened, [{
			resource: 'http://localhost:3000/details',
			options: {
				openExternal: true,
				fromUserGesture: true,
				allowContributedOpeners: true,
			},
		}]);
	});

	test('warns when the workbench opener declines an external link request', async () => {
		const harness = createHarness({ openerResult: false });
		await harness.open();
		await harness.modelAttached.p;
		harness.openExternal.fire('https://example.test/details');
		assert.strictEqual(await harness.warningLogged.p, '[CanvasEditor] External canvas link was not opened');
	});

	test('accessibility help describes external links, reopen affordances and closing the canvas itself', () => {
		const closeHelp = [false, true].map(isSessionsWindow => {
			const provider = store.add(createHarness({ isSessionsWindow }).editor.createAccessibleProvider(AccessibleViewType.Help));
			return provider.provideContent().split('\n\n').filter(paragraph => paragraph.startsWith('User-initiated HTTP') || paragraph.startsWith('Closing the tab') || paragraph.startsWith('To close the canvas'));
		});

		assert.deepStrictEqual(closeHelp, [
			[
				'User-initiated HTTP and HTTPS links that request a new tab or window open outside the canvas.',
				'Closing the tab hides this canvas. Reopen it from its canvas pill or ask the agent to open it again.',
				'To close the canvas itself, which also notifies the extension that provides it, use Close Canvas from its canvas pill.',
			],
			[
				'User-initiated HTTP and HTTPS links that request a new tab or window open outside the canvas.',
				'Closing the tab hides this canvas. Use the Add Tab menu in the editor toolbar, then Canvas, to open any available canvas or reopen a hidden canvas.',
				'To close the canvas itself, which also notifies the extension that provides it, use Close Canvas from its canvas pill.',
			],
		]);
	});
});
