/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { disposableTimeout, raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions } from '../../../../../../editor/common/config/editorOptions.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { tokenizeToStringSync } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { IReadonlyTextBuffer } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { CellEditState, CellFocusMode, CellFoldingState, EXPAND_CELL_INPUT_COMMAND_ID, IActiveNotebookEditorDelegate, ICellViewModel } from '../../notebookBrowser.js';
import { collapsedIcon, expandedIcon } from '../../notebookIcons.js';
import { CellEditorOptions } from './cellEditorOptions.js';
import { MarkdownCellRenderTemplate } from '../notebookRenderingCommon.js';
import { MarkupCellViewModel } from '../../viewModel/markupCellViewModel.js';
import { WordHighlighterContribution } from '../../../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js';

export class MarkupCell extends Disposable {

	private editor: CodeEditorWidget | null = null;

	private markdownAccessibilityContainer!: HTMLElement;
	private editorPart: HTMLElement;

	private readonly localDisposables = this._register(new DisposableStore());
	private readonly focusSwitchDisposable = this._register(new MutableDisposable());
	private readonly editorDisposables = this._register(new DisposableStore());
	private foldingState: CellFoldingState;
	private cellEditorOptions: CellEditorOptions;
	private editorOptions: IEditorOptions;
	private _isDisposed: boolean = false;

