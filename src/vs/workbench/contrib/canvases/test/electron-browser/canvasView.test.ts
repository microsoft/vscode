/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibleViewService } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewModel } from '../../../browserView/common/browserView.js';
import { WebContentsViewHost } from '../../../browserView/electron-browser/webContentsViewHost.js';
import { ICanvas, ICanvasReference, ICanvasService } from '../../common/canvas.js';
import { CanvasView, ICanvasViewInput } from '../../electron-browser/canvasView.js';

suite('CanvasView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lays out its status message while no canvas page is attached', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICanvasService, {
			enabled: constObservable(true),
			// Like a restored pin that has not reconnected yet, the canvas cannot be attached.
			isPresentable: () => false,
			resolveCanvasModel: async () => { throw new Error('No canvas page should be requested'); },
		});
		instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => false });
		instantiationService.stub(IAccessibleViewService, {});
		instantiationService.stubInstance(WebContentsViewHost, {
			screenshotElement: $('div'), pauseElement: $('div'),
			onContainerCreated: () => { },
			setModel: () => { },
			setVisible: () => { },
			layout: () => { },
			tryFocus: () => false,
			dispose: () => { },
		});
		const parent = $('.canvas-view-status');
		parent.style.width = '400px';
		parent.style.height = '200px';
		getWindow(parent).document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const view = store.add(instantiationService.createInstance(CanvasView, parent, getWindow(parent), {
			logPrefix: '[test]',
			notPresentableMessage: constObservable('Reconnecting to this canvas…'),
			getHelpContent: () => '',
		}));
		const reference: ICanvasReference = { providerId: 'local', session: URI.parse('session:/a'), chat: URI.parse('chat:/a'), canvas: URI.parse('canvas:/plan') };
		view.setInput({ reference, canvas: constObservable(undefined), membershipPending: constObservable(true) });
		view.setVisible(true);
		view.layout();

		const message = parent.querySelector<HTMLElement>('.session-canvas-message')!;
		const { width, height } = message.getBoundingClientRect();
		assert.deepStrictEqual({ text: message.textContent, shown: width > 0 && height > 0 }, { text: 'Reconnecting to this canvas…', shown: true });
	});

	test('attaches a live canvas to one view at a time and lets a hidden view take it back once shown', async () => {
		const attached: string[] = [];
		const model = upcastPartial<IBrowserViewModel>({
			url: 'https://example.test',
			onDidChangeFocus: Event.None,
			onDidChangeLoadingState: Event.None,
			onDidNavigate: Event.None,
			onDidRequestOpenExternal: Event.None,
			onWillDispose: Event.None,
			layout: async () => { },
		});
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICanvasService, {
			enabled: constObservable(true),
			isPresentable: () => true,
			resolveCanvasModel: async () => ({ model, reused: true }),
		});
		instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => false });
		instantiationService.stub(IAccessibleViewService, {});
		// Both views share this host stub, so its log shows the order of the hand-off.
		instantiationService.stubInstance(WebContentsViewHost, {
			screenshotElement: $('div'), pauseElement: $('div'),
			onContainerCreated: () => { },
			setModel: value => { attached.push(value ? 'attach' : 'detach'); },
			setVisible: () => { },
			layout: () => { },
			tryFocus: () => false,
			dispose: () => { },
		});
		const reference: ICanvasReference = { providerId: 'local', session: URI.parse('session:/a'), chat: URI.parse('chat:/a'), canvas: URI.parse('canvas:/plan') };
		const canvas: ICanvas = { resource: reference.canvas, instanceId: 'plan', title: 'Plan', source: URI.parse('https://example.test') };
		const input: ICanvasViewInput = { reference, canvas: observableValue('canvas', canvas), membershipPending: constObservable(false) };
		const createView = (name: string) => {
			const parent = $(`.canvas-view-${name}`);
			parent.style.width = '400px';
			parent.style.height = '200px';
			getWindow(parent).document.body.appendChild(parent);
			store.add(toDisposable(() => parent.remove()));
			const view = instantiationService.createInstance(CanvasView, parent, getWindow(parent), {
				logPrefix: `[${name}]`,
				notPresentableMessage: constObservable('Not shown here.'),
				getHelpContent: () => '',
			});
			view.setVisible(true);
			return { parent, view, message: () => parent.querySelector('.session-canvas-message')?.textContent };
		};
		const editor = createView('editor');
		const page = createView('page');
		store.add(editor.view);
		// A shown view lays out on the next animation frame. Let it pass first, or a late one takes the canvas back from the page.
		await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(getWindow(editor.parent), () => resolve())));

		editor.view.setInput(input);
		await timeout(0);
		page.parent.style.display = 'none';
		page.view.setInput(input);
		await timeout(0);
		const whileHidden = { editor: editor.message(), page: page.message(), attached: [...attached] };
		page.parent.style.display = '';
		page.view.layout();
		await timeout(0);
		const whileShown = { editor: editor.message(), page: page.message(), attached: [...attached] };
		page.view.dispose();
		editor.view.layout();
		await timeout(0);

		assert.deepStrictEqual({ whileHidden, whileShown, afterPageClosed: { editor: editor.message(), attached } }, {
			whileHidden: { editor: '', page: 'This canvas is shown in another view.', attached: ['attach'] },
			whileShown: { editor: 'This canvas is shown in another view.', page: '', attached: ['attach', 'detach', 'attach'] },
			afterPageClosed: { editor: '', attached: ['attach', 'detach', 'attach', 'detach', 'attach'] },
		});
	});

	test('holds the last frame of the shown canvas while switching to another until that one is revealed or loads too long', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const resolutions = new Map<string, DeferredPromise<IBrowserViewModel>>();
		const createModel = (name: string) => upcastPartial<IBrowserViewModel>({
			url: `https://${name}.test`,
			screenshot: VSBuffer.fromString(`${name} frame`),
			onDidChangeFocus: Event.None,
			onDidChangeLoadingState: Event.None,
			onDidNavigate: Event.None,
			onDidRequestOpenExternal: Event.None,
			onWillDispose: Event.None,
			layout: async () => { },
		});
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICanvasService, {
			enabled: constObservable(true),
			isPresentable: () => true,
			resolveCanvasModel: async (reference: ICanvasReference) => ({ model: await resolutions.get(reference.canvas.path)!.p, reused: false }),
		});
		instantiationService.stub(IAccessibilityService, { isScreenReaderOptimized: () => false });
		instantiationService.stub(IAccessibleViewService, {});
		instantiationService.stubInstance(WebContentsViewHost, {
			screenshotElement: $('div'), pauseElement: $('div'),
			onContainerCreated: () => { },
			setModel: () => { },
			setVisible: () => { },
			layout: () => { },
			tryFocus: () => false,
			dispose: () => { },
		});
		const createInput = (name: string): ICanvasViewInput => {
			resolutions.set(`/${name}`, new DeferredPromise<IBrowserViewModel>());
			const reference: ICanvasReference = { providerId: 'local', session: URI.parse('session:/a'), chat: URI.parse('chat:/a'), canvas: URI.parse(`canvas:/${name}`) };
			return { reference, canvas: constObservable({ resource: reference.canvas, instanceId: name, title: name, source: URI.parse(`https://${name}.test`) }), membershipPending: constObservable(false) };
		};
		const resolve = async (name: string) => {
			resolutions.get(`/${name}`)!.complete(createModel(name));
			await timeout(0);
		};
		const parent = $('.canvas-view-held-frame');
		parent.style.width = '400px';
		parent.style.height = '200px';
		getWindow(parent).document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const view = store.add(instantiationService.createInstance(CanvasView, parent, getWindow(parent), {
			logPrefix: '[test]',
			notPresentableMessage: constObservable('Not shown here.'),
			getHelpContent: () => '',
		}));
		view.setVisible(true);
		// A shown view lays out on the next animation frame, which faked timers leave real. Let it pass first,
		// or a late one supersedes a reveal and postpones releasing the held frame.
		await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(getWindow(parent), () => resolve())));
		const frames = ['plan', 'preview', 'slow'];
		const state = () => {
			const frame = parent.querySelector<HTMLElement>('.session-canvas-held-frame');
			const image = frame?.classList.contains('held') ? frame.style.backgroundImage : '';
			return {
				heldFrame: frames.find(name => image.includes(encodeBase64(VSBuffer.fromString(`${name} frame`)))),
				message: parent.querySelector('.session-canvas-message')?.textContent,
			};
		};

		const plan = createInput('plan');
		view.setInput(plan);
		await resolve('plan');
		view.setInput(createInput('preview'));
		await timeout(0);
		const whileLoading = state();
		await resolve('preview');
		const whenRevealed = state();
		await timeout(100);
		const afterReveal = state();
		view.setInput(createInput('slow'));
		await timeout(300);
		const whenLoadingTakesLong = state();
		await resolve('slow');
		view.clearInput();
		const whenCleared = state();
		view.setInput(plan);
		await timeout(0);
		const afterNextReveal = state();
		view.setVisible(false);

		assert.deepStrictEqual({ whileLoading, whenRevealed, afterReveal, whenLoadingTakesLong, whenCleared, afterNextReveal, afterHide: state() }, {
			whileLoading: { heldFrame: 'plan', message: 'Loading canvas…' },
			whenRevealed: { heldFrame: 'plan', message: '' },
			afterReveal: { heldFrame: undefined, message: '' },
			whenLoadingTakesLong: { heldFrame: undefined, message: 'Loading canvas…' },
			// An editor clears its input before it sets the next one, so the frame waits for that canvas.
			whenCleared: { heldFrame: 'slow', message: '' },
			afterNextReveal: { heldFrame: 'slow', message: '' },
			afterHide: { heldFrame: undefined, message: '' },
		});
	}));
});
