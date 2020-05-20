/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line code-import-patterns
import 'vs/css!vs/workbench/contrib/notebook/browser/media/notebook';
import { getZoomLevel } from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { Delayer } from 'vs/base/common/async';
import { renderCodicons } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { escape } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption, EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { tokenizeLineToHTML } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { BOTTOM_CELL_TOOLBAR_HEIGHT, EDITOR_BOTTOM_PADDING, EDITOR_TOOLBAR_HEIGHT, EDITOR_TOP_MARGIN, EDITOR_TOP_PADDING } from 'vs/workbench/contrib/notebook/browser/constants';
import { CancelCellAction, ChangeCellLanguageAction, ExecuteCellAction, INotebookCellActionContext, InsertCodeCellAction, InsertMarkdownCellAction } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { BaseCellRenderTemplate, CellEditState, CellRunState, CodeCellRenderTemplate, ICellViewModel, INotebookCellList, INotebookEditor, MarkdownCellRenderTemplate, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_RUNNABLE, NOTEBOOK_CELL_RUN_STATE, NOTEBOOK_CELL_TYPE, NOTEBOOK_VIEW_TYPE } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellMenus } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellMenus';
import { CodeCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/codeCell';
import { StatefullMarkdownCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/markdownCell';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkdownCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markdownCellViewModel';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { CellKind, NotebookCellRunState } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const $ = DOM.$;

export class NotebookCellListDelegate implements IListVirtualDelegate<CellViewModel> {
	private _lineHeight: number;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this._lineHeight = BareFontInfo.createFromRawSettings(editorOptions, getZoomLevel()).lineHeight;
	}

	getHeight(element: CellViewModel): number {
		return element.getHeight(this._lineHeight);
	}

	hasDynamicHeight(element: CellViewModel): boolean {
		return element.hasDynamicHeight();
	}

	getTemplateId(element: CellViewModel): string {
		if (element.cellKind === CellKind.Markdown) {
			return MarkdownCellRenderer.TEMPLATE_ID;
		} else {
			return CodeCellRenderer.TEMPLATE_ID;
		}
	}
}

export class CodiconActionViewItem extends ContextAwareMenuEntryActionViewItem {
	constructor(
		readonly _action: MenuItemAction,
		_keybindingService: IKeybindingService,
		_notificationService: INotificationService,
		_contextMenuService: IContextMenuService
	) {
		super(_action, _keybindingService, _notificationService, _contextMenuService);
	}
	updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.innerHTML = renderCodicons(this._commandAction.label ?? '');
		}
	}
}

export class CellEditorOptions {

	private static fixedEditorOptions: IEditorOptions = {
		padding: {
			top: EDITOR_TOP_PADDING,
			bottom: EDITOR_BOTTOM_PADDING
		},
		scrollBeyondLastLine: false,
		scrollbar: {
			verticalScrollbarSize: 14,
			horizontal: 'auto',
			useShadows: true,
			verticalHasArrows: false,
			horizontalHasArrows: false,
			alwaysConsumeMouseWheel: false
		},
		renderLineHighlightOnlyWhenFocus: true,
		overviewRulerLanes: 0,
		selectOnLineNumbers: false,
		lineNumbers: 'off',
		lineDecorationsWidth: 0,
		glyphMargin: false,
		fixedOverflowWidgets: true,
		minimap: { enabled: false },
		renderValidationDecorations: 'on'
	};

	private _value: IEditorOptions;
	private _disposable: IDisposable;

	private readonly _onDidChange = new Emitter<IEditorOptions>();
	readonly onDidChange: Event<IEditorOptions> = this._onDidChange.event;

	constructor(configurationService: IConfigurationService, language: string) {

		this._disposable = configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor')) {
				this._value = computeEditorOptions();
				this._onDidChange.fire(this.value);
			}
		});

		const computeEditorOptions = () => {
			const editorOptions = deepClone(configurationService.getValue<IEditorOptions>('editor', { overrideIdentifier: language }));
			return {
				...editorOptions,
				...CellEditorOptions.fixedEditorOptions
			};
		};

		this._value = computeEditorOptions();
	}

	dispose(): void {
		this._onDidChange.dispose();
		this._disposable.dispose();
	}

	get value(): IEditorOptions {
		return this._value;
	}

	setGlyphMargin(gm: boolean): void {
		if (gm !== this._value.glyphMargin) {
			this._value.glyphMargin = gm;
			this._onDidChange.fire(this.value);
		}
	}
}

abstract class AbstractCellRenderer {
	protected editorOptions: CellEditorOptions;
	private actionRunner = new ActionRunner();

	constructor(
		protected readonly instantiationService: IInstantiationService,
		protected readonly notebookEditor: INotebookEditor,
		protected readonly contextMenuService: IContextMenuService,
		configurationService: IConfigurationService,
		private readonly keybindingService: IKeybindingService,
		private readonly notificationService: INotificationService,
		protected readonly contextKeyServiceProvider: (container?: HTMLElement) => IContextKeyService,
		language: string,
		protected readonly dndController: CellDragAndDropController
	) {
		this.editorOptions = new CellEditorOptions(configurationService, language);
	}

