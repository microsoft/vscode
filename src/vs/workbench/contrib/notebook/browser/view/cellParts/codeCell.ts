/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IDimension } from 'vs/editor/common/core/dimension';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { tokenizeToStringSync } from 'vs/editor/common/languages/textToHtmlTokenizer';
import { IReadonlyTextBuffer, ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID, IActiveNotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPartsCollection } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';
import { CellOutputContainer } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellOutput';
import { CollapsedCodeCellExecutionIcon } from 'vs/workbench/contrib/notebook/browser/view/cellParts/codeCellExecutionIcon';
import { CodeCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { CodeCellViewModel, outputDisplayLimit } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { WordHighlighterContribution } from 'vs/editor/contrib/wordHighlighter/browser/wordHighlighter';
import { CodeActionController } from 'vs/editor/contrib/codeAction/browser/codeActionController';

export class CodeCell extends Disposable {
	private _outputContainerRenderer: CellOutputContainer;
	private _inputCollapseElement: HTMLElement | undefined;

	private _renderedInputCollapseState: boolean | undefined;
	private _renderedOutputCollapseState: boolean | undefined;
	private _isDisposed: boolean = false;
	private readonly cellParts: CellPartsCollection;

	private _collapsedExecutionIcon: CollapsedCodeCellExecutionIcon;
	private _cellEditorOptions: CellEditorOptions;

	constructor(
		private readonly notebookEditor: IActiveNotebookEditorDelegate,
		private readonly viewCell: CodeCellViewModel,
		private readonly templateData: CodeCellRenderTemplate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@INotebookExecutionStateService notebookExecutionStateService: INotebookExecutionStateService,
	) {
		super();

		this._cellEditorOptions = this._register(new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(viewCell.language), this.notebookEditor.notebookOptions, this.configurationService));
		this._outputContainerRenderer = this.instantiationService.createInstance(CellOutputContainer, notebookEditor, viewCell, templateData, { limit: outputDisplayLimit });
		this.cellParts = this._register(templateData.cellParts.concatContentPart([this._cellEditorOptions, this._outputContainerRenderer], DOM.getWindow(notebookEditor.getDomNode())));

		// this.viewCell.layoutInfo.editorHeight or estimation when this.viewCell.layoutInfo.editorHeight === 0
		const editorHeight = this.calculateInitEditorHeight();
		this.initializeEditor(editorHeight);
		this._renderedInputCollapseState = false; // editor is always expanded initially

		this.registerViewCellLayoutChange();
		this.registerCellEditorEventListeners();
		this.registerDecorations();
		this.registerMouseListener();

		this._register(Event.any(this.viewCell.onDidStartExecution, this.viewCell.onDidStopExecution)((e) => {
			this.cellParts.updateForExecutionState(this.viewCell, e);
		}));

		this._register(this.viewCell.onDidChangeState(e => {
			this.cellParts.updateState(this.viewCell, e);

			if (e.outputIsHoveredChanged) {
				this.updateForOutputHover();
			}

			if (e.outputIsFocusedChanged) {
				this.updateForOutputFocus();
			}

			if (e.metadataChanged || e.internalMetadataChanged) {
				this.updateEditorOptions();
			}

			if (e.inputCollapsedChanged || e.outputCollapsedChanged) {
				this.viewCell.pauseLayout();
				const updated = this.updateForCollapseState();
				this.viewCell.resumeLayout();
				if (updated) {
					this.relayoutCell();
				}
			}

			if (e.focusModeChanged) {
				this.updateEditorForFocusModeChange(true);
			}
		}));

		this.cellParts.scheduleRenderCell(this.viewCell);

		this._register(toDisposable(() => {
			this.cellParts.unrenderCell(this.viewCell);
		}));

		this.updateEditorOptions();
		this.updateEditorForFocusModeChange(false);
		this.updateForOutputHover();
		this.updateForOutputFocus();

		// Render Outputs
		this.viewCell.editorHeight = editorHeight;
		this._outputContainerRenderer.render();
		this._renderedOutputCollapseState = false; // the output is always rendered initially
		// Need to do this after the intial renderOutput
		this.initialViewUpdateExpanded();

		this._register(this.viewCell.onLayoutInfoRead(() => {
			this.cellParts.prepareLayout();
		}));

		const executionItemElement = DOM.append(this.templateData.cellInputCollapsedContainer, DOM.$('.collapsed-execution-icon'));
		this._register(toDisposable(() => {
			executionItemElement.remove();
		}));
		this._collapsedExecutionIcon = this._register(this.instantiationService.createInstance(CollapsedCodeCellExecutionIcon, this.notebookEditor, this.viewCell, executionItemElement));
		this.updateForCollapseState();

		this._register(Event.runAndSubscribe(viewCell.onDidChangeOutputs, this.updateForOutputs.bind(this)));
		this._register(Event.runAndSubscribe(viewCell.onDidChangeLayout, this.updateForLayout.bind(this)));

		this._cellEditorOptions.setLineNumbers(this.viewCell.lineNumbers);
		templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));
	}

	private updateCodeCellOptions(templateData: CodeCellRenderTemplate) {
		templateData.editor.updateOptions(this._cellEditorOptions.getUpdatedValue(this.viewCell.internalMetadata, this.viewCell.uri));

		const cts = new CancellationTokenSource();
		this._register({ dispose() { cts.dispose(true); } });
		raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
			if (this._isDisposed) {
				return;
			}

			if (model) {
				model.updateOptions({
					indentSize: this._cellEditorOptions.indentSize,
					tabSize: this._cellEditorOptions.tabSize,
					insertSpaces: this._cellEditorOptions.insertSpaces,
				});
			}
		});
	}

	private _pendingLayout: IDisposable | undefined;

	private updateForLayout(): void {
		this._pendingLayout?.dispose();
		this._pendingLayout = DOM.modify(DOM.getWindow(this.notebookEditor.getDomNode()), () => {
			this.cellParts.updateInternalLayoutNow(this.viewCell);
		});
	}

	private updateForOutputHover() {
		this.templateData.container.classList.toggle('cell-output-hover', this.viewCell.outputIsHovered);
	}

	private updateForOutputFocus() {
		this.templateData.container.classList.toggle('cell-output-focus', this.viewCell.outputIsFocused);
	}

	private calculateInitEditorHeight() {
		const lineNum = this.viewCell.lineCount;
		const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
		const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
		const editorHeight = this.viewCell.layoutInfo.editorHeight === 0
			? lineNum * lineHeight + editorPadding.top + editorPadding.bottom
			: this.viewCell.layoutInfo.editorHeight;
		return editorHeight;
	}

	private initializeEditor(initEditorHeight: number) {
		const width = this.viewCell.layoutInfo.editorWidth;
		this.layoutEditor(
			{
				width: width,
				height: initEditorHeight
			}
		);

		const cts = new CancellationTokenSource();
		this._register({ dispose() { cts.dispose(true); } });
		raceCancellation(this.viewCell.resolveTextModel(), cts.token).then(model => {
			if (this._isDisposed) {
				return;
			}

			if (model && this.templateData.editor) {
				this._reigsterModelListeners(model);

				// set model can trigger view update, which can lead to dispose of this cell
				this.templateData.editor.setModel(model);

				if (this._isDisposed) {
					return;
				}

				model.updateOptions({
					indentSize: this._cellEditorOptions.indentSize,
					tabSize: this._cellEditorOptions.tabSize,
					insertSpaces: this._cellEditorOptions.insertSpaces,
				});
				this.viewCell.attachTextEditor(this.templateData.editor, this.viewCell.layoutInfo.estimatedHasHorizontalScrolling);
				const focusEditorIfNeeded = () => {
					if (
						this.notebookEditor.getActiveCell() === this.viewCell &&
						this.viewCell.focusMode === CellFocusMode.Editor &&
						(this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body)) // Don't steal focus from other workbench parts, but if body has focus, we can take it
					{
						this.templateData.editor?.focus();
					}
				};
				focusEditorIfNeeded();

				const realContentHeight = this.templateData.editor?.getContentHeight();
				if (realContentHeight !== undefined && realContentHeight !== initEditorHeight) {
					this.onCellEditorHeightChange(realContentHeight);
				}

				if (this._isDisposed) {
					return;
				}

				focusEditorIfNeeded();
			}

			this._register(this._cellEditorOptions.onDidChange(() => this.updateCodeCellOptions(this.templateData)));
		});
	}

	private updateForOutputs(): void {
		DOM.setVisibility(this.viewCell.outputsViewModels.length > 0, this.templateData.focusSinkElement);
	}

	private updateEditorOptions() {
		const editor = this.templateData.editor;
		if (!editor) {
			return;
		}

		const isReadonly = this.notebookEditor.isReadOnly;
		const padding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri);
		const options = editor.getOptions();
		if (options.get(EditorOption.readOnly) !== isReadonly || options.get(EditorOption.padding) !== padding) {
			editor.updateOptions({ readOnly: this.notebookEditor.isReadOnly, padding: this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata, this.viewCell.uri) });
		}
	}

	private registerViewCellLayoutChange() {
		this._register(this.viewCell.onDidChangeLayout((e) => {
			if (e.outerWidth !== undefined) {
				const layoutInfo = this.templateData.editor.getLayoutInfo();
				if (layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
					this.onCellWidthChange();
				}
			}
		}));
	}

	private registerCellEditorEventListeners() {
		this._register(this.templateData.editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				if (this.viewCell.layoutInfo.editorHeight !== e.contentHeight) {
					this.onCellEditorHeightChange(e.contentHeight);
				}
			}
		}));

		this._register(this.templateData.editor.onDidChangeCursorSelection((e) => {
			if (e.source === 'restoreState' || e.oldModelVersionId === 0) {
				// do not reveal the cell into view if this selection change was caused by restoring editors...
				return;
			}

			const selections = this.templateData.editor.getSelections();

			if (selections?.length) {
				const contentHeight = this.templateData.editor.getContentHeight();
				const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;

				if (contentHeight !== layoutContentHeight) {
					this.onCellEditorHeightChange(contentHeight);

					if (this._isDisposed) {
						return;
					}
				}
				const lastSelection = selections[selections.length - 1];
				this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
			}
		}));

		this._register(this.templateData.editor.onDidBlurEditorWidget(() => {
			WordHighlighterContribution.get(this.templateData.editor)?.stopHighlighting();
			CodeActionController.get(this.templateData.editor)?.hideCodeActions();
			CodeActionController.get(this.templateData.editor)?.hideLightBulbWidget();
		}));
		this._register(this.templateData.editor.onDidFocusEditorWidget(() => {
			WordHighlighterContribution.get(this.templateData.editor)?.restoreViewState(true);
		}));
	}

	private _reigsterModelListeners(model: ITextModel) {
		this._register(model.onDidChangeTokens(() => {
			if (this.viewCell.isInputCollapsed && this._inputCollapseElement) {
				// flush the collapsed input with the latest tokens
				const content = this._getRichTextFromLineTokens(model);
				DOM.safeInnerHtml(this._inputCollapseElement, content);
				this._attachInputExpandButton(this._inputCollapseElement);
			}
		}));
	}

	private registerDecorations() {
		// Apply decorations
		this._register(this.viewCell.onCellDecorationsChanged((e) => {
			e.added.forEach(options => {
				if (options.className) {
					this.templateData.rootContainer.classList.add(options.className);
				}

				if (options.outputClassName) {
					this.notebookEditor.deltaCellContainerClassNames(this.viewCell.id, [options.outputClassName], []);
				}
			});

			e.removed.forEach(options => {
				if (options.className) {
					this.templateData.rootContainer.classList.remove(options.className);
				}

				if (options.outputClassName) {
					this.notebookEditor.deltaCellContainerClassNames(this.viewCell.id, [], [options.outputClassName]);
				}
			});
		}));

		this.viewCell.getCellDecorations().forEach(options => {
			if (options.className) {
				this.templateData.rootContainer.classList.add(options.className);
			}

			if (options.outputClassName) {
				this.notebookEditor.deltaCellContainerClassNames(this.viewCell.id, [options.outputClassName], []);
			}
		});
	}

	private registerMouseListener() {
		this._register(this.templateData.editor.onMouseDown(e => {
			// prevent default on right mouse click, otherwise it will trigger unexpected focus changes
			// the catch is, it means we don't allow customization of right button mouse down handlers other than the built in ones.
			if (e.event.rightButton) {
				e.event.preventDefault();
			}
		}));
	}

	private shouldUpdateDOMFocus() {
		// The DOM focus needs to be adjusted:
		// when a cell editor should be focused
		// the document active element is inside the notebook editor or the document body (cell editor being disposed previously)
		return this.notebookEditor.getActiveCell() === this.viewCell
			&& this.viewCell.focusMode === CellFocusMode.Editor
			&& (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body);
	}

	private updateEditorForFocusModeChange(sync: boolean) {
		if (this.shouldUpdateDOMFocus()) {
			if (sync) {
				this.templateData.editor?.focus();
			} else {
				this._register(DOM.runAtThisOrScheduleAtNextAnimationFrame(DOM.getWindow(this.templateData.container), () => {
					this.templateData.editor?.focus();
				}));
			}
		}

		this.templateData.container.classList.toggle('cell-editor-focus', this.viewCell.focusMode === CellFocusMode.Editor);
		this.templateData.container.classList.toggle('cell-output-focus', this.viewCell.focusMode === CellFocusMode.Output);
	}
	private updateForCollapseState(): boolean {
		if (this.viewCell.isOutputCollapsed === this._renderedOutputCollapseState &&
			this.viewCell.isInputCollapsed === this._renderedInputCollapseState) {
			return false;
		}

		this.viewCell.layoutChange({ editorHeight: true });

		if (this.viewCell.isInputCollapsed) {
			this._collapseInput();
		} else {
			this._showInput();
		}

		if (this.viewCell.isOutputCollapsed) {
			this._collapseOutput();
		} else {
			this._showOutput(false);
		}

		this.relayoutCell();

		this._renderedOutputCollapseState = this.viewCell.isOutputCollapsed;
		this._renderedInputCollapseState = this.viewCell.isInputCollapsed;

		return true;
	}

	private _collapseInput() {
		// hide the editor and execution label, keep the run button
		DOM.hide(this.templateData.editorPart);
		this.templateData.container.classList.toggle('input-collapsed', true);

		// remove input preview
		this._removeInputCollapsePreview();

		this._collapsedExecutionIcon.setVisibility(true);

		// update preview
		const richEditorText = this.templateData.editor.hasModel() ? this._getRichTextFromLineTokens(this.templateData.editor.getModel()) : this._getRichText(this.viewCell.textBuffer, this.viewCell.language);
		const element = DOM.$('div.cell-collapse-preview');
		DOM.safeInnerHtml(element, richEditorText);
		this._inputCollapseElement = element;
		this.templateData.cellInputCollapsedContainer.appendChild(element);
		this._attachInputExpandButton(element);

		DOM.show(this.templateData.cellInputCollapsedContainer);
	}

	private _attachInputExpandButton(element: HTMLElement) {
		const expandIcon = DOM.$('span.expandInputIcon');
		const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
		if (keybinding) {
			element.title = localize('cellExpandInputButtonLabelWithDoubleClick', "Double-click to expand cell input ({0})", keybinding.getLabel());
			expandIcon.title = localize('cellExpandInputButtonLabel', "Expand Cell Input ({0})", keybinding.getLabel());
		}

		expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
		element.appendChild(expandIcon);
	}

	private _showInput() {
		this._collapsedExecutionIcon.setVisibility(false);
		DOM.show(this.templateData.editorPart);
		DOM.hide(this.templateData.cellInputCollapsedContainer);
	}

	private _getRichText(buffer: IReadonlyTextBuffer, language: string) {
		return tokenizeToStringSync(this.languageService, buffer.getLineContent(1), language);
	}

	private _getRichTextFromLineTokens(model: ITextModel) {
		let result = `<div class="monaco-tokenized-source">`;

		const firstLineTokens = model.tokenization.getLineTokens(1);
		const viewLineTokens = firstLineTokens.inflate();
		const line = model.getLineContent(1);
		let startOffset = 0;
		for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
			const type = viewLineTokens.getClassName(j);
			const endIndex = viewLineTokens.getEndOffset(j);
			result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
			startOffset = endIndex;
		}

		result += `</div>`;
		return result;
	}

	private _removeInputCollapsePreview() {
		const children = this.templateData.cellInputCollapsedContainer.children;
		const elements = [];
		for (let i = 0; i < children.length; i++) {
			if (children[i].classList.contains('cell-collapse-preview')) {
				elements.push(children[i]);
			}
		}

		elements.forEach(element => {
			element.remove();
		});
	}

	private _updateOutputInnerContainer(hide: boolean) {
		const children = this.templateData.outputContainer.domNode.children;
		for (let i = 0; i < children.length; i++) {
			if (children[i].classList.contains('output-inner-container')) {
				DOM.setVisibility(!hide, children[i] as HTMLElement);
			}
		}
	}

	private _collapseOutput() {
		this.templateData.container.classList.toggle('output-collapsed', true);
		DOM.show(this.templateData.cellOutputCollapsedContainer);
		this._updateOutputInnerContainer(true);
		this._outputContainerRenderer.viewUpdateHideOuputs();
	}

	private _showOutput(initRendering: boolean) {
		this.templateData.container.classList.toggle('output-collapsed', false);
		DOM.hide(this.templateData.cellOutputCollapsedContainer);
		this._updateOutputInnerContainer(false);
		this._outputContainerRenderer.viewUpdateShowOutputs(initRendering);
	}

	private initialViewUpdateExpanded(): void {
		this.templateData.container.classList.toggle('input-collapsed', false);
		DOM.show(this.templateData.editorPart);
		DOM.hide(this.templateData.cellInputCollapsedContainer);
		this.templateData.container.classList.toggle('output-collapsed', false);
		this._showOutput(true);
	}

	private layoutEditor(dimension: IDimension): void {
		this.templateData.editor?.layout(dimension, true);
	}

	private onCellWidthChange(): void {
		if (!this.templateData.editor.hasModel()) {
			return;
		}

		const realContentHeight = this.templateData.editor.getContentHeight();
		this.viewCell.editorHeight = realContentHeight;
		this.relayoutCell();
		this.layoutEditor(
			{
				width: this.viewCell.layoutInfo.editorWidth,
				height: realContentHeight
			}
		);
	}

	private onCellEditorHeightChange(newHeight: number): void {
		const viewLayout = this.templateData.editor.getLayoutInfo();
		this.viewCell.editorHeight = newHeight;
		this.relayoutCell();
		this.layoutEditor(
			{
				width: viewLayout.width,
				height: newHeight
			}
		);
	}

	relayoutCell() {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}

	override dispose() {
		this._isDisposed = true;

		// move focus back to the cell list otherwise the focus goes to body
		if (this.shouldUpdateDOMFocus()) {
			this.notebookEditor.focusContainer();
		}

		this.viewCell.detachTextEditor();
		this._removeInputCollapsePreview();
		this._outputContainerRenderer.dispose();
		this._pendingLayout?.dispose();

		super.dispose();
	}
}
