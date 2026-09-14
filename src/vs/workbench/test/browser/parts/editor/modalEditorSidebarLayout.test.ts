/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDimension, isHTMLElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IModalEditorSidebar } from '../../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPartModalContext, EditorPartModalSidebarVisibleContext } from '../../../../common/contextkeys.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { EditorService } from '../../../../services/editor/browser/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, TestLayoutService, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('Modal Editor Sidebar Layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorInputId = 'test.modalSidebarLayoutInput';

	setup(() => {
		store.add(registerTestEditor('test.modalSidebarLayoutEditor', [new SyncDescriptor(TestFileEditorInput)], editorInputId));
	});

	async function createServices(viewport: IDimension = { width: 1200, height: 800 }) {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
		const layoutService = new TestLayoutService();
		const workbench = document.body.appendChild(document.createElement('div'));
		workbench.classList.add('monaco-workbench');
		workbench.style.setProperty('--vscode-editorWidget-border', 'transparent');
		disposables.add(toDisposable(() => workbench.remove()));
		layoutService.mainContainer = workbench;
		layoutService.activeContainer = workbench;
		layoutService.containers = [workbench];
		const layoutChanged = disposables.add(new Emitter<IDimension>());
		layoutService.mainContainerDimension = viewport;
		layoutService.onDidLayoutMainContainer = layoutChanged.event;
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);
		return {
			parts, editorService,
			resize: (width: number, height: number = viewport.height) => {
				layoutService.mainContainerDimension = { width, height };
				layoutChanged.fire(layoutService.mainContainerDimension);
			},
		};
	}

	function createSidebar(options: Omit<IModalEditorSidebar, 'render'>) {
		const state: {
			container?: HTMLElement;
			input?: HTMLTextAreaElement;
			context?: IContextKeyService;
			layouts: IDimension[];
			renders: number;
			disposals: number;
		} = { layouts: [], renders: 0, disposals: 0 };
		const sidebar: IModalEditorSidebar = {
			...options,
			render: (container, onDidLayout, context) => {
				assert.ok(isHTMLElement(container));
				state.container = container;
				state.context = context;
				state.renders++;
				state.input = container.appendChild(document.createElement('textarea'));
				state.input.value = 'persistent reply';
				const contentStore = new DisposableStore();
				contentStore.add(onDidLayout(dimension => state.layouts.push(dimension)));
				contentStore.add(toDisposable(() => {
					state.disposals++;
					state.input?.remove();
				}));
				return contentStore;
			},
		};
		return { sidebar, state };
	}

	async function createHarness(options: Omit<IModalEditorSidebar, 'render'> = {}, viewport?: IDimension, size: IDimension = { width: 900, height: 600 }) {
		const services = await createServices(viewport);
		const content = createSidebar(options);
		const modal = await services.parts.createModalEditorPart({
			maximized: false,
			size,
			sidebar: content.sidebar,
		});
		assert.ok(content.state.container);
		const container = content.state.container.parentElement;
		assert.ok(container);
		const editor = container.querySelector<HTMLElement>(':scope > .content');
		assert.ok(editor);
		return { ...services, ...content, modal, container, editor };
	}

	for (const placement of [undefined, 'left'] as const) {
		test(`keeps ${placement ?? 'default'} placement on the left at narrow widths`, async () => {
			const h = await createHarness({ placement, sidebarWidth: 300 });
			const wide = {
				bottom: h.container.classList.contains('sidebar-bottom'),
				sidebarWidth: h.state.container!.getBoundingClientRect().width,
				editorWidth: h.modal.contentDimension.width,
				layoutWidth: h.state.layouts.at(-1)?.width,
			};
			h.resize(540);
			const narrow = {
				bottom: h.container.classList.contains('sidebar-bottom'),
				sidebarWidth: h.state.container!.getBoundingClientRect().width,
				editorWidth: h.modal.contentDimension.width,
				layoutWidth: h.state.layouts.at(-1)?.width,
			};

			assert.deepStrictEqual({ wide, narrow, renders: h.state.renders }, {
				wide: { bottom: false, sidebarWidth: 300, editorWidth: 598, layoutWidth: 283 },
				narrow: { bottom: false, sidebarWidth: 300, editorWidth: 258, layoutWidth: 283 },
				renders: 1,
			});
			await h.modal.close();
		});
	}

	test('places the sidebar below the native editor with content-box layout dimensions', async () => {
		const h = await createHarness({ placement: 'bottom', sidebarHeight: 240 });
		const sidebar = h.state.container!.getBoundingClientRect();
		const editor = h.editor.getBoundingClientRect();

		assert.deepStrictEqual({
			bottom: h.container.classList.contains('sidebar-bottom'),
			fullWidth: sidebar.width,
			height: sidebar.height,
			noOverlap: editor.bottom <= sidebar.top,
			editorPrecedesSidebar: !!(h.editor.compareDocumentPosition(h.state.container!) & Node.DOCUMENT_POSITION_FOLLOWING),
			layout: h.state.layouts.at(-1),
			horizontalSash: !!h.container.querySelector(':scope > .monaco-sash.horizontal'),
		}, {
			bottom: true, fullWidth: 898, height: 240, noOverlap: true, editorPrecedesSidebar: true,
			layout: { width: 882, height: 223 }, horizontalSash: true,
		});
		await h.modal.close();
	});

	test('automatically moves between left and bottom without recreating or moving the rendered content', async () => {
		const h = await createHarness({ placement: 'auto', sidebarWidth: 300, sidebarHeight: 240 });
		const container = h.state.container!;
		const input = h.state.input!;
		input.focus();
		input.setSelectionRange(2, 8);
		const states: { bottom: boolean; width: number; height: number }[] = [];
		for (const width of [540, 1200, 540]) {
			h.resize(width);
			const rect = container.getBoundingClientRect();
			states.push({ bottom: h.container.classList.contains('sidebar-bottom'), width: rect.width, height: rect.height });
		}

		assert.deepStrictEqual({
			states,
			sameContainer: h.state.container === container && container.parentElement === h.container,
			focused: mainWindow.document.activeElement === input,
			draft: input.value,
			selection: [input.selectionStart, input.selectionEnd],
			modalContext: h.state.context?.getContextKeyValue(EditorPartModalContext.key),
			visibleContext: h.state.context?.getContextKeyValue(EditorPartModalSidebarVisibleContext.key),
			preferredWidth: h.modal.sidebarWidth,
			renders: h.state.renders, disposals: h.state.disposals,
		}, {
			states: [
				{ bottom: true, width: 538, height: 240 },
				{ bottom: false, width: 300, height: 565 },
				{ bottom: true, width: 538, height: 240 },
			],
			sameContainer: true, focused: true, draft: 'persistent reply', selection: [2, 8],
			modalContext: true, visibleContext: true, preferredWidth: 300, renders: 1, disposals: 0,
		});
		await h.modal.close();
		assert.strictEqual(h.state.disposals, 1);
	});

	test('preserves the preferred column width when first opened at a narrow width', async () => {
		const h = await createHarness({ placement: 'auto', sidebarWidth: 320 }, { width: 540, height: 800 });
		const narrow = { bottom: h.container.classList.contains('sidebar-bottom'), width: h.modal.sidebarWidth };
		h.resize(1200);
		assert.deepStrictEqual({
			narrow, wide: { bottom: h.container.classList.contains('sidebar-bottom'), width: h.state.container!.getBoundingClientRect().width },
		}, { narrow: { bottom: true, width: 320 }, wide: { bottom: false, width: 320 } });
		await h.modal.close();
	});

	test('switches only when the preferred sidebar plus editor width no longer fit', async () => {
		const h = await createHarness({ placement: 'auto', sidebarWidth: 300 });
		const bottom: boolean[] = [];
		for (const width of [703, 702, 701, 702]) {
			h.resize(width);
			bottom.push(h.container.classList.contains('sidebar-bottom'));
		}
		assert.deepStrictEqual(bottom, [false, false, true, false]);
		await h.modal.close();
	});

	test('adapts when maximizing and returns to the bottom composition on restore', async () => {
		const h = await createHarness({ placement: 'auto', sidebarWidth: 300 }, { width: 1000, height: 800 }, { width: 600, height: 600 });
		const bottom: boolean[] = [h.container.classList.contains('sidebar-bottom')];
		h.modal.toggleMaximized();
		bottom.push(h.container.classList.contains('sidebar-bottom'));
		h.modal.toggleMaximized();
		bottom.push(h.container.classList.contains('sidebar-bottom'));
		assert.deepStrictEqual({ bottom, renders: h.state.renders, preferredWidth: h.modal.sidebarWidth },
			{ bottom: [true, false, true], renders: 1, preferredWidth: 300 });
		await h.modal.close();
	});

	test('honors explicit hiding and restores the same bottom content when shown again', async () => {
		const h = await createHarness({ placement: 'auto', sidebarWidth: 300, sidebarHidden: true }, { width: 540, height: 800 });
		const hidden = { hidden: h.modal.sidebarHidden, layouts: h.state.layouts.length, editorWidth: h.modal.contentDimension.width };
		h.modal.toggleSidebar();
		const shown = { hidden: h.modal.sidebarHidden, height: h.state.container!.getBoundingClientRect().height, renders: h.state.renders };
		h.modal.toggleSidebar();
		const layoutCount = h.state.layouts.length;
		h.resize(500);

		assert.deepStrictEqual({ hidden, shown, layoutsWhileHidden: h.state.layouts.length - layoutCount }, {
			hidden: { hidden: true, layouts: 0, editorWidth: 538 },
			shown: { hidden: false, height: 240, renders: 1 },
			layoutsWhileHidden: 0,
		});
		await h.modal.close();
	});

	test('uses the native bottom sash for height without overwriting the preferred column width', async () => {
		const h = await createHarness({ placement: 'auto', sidebarWidth: 300 }, { width: 540, height: 800 });
		const sash = h.container.querySelector<HTMLElement>(':scope > .monaco-sash.horizontal');
		assert.ok(sash);
		const start = sash.getBoundingClientRect().top;
		sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: start, bubbles: true, button: 0, buttons: 1 }));
		mainWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: start - 60, bubbles: true, buttons: 1 }));
		mainWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 100, clientY: start - 60, bubbles: true, button: 0 }));
		const resizedHeight = h.state.container!.getBoundingClientRect().height;
		sash.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const resetHeight = h.state.container!.getBoundingClientRect().height;
		h.resize(1200);

		assert.deepStrictEqual({
			resizedHeight, resetHeight, columnWidth: h.state.container!.getBoundingClientRect().width,
			preferredWidth: h.modal.sidebarWidth, renders: h.state.renders,
		}, { resizedHeight: 300, resetHeight: 240, columnWidth: 300, preferredWidth: 300, renders: 1 });
		await h.modal.close();
	});

	test('bounds a requested bottom height to the available space without hiding either region', async () => {
		const h = await createHarness({ placement: 'bottom', sidebarHeight: 10000 }, { width: 540, height: 200 });
		const sidebar = h.state.container!.getBoundingClientRect();
		const editor = h.editor.getBoundingClientRect();
		const modal = h.container.getBoundingClientRect();
		assert.deepStrictEqual({
			sidebarVisible: sidebar.height > 0,
			editorVisible: editor.height > 0,
			noOverlap: editor.bottom <= sidebar.top,
			fits: sidebar.bottom <= modal.bottom,
			fitsViewport: modal.bottom <= 200,
			validLayout: h.state.layouts.every(size => size.width >= 0 && size.height >= 0),
		}, { sidebarVisible: true, editorVisible: true, noOverlap: true, fits: true, fitsViewport: true, validLayout: true });
		await h.modal.close();
	});

	test('keeps an automatic bottom sidebar inside a phone-width viewport', async () => {
		const h = await createHarness({ placement: 'auto', sidebarWidth: 300 }, { width: 390, height: 700 });
		const modal = h.container.getBoundingClientRect();
		const sidebar = h.state.container!.getBoundingClientRect();
		assert.deepStrictEqual({
			bottom: h.container.classList.contains('sidebar-bottom'),
			insideViewport: modal.left >= 0 && modal.right <= 390 && modal.bottom <= 700,
			sidebarWidth: sidebar.width,
			sidebarHeight: sidebar.height,
		}, { bottom: true, insideViewport: true, sidebarWidth: 388, sidebarHeight: 240 });
		await h.modal.close();
	});

	test('keeps sidebar creation options immutable when the native modal is reused', async () => {
		const h = await createHarness({ placement: 'bottom' });
		const replacement = createSidebar({ placement: 'left' });
		const reused = await h.parts.createModalEditorPart({ sidebar: replacement.sidebar });
		assert.deepStrictEqual({
			sameModal: reused === h.modal,
			bottom: h.container.classList.contains('sidebar-bottom'),
			renders: h.state.renders,
			replacementRenders: replacement.state.renders,
		}, { sameModal: true, bottom: true, renders: 1, replacementRenders: 0 });
		await h.modal.close();
	});

	test('accepts the sidebar through the public modal open route without replacing main editors', async () => {
		const services = await createServices({ width: 540, height: 800 });
		const original = store.add(new TestFileEditorInput(URI.file('/original.txt'), editorInputId));
		await services.editorService.openEditor(original, { pinned: true }, services.parts.mainPart.activeGroup);
		const review = store.add(new TestFileEditorInput(URI.file('/review.txt'), editorInputId));
		const content = createSidebar({ placement: 'auto', sidebarWidth: 300, sidebarHidden: false });
		await services.editorService.openEditor(review, { pinned: true, modal: { sidebar: content.sidebar } }, MODAL_GROUP);
		const modal = services.parts.activeModalEditorPart;
		assert.ok(modal);
		const duringReview = {
			main: services.parts.mainPart.activeGroup.activeEditor,
			modal: modal.activeGroup.activeEditor,
			bottom: content.state.container?.parentElement?.classList.contains('sidebar-bottom'),
		};
		await modal.close();

		assert.deepStrictEqual({
			duringReview, mainAfterClose: services.parts.mainPart.activeGroup.activeEditor,
			modalAfterClose: services.parts.activeModalEditorPart, disposals: content.state.disposals,
		}, {
			duringReview: { main: original, modal: review, bottom: true },
			mainAfterClose: original, modalAfterClose: undefined, disposals: 1,
		});
	});

	for (const sidebarHeight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		test(`rejects invalid bottom height ${sidebarHeight} before attaching a modal`, async () => {
			const services = await createServices();
			const content = createSidebar({ placement: 'bottom', sidebarHeight });
			const modalCount = document.querySelectorAll('.monaco-modal-editor-block').length;
			await assert.rejects(services.parts.createModalEditorPart({ sidebar: content.sidebar }), /positive finite number/);
			assert.deepStrictEqual({
				modalCount: document.querySelectorAll('.monaco-modal-editor-block').length,
				renders: content.state.renders,
				modal: services.parts.activeModalEditorPart,
			}, { modalCount, renders: 0, modal: undefined });
		});
	}
});