	dispose() {
		this.editorOptions.dispose();
	}

	protected createBottomCellToolbar(container: HTMLElement): ToolBar {
		const toolbar = new ToolBar(container, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					const item = new CodiconActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
					return item;
				}

				return undefined;
			}
		});

		toolbar.getContainer().style.height = `${BOTTOM_CELL_TOOLBAR_HEIGHT}px`;
		return toolbar;
	}

	protected setupBetweenCellToolbarActions(element: CodeCellViewModel | MarkdownCellViewModel, templateData: BaseCellRenderTemplate, disposables: DisposableStore, context: INotebookCellActionContext): void {
		const container = templateData.bottomCellContainer;
		container.innerHTML = '';
		container.style.height = `${BOTTOM_CELL_TOOLBAR_HEIGHT}px`;

		DOM.append(container, $('.seperator'));
		const addCodeCell = DOM.append(container, $('span.button'));
		addCodeCell.innerHTML = renderCodicons(escape(`$(add) Code `));
		addCodeCell.tabIndex = 0;
		const insertCellBelow = this.instantiationService.createInstance(InsertCodeCellAction);

		const toolbarContext = {
			...context,
			ui: true
		};

		disposables.add(DOM.addDisposableListener(addCodeCell, DOM.EventType.CLICK, e => {
			this.actionRunner.run(insertCellBelow, toolbarContext);
			e.stopPropagation();
		}));

		disposables.add((DOM.addDisposableListener(addCodeCell, DOM.EventType.KEY_DOWN, async e => {
			const event = new StandardKeyboardEvent(e);
			if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
				e.preventDefault();
				e.stopPropagation();
				this.actionRunner.run(insertCellBelow, toolbarContext);
			}
		})));

		DOM.append(container, $('.seperator-short'));
		const addMarkdownCell = DOM.append(container, $('span.button'));
		addMarkdownCell.innerHTML = renderCodicons(escape('$(add) Markdown '));
		addMarkdownCell.tabIndex = 0;
		const insertMarkdownBelow = this.instantiationService.createInstance(InsertMarkdownCellAction);
		disposables.add(DOM.addDisposableListener(addMarkdownCell, DOM.EventType.CLICK, e => {
			this.actionRunner.run(insertMarkdownBelow, toolbarContext);
			e.stopPropagation();
		}));

		disposables.add((DOM.addDisposableListener(addMarkdownCell, DOM.EventType.KEY_DOWN, async e => {
			const event = new StandardKeyboardEvent(e);
			if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
				e.preventDefault();
				e.stopPropagation();
				this.actionRunner.run(insertMarkdownBelow, toolbarContext);
			}
		})));

		DOM.append(container, $('.seperator'));

		if (element instanceof CodeCellViewModel) {
			const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
			container.style.top = `${bottomToolbarOffset}px`;

			disposables.add(element.onDidChangeLayout(() => {
				const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
				container.style.top = `${bottomToolbarOffset}px`;
			}));
		} else {
			container.style.position = 'static';
			container.style.height = `${BOTTOM_CELL_TOOLBAR_HEIGHT}`;
		}
	}

	protected createToolbar(container: HTMLElement): ToolBar {
		const toolbar = new ToolBar(container, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					const item = new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
					return item;
				}

				return undefined;
			}
		});

		return toolbar;
	}

	private getCellToolbarActions(menu: IMenu): IAction[] {
		const actions: IAction[] = [];
		for (let [, menuActions] of menu.getActions({ shouldForwardArgs: true })) {
			actions.push(...menuActions);
		}

		return actions;
	}

	protected setupCellToolbarActions(scopedContextKeyService: IContextKeyService, templateData: BaseCellRenderTemplate, disposables: DisposableStore): void {
		const cellMenu = this.instantiationService.createInstance(CellMenus);
		const menu = disposables.add(cellMenu.getCellTitleMenu(scopedContextKeyService));

		const updateActions = () => {
			const actions = this.getCellToolbarActions(menu);

			templateData.toolbar.setActions(actions)();

			if (templateData.focusIndicator) {
				if (actions.length) {
					templateData.container.classList.add('cell-has-toolbar-actions');
					templateData.focusIndicator.style.top = `${EDITOR_TOOLBAR_HEIGHT + EDITOR_TOP_MARGIN}px`;
				} else {
					templateData.container.classList.remove('cell-has-toolbar-actions');
					templateData.focusIndicator.style.top = `${EDITOR_TOP_MARGIN}px`;
				}
			}
		};

		updateActions();
		disposables.add(menu.onDidChange(() => {
			updateActions();
		}));
	}

	protected commonRenderTemplate(templateData: BaseCellRenderTemplate): void {
		templateData.disposables.add(DOM.addDisposableListener(templateData.container, DOM.EventType.FOCUS, () => {
			if (templateData.currentRenderedCell) {
				this.notebookEditor.selectElement(templateData.currentRenderedCell);
			}
		}, true));
	}

	protected commonRenderElement(element: ICellViewModel, index: number, templateData: BaseCellRenderTemplate): void {
		if (element.dragging) {
			templateData.container.classList.add(DRAGGING_CLASS);
		} else {
			templateData.container.classList.remove(DRAGGING_CLASS);
		}
	}
}

