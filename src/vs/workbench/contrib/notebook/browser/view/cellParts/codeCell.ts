/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { combinedDisposable, Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../../base/common/numbers.js';
import * as strings from '../../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { IDimension } from '../../../../../../editor/common/core/2d/dimension.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { tokenizeToStringSync } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { IReadonlyTextBuffer, ITextModel } from '../../../../../../editor/common/model.js';
import { CodeActionController } from '../../../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID, IActiveNotebookEditorDelegate } from '../../notebookBrowser.js';
import { CodeCellViewModel, outputDisplayLimit } from '../../viewModel/codeCellViewModel.js';
import { CellPartsCollection } from '../cellPart.js';
import { NotebookCellEditorPool } from '../notebookCellEditorPool.js';
import { CodeCellRenderTemplate, collapsedCellTTPolicy } from '../notebookRenderingCommon.js';
import { CellEditorOptions } from './cellEditorOptions.js';
import { CellOutputContainer } from './cellOutput.js';
import { CollapsedCodeCellExecutionIcon } from './codeCellExecutionIcon.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';

export class CodeCell extends Disposable {
	private _outputContainerRenderer: CellOutputContainer;
	private _inputCollapseElement: HTMLElement | undefined;

	private _renderedInputCollapseState: boolean | undefined;
	private _renderedOutputCollapseState: boolean | undefined;
	private _isDisposed: boolean = false;
	private readonly cellParts: CellPartsCollection;

	private _collapsedExecutionIcon: CollapsedCodeCellExecutionIcon;
	private _cellEditorOptions: CellEditorOptions;
	public calculatedEditorHeight?: number;

	constructor(
		private readonly notebookEditor: IActiveNotebookEditorDelegate,
		private readonly viewCell: CodeCellViewModel,
		private readonly templateData: CodeCellRenderTemplate,
		private readonly editorPool: NotebookCellEditorPool,
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

		this.registerNotebookEditorListeners();
		this.registerViewCellLayoutChange();
		this.registerCellEditorEventListeners();
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

		this.updateEditorOptions();
		this.updateEditorForFocusModeChange(false);
		this.updateForOutputHover();
		this.updateForOutputFocus();

		// this._register(templateData.editor.onDidLayoutChange(e => {
		// 	console.log(`Cell ${this.notebookEditor.getCellIndex(this.viewCell)}, onDidLayoutChange Height = ${e.height}`);
		// }));

		this.cellParts.scheduleRenderCell(this.viewCell);
		// const stickyEditor = this._register(registerStickyEditor(this.notebookEditor, this.viewCell, this.templateData.editorPart, templateData.editor, { extraOffset: 0 }));
		this.adjustEditorHeight();
		this._register(notebookEditor.onDidScroll(() => this.adjustEditorHeight()));
		this._register(notebookEditor.onDidChangeLayout(() => this.adjustEditorHeight()));
		// const stickyEditor = combinedDisposable(
		// 	notebookEditor.onDidScroll(() => this.adjustEditorHeight()),
		// 	notebookEditor.onDidChangeLayout(() => this.adjustEditorHeight())
		// );

		this._register(toDisposable(() => {
			this.cellParts.unrenderCell(this.viewCell);
			// stickyEditor.dispose();
		}));


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
			if (this._isDisposed || model?.isDisposed()) {
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
					this.calculatedEditorHeight = this.templateData.editor.getLayoutInfo().height;
					if (realContentHeight !== this.calculatedEditorHeight) {
						console.log(`Cell ${this.notebookEditor.getCellIndex(this.viewCell)}, Initial Editor Height = ${realContentHeight}px`);
					}
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

	private registerNotebookEditorListeners() {
		// this._register(this.notebookEditor.onDidScroll(() => {
		// 	this.adjustEditorPosition();
		// }));

		this._register(this.notebookEditor.onDidChangeLayout(() => {
			this.adjustEditorPosition();
			this.onCellWidthChange();
		}));
	}

	private adjustEditorPosition() {
		const extraOffset = - 6 /** distance to the top of the cell editor, which is 6px under the focus indicator */ - 1 /** border */;
		const min = 0;

		const scrollTop = this.notebookEditor.scrollTop;
		const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
		const diff = scrollTop - elementTop + extraOffset;

		const notebookEditorLayout = this.notebookEditor.getLayoutInfo();

		// we should stop adjusting the top when users are viewing the bottom of the cell editor
		const editorMaxHeight = notebookEditorLayout.height
			- notebookEditorLayout.stickyHeight
			- 26 /** notebook toolbar */;
		console.log(`Cell ${this.notebookEditor.getCellIndex(this.viewCell)}, Editor Height = ${this.templateData.editor.getLayoutInfo().height}`);

		const editorHeight = this.templateData.editor.getLayoutInfo().height;
		// const editorHeight = this.viewCell.layoutInfo.editorHeight;
		const maxTop =
			editorHeight
			// + this.viewCell.layoutInfo.statusBarHeight
			// - editorMaxHeight
			;
		// const top = maxTop > 20 ?
		// 	clamp(min, diff, maxTop) :
		// 	min;
		const top = diff;
		// this.templateData.editorPart.style.top = `${top}px`;
		// scroll the editor with top
		console.log(`Cell ${this.notebookEditor.getCellIndex(this.viewCell)}, Require Adjust Scroll Top = ${top}`);
		// this.templateData.editor?.setScrollTop(top);
	}

	private registerViewCellLayoutChange() {
		this._register(this.viewCell.onDidChangeLayout((e) => {
			if (e.outerWidth !== undefined) {
				const layoutInfo = this.templateData.editor.getLayoutInfo();
				if (layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
					this.onCellWidthChange();
					this.adjustEditorPosition();
				}
			}
		}));
	}

	private registerCellEditorEventListeners() {
		this._register(this.templateData.editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				if (this.viewCell.layoutInfo.editorHeight !== e.contentHeight) {
					console.log('onDidContentSizeChange', e.contentHeight);
					this.onCellEditorHeightChange(e.contentHeight);
					// TODO @DonJayamanne This doesn't work well
					// Have a cell with 20 lines, and scroll such that only 10 lines are visible & rest is cut off from bottom viewport.
					// While on line 5 add a new line, all is good
					// Now start typing, and we change the scrollTop incorrectly.
					this.adjustEditorHeight();
					// this.adjustEditorPosition();
				}
			}
		}));

		this._register(this.templateData.editor.onDidChangeCursorSelection((e) => {
			if (
				// do not reveal the cell into view if this selection change was caused by restoring editors
				e.source === 'restoreState' || e.oldModelVersionId === 0
				// nor if the text editor is not actually focused (e.g. inline chat is focused and modifying the cell content)
				|| !this.templateData.editor.hasTextFocus()
			) {
				return;
			}

			const selections = this.templateData.editor.getSelections();

			if (selections?.length) {
				const contentHeight = this.templateData.editor.getContentHeight();
				const layoutContentHeight = this.viewCell.layoutInfo.editorHeight;

				if (contentHeight !== layoutContentHeight) {
					console.log('onDidChangeCursorSelection', contentHeight, layoutContentHeight);
					// this.onCellEditorHeightChange(contentHeight);

					if (this._isDisposed) {
						return;
					}
				}
				const lastSelection = selections[selections.length - 1];
				this.notebookEditor.revealRangeInViewAsync(this.viewCell, lastSelection);
			}
		}));

		this._register(this.templateData.editor.onDidBlurEditorWidget(() => {
			CodeActionController.get(this.templateData.editor)?.hideLightBulbWidget();
		}));
	}

	private _reigsterModelListeners(model: ITextModel) {
		this._register(model.onDidChangeTokens(() => {
			if (this.viewCell.isInputCollapsed && this._inputCollapseElement) {
				// flush the collapsed input with the latest tokens
				const content = this._getRichTextFromLineTokens(model);
				this._inputCollapseElement.innerHTML = (collapsedCellTTPolicy?.createHTML(content) ?? content) as string;
				this._attachInputExpandButton(this._inputCollapseElement);
			}
		}));
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

	private shouldPreserveEditor() {
		// The DOM focus needs to be adjusted:
		// when a cell editor should be focused
		// the document active element is inside the notebook editor or the document body (cell editor being disposed previously)
		return this.notebookEditor.getActiveCell() === this.viewCell
			&& this.viewCell.focusMode === CellFocusMode.Editor
			&& (this.notebookEditor.hasEditorFocus() || this.notebookEditor.getDomNode().ownerDocument.activeElement === this.notebookEditor.getDomNode().ownerDocument.body);
	}

	private updateEditorForFocusModeChange(sync: boolean) {
		if (this.shouldPreserveEditor()) {
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
		element.innerHTML = (collapsedCellTTPolicy?.createHTML(richEditorText) ?? richEditorText) as string;
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
		const editorLayout = this.notebookEditor.getLayoutInfo();
		const maxHeight = Math.min(
			editorLayout.height
			- editorLayout.stickyHeight
			- 26 /** notebook toolbar */,
			dimension.height
		);
		console.log(`Layout Editor for Cell ${this.notebookEditor.getCellIndex(this.viewCell)}, Width = ${dimension.width}, Height = ${maxHeight} (Original: ${dimension.height})`);
		this.templateData.editor?.layout({
			width: dimension.width,
			height: maxHeight
		}, true);

		if (this.calculatedEditorHeight === undefined) {
			this.calculatedEditorHeight = dimension.height;
		}
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
		if (this.shouldPreserveEditor()) {
			// now the focus is on the monaco editor for the cell but detached from the rows.
			this.editorPool.preserveFocusedEditor(this.viewCell);
		}

		this.viewCell.detachTextEditor();
		this._removeInputCollapsePreview();
		this._outputContainerRenderer.dispose();
		this._pendingLayout?.dispose();

		super.dispose();
	}
	private previousScrollBottom?: number;
	private adjustEditorHeight() {
		this.adjustEditorHeightEx();
		// this.adjustEditorHeightImpl();
	}
	private adjustEditorHeightImpl() {
		const element = this.templateData.editorPart;
		if (!this.calculatedEditorHeight) {
			return;
		}
		if (this.viewCell.isInputCollapsed) {
			element.style.top = '';
			return;
		}
		const cellIndex = this.notebookEditor.getCellIndex(this.viewCell);
		const editor = this.templateData.editor;
		const lineHeight = 22;
		const extraOffset = -6 - 1 // 6px top padding for cell in list (.cell-inner-container), 1 extra px for border (we don't want to be able to see the cell border when scrolling up);
		const min = 0;
		// if (editorHeight === lastUpdatedEditorHeight){
		// 	return;
		// }
		const editorLayout = editor.getLayoutInfo();
		const editorHeight = this.viewCell.layoutInfo.editorHeight;
		// const editorHeight = editorLayout.height;
		const scrollTop = this.notebookEditor.scrollTop;
		const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
		// notebookEditor.codeEditors[][1].layout({
		const diff = scrollTop - elementTop + extraOffset;
		const maxTop = editorHeight + this.viewCell.layoutInfo.statusBarHeight - 45; // subtract roughly the height of the execution order label plus padding
		const top = maxTop > 20 ? // Don't move the run button if it can only move a very short distance
			clamp(min, diff, maxTop) :
			min;
		const editorBottom = elementTop + this.viewCell.layoutInfo.outputContainerOffset;
		const scrollBottom = this.notebookEditor.scrollBottom;
		const viewportHeight = this.notebookEditor.getLayoutInfo().height;
		const viewportHeight2 = scrollBottom - scrollTop;
		const outputContainerOffset = this.viewCell.layoutInfo.outputContainerOffset;
		let scrollingUp = false;
		if (typeof this.previousScrollBottom === 'number') {
			scrollingUp = scrollBottom < this.previousScrollBottom;
		}
		const calculatedEditorHeight = this.templateData.editor.getContentHeight() || this.calculatedEditorHeight || 0;
		this.previousScrollBottom = scrollBottom;
		console.log(`Cell ${cellIndex} Top = ${top}px (min = ${min}, diff = ${diff}, maxTop = ${maxTop}, editorHeight = ${editorHeight}, scrollTop = ${scrollTop}, elementTop = ${elementTop}, calculatedEditorHeight: ${calculatedEditorHeight}, statusBarHeight: ${this.viewCell.layoutInfo.statusBarHeight}, scrollBottom: ${scrollBottom}, editorBottom: ${editorBottom}, viewportHeight: ${viewportHeight}, viewportHeight2: ${viewportHeight2}, scrollingUp: ${scrollingUp}, outputContainerOffset: ${outputContainerOffset})`);
		element.style.top = `${top}px`;


		// cell.edito
		// const runTop = top;
		// if ((top - extraOffset) === 0) {
		// 	const layout = { ...textEditor.getLayoutInfo() };
		// 	layout.height = cell.calculatedEditorHeight;
		// 	textEditor.layout(layout, true);
		// }
		const adjustScrollTop = (height: number, kind: number) => {
			console.log(`Cell ${cellIndex} Update (${kind}) Editor Height = ${height}px (calculatedEditorHeight: ${calculatedEditorHeight})`);
			// lastUpdatedEditorHeight = height;
			// this.onCellEditorHeightChange(height);
			editor.layout({
				width: editorLayout.width,
				height
			}, true);

			// Scroll the editor by the same amount the editor height was changed by.
			let top = calculatedEditorHeight ? calculatedEditorHeight - height : -1;
			top = scrollingUp ? -top : top;
			if (top > 0) {
				console.log(`Cell ${this.notebookEditor.getCellIndex(this.viewCell)}, Actual Adjust Scroll Top = ${top}`);
				// this.templateData.editor?.setScrollTop(top);// + extraOffset);
			}
			// if (top > 0 && (editorBottom > scrollBottom)) {
			// 	console.log(`Cell ${this.notebookEditor.getCellIndex(this.viewCell)}, Actual Adjust Scroll Top = ${0}`);
			// 	this.templateData.editor?.setScrollTop(0);// + extraOffset);
			// }
		}

		if ((top - extraOffset) <= 0) {
			console.log('Here');
			let top = editorHeight - lineHeight + this.viewCell.layoutInfo.statusBarHeight;


			const statusBarVisible = this.viewCell.layoutInfo.statusBarHeight > 0;

			// Sticky mode: cell is running and editor is not fully visible
			const offset = editorBottom - scrollBottom;
			top -= offset;
			top = clamp(
				top,
				lineHeight + 12, // line height + padding for single line
				editorHeight - lineHeight + this.viewCell.layoutInfo.statusBarHeight
			);

			if (!statusBarVisible) {
				top = editorHeight - lineHeight; // Place at the bottom of the editor
			}
			const height = top;
			if (height > 0) {
				adjustScrollTop(height, 1);
				// console.log(`Cell ${cellIndex} Update (1) Editor Height = ${height}px (calculatedEditorHeight: ${this.calculatedEditorHeight})`);
				// // lastUpdatedEditorHeight = height;
				// // this.onCellEditorHeightChange(height);
				// editor.layout({
				// 	width: editorLayout.width,
				// 	height
				// }, true);
			}
		}
		if ((top - extraOffset) > 0) {
			// const maxTop = cell.calculatedEditorHeight + cell.layoutInfo.statusBarHeight; // subtract roughly the height of the execution order label plus padding
			// const top = clamp(min, diff, maxTop);
			// const top = maxTop > 20 ? // Don't move the run button if it can only move a very short distance
			// 	clamp(min, diff, maxTop) :
			// 	min;
			// const info = textEditor.getLayoutInfo();

			let bottom = calculatedEditorHeight - lineHeight + this.viewCell.layoutInfo.statusBarHeight;

			const editorBottom = elementTop + this.viewCell.layoutInfo.outputContainerOffset;
			const scrollBottom = this.notebookEditor.scrollBottom;

			const statusBarVisible = this.viewCell.layoutInfo.statusBarHeight > 0;

			// Sticky mode: cell is running and editor is not fully visible
			const offset = editorBottom - scrollBottom;
			bottom -= offset;
			bottom = clamp(
				bottom,
				lineHeight + 12, // line height + padding for single line
				calculatedEditorHeight - lineHeight + this.viewCell.layoutInfo.statusBarHeight
			);

			if (scrollBottom <= editorBottom) {
				//
			} else if (!statusBarVisible) {
				bottom = calculatedEditorHeight - lineHeight; // Place at the bottom of the editor
			}

			const height = (bottom - top);// + extraOffset);
			if (height > 0) {
				adjustScrollTop(height, 2);
				// console.log(`Cell ${cellIndex} Update (2) Editor Height = ${height}px (calculatedEditorHeight: ${calculatedEditorHeight})`);
				// // lastUpdatedEditorHeight = height;
				// // this.onCellEditorHeightChange(height);
				// editor.layout({
				// 	width: editorLayout.width,
				// 	height
				// }, true);
			}
		}

	}
	private adjustEditorHeightEx() {
		const element = this.templateData.editorPart;
		if (!this.calculatedEditorHeight) {
			return;
		}
		if (this.viewCell.isInputCollapsed) {
			element.style.top = '';
			return;
		}
		const cellIndex = this.notebookEditor.getCellIndex(this.viewCell);
		const editor = this.templateData.editor;
		const lineHeight = 22;
		const extraOffset = -6 - 1 // 6px top padding for cell in list (.cell-inner-container), 1 extra px for border (we don't want to be able to see the cell border when scrolling up);
		const min = 0;
		// if (editorHeight === lastUpdatedEditorHeight){
		// 	return;
		// }
		const editorLayout = editor.getLayoutInfo();
		const editorHeight = this.viewCell.layoutInfo.editorHeight;
		// const editorHeight = editorLayout.height;
		const scrollTop = this.notebookEditor.scrollTop;
		const elementTop = this.notebookEditor.getAbsoluteTopOfElement(this.viewCell);
		// notebookEditor.codeEditors[][1].layout({
		const diff = scrollTop - elementTop + extraOffset;
		const maxTop = editorHeight + this.viewCell.layoutInfo.statusBarHeight - 45; // subtract roughly the height of the execution order label plus padding
		const top = maxTop > 20 ? // Don't move the run button if it can only move a very short distance
			clamp(min, diff, maxTop) :
			min;
		const calculatedEditorHeight = Math.max((this.templateData.editor.getContentHeight() === -1 ? this.templateData.editor.getLayoutInfo().height : this.templateData.editor.getContentHeight()), this.calculatedEditorHeight); // || this.calculatedEditorHeight || 0;
		const editorBottom = elementTop + this.viewCell.layoutInfo.outputContainerOffset;
		const scrollBottom = this.notebookEditor.scrollBottom;
		const viewportHeight = this.notebookEditor.getLayoutInfo().height;
		const viewportHeight2 = scrollBottom - scrollTop;
		const outputContainerOffset = this.viewCell.layoutInfo.outputContainerOffset;
		let scrollDirection: 'down' | 'up' = 'down';
		if (typeof this.previousScrollBottom === 'number') {
			scrollDirection = scrollBottom < this.previousScrollBottom ? 'up' : 'down';
		}
		this.previousScrollBottom = scrollBottom;
		console.log(`Cell ${cellIndex} Update Editor Top = ${top}px (min = ${min}, diff = ${diff}, maxTop = ${maxTop}, editorHeight = ${editorHeight}, scrollTop = ${scrollTop}, elementTop = ${elementTop}, calculatedEditorHeight: ${calculatedEditorHeight}, statusBarHeight: ${this.viewCell.layoutInfo.statusBarHeight}, scrollBottom: ${scrollBottom}, editorBottom: ${editorBottom}, viewportHeight: ${viewportHeight}, viewportHeight2: ${viewportHeight2}, scrollDirection: ${scrollDirection}, outputContainerOffset: ${outputContainerOffset})`);
		element.style.top = `${top}px`;


		let height = calculatedEditorHeight;
		let type = ''
		let editorScrollTop = 0;
		if (scrollTop <= (elementTop + 6)) {
			if (scrollBottom >= editorBottom) {
				height = Math.max(calculatedEditorHeight, lineHeight);
				type = 'Full';
			} else {
				height = Math.max(scrollBottom - (elementTop + 6), lineHeight);
				type = 'Partial Bottom';
				editorScrollTop = scrollTop === (elementTop + 6) ? (scrollTop - (elementTop - 6)) : 0;
			}
		} else {
			if (viewportHeight <= calculatedEditorHeight && scrollBottom <= editorBottom) {
				height = Math.max(viewportHeight, lineHeight);
				type = 'Full (Small Viewport)';
				editorScrollTop = scrollTop - (elementTop - 6);
			} else {
				height = Math.max(calculatedEditorHeight - (scrollTop - (elementTop + 6)), lineHeight);
				type = 'Partial Top';
				editorScrollTop = calculatedEditorHeight - height;
			}
		}

		// height = Math.max(height, lineHeight);
		console.log(`Cell ${cellIndex} Update (${type}) Editor Height = ${height}px, EditorScrollTop = ${editorScrollTop}px  (calculatedEditorHeight: ${calculatedEditorHeight})`);
		editor.layout({
			width: editorLayout.width,
			height
		}, true);
		if (editorScrollTop >= 0) {
			this.templateData.editor?.setScrollTop(editorScrollTop);// + extraOffset);
		}
	}
}


// TODO @DonJayamanne
/**
 * Test scenarios:
 * 1. Cell with 40 lines, scroll notebook to the bottom and ensure only top 10-15 lines of this cell are visible.
 * Add a new line in line 8 or so.
 * Things should be ok.
 * Edit the text and scroll position moves when it shouldn't.
 * If we can already see cursor, then don't change scroll position.
 * 2. Same as 1, when cursor is on line 8, use up/down arrow keys.
 * Watch how editor moves around and is resized.
 * Similarly scroll position changes as well.
 * Compare against stable version of notebook editor to figure out expected behaviour.
 * 3. Same as 1, when cursor is on line 8, start selecting text downwards.
 * I.e. use shift+down arrow keys.
 * Watch how editor moves around and is resized.
 * Similarly scroll position changes as well.
 * Compare against stable version of notebook editor to figure out expected behaviour.
 * 4. Same as 1, when cursor is on line 8, start selecting text upwards.
 * I.e. use shift+up arrow keys.
 * Watch how editor moves around and is resized.
 * Similarly scroll position changes as well.
 * Compare against stable version of notebook editor to figure out expected behaviour.
 */
