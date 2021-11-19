/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon, CSSIcon } from 'vs/base/common/codicons';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IDimension } from 'vs/editor/common/editorCommon';
import { IReadonlyTextBuffer } from 'vs/editor/common/model';
import { TokenizationRegistry } from 'vs/editor/common/modes';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IModeService } from 'vs/editor/common/services/modeService';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID, IActiveNotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodeCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { CellOutputContainer } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellOutput';
import { ClickTargetType } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellWidgets';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';


export class CodeCell extends Disposable {
	private _outputContainerRenderer: CellOutputContainer;
	private _untrustedStatusItem: IDisposable | null = null;

	private _renderedInputCollapseState: boolean | undefined;
	private _renderedOutputCollapseState: boolean | undefined;
	private _isDisposed: boolean = false;

	constructor(
		private readonly notebookEditor: IActiveNotebookEditorDelegate,
		private readonly viewCell: CodeCellViewModel,
		private readonly templateData: CodeCellRenderTemplate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookCellStatusBarService readonly notebookCellStatusBarService: INotebookCellStatusBarService,
		@IKeybindingService readonly keybindingService: IKeybindingService,
		@IOpenerService readonly openerService: IOpenerService,
		@IModeService readonly modeService: IModeService,
	) {
		super();

		const editorHeight = this.calculateInitEditorHeight();
		this.initializeEditor(editorHeight);
		this.registerEditorOptionsListener();
		this.registerViewCellStateChange();
		this.registerFocusModeTracker();
		this.registerEditorLayoutListeners();
		this.registerDecorations();
		this.registerMouseListener();

		// Render Outputs
		this._outputContainerRenderer = this.instantiationService.createInstance(CellOutputContainer, notebookEditor, viewCell, templateData, { limit: 500 });
		this._outputContainerRenderer.render(editorHeight);
		// Need to do this after the intial renderOutput
		if (this.viewCell.isOutputCollapsed === undefined && this.viewCell.isInputCollapsed === undefined) {
			this.initialViewUpdateExpanded();
			this.viewCell.layoutChange({});
		}

		this._register(this.viewCell.onLayoutInfoRead(() => {
			this._outputContainerRenderer.prepareRender();
		}));

		this.updateForCollapseState();
	}

	private calculateInitEditorHeight() {
		const lineNum = this.viewCell.lineCount;
		const lineHeight = this.viewCell.layoutInfo.fontInfo?.lineHeight || 17;
		const editorPadding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata);
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
				this.templateData.editor.setModel(model);
				this.viewCell.attachTextEditor(this.templateData.editor);
				const focusEditorIfNeeded = () => {
					if (
						this.notebookEditor.getActiveCell() === this.viewCell &&
						this.viewCell.focusMode === CellFocusMode.Editor &&
						(this.notebookEditor.hasEditorFocus() || document.activeElement === document.body)) // Don't steal focus from other workbench parts, but if body has focus, we can take it
					{
						this.templateData.editor?.focus();
					}
				};
				focusEditorIfNeeded();

				const realContentHeight = this.templateData.editor?.getContentHeight();
				if (realContentHeight !== undefined && realContentHeight !== initEditorHeight) {
					this.onCellEditorHeightChange(realContentHeight);
				}