export class MarkdownCellRenderer extends AbstractCellRenderer implements IListRenderer<MarkdownCellViewModel, MarkdownCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'markdown_cell';

	constructor(
		notebookEditor: INotebookEditor,
		dndController: CellDragAndDropController,
		private renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>,
		contextKeyServiceProvider: (container?: HTMLElement) => IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notebookEditor, contextMenuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, 'markdown', dndController);
	}

	get templateId() {
		return MarkdownCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): MarkdownCellRenderTemplate {
		const contextKeyService = this.contextKeyServiceProvider(container);

		container.tabIndex = -1;
		container.classList.add('markdown-cell-row');
		const disposables = new DisposableStore();
		const toolbar = disposables.add(this.createToolbar(container));
		const focusIndicator = DOM.append(container, DOM.$('.notebook-cell-focus-indicator'));
		focusIndicator.setAttribute('draggable', 'true');

		const codeInnerContent = DOM.append(container, $('.cell.code'));
		const editorPart = DOM.append(codeInnerContent, $('.cell-editor-part'));
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
		editorPart.style.display = 'none';

		const innerContent = DOM.append(container, $('.cell.markdown'));
		const foldingIndicator = DOM.append(focusIndicator, DOM.$('.notebook-folding-indicator'));

		const bottomCellContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));

		const statusBar = this.instantiationService.createInstance(CellEditorStatusBar, editorPart);

		const templateData: MarkdownCellRenderTemplate = {
			contextKeyService,
			container,
			cellContainer: innerContent,
			editorPart,
			editorContainer,
			focusIndicator,
			foldingIndicator,
			disposables,
			elementDisposables: new DisposableStore(),
			toolbar,
			bottomCellContainer,
			statusBarContainer: statusBar.statusBarContainer,
			languageStatusBarItem: statusBar.languageStatusBarItem,
			toJSON: () => { return {}; }
		};
		this.dndController.registerDragHandle(templateData, () => this.getDragImage(templateData));
		this.commonRenderTemplate(templateData);
		return templateData;
	}

	private getDragImage(templateData: MarkdownCellRenderTemplate): HTMLElement {
		if (templateData.currentRenderedCell!.editState === CellEditState.Editing) {
			return this._getEditDragImage(templateData);
		} else {
			return this._getMarkdownDragImage(templateData);
		}
	}

	private _getMarkdownDragImage(templateData: MarkdownCellRenderTemplate): HTMLElement {
		const dragImageContainer = DOM.$('.cell-drag-image.monaco-list-row.focused.markdown-cell-row');
		dragImageContainer.innerHTML = templateData.container.innerHTML;

		// Remove all rendered content nodes after the
		const markdownContent = dragImageContainer.querySelector('.cell.markdown')!;
		const contentNodes = markdownContent.children[0].children;
		for (let i = contentNodes.length - 1; i >= 1; i--) {
			contentNodes.item(i)!.remove();
		}

		return dragImageContainer;
	}

	private _getEditDragImage(templateData: MarkdownCellRenderTemplate): HTMLElement {
		return new CodeCellDragImageRenderer().getDragImage(templateData, templateData.currentEditor!, 'markdown');
	}

	renderElement(element: MarkdownCellViewModel, index: number, templateData: MarkdownCellRenderTemplate, height: number | undefined): void {
		this.commonRenderElement(element, index, templateData);

		templateData.currentRenderedCell = element;
		templateData.currentEditor = undefined;
		templateData.editorPart!.style.display = 'none';
		templateData.cellContainer.innerHTML = '';
		let renderedHTML = element.getHTML();
		if (renderedHTML) {
			templateData.cellContainer.appendChild(renderedHTML);
		}

		if (height) {
			const elementDisposables = templateData.elementDisposables;

			// render toolbar first
			this.setupCellToolbarActions(templateData.contextKeyService, templateData, elementDisposables);

			const toolbarContext = <INotebookCellActionContext>{
				cell: element,
				notebookEditor: this.notebookEditor,
				$mid: 12
			};
			templateData.toolbar.context = toolbarContext;

			this.setupBetweenCellToolbarActions(element, templateData, elementDisposables, toolbarContext);

			const markdownCell = this.instantiationService.createInstance(StatefullMarkdownCell, this.notebookEditor, element, templateData, this.editorOptions.value, this.renderedEditors);
			elementDisposables.add(this.editorOptions.onDidChange(newValue => markdownCell.updateEditorOptions(newValue)));
			elementDisposables.add(markdownCell);

			NOTEBOOK_CELL_TYPE.bindTo(templateData.contextKeyService).set('markdown');
			NOTEBOOK_VIEW_TYPE.bindTo(templateData.contextKeyService).set(element.viewType);
			const metadata = element.getEvaluatedMetadata(this.notebookEditor.viewModel!.notebookDocument.metadata);
			const cellEditableKey = NOTEBOOK_CELL_EDITABLE.bindTo(templateData.contextKeyService);
			cellEditableKey.set(!!metadata.editable);
			const updateForMetadata = () => {
				const metadata = element.getEvaluatedMetadata(this.notebookEditor.viewModel!.notebookDocument.metadata);
				cellEditableKey.set(!!metadata.editable);
			};

			updateForMetadata();
			elementDisposables.add(element.onDidChangeState((e) => {
				if (e.metadataChanged) {
					updateForMetadata();
				}
			}));

			const editModeKey = NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.bindTo(templateData.contextKeyService);
			editModeKey.set(element.editState === CellEditState.Editing);
			elementDisposables.add(element.onDidChangeState((e) => {
				if (e.editStateChanged) {
					editModeKey.set(element.editState === CellEditState.Editing);
				}
			}));

			element.totalHeight = height;

			templateData.languageStatusBarItem.update(element, this.notebookEditor);
		}
	}

	disposeTemplate(templateData: MarkdownCellRenderTemplate): void {
		templateData.disposables.clear();
	}

	disposeElement(element: ICellViewModel, index: number, templateData: MarkdownCellRenderTemplate, height: number | undefined): void {
		if (height) {
			templateData.elementDisposables.clear();
		}
	}
}

