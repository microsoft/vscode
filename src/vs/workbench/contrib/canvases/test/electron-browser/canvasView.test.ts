/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
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
});