				focusEditorIfNeeded();
			}
		});
	}

	private registerEditorOptionsListener() {
		const updateEditorOptions = () => {
			const editor = this.templateData.editor;
			if (!editor) {
				return;
			}

			const isReadonly = this.notebookEditor.isReadOnly;
			const padding = this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata);
			const options = editor.getOptions();
			if (options.get(EditorOption.readOnly) !== isReadonly || options.get(EditorOption.padding) !== padding) {
				editor.updateOptions({ readOnly: this.notebookEditor.isReadOnly, padding: this.notebookEditor.notebookOptions.computeEditorPadding(this.viewCell.internalMetadata) });
			}
		};

		updateEditorOptions();
		this._register(this.viewCell.onDidChangeState((e) => {
			if (e.metadataChanged || e.internalMetadataChanged) {
				updateEditorOptions();
			}
		}));
	}

	private registerViewCellStateChange() {
		this._register(this.viewCell.onDidChangeState((e) => {
			if (e.inputCollapsedChanged || e.outputCollapsedChanged) {
				this.viewCell.pauseLayout();
				const updated = this.updateForCollapseState();
				this.viewCell.resumeLayout();
				if (updated) {
					this.relayoutCell();
				}
			}
		}));

		this._register(this.viewCell.onDidChangeLayout((e) => {
			if (e.outerWidth !== undefined) {
				const layoutInfo = this.templateData.editor.getLayoutInfo();
				if (layoutInfo.width !== this.viewCell.layoutInfo.editorWidth) {
					this.onCellWidthChange();
				}
			}

			if (e.totalHeight) {
				this.relayoutCell();
			}
		}));
	}

	private registerEditorLayoutListeners() {
		this._register(this.templateData.editor.onDidContentSizeChange((e) => {
			if (e.contentHeightChanged) {
				if (this.viewCell.layoutInfo.editorHeight !== e.contentHeight) {
					this.onCellEditorHeightChange(e.contentHeight);
				}
			}
		}));

		this._register(this.templateData.editor.onDidChangeCursorSelection((e) => {
			if (e.source === 'restoreState') {
				// do not reveal the cell into view if this selection change was caused by restoring editors...
				return;
			}

			const primarySelection = this.templateData.editor.getSelection();

			if (primarySelection) {
				this.notebookEditor.revealLineInViewAsync(this.viewCell, primarySelection.positionLineNumber);
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
					this.notebookEditor.deltaCellOutputContainerClassNames(this.viewCell.id, [options.outputClassName], []);
				}
			});

			e.removed.forEach(options => {
				if (options.className) {
					this.templateData.rootContainer.classList.remove(options.className);
				}

				if (options.outputClassName) {
					this.notebookEditor.deltaCellOutputContainerClassNames(this.viewCell.id, [], [options.outputClassName]);
				}
			});
		}));

		this.viewCell.getCellDecorations().forEach(options => {
			if (options.className) {
				this.templateData.rootContainer.classList.add(options.className);
			}

			if (options.outputClassName) {
				this.notebookEditor.deltaCellOutputContainerClassNames(this.viewCell.id, [options.outputClassName], []);
			}
		});
	}

	private registerMouseListener() {
		// Mouse click handlers
		this._register(this.templateData.statusBar.onDidClick(e => {
			if (e.type !== ClickTargetType.ContributedCommandItem) {
				const target = this.templateData.editor.getTargetAtClientPoint(e.event.clientX, e.event.clientY - this.notebookEditor.notebookOptions.computeEditorStatusbarHeight(this.viewCell.internalMetadata));
				if (target?.position) {
					this.templateData.editor.setPosition(target.position);
					this.templateData.editor.focus();
				}
			}
		}));

		this._register(this.templateData.editor.onMouseDown(e => {
			// prevent default on right mouse click, otherwise it will trigger unexpected focus changes
			// the catch is, it means we don't allow customization of right button mouse down handlers other than the built in ones.
			if (e.event.rightButton) {
				e.event.preventDefault();
			}
		}));
	}

	private registerFocusModeTracker() {
		const updateEditorForFocusModeChange = () => {
			if (this.viewCell.focusMode === CellFocusMode.Editor && this.notebookEditor.getActiveCell() === this.viewCell) {
				this.templateData.editor?.focus();
			}

			this.templateData.container.classList.toggle('cell-editor-focus', this.viewCell.focusMode === CellFocusMode.Editor);
		};
		this._register(this.viewCell.onDidChangeState((e) => {
			if (e.focusModeChanged) {
				updateEditorForFocusModeChange();
			}
		}));

		updateEditorForFocusModeChange();

		// Focus Mode
		const updateFocusModeForEditorEvent = () => {
			this.viewCell.focusMode =
				(this.templateData.editor.hasWidgetFocus() || (document.activeElement && this.templateData.statusBar.statusBarContainer.contains(document.activeElement)))
					? CellFocusMode.Editor
					: CellFocusMode.Container;
		};

		this._register(this.templateData.editor.onDidFocusEditorWidget(() => {
			updateFocusModeForEditorEvent();
		}));
		this._register(this.templateData.editor.onDidBlurEditorWidget(() => {
			// this is for a special case:
			// users click the status bar empty space, which we will then focus the editor
			// so we don't want to update the focus state too eagerly, it will be updated with onDidFocusEditorWidget
			if (
				this.notebookEditor.hasEditorFocus() &&
				!(document.activeElement && this.templateData.statusBar.statusBarContainer.contains(document.activeElement))) {
				updateFocusModeForEditorEvent();
			}
		}));
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
		DOM.hide(this.templateData.executionOrderLabel);
		this.templateData.container.classList.toggle('input-collapsed', true);

		// remove input preview
		this._removeInputCollapsePreview();

		// update preview
		const richEditorText = this._getRichText(this.viewCell.textBuffer, this.viewCell.language);
		const element = DOM.$('div');
		element.classList.add('cell-collapse-preview');
		DOM.safeInnerHtml(element, richEditorText);
		this.templateData.cellInputCollapsedContainer.appendChild(element);
		const expandIcon = DOM.$('span.expandInputIcon');
		const keybinding = this.keybindingService.lookupKeybinding(EXPAND_CELL_INPUT_COMMAND_ID);
		if (keybinding) {
			element.title = localize('cellExpandInputButtonLabelWithDoubleClick', "Double click to expand cell input ({0})", keybinding.getLabel());
			expandIcon.title = localize('cellExpandInputButtonLabel', "Expand Cell Input ({0})", keybinding.getLabel());
		}

		expandIcon.classList.add(...CSSIcon.asClassNameArray(Codicon.more));
		element.appendChild(expandIcon);

		DOM.show(this.templateData.cellInputCollapsedContainer);
	}

	private _showInput() {
		DOM.show(this.templateData.editorPart);
		DOM.show(this.templateData.executionOrderLabel);
		DOM.hide(this.templateData.cellInputCollapsedContainer);
	}

	private _getRichText(buffer: IReadonlyTextBuffer, language: string) {
		return tokenizeToString(buffer.getLineContent(1), this.modeService.languageIdCodec, TokenizationRegistry.get(language)!);
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
			element.parentElement?.removeChild(element);
		});
	}

	private _updateOutputInnertContainer(hide: boolean) {
		const children = this.templateData.outputContainer.domNode.children;
		for (let i = 0; i < children.length; i++) {
			if (children[i].classList.contains('output-inner-container')) {
				if (hide) {
					DOM.hide(children[i] as HTMLElement);
				} else {
					DOM.show(children[i] as HTMLElement);
				}
			}
		}
	}

	private _collapseOutput() {
		this.templateData.container.classList.toggle('output-collapsed', true);
		DOM.show(this.templateData.cellOutputCollapsedContainer);
		this._updateOutputInnertContainer(true);
		this._outputContainerRenderer.viewUpdateHideOuputs();
	}

	private _showOutput(initRendering: boolean) {
		this.templateData.container.classList.toggle('output-collapsed', false);
		DOM.hide(this.templateData.cellOutputCollapsedContainer);
		this._updateOutputInnertContainer(false);
		this._outputContainerRenderer.viewUpdateShowOutputs(initRendering);
	}

	private initialViewUpdateExpanded(): void {
		this.templateData.container.classList.toggle('input-collapsed', false);
		this._showInput();
		this.templateData.container.classList.toggle('output-collapsed', false);
		this._showOutput(true);
		this.relayoutCell();
	}

	private layoutEditor(dimension: IDimension): void {
		this.templateData.editor?.layout(dimension);
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
		if (this.notebookEditor.getActiveCell() === this.viewCell && this.viewCell.focusMode === CellFocusMode.Editor) {
			this.notebookEditor.focusContainer();
		}

		this.viewCell.detachTextEditor();
		this._removeInputCollapsePreview();
		this._outputContainerRenderer.dispose();
		this._untrustedStatusItem?.dispose();
		this.templateData.focusIndicator.left.setHeight(0);

		super.dispose();
	}
}