const DRAGGING_CLASS = 'cell-dragging';
const GLOBAL_DRAG_CLASS = 'global-drag-active';

type DragImageProvider = () => HTMLElement;

interface CellDragEvent {
	browserEvent: DragEvent;
	draggedOverCell: ICellViewModel;
	cellTop: number;
	cellHeight: number;
	dragPosRatio: number;
}

export class CellDragAndDropController extends Disposable {
	// TODO@roblourens - should probably use dataTransfer here, but any dataTransfer set makes the editor think I am dropping a file, need
	// to figure out how to prevent that
	private currentDraggedCell: ICellViewModel | undefined;

	private listInsertionIndicator: HTMLElement;

	private list!: INotebookCellList;

	private isScrolling = false;
	private scrollingDelayer: Delayer<void>;

	constructor(
		private readonly notebookEditor: INotebookEditor,
		insertionIndicatorContainer: HTMLElement
	) {
		super();

		this.listInsertionIndicator = DOM.append(insertionIndicatorContainer, $('.cell-list-insertion-indicator'));

		this._register(domEvent(document.body, DOM.EventType.DRAG_START, true)(this.onGlobalDragStart.bind(this)));
		this._register(domEvent(document.body, DOM.EventType.DRAG_END, true)(this.onGlobalDragEnd.bind(this)));

		const addCellDragListener = (eventType: string, handler: (e: CellDragEvent) => void) => {
			this._register(DOM.addDisposableListener(
				notebookEditor.getDomNode(),
				eventType,
				e => {
					const cellDragEvent = this.toCellDragEvent(e);
					if (cellDragEvent) {
						handler(cellDragEvent);
					}
				}));
		};

		addCellDragListener(DOM.EventType.DRAG_OVER, event => {
			event.browserEvent.preventDefault();
			this.onCellDragover(event);
		});
		addCellDragListener(DOM.EventType.DROP, event => {
			event.browserEvent.preventDefault();
			this.onCellDrop(event);
		});
		addCellDragListener(DOM.EventType.DRAG_LEAVE, event => {
			event.browserEvent.preventDefault();
			this.onCellDragLeave(event);
		});

		this.scrollingDelayer = new Delayer(200);
	}

	setList(value: INotebookCellList) {
		this.list = value;

		this.list.onWillScroll(e => {
			if (!e.scrollTopChanged) {
				return;
			}

			this.setInsertIndicatorVisibility(false);
			this.isScrolling = true;
			this.scrollingDelayer.trigger(() => {
				this.isScrolling = false;
			});
		});
	}

	private setInsertIndicatorVisibility(visible: boolean) {
		this.listInsertionIndicator.style.opacity = visible ? '1' : '0';
	}

	private toCellDragEvent(event: DragEvent): CellDragEvent | undefined {
		const targetTop = this.notebookEditor.getDomNode().getBoundingClientRect().top;
		const dragOffset = this.list.scrollTop + event.clientY - targetTop;
		const draggedOverCell = this.list.elementAt(dragOffset);
		if (!draggedOverCell) {
			return undefined;
		}

		const cellTop = this.list.getAbsoluteTopOfElement(draggedOverCell);
		const cellHeight = this.list.elementHeight(draggedOverCell);

		const dragPosInElement = dragOffset - cellTop;
		const dragPosRatio = dragPosInElement / cellHeight;

		return <CellDragEvent>{
			browserEvent: event,
			draggedOverCell,
			cellTop,
			cellHeight,
			dragPosRatio
		};
	}

	private onGlobalDragStart() {
		this.notebookEditor.getDomNode().classList.add(GLOBAL_DRAG_CLASS);
	}

	private onGlobalDragEnd() {
		this.notebookEditor.getDomNode().classList.remove(GLOBAL_DRAG_CLASS);
	}

	private onCellDragover(event: CellDragEvent): void {
		if (this.isScrolling || this.currentDraggedCell === event.draggedOverCell) {
			this.setInsertIndicatorVisibility(false);
			return;
		}

		const dropDirection = this.getDropInsertDirection(event);
		const insertionIndicatorAbsolutePos = dropDirection === 'above' ? event.cellTop : event.cellTop + event.cellHeight;
		const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop;
		if (insertionIndicatorTop >= 0) {
			this.listInsertionIndicator.style.top = `${insertionIndicatorAbsolutePos - this.list.scrollTop}px`;
			this.setInsertIndicatorVisibility(true);
		} else {
			this.setInsertIndicatorVisibility(false);
		}
	}

