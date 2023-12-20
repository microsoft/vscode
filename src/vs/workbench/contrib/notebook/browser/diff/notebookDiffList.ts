/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./notebookDiff';
import { IListMouseEvent, IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import * as DOM from 'vs/base/browser/dom';
import { IListOptions, IListStyles, isMonacoEditor, IStyleController, MouseController } from 'vs/base/browser/ui/list/listWidget';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IListService, IWorkbenchListOptions, WorkbenchList } from 'vs/platform/list/browser/listService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { DiffElementViewModelBase, SideBySideDiffElementViewModel, SingleSideDiffElementViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { CellDiffSideBySideRenderTemplate, CellDiffSingleSideRenderTemplate, DIFF_CELL_MARGIN, INotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { DeletedElement, getOptimizedNestedCodeEditorWidgetOptions, InsertElement, ModifiedElement } from 'vs/workbench/contrib/notebook/browser/diff/diffComponents';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { PixelRatio } from 'vs/base/browser/browser';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { fixedDiffEditorOptions, fixedEditorOptions } from 'vs/workbench/contrib/notebook/browser/diff/diffCellEditorOptions';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

export class NotebookCellTextDiffListDelegate implements IListVirtualDelegate<DiffElementViewModelBase> {
	private readonly lineHeight: number;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		const editorOptions = this.configurationService.getValue<IEditorOptions>('editor');
		this.lineHeight = BareFontInfo.createFromRawSettings(editorOptions, PixelRatio.value).lineHeight;
	}

	getHeight(element: DiffElementViewModelBase): number {
		return element.getHeight(this.lineHeight);
	}

	hasDynamicHeight(element: DiffElementViewModelBase): boolean {
		return false;
	}

	getTemplateId(element: DiffElementViewModelBase): string {
		switch (element.type) {
			case 'delete':
			case 'insert':
				return CellDiffSingleSideRenderer.TEMPLATE_ID;
			case 'modified':
			case 'unchanged':
				return CellDiffSideBySideRenderer.TEMPLATE_ID;
		}

	}
}
export class CellDiffSingleSideRenderer implements IListRenderer<SingleSideDiffElementViewModel, CellDiffSingleSideRenderTemplate | CellDiffSideBySideRenderTemplate> {
	static readonly TEMPLATE_ID = 'cell_diff_single';

	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		@IInstantiationService protected readonly instantiationService: IInstantiationService
	) { }

	get templateId() {
		return CellDiffSingleSideRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellDiffSingleSideRenderTemplate {
		const body = DOM.$('.cell-body');
		DOM.append(container, body);
		const diffEditorContainer = DOM.$('.cell-diff-editor-container');
		DOM.append(body, diffEditorContainer);

		const diagonalFill = DOM.append(body, DOM.$('.diagonal-fill'));

		const sourceContainer = DOM.append(diffEditorContainer, DOM.$('.source-container'));
		const editor = this._buildSourceEditor(sourceContainer);

		const metadataHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-header-container'));
		const metadataInfoContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-info-container'));

		const outputHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.output-header-container'));
		const outputInfoContainer = DOM.append(diffEditorContainer, DOM.$('.output-info-container'));

		const borderContainer = DOM.append(body, DOM.$('.border-container'));
		const leftBorder = DOM.append(borderContainer, DOM.$('.left-border'));
		const rightBorder = DOM.append(borderContainer, DOM.$('.right-border'));
		const topBorder = DOM.append(borderContainer, DOM.$('.top-border'));
		const bottomBorder = DOM.append(borderContainer, DOM.$('.bottom-border'));

		return {
			body,
			container,
			diffEditorContainer,
			diagonalFill,
			sourceEditor: editor,
			metadataHeaderContainer,
			metadataInfoContainer,
			outputHeaderContainer,
			outputInfoContainer,
			leftBorder,
			rightBorder,
			topBorder,
			bottomBorder,
			elementDisposables: new DisposableStore()
		};
	}

	private _buildSourceEditor(sourceContainer: HTMLElement) {
		const editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));

		const editor = this.instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...fixedEditorOptions,
			dimension: {
				width: (this.notebookEditor.getLayoutInfo().width - 2 * DIFF_CELL_MARGIN) / 2 - 18,
				height: 0
			},
			automaticLayout: false,
			overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
		}, {});

		return editor;
	}

	renderElement(element: SingleSideDiffElementViewModel, index: number, templateData: CellDiffSingleSideRenderTemplate, height: number | undefined): void {
		templateData.body.classList.remove('left', 'right', 'full');

		switch (element.type) {
			case 'delete':
				templateData.elementDisposables.add(this.instantiationService.createInstance(DeletedElement, this.notebookEditor, element, templateData));
				return;
			case 'insert':
				templateData.elementDisposables.add(this.instantiationService.createInstance(InsertElement, this.notebookEditor, element, templateData));
				return;
			default:
				break;
		}
	}

	disposeTemplate(templateData: CellDiffSingleSideRenderTemplate): void {
		templateData.container.innerText = '';
		templateData.sourceEditor.dispose();
		templateData.elementDisposables.dispose();
	}

	disposeElement(element: SingleSideDiffElementViewModel, index: number, templateData: CellDiffSingleSideRenderTemplate): void {
		templateData.elementDisposables.clear();
	}
}


