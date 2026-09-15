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
import { ConfirmResult, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IModalEditorContentFooter, IModalEditorSidebar } from '../../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPartModalContext, EditorPartModalSidebarVisibleContext } from '../../../../common/contextkeys.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { EditorService } from '../../../../services/editor/browser/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { createEditorParts, registerTestEditor, TestFileDialogService, TestFileEditorInput, TestLayoutService, workbenchInstantiationService } from '../../workbenchTestServices.js';

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
			parts, editorService, instantiationService,
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

	function createFooter(height = 180) {
		const content = createSidebar({});
		return { contentFooter: { height, render: content.sidebar.render } satisfies IModalEditorContentFooter, state: content.state };
	}

	async function createHarness(options: Omit<IModalEditorSidebar, 'render'> = {}, viewport?: IDimension, size: IDimension = { width: 900, height: 600 }, contentFooter?: IModalEditorContentFooter) {
		const services = await createServices(viewport);
		const content = createSidebar(options);
		const modal = await services.parts.createModalEditorPart({
			maximized: false,
			size,
			sidebar: content.sidebar,
			contentFooter,
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

	suite('Content footer', () => {
		test('occupies only the editor column while the left sidebar spans both rows', async () => {
			const footer = createFooter();
			const h = await createHarness({ sidebarWidth: 240 }, undefined, undefined, footer.contentFooter);
			const sidebar = h.state.container!.getBoundingClientRect();
			const editor = h.editor.getBoundingClientRect();
			const content = footer.state.container!;
			const footerRect = content.getBoundingClientRect();

			assert.deepStrictEqual({
				sameHost: content.parentElement === h.container,
				aligned: editor.left === footerRect.left && editor.width === footerRect.width && sidebar.right === footerRect.left,
				belowEditor: editor.bottom === footerRect.top,
				sidebarSpansFooter: sidebar.bottom === footerRect.bottom,
				editorPrecedesFooter: !!(h.editor.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING),
				sidebarLayout: h.state.layouts.at(-1),
				footerLayout: footer.state.layouts.at(-1),
				renders: footer.state.renders,
			}, {
				sameHost: true, aligned: true, belowEditor: true, sidebarSpansFooter: true, editorPrecedesFooter: true,
				sidebarLayout: { width: 223, height: 549 }, footerLayout: { width: 658, height: 179 }, renders: 1,
			});
			await h.modal.close();
		});

		test('supports a footer without a sidebar through the public editor open route', async () => {
			const services = await createServices();
			const footer = createFooter();
			const input = store.add(new TestFileEditorInput(URI.file('/footer.txt'), editorInputId));
			await services.editorService.openEditor(input, { pinned: true, modal: { contentFooter: footer.contentFooter } }, MODAL_GROUP);
			const modal = services.parts.activeModalEditorPart!;
			const container = footer.state.container!;
			const editor = container.parentElement!.querySelector<HTMLElement>(':scope > .content')!;
			const editorRect = editor.getBoundingClientRect();
			const footerRect = container.getBoundingClientRect();

			assert.deepStrictEqual({
				hasSidebar: modal.hasSidebar,
				aligned: footerRect.left === editorRect.left && footerRect.width === editorRect.width,
				belowEditor: footerRect.top === editorRect.bottom,
				modalContext: footer.state.context?.getContextKeyValue(EditorPartModalContext.key),
				activeEditor: modal.activeGroup.activeEditor,
			}, { hasSidebar: false, aligned: true, belowEditor: true, modalContext: true, activeEditor: input });
			await modal.close();
			assert.strictEqual(footer.state.disposals, 1);
		});

		test('keeps the same footer and focused draft across resizing, maximizing and sidebar visibility', async () => {
			const footer = createFooter();
			const h = await createHarness({ sidebarWidth: 240 }, undefined, undefined, footer.contentFooter);
			const container = footer.state.container!;
			const input = footer.state.input!;
			input.focus();
			input.setSelectionRange(2, 8);
			h.modal.toggleSidebar();
			const hiddenSidebarWidth = footer.state.layouts.at(-1)?.width;
			h.modal.toggleSidebar();
			h.modal.toggleMaximized();
			h.modal.toggleMaximized();
			h.resize(390, 260);
			const smallModal = h.container.getBoundingClientRect();
			const smallSidebar = h.state.container!.getBoundingClientRect();
			const smallFooter = container.getBoundingClientRect();
			const smallEditor = h.editor.getBoundingClientRect();
			h.resize(1200, 800);

			assert.deepStrictEqual({
				sameContainer: footer.state.container === container && container.parentElement === h.container,
				focused: mainWindow.document.activeElement === input,
				draft: input.value, selection: [input.selectionStart, input.selectionEnd],
				hiddenSidebarWidth,
				small: {
					insideViewport: smallModal.left >= 0 && smallModal.right <= 390 && smallModal.bottom <= 260,
					leftNavigation: smallSidebar.right === smallFooter.left && !h.container.classList.contains('sidebar-bottom'),
					visibleEditor: smallEditor.height > 0 && smallEditor.bottom <= smallFooter.top,
					visibleFooter: smallFooter.height > 0 && smallFooter.bottom <= smallModal.bottom,
				},
				restoredSidebarWidth: h.state.container!.getBoundingClientRect().width,
				preferredSidebarWidth: h.modal.sidebarWidth,
				validLayouts: footer.state.layouts.every(size => size.width >= 0 && size.height >= 0),
				renders: footer.state.renders, disposals: footer.state.disposals,
			}, {
				sameContainer: true, focused: true, draft: 'persistent reply', selection: [2, 8], hiddenSidebarWidth: 898,
				small: { insideViewport: true, leftNavigation: true, visibleEditor: true, visibleFooter: true },
				restoredSidebarWidth: 240, preferredSidebarWidth: 240, validLayouts: true, renders: 1, disposals: 0,
			});
			await h.modal.close();
			const layoutCount = footer.state.layouts.length;
			h.resize(1000);
			assert.deepStrictEqual({ disposals: footer.state.disposals, layoutsAfterClose: footer.state.layouts.length - layoutCount },
				{ disposals: 1, layoutsAfterClose: 0 });
		});

		test('places a bottom sidebar after the content footer without changing its lifetime', async () => {
			const footer = createFooter(120);
			const h = await createHarness({ placement: 'bottom', sidebarHeight: 160 }, undefined, undefined, footer.contentFooter);
			const editor = h.editor.getBoundingClientRect();
			const footerRect = footer.state.container!.getBoundingClientRect();
			const sidebar = h.state.container!.getBoundingClientRect();
			assert.deepStrictEqual({
				belowEditor: editor.bottom === footerRect.top,
				aboveSidebar: footerRect.bottom === sidebar.top,
				fullWidth: footerRect.width === sidebar.width,
				footerLayout: footer.state.layouts.at(-1),
				sidebarHeight: sidebar.height,
			}, { belowEditor: true, aboveSidebar: true, fullWidth: true, footerLayout: { width: 898, height: 119 }, sidebarHeight: 160 });
			await h.modal.close();
			assert.deepStrictEqual({ footerDisposals: footer.state.disposals, sidebarDisposals: h.state.disposals },
				{ footerDisposals: 1, sidebarDisposals: 1 });
		});

		test('does not add a footer to an existing modal or replace an existing footer', async () => {
			const h = await createHarness();
			const ignored = createFooter();
			await h.parts.createModalEditorPart({ contentFooter: ignored.contentFooter });
			const absent = { hasFooter: !!h.container.querySelector('.modal-editor-content-footer'), renders: ignored.state.renders };
			await h.modal.close();
			const original = createFooter();
			const modal = await h.parts.createModalEditorPart({ contentFooter: original.contentFooter });
			await h.parts.createModalEditorPart({ contentFooter: ignored.contentFooter });
			assert.deepStrictEqual({
				absent, originalRenders: original.state.renders, ignoredRenders: ignored.state.renders, originalDisposals: original.state.disposals,
			}, { absent: { hasFooter: false, renders: 0 }, originalRenders: 1, ignoredRenders: 0, originalDisposals: 0 });
			await modal.close();
		});

		test('retains the footer when dirty-editor close is cancelled and disposes it on confirmed close', async () => {
			const footer = createFooter();
			const h = await createHarness({}, undefined, undefined, footer.contentFooter);
			const dialogs = h.instantiationService.get(IFileDialogService);
			assert.ok(dialogs instanceof TestFileDialogService);
			const input = store.add(new TestFileEditorInput(URI.file('/dirty-footer.txt'), editorInputId));
			await h.editorService.openEditor(input, { pinned: true }, MODAL_GROUP);
			input.setDirty();
			dialogs.setConfirmResult(ConfirmResult.CANCEL);
			const cancelled = await h.modal.close();
			const retained = { connected: footer.state.container!.isConnected, disposals: footer.state.disposals };
			dialogs.setConfirmResult(ConfirmResult.DONT_SAVE);
			const closed = await h.modal.close();

			assert.deepStrictEqual({ cancelled, retained, closed, disposals: footer.state.disposals },
				{ cancelled: false, retained: { connected: true, disposals: 0 }, closed: true, disposals: 1 });
		});

		test('cleans up the native modal when the footer renderer throws', async () => {
			const services = await createServices();
			const sidebar = createSidebar({});
			const modalCount = document.querySelectorAll('.monaco-modal-editor-block').length;
			await assert.rejects(services.parts.createModalEditorPart({
				sidebar: sidebar.sidebar,
				contentFooter: { height: 180, render: () => { throw new Error('footer render failed'); } },
			}), /footer render failed/);
			assert.deepStrictEqual({
				modalCount: document.querySelectorAll('.monaco-modal-editor-block').length,
				sidebarDisposals: sidebar.state.disposals, modal: services.parts.activeModalEditorPart,
			}, { modalCount, sidebarDisposals: 1, modal: undefined });
		});

		for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
			test(`rejects invalid footer height ${height} before attaching a modal`, async () => {
				const services = await createServices();
				const footer = createFooter(height);
				const modalCount = document.querySelectorAll('.monaco-modal-editor-block').length;
				await assert.rejects(services.parts.createModalEditorPart({ contentFooter: footer.contentFooter }), /positive finite number/);
				assert.deepStrictEqual({
					modalCount: document.querySelectorAll('.monaco-modal-editor-block').length,
					renders: footer.state.renders, modal: services.parts.activeModalEditorPart,
				}, { modalCount, renders: 0, modal: undefined });
			});
		}
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