	private getDropInsertDirection(event: CellDragEvent): 'above' | 'below' {
		return event.dragPosRatio < 0.5 ? 'above' : 'below';
	}

	private onCellDrop(event: CellDragEvent): void {
		const draggedCell = this.currentDraggedCell!;
		this.dragCleanup();

		const isCopy = (event.browserEvent.ctrlKey && !platform.isMacintosh) || (event.browserEvent.altKey && platform.isMacintosh);

		const dropDirection = this.getDropInsertDirection(event);
		const insertionIndicatorAbsolutePos = dropDirection === 'above' ? event.cellTop : event.cellTop + event.cellHeight;
		const insertionIndicatorTop = insertionIndicatorAbsolutePos - this.list.scrollTop;
		const editorHeight = this.notebookEditor.getDomNode().getBoundingClientRect().height;
		if (insertionIndicatorTop < 0 || insertionIndicatorTop > editorHeight) {
			// Ignore drop, insertion point is off-screen
			return;
		}

		if (isCopy) {
			this.copyCell(draggedCell, event.draggedOverCell, dropDirection);
		} else {
			this.moveCell(draggedCell, event.draggedOverCell, dropDirection);
		}
	}

	private onCellDragLeave(event: CellDragEvent): void {
		if (!event.browserEvent.relatedTarget || !DOM.isAncestor(event.browserEvent.relatedTarget as HTMLElement, this.notebookEditor.getDomNode())) {
			this.setInsertIndicatorVisibility(false);
		}
	}

	private dragCleanup(): void {
		if (this.currentDraggedCell) {
			this.currentDraggedCell.dragging = false;
			this.currentDraggedCell = undefined;
		}

		this.setInsertIndicatorVisibility(false);
	}

	registerDragHandle(templateData: BaseCellRenderTemplate, dragImageProvider: DragImageProvider): void {
		const container = templateData.container;
		const dragHandle = templateData.focusIndicator;

		templateData.disposables.add(domEvent(dragHandle, DOM.EventType.DRAG_END)(() => {
			// Note, templateData may have a different element rendered into it by now
			container.classList.remove(DRAGGING_CLASS);
			this.dragCleanup();
		}));

		templateData.disposables.add(domEvent(dragHandle, DOM.EventType.DRAG_START)(event => {
			if (!event.dataTransfer) {
				return;
			}

			this.currentDraggedCell = templateData.currentRenderedCell!;
			this.currentDraggedCell.dragging = true;

			const dragImage = dragImageProvider();
			container.parentElement!.appendChild(dragImage);
			event.dataTransfer.setDragImage(dragImage, 0, 0);
			setTimeout(() => container.parentElement!.removeChild(dragImage!), 0); // Comment this out to debug drag image layout

			container.classList.add(DRAGGING_CLASS);
		}));
	}

	private moveCell(draggedCell: ICellViewModel, ontoCell: ICellViewModel, direction: 'above' | 'below') {
		const editState = draggedCell.editState;
		this.notebookEditor.moveCell(draggedCell, ontoCell, direction);
		this.notebookEditor.focusNotebookCell(draggedCell, editState === CellEditState.Editing ? 'editor' : 'container');
	}

	private copyCell(draggedCell: ICellViewModel, ontoCell: ICellViewModel, direction: 'above' | 'below') {
		const editState = draggedCell.editState;
		const newCell = this.notebookEditor.insertNotebookCell(ontoCell, draggedCell.cellKind, direction, draggedCell.getText());
		if (newCell) {
			this.notebookEditor.focusNotebookCell(newCell, editState === CellEditState.Editing ? 'editor' : 'container');
		}
	}
}

export class CellLanguageStatusBarItem extends Disposable {
	private labelElement: HTMLElement;

	private _cell: ICellViewModel | undefined;
	private _editor: INotebookEditor | undefined;

	private cellDisposables: DisposableStore;

	constructor(
		readonly container: HTMLElement,
		@IModeService private readonly modeService: IModeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.labelElement = DOM.append(container, $('.cell-language-picker'));
		this.labelElement.tabIndex = 0;

		this._register(DOM.addDisposableListener(this.labelElement, DOM.EventType.CLICK, () => {
			this.instantiationService.invokeFunction(accessor => {
				new ChangeCellLanguageAction().run(accessor, { notebookEditor: this._editor!, cell: this._cell! });
			});
		}));
		this._register(this.cellDisposables = new DisposableStore());
	}

	update(cell: ICellViewModel, editor: INotebookEditor): void {
		this.cellDisposables.clear();
		this._cell = cell;
		this._editor = editor;

		this.render();
		this.cellDisposables.add(this._cell.model.onDidChangeLanguage(() => this.render()));
	}

	private render(): void {
		this.labelElement.textContent = this.modeService.getLanguageName(this._cell!.language!);
	}
}

class EditorTextRenderer {