export class CellDiffSideBySideRenderer implements IListRenderer<SideBySideDiffElementViewModel, CellDiffSideBySideRenderTemplate> {
	static readonly TEMPLATE_ID = 'cell_diff_side_by_side';

	constructor(
		readonly notebookEditor: INotebookTextDiffEditor,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IKeybindingService protected readonly keybindingService: IKeybindingService,
		@IMenuService protected readonly menuService: IMenuService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@INotificationService protected readonly notificationService: INotificationService,
		@IThemeService protected readonly themeService: IThemeService,
		@IAccessibilityService protected readonly accessibilityService: IAccessibilityService
	) { }

	get templateId() {
		return CellDiffSideBySideRenderer.TEMPLATE_ID;
	}

	renderTemplate(container: HTMLElement): CellDiffSideBySideRenderTemplate {
		const body = DOM.$('.cell-body');
		DOM.append(container, body);
		const diffEditorContainer = DOM.$('.cell-diff-editor-container');
		DOM.append(body, diffEditorContainer);

		const sourceContainer = DOM.append(diffEditorContainer, DOM.$('.source-container'));
		const { editor, editorContainer } = this._buildSourceEditor(sourceContainer);

		const inputToolbarContainer = DOM.append(sourceContainer, DOM.$('.editor-input-toolbar-container'));
		const cellToolbarContainer = DOM.append(inputToolbarContainer, DOM.$('div.property-toolbar'));
		const toolbar = this.instantiationService.createInstance(WorkbenchToolBar, cellToolbarContainer, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					const item = new CodiconActionViewItem(action, undefined, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.contextMenuService, this.accessibilityService);
					return item;
				}

				return undefined;
			}
		});

		const metadataHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-header-container'));
		const metadataInfoContainer = DOM.append(diffEditorContainer, DOM.$('.metadata-info-container'));

		const outputHeaderContainer = DOM.append(diffEditorContainer, DOM.$('.output-header-container'));
		const outputInfoContainer = DOM.append(diffEditorContainer, DOM.$('.output-info-container'));

		const borderContainer = DOM.append(body, DOM.$('.border-container'));
		const leftBorder = DOM.append(borderContainer, DOM.$('.left-border'));
		const rightBorder = DOM.append(borderContainer, DOM.$('.right-border'));
		const topBorder = DOM.append(borderContainer, DOM.$('.top-border'));
		const bottomBorder = DOM.append(borderContainer, DOM.$('.bottom-border'));


		return {
			body,
			container,
			diffEditorContainer,
			sourceEditor: editor,
			editorContainer,
			inputToolbarContainer,
			toolbar,
			metadataHeaderContainer,
			metadataInfoContainer,
			outputHeaderContainer,
			outputInfoContainer,
			leftBorder,
			rightBorder,
			topBorder,
			bottomBorder,
			elementDisposables: new DisposableStore()
		};
	}

	private _buildSourceEditor(sourceContainer: HTMLElement) {
		const editorContainer = DOM.append(sourceContainer, DOM.$('.editor-container'));

		const editor = this.instantiationService.createInstance(DiffEditorWidget, editorContainer, {
			...fixedDiffEditorOptions,
			padding: {
				top: 24,
				bottom: 12
			},
			overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode(),
			originalEditable: false,
			ignoreTrimWhitespace: false,
			automaticLayout: false,
			dimension: {
				height: 0,
				width: 0
			}
		}, {
			originalEditor: getOptimizedNestedCodeEditorWidgetOptions(),
			modifiedEditor: getOptimizedNestedCodeEditorWidgetOptions()
		});

		return {
			editor,
			editorContainer
		};
	}

	renderElement(element: SideBySideDiffElementViewModel, index: number, templateData: CellDiffSideBySideRenderTemplate, height: number | undefined): void {
		templateData.body.classList.remove('left', 'right', 'full');

		switch (element.type) {
			case 'unchanged':
				templateData.elementDisposables.add(this.instantiationService.createInstance(ModifiedElement, this.notebookEditor, element, templateData));
				return;
			case 'modified':
				templateData.elementDisposables.add(this.instantiationService.createInstance(ModifiedElement, this.notebookEditor, element, templateData));
				return;
			default:
				break;
		}
	}

	disposeTemplate(templateData: CellDiffSideBySideRenderTemplate): void {
		templateData.container.innerText = '';
		templateData.sourceEditor.dispose();
		templateData.toolbar?.dispose();
		templateData.elementDisposables.dispose();
	}

	disposeElement(element: SideBySideDiffElementViewModel, index: number, templateData: CellDiffSideBySideRenderTemplate): void {
		if (templateData.toolbar) {
			templateData.toolbar.context = undefined;
		}
		templateData.elementDisposables.clear();
	}
}

