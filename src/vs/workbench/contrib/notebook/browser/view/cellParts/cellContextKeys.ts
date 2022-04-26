/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CellEditState, CellFocusMode, ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookCellExecutionStateContext, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_INPUT_COLLAPSED, NOTEBOOK_CELL_LINE_NUMBERS, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_OUTPUT_COLLAPSED, NOTEBOOK_CELL_RESOURCE, NOTEBOOK_CELL_TYPE } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export class CellContextKeyPart extends CellPart {
	private cellContextKeyManager: CellContextKeyManager;

	constructor(
		notebookEditor: INotebookEditorDelegate,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.cellContextKeyManager = this._register(this.instantiationService.createInstance(CellContextKeyManager, notebookEditor, undefined));
	}

	protected override didRenderCell(element: ICellViewModel): void {
		this.cellContextKeyManager.updateForElement(element);
	}
}

export class CellContextKeyManager extends Disposable {

	private cellType!: IContextKey<'code' | 'markup'>;
	private cellEditable!: IContextKey<boolean>;
	private cellFocused!: IContextKey<boolean>;
	private cellEditorFocused!: IContextKey<boolean>;
	private cellRunState!: IContextKey<NotebookCellExecutionStateContext>;
	private cellExecuting!: IContextKey<boolean>;
	private cellHasOutputs!: IContextKey<boolean>;
	private cellContentCollapsed!: IContextKey<boolean>;
	private cellOutputCollapsed!: IContextKey<boolean>;
	private cellLineNumbers!: IContextKey<'on' | 'off' | 'inherit'>;
	private cellResource!: IContextKey<string>;

	private markdownEditMode!: IContextKey<boolean>;

	private readonly elementDisposables = this._register(new DisposableStore());

	constructor(
		private readonly notebookEditor: INotebookEditorDelegate,
		private element: ICellViewModel | undefined,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService
	) {
		super();

		this._contextKeyService.bufferChangeEvents(() => {
			this.cellType = NOTEBOOK_CELL_TYPE.bindTo(this._contextKeyService);
			this.cellEditable = NOTEBOOK_CELL_EDITABLE.bindTo(this._contextKeyService);
			this.cellFocused = NOTEBOOK_CELL_FOCUSED.bindTo(this._contextKeyService);
			this.cellEditorFocused = NOTEBOOK_CELL_EDITOR_FOCUSED.bindTo(this._contextKeyService);
			this.markdownEditMode = NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.bindTo(this._contextKeyService);
			this.cellRunState = NOTEBOOK_CELL_EXECUTION_STATE.bindTo(this._contextKeyService);
			this.cellExecuting = NOTEBOOK_CELL_EXECUTING.bindTo(this._contextKeyService);
			this.cellHasOutputs = NOTEBOOK_CELL_HAS_OUTPUTS.bindTo(this._contextKeyService);
			this.cellContentCollapsed = NOTEBOOK_CELL_INPUT_COLLAPSED.bindTo(this._contextKeyService);
			this.cellOutputCollapsed = NOTEBOOK_CELL_OUTPUT_COLLAPSED.bindTo(this._contextKeyService);
			this.cellLineNumbers = NOTEBOOK_CELL_LINE_NUMBERS.bindTo(this._contextKeyService);
			this.cellResource = NOTEBOOK_CELL_RESOURCE.bindTo(this._contextKeyService);

			if (element) {
				this.updateForElement(element);
			}
		});

		this._register(this._notebookExecutionStateService.onDidChangeCellExecution(e => {
			if (this.element && e.affectsCell(this.element.uri)) {
				this.updateForExecutionState();
			}
		}));
	}

	public updateForElement(element: ICellViewModel | undefined) {
		this.elementDisposables.clear();
		this.element = element;

		if (!element) {
			return;
		}

		this.elementDisposables.add(element.onDidChangeState(e => this.onDidChangeState(e)));

		if (element instanceof CodeCellViewModel) {
			this.elementDisposables.add(element.onDidChangeOutputs(() => this.updateForOutputs()));
		}

		this.elementDisposables.add(this.notebookEditor.onDidChangeActiveCell(() => this.updateForFocusState()));

		if (this.element instanceof MarkupCellViewModel) {
			this.cellType.set('markup');
		} else if (this.element instanceof CodeCellViewModel) {
			this.cellType.set('code');
		}

		this._contextKeyService.bufferChangeEvents(() => {
			this.updateForFocusState();
			this.updateForExecutionState();
			this.updateForEditState();
			this.updateForCollapseState();
			this.updateForOutputs();

			this.cellLineNumbers.set(this.element!.lineNumbers);
			this.cellResource.set(this.element!.uri.toString());
		});
	}

	private onDidChangeState(e: CellViewModelStateChangeEvent) {
		this._contextKeyService.bufferChangeEvents(() => {
			if (e.internalMetadataChanged) {
				this.updateForExecutionState();
			}

			if (e.editStateChanged) {
				this.updateForEditState();
			}

			if (e.focusModeChanged) {
				this.updateForFocusState();
			}

			if (e.cellLineNumberChanged) {
				this.cellLineNumbers.set(this.element!.lineNumbers);
			}

			if (e.inputCollapsedChanged || e.outputCollapsedChanged) {
				this.updateForCollapseState();
			}
		});
	}

	private updateForFocusState() {
		if (!this.element) {
			return;
		}

		const activeCell = this.notebookEditor.getActiveCell();
		this.cellFocused.set(this.notebookEditor.getActiveCell() === this.element);

		if (activeCell === this.element) {
			this.cellEditorFocused.set(this.element.focusMode === CellFocusMode.Editor);
		} else {
			this.cellEditorFocused.set(false);
		}

	}

	private updateForExecutionState() {
		if (!this.element) {
			return;
		}

		const internalMetadata = this.element.internalMetadata;
		this.cellEditable.set(!this.notebookEditor.isReadOnly);

		const exeState = this._notebookExecutionStateService.getCellExecution(this.element.uri);
		if (this.element instanceof MarkupCellViewModel) {
			this.cellRunState.reset();
			this.cellExecuting.reset();
		} else if (exeState?.state === NotebookCellExecutionState.Executing) {
			this.cellRunState.set('executing');
			this.cellExecuting.set(true);
		} else if (exeState?.state === NotebookCellExecutionState.Pending || exeState?.state === NotebookCellExecutionState.Unconfirmed) {
			this.cellRunState.set('pending');
			this.cellExecuting.set(true);
		} else if (internalMetadata.lastRunSuccess === true) {
			this.cellRunState.set('succeeded');
			this.cellExecuting.set(false);
		} else if (internalMetadata.lastRunSuccess === false) {
			this.cellRunState.set('failed');
			this.cellExecuting.set(false);
		} else {
			this.cellRunState.set('idle');
			this.cellExecuting.set(false);
		}
	}

	private updateForEditState() {
		if (!this.element) {
			return;
		}

		if (this.element instanceof MarkupCellViewModel) {
			this.markdownEditMode.set(this.element.getEditState() === CellEditState.Editing);
		} else {
			this.markdownEditMode.set(false);
		}
	}

	private updateForCollapseState() {
		if (!this.element) {
			return;
		}

		this.cellContentCollapsed.set(!!this.element.isInputCollapsed);
		this.cellOutputCollapsed.set(!!this.element.isOutputCollapsed);
	}

	private updateForOutputs() {
		if (this.element instanceof CodeCellViewModel) {
			this.cellHasOutputs.set(this.element.outputsViewModels.length > 0);
		} else {
			this.cellHasOutputs.set(false);
		}
	}
}