	getRichText(editor: ICodeEditor, modelRange: Range): string | null {
		const model = editor.getModel();
		if (!model) {
			return null;
		}

		const colorMap = this._getDefaultColorMap();
		const fontInfo = editor.getOptions().get(EditorOption.fontInfo);
		const fontFamily = fontInfo.fontFamily === EDITOR_FONT_DEFAULTS.fontFamily ? fontInfo.fontFamily : `'${fontInfo.fontFamily}', ${EDITOR_FONT_DEFAULTS.fontFamily}`;

		return `<div style="`
			+ `color: ${colorMap[modes.ColorId.DefaultForeground]};`
			+ `background-color: ${colorMap[modes.ColorId.DefaultBackground]};`
			+ `font-family: ${fontFamily};`
			+ `font-weight: ${fontInfo.fontWeight};`
			+ `font-size: ${fontInfo.fontSize}px;`
			+ `line-height: ${fontInfo.lineHeight}px;`
			+ `white-space: pre;`
			+ `">`
			+ this._getRichTextLines(model, modelRange, colorMap)
			+ '</div>';
	}

	private _getRichTextLines(model: ITextModel, modelRange: Range, colorMap: string[]): string {
		const startLineNumber = modelRange.startLineNumber;
		const startColumn = modelRange.startColumn;
		const endLineNumber = modelRange.endLineNumber;
		const endColumn = modelRange.endColumn;

		const tabSize = model.getOptions().tabSize;

		let result = '';

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const lineTokens = model.getLineTokens(lineNumber);
			const lineContent = lineTokens.getLineContent();
			const startOffset = (lineNumber === startLineNumber ? startColumn - 1 : 0);
			const endOffset = (lineNumber === endLineNumber ? endColumn - 1 : lineContent.length);

			if (lineContent === '') {
				result += '<br>';
			} else {
				result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
			}
		}

		return result;
	}

	private _getDefaultColorMap(): string[] {
		let colorMap = modes.TokenizationRegistry.getColorMap();
		let result: string[] = ['#000000'];
		if (colorMap) {
			for (let i = 1, len = colorMap.length; i < len; i++) {
				result[i] = Color.Format.CSS.formatHex(colorMap[i]);
			}
		}
		return result;
	}
}

class CodeCellDragImageRenderer {
	getDragImage(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement {
		let dragImage = this._getDragImage(templateData, editor, type);
		if (!dragImage) {
			// TODO@roblourens I don't think this can happen
			dragImage = document.createElement('div');
			dragImage.textContent = '1 cell';
		}

		return dragImage;
	}

	private _getDragImage(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement | null {
		const dragImageContainer = DOM.$(`.cell-drag-image.monaco-list-row.focused.${type}-cell-row`);
		dragImageContainer.innerHTML = templateData.container.innerHTML;

		const editorContainer = dragImageContainer.querySelector('.cell-editor-container');
		if (!editorContainer) {
			return null;
		}

		const focusIndicator = dragImageContainer.querySelector('.notebook-cell-focus-indicator') as HTMLElement;
		if (focusIndicator) {
			focusIndicator.style.height = '40px';
		}

		const richEditorText = new EditorTextRenderer().getRichText(editor, new Range(1, 1, 1, 1000));
		if (!richEditorText) {
			return null;
		}

		editorContainer.innerHTML = richEditorText;

		return dragImageContainer;
	}
}

class CellEditorStatusBar {
	readonly cellStatusMessageContainer: HTMLElement;
	readonly cellRunStatusContainer: HTMLElement;
	readonly statusBarContainer: HTMLElement;
	readonly languageStatusBarItem: CellLanguageStatusBarItem;
	readonly durationContainer: HTMLElement;

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.statusBarContainer = DOM.append(container, $('.cell-statusbar-container'));
		const leftStatusBarItems = DOM.append(this.statusBarContainer, $('.cell-status-left'));
		const rightStatusBarItems = DOM.append(this.statusBarContainer, $('.cell-status-right'));
		this.cellRunStatusContainer = DOM.append(leftStatusBarItems, $('.cell-run-status'));
		this.durationContainer = DOM.append(leftStatusBarItems, $('.cell-run-duration'));
		this.cellStatusMessageContainer = DOM.append(leftStatusBarItems, $('.cell-status-message'));
		this.languageStatusBarItem = instantiationService.createInstance(CellLanguageStatusBarItem, rightStatusBarItems);
	}
}

export class CodeCellRenderer extends AbstractCellRenderer implements IListRenderer<CodeCellViewModel, CodeCellRenderTemplate> {
	static readonly TEMPLATE_ID = 'code_cell';

	constructor(
		protected notebookEditor: INotebookEditor,
		private renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>,
		dndController: CellDragAndDropController,
		contextKeyServiceProvider: (container?: HTMLElement) => IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		super(instantiationService, notebookEditor, contextMenuService, configurationService, keybindingService, notificationService, contextKeyServiceProvider, 'python', dndController);
	}

