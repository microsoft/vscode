/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as DOM from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorContributionCtor, EditorContributionInstantiation } from '../../../../../editor/browser/editorExtensions.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { CompletionItemKind, Hover, SignatureHelpResult, SignatureHelpTriggerKind } from '../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ContentHoverController } from '../../../../../editor/contrib/hover/browser/contentHoverController.js';
import { HoverStartMode, HoverStartSource } from '../../../../../editor/contrib/hover/browser/hoverOperation.js';
import { HoverParticipantRegistry } from '../../../../../editor/contrib/hover/browser/hoverTypes.js';
import { InlineSuggestionHintsContentWidget } from '../../../../../editor/contrib/inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget.js';
import { MarkdownHoverParticipant } from '../../../../../editor/contrib/hover/browser/markdownHoverParticipant.js';
import { ParameterHintsController } from '../../../../../editor/contrib/parameterHints/browser/parameterHints.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { ISuggestMemoryService } from '../../../../../editor/contrib/suggest/browser/suggestMemory.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { UserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionServiceImpl.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { CellEditState, IBaseCellEditorOptions, IActiveNotebookEditorDelegate, ICellViewModel, INotebookEditorCreationOptions } from '../../browser/notebookBrowser.js';
import { CellContentPart, CellPartsCollection } from '../../browser/view/cellPart.js';
import { CellChatPart } from '../../browser/view/cellParts/chat/cellChatPart.js';
import { CellComments } from '../../browser/view/cellParts/cellComments.js';
import { CellContextKeyPart } from '../../browser/view/cellParts/cellContextKeys.js';
import { CellDragAndDropController } from '../../browser/view/cellParts/cellDnd.js';
import { CellExecutionPart } from '../../browser/view/cellParts/cellExecution.js';
import { CellOutputContainer } from '../../browser/view/cellParts/cellOutput.js';
import { CellProgressBar } from '../../browser/view/cellParts/cellProgressBar.js';
import { CellEditorStatusBar } from '../../browser/view/cellParts/cellStatusPart.js';
import { BetweenCellToolbar, CellTitleToolbarPart } from '../../browser/view/cellParts/cellToolbars.js';
import { CollapsedCodeCellExecutionIcon } from '../../browser/view/cellParts/codeCellExecutionIcon.js';
import { CollapsedCellOutput } from '../../browser/view/cellParts/collapsedCellOutput.js';
import { NotebookCellEditorPool } from '../../browser/view/notebookCellEditorPool.js';
import { BaseCellRenderTemplate } from '../../browser/view/notebookRenderingCommon.js';
import { CodeCellRenderer, MarkupCellRenderer } from '../../browser/view/renderers/cellRenderer.js';
import { CodeCellViewModel } from '../../browser/viewModel/codeCellViewModel.js';
import { MarkupCellViewModel } from '../../browser/viewModel/markupCellViewModel.js';
import { CellViewModel } from '../../browser/viewModel/notebookViewModelImpl.js';
import { CellKind } from '../../common/notebookCommon.js';
import { NOTEBOOK_EDITOR_FOCUSED } from '../../common/notebookContextKeys.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { INotebookLoggingService } from '../../common/notebookLoggingService.js';
import { withTestNotebook } from './testNotebookEditor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('Notebook cell editor overflow widgets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function ownTemplate<T extends BaseCellRenderTemplate>(template: T, store: DisposableStore): T {
		store.add(toDisposable(() => {
			template.elementDisposables.clear();
			template.templateDisposables.dispose();
		}));
		return template;
	}

	async function withFixture(kind: CellKind, callback: (fixture: ReturnType<typeof createFixture>, cell: CellViewModel, store: DisposableStore) => Promise<void>) {
		await withTestNotebook([['cell', 'plaintext', kind]], async (notebookEditor, viewModel, _store, notebookServices) => {
			const fixtureStore = new DisposableStore();
			const renderedCells = fixtureStore.add(new DisposableStore());
			try {
				const fixture = createFixture(notebookEditor, notebookServices, fixtureStore);
				const cell = viewModel.viewCells[0];
				assert.ok(cell instanceof CodeCellViewModel || cell instanceof MarkupCellViewModel);
				await callback(fixture, cell, renderedCells);
			} finally {
				renderedCells.dispose();
				fixtureStore.dispose();
			}
		});
	}

	function createFixture(notebookEditor: IActiveNotebookEditorDelegate, notebookServices: TestInstantiationService, store: DisposableStore) {
		const root = DOM.append(mainWindow.document.body, DOM.$('.notebook-overflow-test'));
		const overflowRoot = DOM.append(root, DOM.$('.notebook-overflow-root'));
		store.add(toDisposable(() => root.remove()));
		const services = createCodeEditorServices(store);
		const contextKeyService = store.add(services.createInstance(ContextKeyService));
		services.stub(IContextKeyService, contextKeyService);
		services.stub(IUserInteractionService, new UserInteractionService());
		services.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override onDidShowContextMenu = Event.None;
			override onDidHideContextMenu = Event.None;
		});
		services.stub(IMenuService, {});
		services.stub(IStorageService, store.add(new TestStorageService()));
		services.stub(IMarkdownRendererService, services.createInstance(MarkdownRendererService));
		services.stub(ISuggestMemoryService, { memorize: () => { }, select: () => 0 });
		services.stub(INotebookExecutionStateService, notebookServices.get(INotebookExecutionStateService));
		services.stub(INotebookLoggingService, notebookServices.get(INotebookLoggingService));
		for (const cell of notebookEditor.getViewModel().viewCells) {
			assert.ok(cell instanceof CodeCellViewModel || cell instanceof MarkupCellViewModel);
			const model = store.add(services.get(IModelService).createModel(cell.getText(), null, cell.uri));
			sinon.stub(cell, 'resolveTextModel').resolves(model);
			sinon.stub(cell, 'attachTextEditor');
			sinon.stub(cell, 'detachTextEditor');
		}
		const notebookContext = store.add(contextKeyService.createScoped(root));
		NOTEBOOK_EDITOR_FOCUSED.bindTo(notebookContext).set(true);

		const participants = HoverParticipantRegistry.getAll();
		const previousParticipants = participants.splice(0, participants.length);
		HoverParticipantRegistry.register(MarkdownHoverParticipant);
		store.add(toDisposable(() => participants.splice(0, participants.length, ...previousParticipants)));

		const creationOptions: INotebookEditorCreationOptions = {
			menuIds: {
				notebookToolbar: MenuId.NotebookToolbar,
				cellTitleToolbar: MenuId.NotebookCellTitle,
				cellDeleteToolbar: MenuId.NotebookCellDelete,
				cellInsertToolbar: MenuId.NotebookCellBetween,
				cellTopInsertToolbar: MenuId.NotebookCellListTop,
				cellExecuteToolbar: MenuId.NotebookCellExecute,
			},
			cellEditorContributions: [
				{ id: ContentHoverController.ID, ctor: ContentHoverController as EditorContributionCtor, instantiation: EditorContributionInstantiation.Eager },
				{ id: ParameterHintsController.ID, ctor: ParameterHintsController as EditorContributionCtor, instantiation: EditorContributionInstantiation.Eager },
				{ id: SuggestController.ID, ctor: SuggestController as EditorContributionCtor, instantiation: EditorContributionInstantiation.Eager },
			]
		};
		const baseEditorOptions = new class extends mock<IBaseCellEditorOptions>() {
			override onDidChange = Event.None;
			override value = { fixedOverflowWidgets: true, hover: { delay: 0 }, minimap: { enabled: false }, editContext: false, cursorBlinking: 'solid' as const, scrollBeyondLastLine: false };
		};
		const layout = notebookEditor.getLayoutInfo();
		const overrides: Partial<IActiveNotebookEditorDelegate> = {
			creationOptions,
			onDidScroll: Event.None,
			onDidChangeLayout: Event.None,
			isReadOnly: false,
			scrollBottom: 400,
			getDomNode: () => root,
			getOverflowContainerDomNode: () => overflowRoot,
			hasEditorFocus: () => false,
			focusContainer: () => { },
			getBaseCellEditorOptions: () => baseEditorOptions,
			getLayoutInfo: () => ({ ...layout, width: 600, height: 400 }),
			getAbsoluteTopOfElement: () => 0,
			getAbsoluteBottomOfElement: () => 100,
			getHeightOfElement: () => 100,
			hideMarkupPreviews: async () => { },
			unhideMarkupPreviews: async () => { },
			createMarkupPreview: async () => { },
		};
		const cellNotebookEditor: IActiveNotebookEditorDelegate = Object.create(notebookEditor, Object.getOwnPropertyDescriptors(overrides));

		// Keep the editor and cell lifecycle real without constructing unrelated notebook toolbars, chat, or outputs.
		const emptyPart = store.add(new class extends CellContentPart {
			render(): void { }
			viewUpdateShowOutputs(): void { }
			viewUpdateHideOuputs(): void { }
		});
		services.stubInstance(CellChatPart, emptyPart);
		services.stubInstance(CellComments, emptyPart);
		services.stubInstance(CellContextKeyPart, emptyPart);
		services.stubInstance(CellExecutionPart, emptyPart);
		services.stubInstance(CellProgressBar, emptyPart);
		services.stubInstance(CellEditorStatusBar, emptyPart);
		services.stubInstance(BetweenCellToolbar, emptyPart);
		services.stubInstance(CollapsedCellOutput, emptyPart);
		services.stubInstance(CellOutputContainer, emptyPart);
		services.stubInstance(CollapsedCodeCellExecutionIcon, { setVisibility: () => { }, dispose: () => { } });
		services.stubInstance(CellTitleToolbarPart, { onDidUpdateActions: Event.None, dispose: () => { } });

		const editors = new Map<ICellViewModel, ICodeEditor>();
		const pool = new class extends mock<NotebookCellEditorPool>() {
			override preserveFocusedEditor(): void { }
		};
		const dnd = new class extends mock<CellDragAndDropController>() {
			override registerDragHandle(): void { }
		};
		const contextProvider = (container: HTMLElement) => notebookContext.createScoped(container);
		const codeRenderer = store.add(services.createInstance(CodeCellRenderer, cellNotebookEditor, editors, pool, dnd, contextProvider));
		const markupRenderer = store.add(services.createInstance(MarkupCellRenderer, cellNotebookEditor, dnd, editors, contextProvider));
		return { root, overflowRoot, services, codeRenderer, markupRenderer };
	}

	async function showHover(editor: ICodeEditor, services: TestInstantiationService, store: DisposableStore) {
		if (!editor.getLayoutInfo().width) {
			editor.layout({ width: 500, height: editor.getContentHeight() });
		}
		store.add(services.get(ILanguageFeaturesService).hoverProvider.register('*', {
			provideHover: () => ({ contents: [{ value: 'cell hover' }], range: new Range(1, 1, 1, 4) })
		}));
		const hover = ContentHoverController.get(editor)!;
		const shown = new DeferredPromise<void>();
		const listener = store.add(hover.onHoverContentsChanged(() => {
			if (hover.isHoverVisible) {
				void shown.complete();
			}
		}));
		hover.showContentHover(new Range(1, 1, 1, 4), HoverStartMode.Immediate, HoverStartSource.Keyboard, false);
		await shown.p;
		editor.render();
		listener.dispose();
		return hover;
	}

	async function pendingHover(editor: ICodeEditor, services: TestInstantiationService, store: DisposableStore) {
		const started = new DeferredPromise<CancellationToken>();
		const result = new DeferredPromise<Hover>();
		const registration = store.add(services.get(ILanguageFeaturesService).hoverProvider.register('*', {
			provideHover: (_model, _position, token) => {
				void started.complete(token);
				return result.p;
			}
		}));
		const hover = ContentHoverController.get(editor)!;
		hover.showContentHover(new Range(1, 1, 1, 4), HoverStartMode.Immediate, HoverStartSource.Keyboard, false);
		const token = await started.p;
		return {
			hover, token,
			complete: async () => {
				await result.complete({ contents: [{ value: 'stale hover' }], range: new Range(1, 1, 1, 4) });
				registration.dispose();
			}
		};
	}

	for (const kind of [CellKind.Code, CellKind.Markup]) {
		const name = kind === CellKind.Code ? 'code' : 'Markdown';

		test(`${name}: external content widgets inherit editor context and widget focus`, async () => {
			await withFixture(kind, async (fixture, cell, store) => {
				cell.layoutChange({ outerWidth: 600 });
				let editor: ICodeEditor;
				if (cell instanceof CodeCellViewModel) {
					const template = ownTemplate(fixture.codeRenderer.renderTemplate(DOM.append(fixture.root, DOM.$('.cell-row'))), store);
					editor = template.editor;
					// A template allocated for measurement must not expose its external widgets.
					fixture.codeRenderer.renderElement(cell, 0, template);
					assert.deepStrictEqual([template.editorOverflowWidgets.domNode.style.display, template.editorOverflowWidgets.domNode.inert], ['none', true]);
					template.cellParts = template.templateDisposables.add(new CellPartsCollection(mainWindow, [], []));
					fixture.codeRenderer.renderElement(cell, 0, template, { height: 100 });
				} else {
					const markupCell = cell as MarkupCellViewModel;
					markupCell.updateEditState(CellEditState.Editing, 'test');
					const template = ownTemplate(fixture.markupRenderer.renderTemplate(DOM.append(fixture.root, DOM.$('.cell-row'))), store);
					template.cellParts = template.templateDisposables.add(new CellPartsCollection(mainWindow, [], []));
					fixture.markupRenderer.renderElement(markupCell, 0, template, { height: 100 });
					editor = template.currentEditor!;
				}
				editor.setModel(await cell.resolveTextModel());
				const hover = await showHover(editor, fixture.services, store);
				const host = editor.getOverflowWidgetsDomNode()!;
				const popup = host.querySelector<HTMLElement>('.monaco-hover')!;
				const marker = editor.contextKeyService.createKey('notebookOverflowEditor', name);
				store.add(toDisposable(() => marker.reset()));
				editor.focus();
				hover.focus();
				editor.onVisible();
				await timeout(0);
				assert.deepStrictEqual({
					externalHost: host.parentElement === fixture.overflowRoot && !fixture.root.querySelector('.cell-row')!.contains(host),
					externalPopup: !!popup,
					editorContext: fixture.services.get(IContextKeyService).getContext(popup).getValue('notebookOverflowEditor'),
					composite: fixture.services.get(IContextKeyService).getContext(popup).getValue(EditorContextKeys.inCompositeEditor.key),
					notebookFocus: fixture.services.get(IContextKeyService).getContext(popup).getValue(NOTEBOOK_EDITOR_FOCUSED.key),
					widgetFocus: editor.hasWidgetFocus(),
					textFocus: editor.hasTextFocus()
				}, { externalHost: true, externalPopup: true, editorContext: name, composite: true, notebookFocus: true, widgetFocus: true, textFocus: false });
			});
		});

		test(`${name}: collapse cancels hovers even while an inline suggestion dropdown is open`, async () => {
			await runWithFakedTimers({}, async () => {
				await withFixture(kind, async (fixture, cell, store) => {
					cell.layoutChange({ outerWidth: 600 });
					let editor: ICodeEditor;
					if (cell instanceof CodeCellViewModel) {
						const template = ownTemplate(fixture.codeRenderer.renderTemplate(DOM.append(fixture.root, DOM.$('.cell-row'))), store);
						template.cellParts = template.templateDisposables.add(new CellPartsCollection(mainWindow, [], []));
						fixture.codeRenderer.renderElement(cell, 0, template, { height: 100 });
						editor = template.editor;
					} else {
						const markupCell = cell as MarkupCellViewModel;
						markupCell.updateEditState(CellEditState.Editing, 'test');
						const template = ownTemplate(fixture.markupRenderer.renderTemplate(DOM.append(fixture.root, DOM.$('.cell-row'))), store);
						template.cellParts = template.templateDisposables.add(new CellPartsCollection(mainWindow, [], []));
						fixture.markupRenderer.renderElement(markupCell, 0, template, { height: 100 });
						editor = template.currentEditor!;
					}
					editor.setModel(await cell.resolveTextModel());
					const hover = await showHover(editor, fixture.services, store);
					const host = editor.getOverflowWidgetsDomNode()!;
					sinon.stub(InlineSuggestionHintsContentWidget, 'dropDownVisible').get(() => true);
					cell.isInputCollapsed = true;
					const existing = { hidden: host.style.display, inert: host.inert, hover: hover.isHoverVisible };
					cell.isInputCollapsed = false;
					const pending = await pendingHover(editor, fixture.services, store);
					cell.isInputCollapsed = true;
					await pending.complete();
					cell.isInputCollapsed = false;
					assert.deepStrictEqual({
						existing,
						cancelled: pending.token.isCancellationRequested,
						reactivated: host.style.display !== 'none' && !host.inert,
						staleHover: hover.isHoverVisible,
						reusedEditor: host === editor.getOverflowWidgetsDomNode()
					}, { existing: { hidden: 'none', inert: true, hover: false }, cancelled: true, reactivated: true, staleHover: false, reusedEditor: true });
				});
			});
		});
	}

	test('code: unrender cancels existing and delayed hovers while preserving the cached editor and host', async () => {
		await runWithFakedTimers({}, async () => {
			await withFixture(CellKind.Code, async (fixture, viewCell, store) => {
				const cell = viewCell as CodeCellViewModel;
				cell.layoutChange({ outerWidth: 600 });
				const template = ownTemplate(fixture.codeRenderer.renderTemplate(DOM.append(fixture.root, DOM.$('.cell-row'))), store);
				template.cellParts = template.templateDisposables.add(new CellPartsCollection(mainWindow, [], []));
				fixture.codeRenderer.renderElement(cell, 0, template, { height: 100 });
				const editor = template.editor;
				editor.setModel(await cell.resolveTextModel());
				const hover = await showHover(editor, fixture.services, store);
				fixture.codeRenderer.disposeElement(cell, 0, template);
				const host = editor.getOverflowWidgetsDomNode()!;
				const existing = { hidden: host.style.display, inert: host.inert, hover: hover.isHoverVisible };
				fixture.codeRenderer.renderElement(cell, 0, template, { height: 100 });
				const pending = await pendingHover(editor, fixture.services, store);
				fixture.codeRenderer.disposeElement(cell, 0, template);
				const unrendered = { hidden: host.style.display, inert: host.inert, connected: host.isConnected, cancelled: pending.token.isCancellationRequested };
				await pending.complete();
				fixture.codeRenderer.renderElement(cell, 0, template, { height: 100 });
				assert.deepStrictEqual({
					existing,
					unrendered,
					reused: template.editor === editor && editor.getOverflowWidgetsDomNode() === host,
					staleHover: pending.hover.isHoverVisible,
					active: host.style.display !== 'none' && !host.inert
				}, { existing: { hidden: 'none', inert: true, hover: false }, unrendered: { hidden: 'none', inert: true, connected: true, cancelled: true }, reused: true, staleHover: false, active: true });
				fixture.codeRenderer.disposeTemplate(template);
				assert.strictEqual(host.isConnected, false);
			});
		});
	});

	test('Markdown: preview cancels pending hover and signature help on the retained editor', async () => {
		await runWithFakedTimers({}, async () => {
			await withFixture(CellKind.Markup, async (fixture, viewCell, store) => {
				const cell = viewCell as MarkupCellViewModel;
				cell.layoutChange({ outerWidth: 600 });
				cell.updateEditState(CellEditState.Editing, 'test');
				const template = ownTemplate(fixture.markupRenderer.renderTemplate(DOM.append(fixture.root, DOM.$('.cell-row'))), store);
				template.cellParts = template.templateDisposables.add(new CellPartsCollection(mainWindow, [], []));
				fixture.markupRenderer.renderElement(cell, 0, template, { height: 100 });
				const editor = template.currentEditor!;
				editor.setModel(await cell.resolveTextModel());
				const pending = await pendingHover(editor, fixture.services, store);
				const signatureStarted = new DeferredPromise<CancellationToken>();
				const signatureResult = new DeferredPromise<SignatureHelpResult>();
				store.add(fixture.services.get(ILanguageFeaturesService).signatureHelpProvider.register('*', {
					signatureHelpTriggerCharacters: ['('],
					provideSignatureHelp: (_model, _position, token) => {
						void signatureStarted.complete(token);
						return signatureResult.p;
					}
				}));
				ParameterHintsController.get(editor)!.trigger({ triggerKind: SignatureHelpTriggerKind.Invoke });
				const signatureToken = await signatureStarted.p;
				cell.updateEditState(CellEditState.Preview, 'test');
				const host = editor.getOverflowWidgetsDomNode()!;
				const preview = { hidden: host.style.display, inert: host.inert };
				await pending.complete();
				await signatureResult.complete({
					value: { signatures: [{ label: 'cell()', parameters: [] }], activeSignature: 0, activeParameter: 0 },
					dispose: () => { }
				});
				cell.updateEditState(CellEditState.Editing, 'test');
				assert.deepStrictEqual({
					preview,
					cancelled: [pending.token.isCancellationRequested, signatureToken.isCancellationRequested],
					reused: template.currentEditor === editor && editor.getOverflowWidgetsDomNode() === host,
					active: host.style.display !== 'none' && !host.inert,
					staleHover: pending.hover.isHoverVisible,
					staleSignature: !!host.querySelector('.parameter-hints-widget.visible')
				}, { preview: { hidden: 'none', inert: true }, cancelled: [true, true], reused: true, active: true, staleHover: false, staleSignature: false });
				fixture.markupRenderer.disposeElement(cell, 0, template);
				assert.strictEqual(host.isConnected, false);
			});
		});
	});

	test('code: collapse cancels pending suggestions', async () => {
		await runWithFakedTimers({}, async () => {
			await withFixture(CellKind.Code, async (fixture, viewCell, store) => {
				const cell = viewCell as CodeCellViewModel;
				cell.layoutChange({ outerWidth: 600 });
				const template = ownTemplate(fixture.codeRenderer.renderTemplate(DOM.append(fixture.root, DOM.$('.cell-row'))), store);
				template.cellParts = template.templateDisposables.add(new CellPartsCollection(mainWindow, [], []));
				fixture.codeRenderer.renderElement(cell, 0, template, { height: 100 });
				const editor = template.editor;
				editor.setModel(await cell.resolveTextModel());
				const started = new DeferredPromise<CancellationToken>();
				const result = new DeferredPromise<{ suggestions: { label: string; insertText: string; kind: CompletionItemKind; range: Range }[] }>();
				store.add(fixture.services.get(ILanguageFeaturesService).completionProvider.register('*', {
					_debugDisplayName: 'notebookOverflowTest',
					provideCompletionItems: (_model, _position, _context, token) => {
						void started.complete(token);
						return result.p;
					}
				}));
				SuggestController.get(editor)!.triggerSuggest();
				const token = await started.p;
				cell.isInputCollapsed = true;
				await result.complete({ suggestions: [{ label: 'cell', insertText: 'cell', kind: CompletionItemKind.Text, range: new Range(1, 1, 1, 4) }] });
				cell.isInputCollapsed = false;
				assert.deepStrictEqual({
					cancelled: token.isCancellationRequested,
					staleSuggestion: !!editor.getOverflowWidgetsDomNode()!.querySelector('.suggest-widget.visible')
				}, { cancelled: true, staleSuggestion: false });
			});
		});
	});
});
