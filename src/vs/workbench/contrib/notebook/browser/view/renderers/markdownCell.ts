/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { disposableTimeout, raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CellEditState, CellFocusMode, MarkdownCellRenderTemplate, ICellViewModel, IActiveNotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellFoldingState } from 'vs/workbench/contrib/notebook/browser/contrib/fold/foldingModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { collapsedIcon, expandedIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IReadonlyTextBuffer } from 'vs/editor/common/model';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { TokenizationRegistry } from 'vs/editor/common/modes';


export class StatefulMarkdownCell extends Disposable {

	private editor: CodeEditorWidget | null = null;

	private markdownAccessibilityContainer: HTMLElement;
	private editorPart: HTMLElement;

	private readonly localDisposables = this._register(new DisposableStore());
	private readonly focusSwitchDisposable = this._register(new MutableDisposable());
	private readonly editorDisposables = this._register(new DisposableStore());
	private foldingState: CellFoldingState;

	constructor(
		private readonly notebookEditor: IActiveNotebookEditorDelegate,
		private readonly viewCell: MarkupCellViewModel,
		private readonly templateData: MarkdownCellRenderTemplate,
		private editorOptions: IEditorOptions,
		private readonly renderedEditors: Map<ICellViewModel, ICodeEditor | undefined>,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotebookCellStatusBarService readonly notebookCellStatusBarService: INotebookCellStatusBarService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		// Create an element that is only used to announce markup cell content to screen readers
		const id = `aria-markup-cell-${this.viewCell.id}`;
		this.markdownAccessibilityContainer = templateData.cellContainer;
		this.markdownAccessibilityContainer.id = id;
		// Hide the element from non-screen readers
		this.markdownAccessibilityContainer.style.height = '1px';
		this.markdownAccessibilityContainer.style.position = 'absolute';
		this.markdownAccessibilityContainer.style.top = '10000px';
		this.markdownAccessibilityContainer.ariaHidden = 'false';

		this.templateData.rootContainer.setAttribute('aria-describedby', id);

		this.editorPart = templateData.editorPart;

		this.templateData.container.classList.toggle('webview-backed-markdown-cell', true);

		this._register(toDisposable(() => renderedEditors.delete(this.viewCell)));

		this._register(viewCell.onDidChangeState((e) => {
			if (e.editStateChanged) {
				this.viewUpdate();
			} else if (e.contentChanged) {
				this.viewUpdate();
			}
		}));

		this._register(viewCell.model.onDidChangeMetadata(() => {
			this.viewUpdate();
		}));

		const updateForFocusMode = () => {
			if (viewCell.focusMode === CellFocusMode.Editor) {
				this.focusEditorIfNeeded();
			}

			templateData.container.classList.toggle('cell-editor-focus', viewCell.focusMode === CellFocusMode.Editor);
		};
		this._register(viewCell.onDidChangeState((e) => {
			if (!e.focusModeChanged) {
				return;
			}

			updateForFocusMode();
		}));
		updateForFocusMode();

		this.foldingState = viewCell.foldingState;
		this.setFoldingIndicator();
		this.updateFoldingIconShowClass();

		this._register(this.notebookEditor.notebookOptions.onDidChangeOptions(e => {
			if (e.showFoldingControls) {
				this.updateFoldingIconShowClass();
			}
		}));

		this._register(viewCell.onDidChangeState((e) => {
			if (!e.foldingStateChanged) {
				return;
			}

			const foldingState = viewCell.foldingState;

			if (foldingState !== this.foldingState) {
				this.foldingState = foldingState;
				this.setFoldingIndicator();
			}
		}));

		this._register(viewCell.onDidChangeLayout((e) => {
			const layoutInfo = this.editor?.getLayoutInfo();
			if (e.outerWidth && this.viewCell.getEditState() === CellEditState.Editing && layoutInfo && layoutInfo.width !== viewCell.layoutInfo.editorWidth) {
				this.onCellEditorWidthChange();
			} else if (e.totalHeight || e.outerWidth) {
				this.relayoutCell();
			}
		}));

		// the markdown preview's height might already be updated after the renderer calls `element.getHeight()`
		if (this.viewCell.layoutInfo.totalHeight > 0) {
			this.relayoutCell();
		}

		// apply decorations

		this._register(viewCell.onCellDecorationsChanged((e) => {
			e.added.forEach(options => {
				if (options.className) {
					this.notebookEditor.deltaCellOutputContainerClassNames(this.viewCell.id, [options.className], []);
				}
			});

			e.removed.forEach(options => {
				if (options.className) {
					this.notebookEditor.deltaCellOutputContainerClassNames(this.viewCell.id, [], [options.className]);
				}
			});
		}));

		viewCell.getCellDecorations().forEach(options => {
			if (options.className) {
				this.notebookEditor.deltaCellOutputContainerClassNames(this.viewCell.id, [options.className], []);
			}
		});

		this.viewUpdate();
	}