	get templateId() {
		return CodeCellRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CodeCellRenderTemplate {
		const contextKeyService = this.contextKeyServiceProvider(container);

		container.classList.add('code-cell-row');
		container.tabIndex = -1;
		const disposables = new DisposableStore();
		const toolbar = disposables.add(this.createToolbar(container));
		const focusIndicator = DOM.append(container, DOM.$('.notebook-cell-focus-indicator'));
		focusIndicator.setAttribute('draggable', 'true');

		const cellContainer = DOM.append(container, $('.cell.code'));
		const runButtonContainer = DOM.append(cellContainer, $('.run-button-container'));
		const runToolbar = this.createToolbar(runButtonContainer);
		disposables.add(runToolbar);

		const executionOrderLabel = DOM.append(runButtonContainer, $('div.execution-count-label'));

		// create a special context key service that set the inCompositeEditor-contextkey
		const editorContextKeyService = this.contextKeyServiceProvider(container);
		const editorInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService]));
		EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);

		const editorPart = DOM.append(cellContainer, $('.cell-editor-part'));
		const editorContainer = DOM.append(editorPart, $('.cell-editor-container'));
		const editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
			...this.editorOptions.value,
			dimension: {
				width: 0,
				height: 0
			}
		}, {});

		disposables.add(this.editorOptions.onDidChange(newValue => editor.updateOptions(newValue)));

		const progressBar = new ProgressBar(editorPart);
		progressBar.hide();
		disposables.add(progressBar);

		const statusBar = this.instantiationService.createInstance(CellEditorStatusBar, editorPart);
		const timer = new TimerRenderer(statusBar.durationContainer);

		const outputContainer = DOM.append(container, $('.output'));
		const focusSink = DOM.append(container, $('.cell-editor-focus-sink'));
		focusSink.setAttribute('tabindex', '0');
		const bottomCellContainer = DOM.append(container, $('.cell-bottom-toolbar-container'));

		const templateData: CodeCellRenderTemplate = {
			contextKeyService,
			container,
			cellContainer,
			statusBarContainer: statusBar.statusBarContainer,
			cellRunStatusContainer: statusBar.cellRunStatusContainer,
			cellStatusMessageContainer: statusBar.cellStatusMessageContainer,
			languageStatusBarItem: statusBar.languageStatusBarItem,
			progressBar,
			focusIndicator,
			toolbar,
			runToolbar,
			runButtonContainer,
			executionOrderLabel,
			outputContainer,
			editor,
			disposables,
			elementDisposables: new DisposableStore(),
			bottomCellContainer,
			timer,
			toJSON: () => { return {}; }
		};

		this.dndController.registerDragHandle(templateData, () => new CodeCellDragImageRenderer().getDragImage(templateData, templateData.editor, 'code'));

		disposables.add(DOM.addDisposableListener(focusSink, DOM.EventType.FOCUS, () => {
			if (templateData.currentRenderedCell) {
				this.notebookEditor.focusNotebookCell(templateData.currentRenderedCell, 'output');
			}
		}));

		this.commonRenderTemplate(templateData);

		return templateData;
	}

	private updateForRunState(element: CodeCellViewModel, templateData: CodeCellRenderTemplate, runStateKey: IContextKey<string>): void {
		runStateKey.set(CellRunState[element.runState]);
		if (element.runState === CellRunState.Running) {
			templateData.progressBar.infinite().show(500);

			templateData.runToolbar.setActions([
				this.instantiationService.createInstance(CancelCellAction)
			])();
		} else {
			templateData.progressBar.hide();

			templateData.runToolbar.setActions([
				this.instantiationService.createInstance(ExecuteCellAction)
			])();
		}
	}

	private updateForMetadata(element: CodeCellViewModel, templateData: CodeCellRenderTemplate, cellEditableKey: IContextKey<boolean>, cellRunnableKey: IContextKey<boolean>): void {
		const metadata = element.getEvaluatedMetadata(this.notebookEditor.viewModel!.notebookDocument.metadata);
		DOM.toggleClass(templateData.cellContainer, 'runnable', !!metadata.runnable);
		this.renderExecutionOrder(element, templateData);
		cellEditableKey.set(!!metadata.editable);
		cellRunnableKey.set(!!metadata.runnable);
		templateData.cellStatusMessageContainer.textContent = metadata?.statusMessage || '';

		if (metadata.runState === NotebookCellRunState.Success) {
			templateData.cellRunStatusContainer.innerHTML = renderCodicons('$(check)');
		} else if (metadata.runState === NotebookCellRunState.Error) {
			templateData.cellRunStatusContainer.innerHTML = renderCodicons('$(error)');
		} else if (metadata.runState === NotebookCellRunState.Running) {
			templateData.cellRunStatusContainer.innerHTML = renderCodicons('$(sync~spin)');
		} else {
			templateData.cellRunStatusContainer.innerHTML = '';
		}

		if (metadata.runState === NotebookCellRunState.Running) {
			if (metadata.runStartTime) {
				templateData.elementDisposables.add(templateData.timer.start(metadata.runStartTime));
			} else {
				templateData.timer.clear();
			}
		} else if (typeof metadata.lastRunDuration === 'number') {
			templateData.timer.show(metadata.lastRunDuration);
		} else {
			templateData.timer.clear();
		}

		if (typeof metadata.breakpointMargin === 'boolean') {
			this.editorOptions.setGlyphMargin(metadata.breakpointMargin);
		}
	}

	private renderExecutionOrder(element: CodeCellViewModel, templateData: CodeCellRenderTemplate): void {
		const hasExecutionOrder = this.notebookEditor.viewModel!.notebookDocument.metadata?.hasExecutionOrder;
		if (hasExecutionOrder) {
			const executionOrdeerLabel = typeof element.metadata?.executionOrder === 'number' ? `[${element.metadata.executionOrder}]` :
				'[ ]';
			templateData.executionOrderLabel.innerText = executionOrdeerLabel;
		} else {
			templateData.executionOrderLabel.innerText = '';
		}
	}

	private updateForHover(element: CodeCellViewModel, templateData: CodeCellRenderTemplate): void {
		DOM.toggleClass(templateData.container, 'cell-output-hover', element.outputIsHovered);
	}

	renderElement(element: CodeCellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		this.commonRenderElement(element, index, templateData);

		templateData.currentRenderedCell = element;

		if (height === undefined) {
			return;
		}

		templateData.outputContainer.innerHTML = '';

		const elementDisposables = templateData.elementDisposables;

		elementDisposables.add(this.instantiationService.createInstance(CodeCell, this.notebookEditor, element, templateData));
		this.renderedEditors.set(element, templateData.editor);

		templateData.focusIndicator.style.height = `${element.layoutInfo.indicatorHeight}px`;
		elementDisposables.add(element.onDidChangeLayout(() => {
			templateData.focusIndicator.style.height = `${element.layoutInfo.indicatorHeight}px`;
		}));

		const contextKeyService = this.contextKeyServiceProvider(templateData.container);

		const runStateKey = NOTEBOOK_CELL_RUN_STATE.bindTo(contextKeyService);
		runStateKey.set(CellRunState[element.runState]);
		this.updateForRunState(element, templateData, runStateKey);
		elementDisposables.add(element.onDidChangeState((e) => {
			if (e.runStateChanged) {
				this.updateForRunState(element, templateData, runStateKey);
			}
		}));

		const cellHasOutputsContext = NOTEBOOK_CELL_HAS_OUTPUTS.bindTo(contextKeyService);
		cellHasOutputsContext.set(element.outputs.length > 0);
		elementDisposables.add(element.onDidChangeOutputs(() => {
			cellHasOutputsContext.set(element.outputs.length > 0);
		}));

		NOTEBOOK_CELL_TYPE.bindTo(contextKeyService).set('code');
		NOTEBOOK_VIEW_TYPE.bindTo(contextKeyService).set(element.viewType);
		const metadata = element.getEvaluatedMetadata(this.notebookEditor.viewModel!.notebookDocument.metadata);
		const cellEditableKey = NOTEBOOK_CELL_EDITABLE.bindTo(contextKeyService);
		cellEditableKey.set(!!metadata.editable);
		const cellRunnableKey = NOTEBOOK_CELL_RUNNABLE.bindTo(contextKeyService);
		cellRunnableKey.set(!!metadata.runnable);
		this.updateForMetadata(element, templateData, cellEditableKey, cellRunnableKey);
		elementDisposables.add(element.onDidChangeState((e) => {
			if (e.metadataChanged) {
				this.updateForMetadata(element, templateData, cellEditableKey, cellRunnableKey);
			}

			if (e.outputIsHoveredChanged) {
				this.updateForHover(element, templateData);
			}
		}));

		this.setupCellToolbarActions(contextKeyService, templateData, elementDisposables);

		const toolbarContext = <INotebookCellActionContext>{
			cell: element,
			cellTemplate: templateData,
			notebookEditor: this.notebookEditor,
			$mid: 12
		};
		templateData.toolbar.context = toolbarContext;
		templateData.runToolbar.context = toolbarContext;

		this.setupBetweenCellToolbarActions(element, templateData, elementDisposables, toolbarContext);

		templateData.languageStatusBarItem.update(element, this.notebookEditor);
	}

	disposeTemplate(templateData: CodeCellRenderTemplate): void {
		templateData.disposables.clear();
	}

	disposeElement(element: ICellViewModel, index: number, templateData: CodeCellRenderTemplate, height: number | undefined): void {
		templateData.elementDisposables.clear();
		this.renderedEditors.delete(element);
		templateData.focusIndicator.style.height = 'initial';
	}
}

export class TimerRenderer {
	constructor(private readonly container: HTMLElement) {
		DOM.hide(container);
	}

	private intervalTimer: number | undefined;

	start(startTime: number): IDisposable {
		this.stop();

		DOM.show(this.container);
		const intervalTimer = setInterval(() => {
			const duration = Date.now() - startTime;
			this.container.textContent = this.formatDuration(duration);
		}, 100);
		this.intervalTimer = intervalTimer as any;

		return toDisposable(() => {
			clearInterval(intervalTimer);
		});
	}

	stop() {
		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
		}
	}

	show(duration: number) {
		this.stop();

		DOM.show(this.container);
		this.container.textContent = this.formatDuration(duration);
	}

	clear() {
		DOM.hide(this.container);
		this.stop();
		this.container.textContent = '';
	}

	private formatDuration(duration: number) {
		const seconds = Math.floor(duration / 1000);
		const tenths = String(duration - seconds * 1000).charAt(0);

		return `${seconds}.${tenths}s`;
	}
}
