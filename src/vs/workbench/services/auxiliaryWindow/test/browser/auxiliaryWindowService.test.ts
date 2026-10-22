/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import { $, registerWindow } from '../../../../../base/browser/dom.js';
import { CodeWindow, ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Barrier } from '../../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionServiceImpl.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWorkbenchLayoutService } from '../../../layout/browser/layoutService.js';
import { AuxiliaryWindow, BrowserAuxiliaryWindowService } from '../../browser/auxiliaryWindowService.js';

class TestBrowserAuxiliaryWindowService extends BrowserAuxiliaryWindowService {
	override createContainer(window: CodeWindow, disposables: DisposableStore) {
		return super.createContainer(window, disposables);
	}
}

class TestAuxiliaryWindow extends AuxiliaryWindow {
	protected override enableWindowFocusOnElementFocus(): void { }
	protected override enableMultiWindowAwareTimeout(): void { }
}

suite('Auxiliary window stylesheet readiness', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => restore());

	function createContainer(targetWindow?: CodeWindow) {
		const instantiation = workbenchInstantiationService(undefined, store);
		const service = store.add(instantiation.createInstance(TestBrowserAuxiliaryWindowService));
		const document = targetWindow?.document ?? mainWindow.document.implementation.createHTMLDocument();
		const window = targetWindow ?? new class extends mock<CodeWindow>() {
			override readonly document = document;
		}();
		const pendingStyle = $('link', { rel: 'stylesheet' });
		mainWindow.document.head.appendChild(pendingStyle);
		store.add(toDisposable(() => pendingStyle.remove()));
		const disposables = store.add(new DisposableStore());
		const opacityAtInsertion: string[] = [];
		stub(document.body, 'append').callsFake((...nodes) => {
			for (const node of nodes) {
				assert.ok(node instanceof HTMLElement);
				opacityAtInsertion.push(node.style.opacity);
				document.body.appendChild(node);
			}
		});
		const { container, stylesLoaded } = service.createContainer(window, disposables);
		container.append($('div.part.titlebar'), $('div.part.editor'), $('div.part.statusbar'));
		instantiation.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return container; }
		}());
		const auxiliaryWindow = disposables.add(instantiation.createInstance(TestAuxiliaryWindow, targetWindow ?? mainWindow, container, stylesLoaded));
		const layoutOpacity: string[] = [];
		disposables.add(auxiliaryWindow.onDidLayout(() => layoutOpacity.push(container.style.opacity)));
		const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
		const lastLink = links.pop()!;
		const settleOtherLinks = () => links.forEach(link => link.dispatchEvent(new Event('load')));
		return { instantiation, container, stylesLoaded, document, disposables, auxiliaryWindow, layoutOpacity, opacityAtInsertion, lastLink, settleOtherLinks };
	}

	function createEditorWindow() {
		const frame = $<HTMLIFrameElement>('iframe');
		frame.style.width = '800px';
		frame.style.height = '600px';
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const targetWindow = frame.contentWindow!;
		ensureCodeWindow(targetWindow, 43);
		store.add(registerWindow(targetWindow));
		const window = createContainer(targetWindow);
		window.instantiation.stub(IUserInteractionService, new UserInteractionService());
		const editorContainer = window.container.querySelector<HTMLElement>('.part.editor')!;
		const editor = window.disposables.add(window.instantiation.createInstance(CodeEditorWidget, editorContainer, {
			editContext: false, automaticLayout: false, minimap: { enabled: false },
		}, { contributions: [] }));
		const model = window.disposables.add(window.instantiation.get(IModelService).createModel('', null));
		editor.setModel(model);
		editor.layout({ width: 700, height: 500 });
		window.disposables.add(window.auxiliaryWindow.onDidLayout(dimension => editor.layout(dimension)));
		const otherInput = $<HTMLInputElement>('input');
		window.document.body.appendChild(otherInput);
		const sourceInput = $<HTMLInputElement>('input');
		mainWindow.document.body.appendChild(sourceInput);
		store.add(toDisposable(() => sourceInput.remove()));
		const isPaintSuppressed = () => window.container.style.opacity === '0' || window.container.style.visibility === 'hidden';
		const hasEditorInputFocus = () => window.document.activeElement === editor.getDomNode()?.querySelector('textarea.inputarea');
		return { ...window, editor, otherInput, sourceInput, isPaintSuppressed, hasEditorInputFocus };
	}

	test('accepts ordinary editor focus before stylesheet readiness and retains it on reveal', async () => {
		const { editor, stylesLoaded, auxiliaryWindow, hasEditorInputFocus, isPaintSuppressed } = createEditorWindow();
		editor.focus();
		const pending = { focused: hasEditorInputFocus(), painted: !isPaintSuppressed(), ready: stylesLoaded.isOpen() };
		stylesLoaded.open();
		await auxiliaryWindow.whenStylesHaveLoaded;
		assert.deepStrictEqual({ pending, settled: { focused: hasEditorInputFocus(), painted: !isPaintSuppressed() } }, {
			pending: { focused: true, painted: false, ready: false },
			settled: { focused: true, painted: true },
		});
	});

	test('accepts input focus before stylesheet readiness without replaying focus on reveal', async () => {
		const { container, document, stylesLoaded, auxiliaryWindow, isPaintSuppressed } = createEditorWindow();
		const input = $<HTMLInputElement>('input');
		container.appendChild(input);
		input.focus();
		const pending = { focused: document.activeElement === input, painted: !isPaintSuppressed(), ready: stylesLoaded.isOpen() };
		stylesLoaded.open();
		await auxiliaryWindow.whenStylesHaveLoaded;
		assert.deepStrictEqual({ pending, focusedAfterSettlement: document.activeElement === input }, {
			pending: { focused: true, painted: false, ready: false }, focusedAfterSettlement: true,
		});
	});

	test('preserves focus when the auxiliary editor receives no focus request', async () => {
		const { sourceInput, stylesLoaded, auxiliaryWindow, hasEditorInputFocus } = createEditorWindow();
		sourceInput.focus();
		const pending = mainWindow.document.activeElement === sourceInput;
		stylesLoaded.open();
		await auxiliaryWindow.whenStylesHaveLoaded;
		assert.deepStrictEqual({ pending, sourceStillFocused: mainWindow.document.activeElement === sourceInput, editorFocused: hasEditorInputFocus() }, {
			pending: true, sourceStillFocused: true, editorFocused: false,
		});
	});

	for (const destination of ['auxiliary', 'source'] as const) {
		test(`does not steal focus back from the ${destination} window after stylesheet readiness`, async () => {
			const { editor, otherInput, sourceInput, stylesLoaded, auxiliaryWindow, hasEditorInputFocus } = createEditorWindow();
			editor.focus();
			const initiallyFocused = hasEditorInputFocus();
			const destinationInput = destination === 'auxiliary' ? otherInput : sourceInput;
			destinationInput.focus();
			stylesLoaded.open();
			await auxiliaryWindow.whenStylesHaveLoaded;
			assert.deepStrictEqual({ initiallyFocused, destinationStillFocused: destinationInput.ownerDocument.activeElement === destinationInput }, {
				initiallyFocused: true, destinationStillFocused: true,
			});
		});
	}

	test('does not replay focus or reveal a disposed editor when styles settle', async () => {
		const { editor, sourceInput, stylesLoaded, auxiliaryWindow, disposables, hasEditorInputFocus, isPaintSuppressed } = createEditorWindow();
		editor.focus();
		const initiallyFocused = hasEditorInputFocus();
		disposables.dispose();
		sourceInput.focus();
		stylesLoaded.open();
		await auxiliaryWindow.whenStylesHaveLoaded;
		assert.deepStrictEqual({ initiallyFocused, sourceStillFocused: mainWindow.document.activeElement === sourceInput, painted: !isPaintSuppressed() }, {
			initiallyFocused: true, sourceStillFocused: true, painted: false,
		});
	});

	for (const event of ['load', 'error']) {
		test(`keeps the whole container unpainted before insertion until stylesheet ${event} settlement`, async () => {
			const { container, stylesLoaded, layoutOpacity, opacityAtInsertion, lastLink, settleOtherLinks } = createContainer();
			const initial = { opacity: container.style.opacity, ready: stylesLoaded.isOpen(), chrome: container.children.length };
			settleOtherLinks();
			await Promise.resolve();
			const pending = { opacity: container.style.opacity, ready: stylesLoaded.isOpen() };
			lastLink.dispatchEvent(new Event(event));
			await stylesLoaded.wait();
			assert.deepStrictEqual({
				opacityAtInsertion, initial, pending, layoutOpacity,
				settled: { opacity: container.style.opacity, ready: stylesLoaded.isOpen(), chrome: container.children.length },
			}, {
				opacityAtInsertion: ['0'],
				initial: { opacity: '0', ready: false, chrome: 3 },
				pending: { opacity: '0', ready: false },
				layoutOpacity: ['0'],
				settled: { opacity: '', ready: true, chrome: 3 },
			});
		});
	}

	test('does not reveal a disposed container when stylesheet readiness settles later', async () => {
		const { container, stylesLoaded, disposables, lastLink, settleOtherLinks } = createContainer();
		settleOtherLinks();
		disposables.dispose();
		lastLink.dispatchEvent(new Event('load'));
		await Promise.resolve();
		const afterLateLoad = { opacity: container.style.opacity, ready: stylesLoaded.isOpen() };
		stylesLoaded.open();
		await stylesLoaded.wait();
		assert.deepStrictEqual({ afterLateLoad, afterSettlement: container.style.opacity }, {
			afterLateLoad: { opacity: '0', ready: false }, afterSettlement: '0',
		});
	});

	test('does not reveal if disposed between stylesheet settlement and its continuation', async () => {
		const { container, stylesLoaded, disposables, lastLink, settleOtherLinks } = createContainer();
		settleOtherLinks();
		lastLink.dispatchEvent(new Event('error'));
		disposables.dispose();
		await stylesLoaded.wait();
		assert.deepStrictEqual({ opacity: container.style.opacity, ready: stylesLoaded.isOpen() }, { opacity: '0', ready: true });
	});

	test('does not reveal if a stylesheet-ready layout listener disposes the window', async () => {
		const { container, stylesLoaded, auxiliaryWindow, disposables, lastLink, settleOtherLinks } = createContainer();
		disposables.add(auxiliaryWindow.onWillLayout(() => auxiliaryWindow.dispose()));
		settleOtherLinks();
		lastLink.dispatchEvent(new Event('load'));
		await auxiliaryWindow.whenStylesHaveLoaded;
		assert.deepStrictEqual({ opacity: container.style.opacity, ready: stylesLoaded.isOpen() }, { opacity: '0', ready: true });
	});

	test('recomputes stylesheet-dependent chrome dimensions before revealing without requiring focus', async () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		const frame = $<HTMLIFrameElement>('iframe');
		frame.style.width = '800px';
		frame.style.height = '600px';
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const targetWindow = frame.contentWindow!;
		ensureCodeWindow(targetWindow, 42);
		targetWindow.document.body.style.margin = '0';
		const container = $('div');
		container.style.opacity = '0';
		const titlebar = $('div.test-titlebar');
		titlebar.textContent = 'Unstyled titlebar controls '.repeat(40);
		const editor = $('div.test-editor');
		editor.tabIndex = 0;
		const statusbar = $('div.test-statusbar');
		statusbar.textContent = 'Status';
		container.append(titlebar, editor, statusbar);
		targetWindow.document.body.appendChild(container);
		instantiation.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return container; }
		}());
		const stylesLoaded = new Barrier();
		const window = store.add(instantiation.createInstance(TestAuxiliaryWindow, targetWindow, container, stylesLoaded));
		const opacityDuringLayout: string[] = [];
		store.add(window.onWillLayout(dimension => {
			opacityDuringLayout.push(container.style.opacity);
			editor.style.height = `${dimension.height - titlebar.getBoundingClientRect().height - statusbar.getBoundingClientRect().height}px`;
		}));
		window.layout();
		const unstyledHeight = editor.getBoundingClientRect().height;
		const style = $('style');
		style.textContent = '.test-titlebar { height: 30px; overflow: hidden; } .test-statusbar { height: 22px; }';
		targetWindow.document.head.appendChild(style);
		stylesLoaded.open();
		await window.whenStylesHaveLoaded;
		const settledHeight = editor.getBoundingClientRect().height;
		const bottomBeforeFocus = statusbar.getBoundingClientRect().bottom;
		editor.focus();
		assert.deepStrictEqual({
			opacityDuringLayout,
			opacity: container.style.opacity,
			grewToReclaimUnstyledChrome: settledHeight > unstyledHeight,
			fillsViewport: bottomBeforeFocus === targetWindow.innerHeight,
			heightUnchangedByFocus: editor.getBoundingClientRect().height === settledHeight,
			bottomUnchangedByFocus: statusbar.getBoundingClientRect().bottom === bottomBeforeFocus,
		}, {
			opacityDuringLayout: ['0', '0'], opacity: '',
			grewToReclaimUnstyledChrome: true, fillsViewport: true,
			heightUnchangedByFocus: true, bottomUnchangedByFocus: true,
		});
	});

	test('continues synchronizing later styles without hiding an already ready container', async () => {
		const { container, stylesLoaded, document, lastLink, settleOtherLinks } = createContainer();
		settleOtherLinks();
		lastLink.dispatchEvent(new Event('load'));
		await stylesLoaded.wait();
		const style = $('style', { id: 'auxiliary-readiness-test-style' });
		style.textContent = '.auxiliary-readiness-test { color: red; }';
		mainWindow.document.head.appendChild(style);
		store.add(toDisposable(() => style.remove()));
		await Promise.resolve();
		const added = document.getElementById(style.id)?.textContent;
		style.textContent = '.auxiliary-readiness-test { color: blue; }';
		await Promise.resolve();
		const changed = document.getElementById(style.id)?.textContent;
		style.remove();
		await Promise.resolve();
		assert.deepStrictEqual({ added, changed, removed: !document.getElementById(style.id), opacity: container.style.opacity }, {
			added: '.auxiliary-readiness-test { color: red; }',
			changed: '.auxiliary-readiness-test { color: blue; }',
			removed: true, opacity: '',
		});
	});
});