	override dispose() {
		this.viewCell.detachTextEditor();
		super.dispose();
	}

	private updateFoldingIconShowClass() {
		const showFoldingIcon = this.notebookEditor.notebookOptions.getLayoutConfiguration().showFoldingControls;
		this.templateData.foldingIndicator.classList.remove('mouseover', 'always');
		this.templateData.foldingIndicator.classList.add(showFoldingIcon);
	}

	private viewUpdate(): void {
		if (this.viewCell.metadata.inputCollapsed) {
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
		const richEditorText = this.getRichText(this.viewCell.textBuffer, this.viewCell.language);
		const element = DOM.$('div');
		element.classList.add('cell-collapse-preview');
		DOM.safeInnerHtml(element, richEditorText);
		this.templateData.cellInputCollapsedContainer.appendChild(element);

		this.markdownAccessibilityContainer.ariaHidden = 'true';

		this.templateData.container.classList.toggle('input-collapsed', true);
		this.viewCell.renderedMarkdownHeight = 0;
		this.viewCell.layoutChange({});
	}

	private getRichText(buffer: IReadonlyTextBuffer, language: string) {
		return tokenizeToString(buffer.getLineContent(1), TokenizationRegistry.get(language)!);
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
			const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata);
			editorHeight = Math.max(lineNum, 1) * lineHeight + editorPadding.top + editorPadding.bottom;

			this.templateData.editorContainer.innerText = '';

			// create a special context key service that set the inCompositeEditor-contextkey
			const editorContextKeyService = this.contextKeyService.createScoped(this.templateData.editorPart);
			EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
			const editorInstaService = this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService]));
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

			const cts = new CancellationTokenSource();
			this.editorDisposables.add({ dispose() { cts.dispose(true); } });
			raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
				if (!model) {
					return;
				}

				this.editor!.setModel(model);
				this.focusEditorIfNeeded();

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
		this.renderedEditors.set(this.viewCell, this.editor!);
	}

	private viewUpdatePreview(): void {
		this.viewCell.detachTextEditor();
		DOM.hide(this.editorPart);
		DOM.hide(this.templateData.cellInputCollapsedContainer);
		this.markdownAccessibilityContainer.ariaHidden = 'false';
		this.templateData.container.classList.toggle('collapsed', false);
		this.templateData.container.classList.toggle('markdown-cell-edit-mode', false);

		this.renderedEditors.delete(this.viewCell);

		this.markdownAccessibilityContainer.innerText = '';
		if (this.viewCell.renderedHtml) {
			DOM.safeInnerHtml(this.markdownAccessibilityContainer, this.viewCell.renderedHtml);
		}

		this.notebookEditor.createMarkupPreview(this.viewCell);
	}

	private focusEditorIfNeeded() {
		if (
			this.viewCell.focusMode === CellFocusMode.Editor &&
			(this.notebookEditor.hasEditorFocus() || document.activeElement === document.body)) { // Don't steal focus from other workbench parts, but if body has focus, we can take it
			this.editor?.focus();
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
	}

	updateEditorOptions(newValue: IEditorOptions): void {
		this.editorOptions = newValue;
		if (this.editor) {
			this.editor.updateOptions(this.editorOptions);
		}
	}

	setFoldingIndicator() {
		switch (this.foldingState) {
			case CellFoldingState.None:
				this.templateData.foldingIndicator.innerText = '';
				break;
			case CellFoldingState.Collapsed:
				DOM.reset(this.templateData.foldingIndicator, renderIcon(collapsedIcon));
				break;
			case CellFoldingState.Expanded:
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
			const viewLayout = editor.getLayoutInfo();

			if (e.contentHeightChanged) {
				this.viewCell.editorHeight = e.contentHeight;
				editor.layout(
					{
						width: viewLayout.width,
						height: e.contentHeight
					}
				);
			}
		}));

		this.localDisposables.add(editor.onDidChangeCursorSelection((e) => {
			if (e.source === 'restoreState') {
				// do not reveal the cell into view if this selection change was caused by restoring editors...
				return;
			}

			const primarySelection = editor.getSelection();

			if (primarySelection) {
				this.notebookEditor.revealLineInViewAsync(this.viewCell, primarySelection.positionLineNumber);
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
			if (document.activeElement?.contains(this.templateData.container)) {
				this.focusSwitchDisposable.value = disposableTimeout(() => updateFocusMode(), 300);
			} else {
				updateFocusMode();
			}
		}));

		updateFocusMode();
	}
}