export class NotebookMouseController<T> extends MouseController<T> {
	protected override onViewPointer(e: IListMouseEvent<T>): void {
		if (isMonacoEditor(e.browserEvent.target as HTMLElement)) {
			const focus = typeof e.index === 'undefined' ? [] : [e.index];
			this.list.setFocus(focus, e.browserEvent);
		} else {
			super.onViewPointer(e);
		}
	}
}

export class NotebookTextDiffList extends WorkbenchList<DiffElementViewModelBase> implements IDisposable, IStyleController {
	private styleElement?: HTMLStyleElement;

	get rowsContainer(): HTMLElement {
		return this.view.containerDomNode;
	}

	constructor(
		listUser: string,
		container: HTMLElement,
		delegate: IListVirtualDelegate<DiffElementViewModelBase>,
		renderers: IListRenderer<DiffElementViewModelBase, CellDiffSingleSideRenderTemplate | CellDiffSideBySideRenderTemplate>[],
		contextKeyService: IContextKeyService,
		options: IWorkbenchListOptions<DiffElementViewModelBase>,
		@IListService listService: IListService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService) {
		super(listUser, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService);
	}

	protected override createMouseController(options: IListOptions<DiffElementViewModelBase>): MouseController<DiffElementViewModelBase> {
		return new NotebookMouseController(this);
	}

	getCellViewScrollTop(element: DiffElementViewModelBase): number {
		const index = this.indexOf(element);
		// if (index === undefined || index < 0 || index >= this.length) {
		// 	this._getViewIndexUpperBound(element);
		// 	throw new ListError(this.listUser, `Invalid index ${index}`);
		// }

		return this.view.elementTop(index);
	}

	getScrollHeight() {
		return this.view.scrollHeight;
	}

	triggerScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent) {
		this.view.delegateScrollFromMouseWheelEvent(browserEvent);
	}

	delegateVerticalScrollbarPointerDown(browserEvent: PointerEvent) {
		this.view.delegateVerticalScrollbarPointerDown(browserEvent);
	}

	clear() {
		super.splice(0, this.length);
	}


	updateElementHeight2(element: DiffElementViewModelBase, size: number) {
		const viewIndex = this.indexOf(element);
		const focused = this.getFocus();

		this.view.updateElementHeight(viewIndex, size, focused.length ? focused[0] : null);
	}

	override style(styles: IListStyles) {
		const selectorSuffix = this.view.domId;
		if (!this.styleElement) {
			this.styleElement = DOM.createStyleSheet(this.view.domNode);
		}
		const suffix = selectorSuffix && `.${selectorSuffix}`;
		const content: string[] = [];

		if (styles.listBackground) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows { background: ${styles.listBackground}; }`);
		}

		if (styles.listFocusBackground) {
			content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
			content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listFocusForeground) {
			content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
		}

		if (styles.listActiveSelectionBackground) {
			content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
			content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listActiveSelectionForeground) {
			content.push(`.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
		}

		if (styles.listFocusAndSelectionBackground) {
			content.push(`
				.monaco-drag-image,
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
		}

		if (styles.listFocusAndSelectionForeground) {
			content.push(`
				.monaco-drag-image,
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
		}

		if (styles.listInactiveFocusBackground) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listInactiveSelectionBackground) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`); // overwrite :hover style in this case!
		}

		if (styles.listInactiveSelectionForeground) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
		}

		if (styles.listHoverBackground) {
			content.push(`.monaco-list${suffix}:not(.drop-target) > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { background-color:  ${styles.listHoverBackground}; }`);
		}

		if (styles.listHoverForeground) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
		}

		if (styles.listSelectionOutline) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
		}

		if (styles.listFocusOutline) {
			content.push(`
				.monaco-drag-image,
				.monaco-list${suffix}:focus > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
		}

		if (styles.listInactiveFocusOutline) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
		}

		if (styles.listHoverOutline) {
			content.push(`.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows > .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
		}

		if (styles.listDropBackground) {
			content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-rows.drop-target,
				.monaco-list${suffix} > div.monaco-scrollable-element > .monaco-list-row.drop-target { background-color: ${styles.listDropBackground} !important; color: inherit !important; }
			`);
		}

		const newStyles = content.join('\n');
		if (newStyles !== this.styleElement.textContent) {
			this.styleElement.textContent = newStyles;
		}
	}
}