	constructor(
		private readonly notebookEditor: IActiveNotebookEditorDelegate,
		private readonly viewCell: MarkupCellViewModel,
		private readonly templateData: MarkdownCellRenderTemplate,
		private readonly renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IKeybindingService private keybindingService: IKeybindingService,
	) {
		super();

		this.constructDOM();
		this.editorPart = templateData.editorPart;
		this.cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
		this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
		this.editorOptions = this.cellEditorOptions.getValue(this.viewCell.internalMetadata, this.viewCell.uri);

		this._register(toDisposable(() => renderedEditors.delete(this.viewCell)));
		this.registerListeners();

		// update for init state
		this.templateData.cellParts.scheduleRenderCell(this.viewCell);

		this._register(toDisposable(() => {
			this.templateData.cellParts.unrenderCell(this.viewCell);
		}));

		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
			this.viewUpdate();
		}));

		this.updateForHover();
		this.updateForFocusModeChange();
		this.foldingState = viewCell.foldingState;
		this.layoutFoldingIndicator();
		this.updateFoldingIconShowClass();

		// the markdown preview's height might already be updated after the renderer calls `element.getHeight()`
		if (this.viewCell.layoutInfo.totalHeight > 0) {
			this.relayoutCell();
		}

		this.viewUpdate();

		this.layoutCellParts();
		this._register(this.viewCell.onDidChangeLayout(() => {
			this.layoutCellParts();
		}));
	}

	layoutCellParts() {
		this.templateData.cellParts.updateInternalLayoutNow(this.viewCell);
	}

	private constructDOM() {
		// Create an element that is only used to announce markup cell content to screen readers
		const id = `aria-markup-cell-${this.viewCell.id}`;
		this.markdownAccessibilityContainer = this.templateData.cellContainer;
		this.markdownAccessibilityContainer.id = id;
		// Hide the element from non-screen readers
		this.markdownAccessibilityContainer.style.height = '1px';
		this.markdownAccessibilityContainer.style.overflow = 'hidden';
		this.markdownAccessibilityContainer.style.position = 'absolute';
		this.markdownAccessibilityContainer.style.top = '100000px';
		this.markdownAccessibilityContainer.style.left = '10000px';
		this.markdownAccessibilityContainer.ariaHidden = 'false';

		this.templateData.rootContainer.setAttribute('aria-describedby', id);
		this.templateData.container.classList.toggle('webview-backed-markdown-cell', true);
	}

	private registerListeners() {
		this._register(this.viewCell.onDidChangeState(e => {
			this.templateData.cellParts.updateState(this.viewCell, e);
		}));

		this._register(this.viewCell.model.onDidChangeMetadata(() => {
			this.viewUpdate();
		}));

		this._register(this.viewCell.onDidChangeState((e) => {
			if (e.editStateChanged || e.contentChanged) {
				this.viewUpdate();
			}

			if (e.focusModeChanged) {
				this.updateForFocusModeChange();
			}

			if (e.foldingStateChanged) {
				const foldingState = this.viewCell.foldingState;

				if (foldingState !== this.foldingState) {
					this.foldingState = foldingState;
					this.layoutFoldingIndicator();
				}
			}

			if (e.cellIsHoveredChanged) {
				this.updateForHover();
			}

			if (e.inputCollapsedChanged) {
				this.updateCollapsedState();
				this.viewUpdate();
			}

			if (e.cellLineNumberChanged) {
				this.cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
			}
		}));

		this._register(this.notebookEditor.notebookOptions.onDidChangeOptions(e => {
			if (e.showFoldingControls) {
				this.updateFoldingIconShowClass();
			}
		}));

		this._register(this.viewCell.onDidChangeLayout((e) => {
			const layoutInfo = this.editor?.getLayoutInfo();
			if (e.outerWidth && this.viewCell.getEditState() === CellEditState.Editing && layoutInfo && layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
				this.onCellEditorWidthChange();
			}
		}));

		this._register(this.cellEditorOptions.onDidChange(() => this.updateMarkupCellOptions()));
	}

	private updateMarkupCellOptions(): void {
		this.updateEditorOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));

		if (this.editor) {
			this.editor.updateOptions(this.cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));

			const cts = new CancellationTokenSource();
			this._register({ dispose() { cts.dispose(true); } });
			raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
				if (this._isDisposed) {
					return;
				}

				if (model) {
					model.updateOptions({
						indentSize: this.cellEditorOptions.indentSize,
						tabSize: this.cellEditorOptions.tabSize,
						insertSpaces: this.cellEditorOptions.insertSpaces,
					});
				}
			});
		}
	}

	private updateCollapsedState() {
		if (this.viewCell.isInputCollapsed) {
			this.notebookEditor.hideMarkupPreviews([this.viewCell]);
		} else {
			this.notebookEditor.unhideMarkupPreviews([this.viewCell]);
		}
	}

	private updateForHover(): void {
		this.templateData.container.classList.toggle('markdown-cell-hover', this.viewCell.cellIsHovered);
	}

	private updateForFocusModeChange() {
		if (this.viewCell.focusMode === CellFocusMode.Editor) {
			this.focusEditorIfNeeded();
		}

		this.templateData.container.classList.toggle('cell-editor-focus', this.viewCell.focusMode === CellFocusMode.Editor);
	}

	override dispose() {
		this._isDisposed = true;

		// move focus back to the cell list otherwise the focus goes to body
		if (this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor && (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) {
			this.notebookEditor.focusContainer();
		}

		this.viewCell.detachTextEditor();
		super.dispose();
	}

	private updateFoldingIconShowClass() {
		const showFoldingIcon = this.notebookEditor.notebookOptions.getDisplayOptions().showFoldingControls;
		this.templateData.foldingIndicator.classList.remove('mouseover', 'always');
		this.templateData.foldingIndicator.classList.add(showFoldingIcon);
	}

	private viewUpdate(): void {
		if (this.viewCell.isInputCollapsed) {
			this.viewUpdateCollapsed();
		} else if (this.viewCell.getEditState() === CellEditState.Editing) {
			this.viewUpdateEditing();
		} else {
			this.viewUpdatePreview();
		}
	}

	private viewUpdateCollapsed(): void {
		DOM.show(this.templateData.cellInputCollapsedContainer);
		DOM.hide(this.editorPart);

		this.templateData.cellInputCollapsedContainer.innerText = '';

		const markdownIcon = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$('span'));
		markdownIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.markdown));

		const element = DOM.$('div');
		element.classList.add('cell-collapse-preview');
		const richEditorText = this.getRichText(this.viewCell.textBuffer, this.viewCell.language);
		DOM.safeInnerHtml(element, richEditorText);
		this.templateData.cellInputCollapsedContainer.appendChild(element);

		const expandIcon = DOM.append(element, DOM.$('span.expandInputIcon'));
		expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
		const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
		if (keybinding) {
			element.title = localize('cellExpandInputButtonLabelWithDoubleClick', "Double-click to expand cell input ({0})", keybinding.getLabel());
			expandIcon.title = localize('cellExpandInputButtonLabel', "Expand Cell Input ({0})", keybinding.getLabel());
		}

		this.markdownAccessibilityContainer.ariaHidden = 'true';

		this.templateData.container.classList.toggle('input-collapsed', true);
		this.viewCell.renderedMarkdownHeight = 0;
		this.viewCell.layoutChange({});
	}

	private getRichText(buffer: IReadonlyTextBuffer, language: string) {
		return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
	}

	private viewUpdateEditing(): void {
		// switch to editing mode
		let editorHeight: number;

		DOM.show(this.editorPart);
		this.markdownAccessibilityContainer.ariaHidden = 'true';
		DOM.hide(this.templateData.cellInputCollapsedContainer);

		this.notebookEditor.hideMarkupPreviews([this.viewCell]);

		this.templateData.container.classList.toggle('input-collapsed', false);
		this.templateData.container.classList.toggle('markdown-cell-edit-mode', true);

		if (this.editor && this.editor.hasModel()) {
			editorHeight = this.editor.getContentHeight();

			// not first time, we don't need to create editor
			this.viewCell.attachTextEditor(this.editor);
			this.focusEditorIfNeeded();

			this.bindEditorListeners(this.editor);

			this.editor.layout({
				width: this.viewCell.layoutInfo.editorWidth,
				height: editorHeight
			});
		} else {
			this.editorDisposables.clear();
			const width = this.notebookEditor.notebookOptions.computeMarkdownCellEditorWidth(this.notebookEditor.getLayoutInfo().width);
			const lineNum = this.viewCell.lineCount;
			const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
			const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
			editorHeight = Math.max(lineNum, 1) * lineHeight + editorPadding.top + editorPadding.bottom;

			this.templateData.editorContainer.innerText = '';

			// create a special context key service that set the inCompositeEditor-contextkey
			const editorContextKeyService = this.contextKeyService.createScoped(this.templateData.editorPart);
			EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
			const editorInstaService = this.editorDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService])));
			this.editorDisposables.add(editorContextKeyService);

			this.editor = this.editorDisposables.add(editorInstaService.createInstance(CodeEditorWidget, this.templateData.editorContainer, {
				...this.editorOptions,
				dimension: {
					width: width,
					height: editorHeight
				},
				// overflowWidgetsDomNode: this.notebookEditor.getOverflowContainerDomNode()
			}, {
				contributions: this.notebookEditor.creationOptions.cellEditorContributions
			}));
			this.templateData.currentEditor = this.editor;
			this.editorDisposables.add(this.editor.onDidBlurEditorWidget(() => {
				if (this.editor) {
					WordHighlighterContribution.get(this.editor)?.stopHighlighting();
				}
			}));
			this.editorDisposables.add(this.editor.onDidFocusEditorWidget(() => {
				if (this.editor) {
					WordHighlighterContribution.get(this.editor)?.restoreViewState(true);
				}
			}));

			const cts = new CancellationTokenSource();
			this.editorDisposables.add({ dispose() { cts.dispose(true); } });
			raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
				if (!model) {
					return;
				}

				this.editor!.setModel(model);
				model.updateOptions({
					indentSize: this.cellEditorOptions.indentSize,
					tabSize: this.cellEditorOptions.tabSize,
					insertSpaces: this.cellEditorOptions.insertSpaces,
				});

				const realContentHeight = this.editor!.getContentHeight();
				if (realContentHeight !== editorHeight) {
					this.editor!.layout(
						{
							width: width,
							height: realContentHeight
						}
					);
					editorHeight = realContentHeight;
				}

				this.viewCell.attachTextEditor(this.editor!);

				if (this.viewCell.getEditState() === CellEditState.Editing) {
					this.focusEditorIfNeeded();
				}

				this.bindEditorListeners(this.editor!);

				this.viewCell.editorHeight = editorHeight;
			});
		}

		this.viewCell.editorHeight = editorHeight;
		this.focusEditorIfNeeded();
		this.renderedEditors.set(this.viewCell, this.editor);
	}

	private viewUpdatePreview(): void {
		this.viewCell.detachTextEditor();
		DOM.hide(this.editorPart);
		DOM.hide(this.templateData.cellInputCollapsedContainer);
		this.markdownAccessibilityContainer.ariaHidden = 'false';
		this.templateData.container.classList.toggle('input-collapsed', false);
		this.templateData.container.classList.toggle('markdown-cell-edit-mode', false);

		this.renderedEditors.delete(this.viewCell);

		this.markdownAccessibilityContainer.innerText = '';
		if (this.viewCell.renderedHtml) {
			if (this.accessibilityService.isScreenReaderOptimized()) {
				DOM.safeInnerHtml(this.markdownAccessibilityContainer, this.viewCell.renderedHtml);
			} else {
				DOM.clearNode(this.markdownAccessibilityContainer);
			}
		}

		this.notebookEditor.createMarkupPreview(this.viewCell);
	}

	private focusEditorIfNeeded() {
		if (this.viewCell.focusMode === CellFocusMode.Editor &&
			(this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)
		) { // Don't steal focus from other workbench parts, but if body has focus, we can take it
			if (!this.editor) {
				return;
			}

			this.editor.focus();

			const primarySelection = this.editor.getSelection();
			if (!primarySelection) {
				return;
			}

			this.notebookEditor.revealRangeInViewAsync(this.viewCell, primarySelection);
		}
	}

	private layoutEditor(dimension: DOM.IDimension): void {
		this.editor?.layout(dimension);
	}

	private onCellEditorWidthChange(): void {
		const realContentHeight = this.editor!.getContentHeight();
		this.layoutEditor(
			{
				width: this.viewCell.layoutInfo.editorWidth,
				height: realContentHeight
			}
		);

		// LET the content size observer to handle it
		// this.viewCell.editorHeight = realContentHeight;
		// this.relayoutCell();
	}

	relayoutCell(): void {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
		this.layoutFoldingIndicator();
	}

	updateEditorOptions(newValue: IEditorOptions): void {
		this.editorOptions = newValue;
		this.editor?.updateOptions(this.editorOptions);
	}

	private layoutFoldingIndicator() {
		switch (this.foldingState) {
			case CellFoldingState.None:
				this.templateData.foldingIndicator.style.display = 'none';
				this.templateData.foldingIndicator.innerText = '';
				break;
			case CellFoldingState.Collapsed:
				this.templateData.foldingIndicator.style.display = '';
				DOM.reset(this.templateData.foldingIndicator, renderIcon(collapsedIcon));
				break;
			case CellFoldingState.Expanded:
				this.templateData.foldingIndicator.style.display = '';
				DOM.reset(this.templateData.foldingIndicator, renderIcon(expandedIcon));
				break;

			default:
				break;
		}
	}

	private bindEditorListeners(editor: CodeEditorWidget) {

		this.localDisposables.clear();
		this.focusSwitchDisposable.clear();

		this.localDisposables.add(editor.onDidContentSizeChange(e => {
			if (e.contentHeightChanged) {
				this.onCellEditorHeightChange(editor, e.contentHeight);
			}
		}));

		this.localDisposables.add(editor.onDidChangeCursorSelection((e) => {
			if (e.source === 'restoreState') {
				// do not reveal the cell into view if this selection change was caused by restoring editors...
				return;
			}

			const selections = editor.getSelections();

			if (selections?.length) {
				const contentHeight = editor.getContentHeight();
				const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;

				if (contentHeight !== layoutContentHeight) {
					this.onCellEditorHeightChange(editor, contentHeight);
				}
				const lastSelection = selections[selections.length - 1];
				this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
			}
		}));

		const updateFocusMode = () => this.viewCell.focusMode = editor.hasWidgetFocus() ? CellFocusMode.Editor : CellFocusMode.Container;
		this.localDisposables.add(editor.onDidFocusEditorWidget(() => {
			updateFocusMode();
		}));

		this.localDisposables.add(editor.onDidBlurEditorWidget(() => {
			// this is for a special case:
			// users click the status bar empty space, which we will then focus the editor
			// so we don't want to update the focus state too eagerly
			if (this.templateData.container.ownerDocument.activeElement?.contains(this.templateData.container)) {
				this.focusSwitchDisposable.value = disposableTimeout(() => updateFocusMode(), 300);
			} else {
				updateFocusMode();
			}
		}));

		updateFocusMode();
	}

	private onCellEditorHeightChange(editor: CodeEditorWidget, newHeight: number): void {
		const viewLayout = editor.getLayoutInfo();
		this.viewCell.editorHeight = newHeight;
		editor.layout(
			{
				width: viewLayout.width,
				height: newHeight
			}
		);
	}
}
